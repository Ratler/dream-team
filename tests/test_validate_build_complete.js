#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initBuildState, writeTask } = require('../lib/build-state');

const hookPath = path.join(__dirname, '..', 'hooks', 'validate_build_complete.js');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function runHook(stdinData) {
  const input = JSON.stringify(stdinData);
  const escaped = input.replace(/'/g, "'\\''");
  try {
    const output = execSync(
      `echo '${escaped}' | node "${hookPath}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return JSON.parse(output.trim());
  } catch (err) {
    // Hook exits with code 1 for block results — parse stdout from error
    if (err.stdout) return JSON.parse(err.stdout.trim());
    throw err;
  }
}

console.log('Testing validate_build_complete.js...\n');

function makeRepo(branch, metaBranch, statuses) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-stop-'));
  execSync(`git init -q -b ${branch}`, { cwd: repo });
  const stateDir = path.join(repo, 'specs', '.build-state', 'demo');
  initBuildState(stateDir, { specFile: 'specs/2026-10-16-demo.md', branch: metaBranch, mode: 'team', compactions: 0 });
  statuses.forEach((status, i) => writeTask(stateDir, `task-${i}`, { name: `Task ${i}`, status, dependsOn: [] }));
  return repo;
}

test('continues when no task data provided', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-stop-'));
  const result = runHook({ cwd: empty });
  fs.rmSync(empty, { recursive: true, force: true });
  assert(result.result === 'continue', `expected "continue", got "${result.result}"`);
});

test('continues when all tasks are completed', () => {
  const result = runHook({
    tasks: [
      { id: '1', subject: 'Setup', status: 'completed' },
      { id: '2', subject: 'Build', status: 'completed' },
      { id: '3', subject: 'Validate', status: 'completed' },
    ]
  });
  assert(result.result === 'continue', `expected "continue", got "${result.result}"`);
});

test('blocks when tasks are still pending', () => {
  const result = runHook({
    tasks: [
      { id: '1', subject: 'Setup', status: 'completed' },
      { id: '2', subject: 'Build', status: 'pending' },
      { id: '3', subject: 'Validate', status: 'pending' },
    ]
  });
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('Build'), 'reason should list incomplete task');
});

test('blocks when a task is still in_progress', () => {
  const result = runHook({
    tasks: [
      { id: '1', subject: 'Setup', status: 'completed' },
      { id: '2', subject: 'Build', status: 'in_progress' },
    ]
  });
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
});

test('falls back to build state for current branch and blocks', () => {
  const repo = makeRepo('feat/demo', 'feat/demo', ['completed', 'pending']);
  const result = runHook({ cwd: repo });
  fs.rmSync(repo, { recursive: true, force: true });
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('Task 1'), 'reason should list incomplete task');
  assert(result.reason.includes('task-state.js'), 'reason should point at task-state.js');
});

test('falls back to build state and continues when all completed', () => {
  const repo = makeRepo('feat/demo', 'feat/demo', ['completed', 'completed']);
  const result = runHook({ cwd: repo });
  fs.rmSync(repo, { recursive: true, force: true });
  assert(result.result === 'continue', `expected "continue", got "${result.result}"`);
});

test('ignores build state for other branches', () => {
  const repo = makeRepo('feat/other', 'feat/demo', ['pending']);
  const result = runHook({ cwd: repo });
  fs.rmSync(repo, { recursive: true, force: true });
  assert(result.result === 'continue', `expected "continue", got "${result.result}"`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
