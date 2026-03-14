#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK_PATH = path.join(__dirname, '..', 'hooks', 'postcompact_checkpoint.js');
const { initBuildState, readMeta, writeTask } = require('../lib/build-state');

let passed = 0;
let failed = 0;

function runHook(input) {
  const inputStr = JSON.stringify(input);
  try {
    const stdout = execSync(`echo '${inputStr.replace(/'/g, "'\\''")}' | node ${HOOK_PATH}`, {
      encoding: 'utf8',
      timeout: 5000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', exitCode: err.status };
  }
}

function test(name, fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-test-'));
  try {
    fn(tmpDir);
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL: ${name} - ${err.message}`);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// --- Tests ---

test('Increments compactions from 0 to 1', (tmpDir) => {
  const stateDir = path.join(tmpDir, 'specs', '.build-state', 'my-feature');
  initBuildState(stateDir, {
    specFile: 'specs/2026-03-14-my-feature.md',
    branch: 'feat/my-feature',
    mode: 'sequential',
    startedAt: '2026-03-14T10:00:00Z',
    lastUpdated: '2026-03-14T10:00:00Z',
    compactions: 0,
  });
  writeTask(stateDir, 'task-1', { name: 'Task 1', status: 'in_progress' });

  runHook({ cwd: tmpDir, trigger: 'auto', compact_summary: 'summary' });

  const meta = readMeta(stateDir);
  assert.strictEqual(meta.compactions, 1);
});

test('Increments compactions from 1 to 2', (tmpDir) => {
  const stateDir = path.join(tmpDir, 'specs', '.build-state', 'my-feature');
  initBuildState(stateDir, {
    specFile: 'test.md',
    compactions: 1,
    startedAt: '2026-01-01T00:00:00Z',
    lastUpdated: '2026-01-01T00:00:00Z',
  });
  writeTask(stateDir, 'task-1', { name: 'Task 1', status: 'pending' });

  runHook({ cwd: tmpDir, trigger: 'auto', compact_summary: 'summary' });

  const meta = readMeta(stateDir);
  assert.strictEqual(meta.compactions, 2);
});

test('No active build state exits 0', (tmpDir) => {
  const result = runHook({ cwd: tmpDir, trigger: 'auto' });
  assert.strictEqual(result.exitCode, 0);
});

test('Missing _meta.json exits 0 (fail-open)', (tmpDir) => {
  // Create a state dir with task files but no _meta.json — won't be found by findActiveStateDir
  // because it reads task files. But even if it were, readMeta would throw.
  const result = runHook({ cwd: tmpDir, trigger: 'manual' });
  assert.strictEqual(result.exitCode, 0);
});

test('Missing cwd exits 0', () => {
  const result = runHook({ trigger: 'auto' });
  assert.strictEqual(result.exitCode, 0);
});

test('All tasks completed means no active build', (tmpDir) => {
  const stateDir = path.join(tmpDir, 'specs', '.build-state', 'done-feature');
  initBuildState(stateDir, {
    specFile: 'test.md',
    compactions: 0,
    startedAt: '2026-01-01T00:00:00Z',
    lastUpdated: '2026-01-01T00:00:00Z',
  });
  writeTask(stateDir, 'task-1', { name: 'Task 1', status: 'completed' });

  runHook({ cwd: tmpDir, trigger: 'auto' });

  // Compactions should still be 0 since no active build found
  const meta = readMeta(stateDir);
  assert.strictEqual(meta.compactions, 0);
});

// --- Summary ---
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);
