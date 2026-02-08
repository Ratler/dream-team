#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

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

test('continues when no task data provided', () => {
  const result = runHook({});
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

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
