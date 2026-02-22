#!/usr/bin/env node
'use strict';

/**
 * Tests for the TaskCompleted hook (validate_task_completed.js).
 *
 * Verifies:
 * - All task types exit 0 (logging only, never blocks)
 * - Audit log creation and JSON line format
 * - Multiple completions append to same log
 * - Agent type extraction from description
 * - last_assistant_message logging
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hookScript = path.join(__dirname, '..', 'hooks', 'validate_task_completed.js');
let passed = 0;
let failed = 0;
let tmpDir;

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

function runHook(input, logDir) {
  const env = Object.assign({}, process.env, {
    DREAM_TEAM_LOG_DIR: logDir || tmpDir
  });
  const result = spawnSync('node', [hookScript], {
    input: JSON.stringify(input),
    env: env,
    encoding: 'utf8'
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function makeInput(overrides) {
  return Object.assign({
    session_id: 'test-session-123',
    cwd: '/test/project',
    hook_event_name: 'TaskCompleted',
    task_id: 'task-1',
    task_subject: 'Test task',
    task_description: '',
    teammate_name: '',
    team_name: ''
  }, overrides);
}

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-test-'));
}

function cleanup() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- Tests ---

console.log('\nTaskCompleted Hook Tests');
console.log('========================\n');

setup();

try {
  // 1. Builder task always exits 0 (logging only)
  test('Builder task exits 0 regardless of report', () => {
    const input = makeInput({
      task_description: '[agent-type: builder]\nJust a plain description'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
  });

  // 2. Debugger task always exits 0
  test('Debugger task exits 0 regardless of report', () => {
    const input = makeInput({
      task_description: '[agent-type: debugger]\nI fixed the bug.'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
  });

  // 3. Unknown agent type exits 0
  test('Unknown agent type exits 0', () => {
    const input = makeInput({
      task_description: 'A task description with no agent-type tag at all'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
  });

  // 4. Empty description exits 0
  test('Empty description exits 0', () => {
    const input = makeInput({ task_description: '' });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
  });

  // 5. Log file creation
  test('Log directory and file are created', () => {
    const logDir = path.join(tmpDir, 'log-creation-test');
    const input = makeInput({
      task_description: '[agent-type: builder]\n## Task Complete\n**Status**: Completed',
      cwd: '/test/log-creation'
    });
    runHook(input, logDir);
    assert(fs.existsSync(logDir), `Log directory was not created at ${logDir}`);
    const logFile = path.join(logDir, 'test-log-creation.jsonl');
    assert(fs.existsSync(logFile), `Log file was not created at ${logFile}`);
  });

  // 6. Log entry format
  test('Log entry contains all expected fields', () => {
    const logDir = path.join(tmpDir, 'entry-format-test');
    const input = makeInput({
      task_description: '[agent-type: tester]\n## Tests Complete\n**Status**: Completed',
      task_id: 'test-42',
      task_subject: 'Run integration tests',
      teammate_name: 'tester-1',
      team_name: 'my-team',
      session_id: 'session-abc',
      cwd: '/my/project'
    });
    runHook(input, logDir);
    const logFile = path.join(logDir, 'my-project.jsonl');
    assert(fs.existsSync(logFile), `Log file not found at ${logFile}`);
    const line = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(line);
    assert(entry.task_id === 'test-42', `Expected task_id 'test-42', got '${entry.task_id}'`);
    assert(entry.task_subject === 'Run integration tests', `Wrong task_subject: ${entry.task_subject}`);
    assert(entry.agent_type === 'tester', `Expected agent_type 'tester', got '${entry.agent_type}'`);
    assert(entry.teammate === 'tester-1', `Expected teammate 'tester-1', got '${entry.teammate}'`);
    assert(entry.team === 'my-team', `Expected team 'my-team', got '${entry.team}'`);
    assert(entry.session === 'session-abc', `Expected session 'session-abc', got '${entry.session}'`);
    assert(entry.cwd === '/my/project', `Expected cwd '/my/project', got '${entry.cwd}'`);
    assert(entry.ts, 'Missing ts field');
    assert(!isNaN(new Date(entry.ts).getTime()), `Invalid ts: ${entry.ts}`);
  });

  // 7. Multiple completions append to same log
  test('Multiple completions append to same log file', () => {
    const logDir = path.join(tmpDir, 'multi-test');
    const input1 = makeInput({
      task_description: '[agent-type: reviewer]\n## Code Review\n**Status**: Approved',
      task_id: 'task-1',
      cwd: '/multi/project'
    });
    const input2 = makeInput({
      task_description: '[agent-type: builder]\n## Task Complete\n**Status**: Completed',
      task_id: 'task-2',
      cwd: '/multi/project'
    });
    runHook(input1, logDir);
    runHook(input2, logDir);
    const logFile = path.join(logDir, 'multi-project.jsonl');
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert(lines.length === 2, `Expected 2 log lines, got ${lines.length}`);
    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    assert(entry1.task_id === 'task-1', `First entry wrong task_id: ${entry1.task_id}`);
    assert(entry2.task_id === 'task-2', `Second entry wrong task_id: ${entry2.task_id}`);
  });

  // 8. Agent type correctly extracted and logged
  test('Agent type is extracted from description', () => {
    const logDir = path.join(tmpDir, 'agent-type-test');
    const input = makeInput({
      task_description: '[agent-type: security-reviewer]\nSome review',
      cwd: '/type/project'
    });
    runHook(input, logDir);
    const logFile = path.join(logDir, 'type-project.jsonl');
    const line = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(line);
    assert(entry.agent_type === 'security-reviewer', `Expected 'security-reviewer', got '${entry.agent_type}'`);
  });

  // 9. Missing tag logs as unknown
  test('Missing agent-type tag logs as unknown', () => {
    const logDir = path.join(tmpDir, 'unknown-type-test');
    const input = makeInput({
      task_description: 'No tag here',
      cwd: '/unknown/project'
    });
    runHook(input, logDir);
    const logFile = path.join(logDir, 'unknown-project.jsonl');
    const line = fs.readFileSync(logFile, 'utf8').trim();
    const entry = JSON.parse(line);
    assert(entry.agent_type === 'unknown', `Expected 'unknown', got '${entry.agent_type}'`);
  });

  // 10. last_assistant_message logged to stderr
  test('last_assistant_message is logged to stderr', () => {
    const input = makeInput({
      task_description: '[agent-type: reviewer]\n## Code Review\n**Status**: Approved',
      last_assistant_message: 'I have completed the review of all files.'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
    assert(result.stderr.includes('last_assistant_message'), `Expected last_assistant_message in stderr`);
    assert(result.stderr.includes('I have completed'), `Expected message content in stderr`);
  });

} finally {
  cleanup();
}

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
