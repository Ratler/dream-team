#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROGRESS_PATH = path.join(__dirname, '..', 'bin', 'progress.js');
const { initBuildState, writeTask } = require('../lib/build-state');

let passed = 0;
let failed = 0;

function runProgress(args) {
  try {
    const stdout = execSync(`node ${PROGRESS_PATH} ${args}`, {
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

// --- Helper to create a populated state dir ---

function createTestState(tmpDir) {
  const stateDir = path.join(tmpDir, 'specs', '.build-state', 'my-feature');
  initBuildState(stateDir, {
    specFile: 'specs/2026-03-14-my-feature.md',
    branch: 'feat/my-feature',
    mode: 'delegated',
    startedAt: '2026-03-14T10:30:00Z',
    lastUpdated: '2026-03-14T11:45:00Z',
    compactions: 2,
  });
  writeTask(stateDir, 'setup-db', {
    name: 'Setup Database',
    status: 'completed',
    agentType: 'builder',
    startedAt: '2026-03-14T10:30:00Z',
    completedAt: '2026-03-14T10:34:12Z',
    commitSha: 'a1b2c3d4e5f6a7b8',
    filesChanged: ['db/schema.sql'],
    dependsOn: [],
  });
  writeTask(stateDir, 'build-api', {
    name: 'Build API',
    status: 'in_progress',
    agentType: 'builder',
    startedAt: '2026-03-14T10:34:12Z',
    completedAt: null,
    commitSha: null,
    filesChanged: [],
    dependsOn: ['setup-db'],
  });
  writeTask(stateDir, 'review-all', {
    name: 'Code Review',
    status: 'pending',
    agentType: 'reviewer',
    startedAt: null,
    completedAt: null,
    commitSha: null,
    filesChanged: [],
    dependsOn: ['build-api'],
  });
  return stateDir;
}

// --- Tests ---

test('No arguments shows usage and exits 1', () => {
  const result = runProgress('');
  assert.strictEqual(result.exitCode, 1);
  assert.ok(result.stdout.includes('Usage:'));
});

test('Nonexistent spec shows error and exits 1', (tmpDir) => {
  const result = runProgress(path.join(tmpDir, 'specs/2026-01-01-nope.md'));
  assert.strictEqual(result.exitCode, 1);
  assert.ok(result.stdout.includes('No build state found'));
});

test('Shows correct header with metadata', (tmpDir) => {
  createTestState(tmpDir);
  const result = runProgress(path.join(tmpDir, 'specs/2026-03-14-my-feature.md'));
  assert.strictEqual(result.exitCode, 0);
  assert.ok(result.stdout.includes('Build: my-feature (delegated)'));
  assert.ok(result.stdout.includes('Branch: feat/my-feature'));
  assert.ok(result.stdout.includes('Compactions: 2'));
});

test('Shows correct task statuses', (tmpDir) => {
  createTestState(tmpDir);
  const result = runProgress(path.join(tmpDir, 'specs/2026-03-14-my-feature.md'));
  assert.ok(result.stdout.includes('completed'));
  assert.ok(result.stdout.includes('in_progress'));
  assert.ok(result.stdout.includes('pending'));
});

test('Shows progress summary', (tmpDir) => {
  createTestState(tmpDir);
  const result = runProgress(path.join(tmpDir, 'specs/2026-03-14-my-feature.md'));
  assert.ok(result.stdout.includes('Progress: 1/3 tasks (33%)'));
});

test('Shows commit SHA (first 7 chars)', (tmpDir) => {
  createTestState(tmpDir);
  const result = runProgress(path.join(tmpDir, 'specs/2026-03-14-my-feature.md'));
  assert.ok(result.stdout.includes('a1b2c3d'));
});

test('Shows in_progress marker', (tmpDir) => {
  createTestState(tmpDir);
  const result = runProgress(path.join(tmpDir, 'specs/2026-03-14-my-feature.md'));
  assert.ok(result.stdout.includes('\u25B6'));
});

test('Duration formatting for completed task', (tmpDir) => {
  createTestState(tmpDir);
  const result = runProgress(path.join(tmpDir, 'specs/2026-03-14-my-feature.md'));
  // 10:30:00 to 10:34:12 = 4m 12s
  assert.ok(result.stdout.includes('4m 12s'));
});

test('Dependency ordering: tasks sorted by dependsOn', (tmpDir) => {
  createTestState(tmpDir);
  const result = runProgress(path.join(tmpDir, 'specs/2026-03-14-my-feature.md'));
  const lines = result.stdout.split('\n');
  const setupLine = lines.findIndex(l => l.includes('Setup Database'));
  const apiLine = lines.findIndex(l => l.includes('Build API'));
  const reviewLine = lines.findIndex(l => l.includes('Code Review'));
  assert.ok(setupLine < apiLine, 'Setup Database should come before Build API');
  assert.ok(apiLine < reviewLine, 'Build API should come before Code Review');
});

test('Task name truncation for long names', (tmpDir) => {
  const stateDir = path.join(tmpDir, 'specs', '.build-state', 'trunc-test');
  initBuildState(stateDir, {
    specFile: 'specs/2026-01-01-trunc-test.md',
    branch: 'feat/trunc-test',
    mode: 'sequential',
    startedAt: '2026-01-01T00:00:00Z',
    lastUpdated: '2026-01-01T00:00:00Z',
    compactions: 0,
  });
  writeTask(stateDir, 'long-name-task', {
    name: 'This Is A Very Long Task Name That Exceeds The Limit',
    status: 'pending',
    agentType: 'builder',
    startedAt: null,
    completedAt: null,
    dependsOn: [],
  });
  const result = runProgress(path.join(tmpDir, 'specs/2026-01-01-trunc-test.md'));
  assert.ok(result.stdout.includes('\u2026'), 'Long name should be truncated with ellipsis');
});

// --- Summary ---
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);
