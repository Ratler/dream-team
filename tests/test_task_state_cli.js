#!/usr/bin/env node
'use strict';

/**
 * Tests for bin/task-state.js (task tracking when Task* tools are unavailable).
 *
 * Verifies:
 * - start marks a task in_progress
 * - complete persists the report, writes the audit log, resolves agent type
 * - commit records the full SHA and changed files
 * - next lists ready / blocked / in_progress tasks
 * - unknown tasks and missing build state exit 1
 */

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const cli = path.join(__dirname, '..', 'bin', 'task-state.js');
const { initBuildState, writeTask, readTask } = require('../lib/build-state');

let passed = 0;
let failed = 0;
let repo;
let logDir;

const SPEC = 'specs/2026-10-16-demo.md';

function test(name, fn) {
  setup();
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  } finally {
    cleanup();
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function task(name, agentType, dependsOn) {
  return {
    name, status: 'pending', agentType, startedAt: null, completedAt: null,
    description: null, commitSha: null, filesChanged: [], dependsOn,
  };
}

function setup() {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-cli-'));
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-cli-log-'));
  execSync('git init -q -b main && git config user.email t@example.invalid && git config user.name t', { cwd: repo });
  const stateDir = path.join(repo, 'specs', '.build-state', 'demo');
  initBuildState(stateDir, { specFile: SPEC, branch: 'feat/demo', mode: 'team', compactions: 0 });
  writeTask(stateDir, 'build-a', task('Build A', 'builder', []));
  writeTask(stateDir, 'review-all', task('Code Review', 'reviewer', ['build-a']));
}

function cleanup() {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(logDir, { recursive: true, force: true });
}

function run(args, input) {
  const r = spawnSync('node', [cli, SPEC, ...args], {
    cwd: repo,
    input: input || '',
    encoding: 'utf8',
    env: Object.assign({}, process.env, { DREAM_TEAM_LOG_DIR: logDir }),
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function state(id) {
  return readTask(path.join(repo, 'specs', '.build-state', 'demo'), id);
}

console.log('Testing bin/task-state.js...\n');

test('start marks task in_progress with startedAt', () => {
  const r = run(['start', 'build-a']);
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  assert(state('build-a').status === 'in_progress', 'status not in_progress');
  assert(state('build-a').startedAt, 'startedAt not set');
});

test('complete stores report and agent type from tag', () => {
  const report = '[agent-type: builder]\n## Task Complete\n\nDone in commit abc1234.\n';
  const r = run(['complete', 'build-a'], report);
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  const t = state('build-a');
  assert(t.status === 'completed', 'status not completed');
  assert(t.agentType === 'builder', `agentType=${t.agentType}`);
  assert(t.description.includes('## Task Complete'), 'report not stored');
  assert(t.commitSha === 'abc1234', `commitSha=${t.commitSha}`);
});

test('complete writes an audit log entry', () => {
  run(['complete', 'build-a'], '[agent-type: builder] ok');
  const files = fs.readdirSync(logDir);
  assert(files.length === 1, `expected 1 log file, got ${files.length}`);
  const entry = JSON.parse(fs.readFileSync(path.join(logDir, files[0]), 'utf8').trim());
  assert(entry.task_id === 'build-a', `task_id=${entry.task_id}`);
  assert(entry.task_subject === 'Build A', `task_subject=${entry.task_subject}`);
  assert(entry.agent_type === 'builder', `agent_type=${entry.agent_type}`);
});

test('complete falls back to state agentType when report has no tag', () => {
  run(['complete', 'review-all'], 'Approved.');
  assert(state('review-all').agentType === 'reviewer', `agentType=${state('review-all').agentType}`);
});

test('complete --agent-type overrides', () => {
  run(['complete', 'build-a', '--agent-type', 'debugger'], '[agent-type: builder] ok');
  assert(state('build-a').agentType === 'debugger', `agentType=${state('build-a').agentType}`);
});

test('commit records full SHA and changed files', () => {
  fs.writeFileSync(path.join(repo, 'a.js'), 'module.exports = 1;\n');
  execSync('git add a.js && git commit -q -m "feat: a"', { cwd: repo });
  const sha = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim();
  const r = run(['commit', 'build-a', sha.substring(0, 7)]);
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  assert(state('build-a').commitSha === sha, `commitSha=${state('build-a').commitSha}`);
  assert(JSON.stringify(state('build-a').filesChanged) === '["a.js"]', `filesChanged=${JSON.stringify(state('build-a').filesChanged)}`);
});

test('commit with a merge SHA records the merged files', () => {
  fs.writeFileSync(path.join(repo, 'base.txt'), 'x\n');
  execSync('git add base.txt && git commit -q -m base && git checkout -q -b wt', { cwd: repo });
  fs.writeFileSync(path.join(repo, 'b.js'), 'module.exports = 2;\n');
  fs.writeFileSync(path.join(repo, 'b.test.js'), '// t\n');
  execSync('git add b.js b.test.js && git commit -q -m "feat: b" && git checkout -q main && git merge -q --no-ff -m merge wt', { cwd: repo });
  const sha = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf8' }).trim();
  const r = run(['commit', 'build-a', sha]);
  assert(r.status === 0, `exit ${r.status}: ${r.stderr}`);
  const files = state('build-a').filesChanged.slice().sort();
  assert(JSON.stringify(files) === '["b.js","b.test.js"]', `filesChanged=${JSON.stringify(files)}`);
});

test('commit with unknown SHA exits 1', () => {
  const r = run(['commit', 'build-a', 'deadbeef']);
  assert(r.status === 1, `expected exit 1, got ${r.status}`);
});

test('next shows ready and blocked tasks', () => {
  const r = run(['next']);
  assert(r.stdout.includes('build-a [builder] ready'), r.stdout);
  assert(r.stdout.includes('review-all [reviewer] blocked by build-a'), r.stdout);
});

test('next unblocks dependents after completion', () => {
  run(['complete', 'build-a'], '[agent-type: builder] ok');
  const r = run(['next']);
  assert(!r.stdout.includes('build-a'), r.stdout);
  assert(r.stdout.includes('review-all [reviewer] ready'), r.stdout);
});

test('next reports all completed', () => {
  run(['complete', 'build-a'], 'ok');
  run(['complete', 'review-all'], 'ok');
  assert(run(['next']).stdout.includes('All tasks completed.'), 'missing completion line');
});

test('unknown task exits 1', () => {
  const r = run(['start', 'nope']);
  assert(r.status === 1, `expected exit 1, got ${r.status}`);
  assert(r.stderr.includes('no task "nope"'), r.stderr);
});

test('missing build state exits 1', () => {
  fs.rmSync(path.join(repo, 'specs'), { recursive: true, force: true });
  const r = run(['next']);
  assert(r.status === 1, `expected exit 1, got ${r.status}`);
  assert(r.stderr.includes('no build state'), r.stderr);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
