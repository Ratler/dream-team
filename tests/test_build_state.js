#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  initBuildState,
  readMeta,
  writeMeta,
  readTask,
  writeTask,
  readAllTasks,
  findActiveStateDir,
  deriveStateDirFromSpec,
} = require('../lib/build-state');

let tmpDir;
let passed = 0;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-test-'));
}

function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function test(name, fn) {
  setup();
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.log(`FAIL: ${name} - ${err.message}`);
    cleanup();
    process.exit(1);
  }
  cleanup();
}

// --- initBuildState ---

test('initBuildState creates directory and _meta.json', () => {
  const stateDir = path.join(tmpDir, 'my-feature');
  const meta = {
    specFile: 'specs/2026-03-14-my-feature.md',
    branch: 'feat/my-feature',
    mode: 'sequential',
    startedAt: '2026-03-14T12:00:00.000Z',
    lastUpdated: '2026-03-14T12:00:00.000Z',
    compactions: 0,
  };
  initBuildState(stateDir, meta);
  assert.ok(fs.existsSync(stateDir));
  assert.ok(fs.existsSync(path.join(stateDir, '_meta.json')));
  const saved = JSON.parse(fs.readFileSync(path.join(stateDir, '_meta.json'), 'utf8'));
  assert.strictEqual(saved.specFile, 'specs/2026-03-14-my-feature.md');
  assert.strictEqual(saved.branch, 'feat/my-feature');
  assert.strictEqual(saved.compactions, 0);
});

// --- readMeta / writeMeta ---

test('readMeta reads _meta.json', () => {
  const stateDir = path.join(tmpDir, 'test-read');
  const meta = { specFile: 'test.md', compactions: 0, startedAt: '2026-01-01T00:00:00Z', lastUpdated: '2026-01-01T00:00:00Z' };
  initBuildState(stateDir, meta);
  const result = readMeta(stateDir);
  assert.strictEqual(result.specFile, 'test.md');
});

test('writeMeta updates lastUpdated', () => {
  const stateDir = path.join(tmpDir, 'test-write');
  const meta = { specFile: 'test.md', compactions: 0, lastUpdated: '2020-01-01T00:00:00Z' };
  initBuildState(stateDir, meta);
  const before = readMeta(stateDir).lastUpdated;
  // Small delay to ensure timestamp differs
  writeMeta(stateDir, { ...readMeta(stateDir), compactions: 1 });
  const after = readMeta(stateDir);
  assert.strictEqual(after.compactions, 1);
  assert.ok(after.lastUpdated >= before);
});

test('readMeta throws for missing directory', () => {
  assert.throws(() => readMeta(path.join(tmpDir, 'nonexistent')));
});

// --- readTask / writeTask ---

test('writeTask creates task file and readTask reads it', () => {
  const stateDir = path.join(tmpDir, 'task-test');
  fs.mkdirSync(stateDir, { recursive: true });
  const taskData = {
    name: 'Build API',
    status: 'pending',
    agentType: 'builder',
    startedAt: null,
    completedAt: null,
    description: null,
    commitSha: null,
    filesChanged: [],
    dependsOn: [],
  };
  writeTask(stateDir, 'build-api', taskData);
  const result = readTask(stateDir, 'build-api');
  assert.strictEqual(result.name, 'Build API');
  assert.strictEqual(result.status, 'pending');
  assert.ok(result.lastUpdated);
});

test('readTask returns null for missing task', () => {
  const stateDir = path.join(tmpDir, 'task-missing');
  fs.mkdirSync(stateDir, { recursive: true });
  const result = readTask(stateDir, 'nonexistent');
  assert.strictEqual(result, null);
});

test('writeTask updates lastUpdated', () => {
  const stateDir = path.join(tmpDir, 'task-update');
  fs.mkdirSync(stateDir, { recursive: true });
  const taskData = { name: 'Test', status: 'pending', lastUpdated: '2020-01-01T00:00:00Z' };
  writeTask(stateDir, 'test-task', taskData);
  const result = readTask(stateDir, 'test-task');
  assert.ok(result.lastUpdated > '2020-01-01T00:00:00Z');
});

// --- readAllTasks ---

test('readAllTasks reads all task files, ignores _meta.json', () => {
  const stateDir = path.join(tmpDir, 'all-tasks');
  const meta = { specFile: 'test.md', compactions: 0, lastUpdated: '2026-01-01T00:00:00Z' };
  initBuildState(stateDir, meta);
  writeTask(stateDir, 'task-a', { name: 'A', status: 'completed' });
  writeTask(stateDir, 'task-b', { name: 'B', status: 'pending' });
  const tasks = readAllTasks(stateDir);
  assert.ok(tasks['task-a']);
  assert.ok(tasks['task-b']);
  assert.strictEqual(tasks['_meta'], undefined);
  assert.strictEqual(Object.keys(tasks).length, 2);
});

test('readAllTasks returns empty object for missing directory', () => {
  const tasks = readAllTasks(path.join(tmpDir, 'nope'));
  assert.deepStrictEqual(tasks, {});
});

// --- findActiveStateDir ---

test('findActiveStateDir returns dir with incomplete tasks', () => {
  const baseDir = path.join(tmpDir, 'specs', '.build-state', 'active-feature');
  initBuildState(baseDir, { specFile: 'test.md', compactions: 0, lastUpdated: '2026-01-01T00:00:00Z' });
  writeTask(baseDir, 'task-1', { name: 'T1', status: 'completed' });
  writeTask(baseDir, 'task-2', { name: 'T2', status: 'in_progress' });
  const result = findActiveStateDir(tmpDir);
  assert.strictEqual(result, baseDir);
});

test('findActiveStateDir returns null when all complete', () => {
  const baseDir = path.join(tmpDir, 'specs', '.build-state', 'done-feature');
  initBuildState(baseDir, { specFile: 'test.md', compactions: 0, lastUpdated: '2026-01-01T00:00:00Z' });
  writeTask(baseDir, 'task-1', { name: 'T1', status: 'completed' });
  const result = findActiveStateDir(tmpDir);
  assert.strictEqual(result, null);
});

test('findActiveStateDir returns null when no state dirs', () => {
  const result = findActiveStateDir(tmpDir);
  assert.strictEqual(result, null);
});

// --- deriveStateDirFromSpec ---

test('deriveStateDirFromSpec strips date prefix and extension', () => {
  const result = deriveStateDirFromSpec('specs/2026-03-14-my-feature.md');
  assert.strictEqual(result, path.join('specs', '.build-state', 'my-feature'));
});

test('deriveStateDirFromSpec handles multi-word names', () => {
  const result = deriveStateDirFromSpec('specs/2026-01-01-persistent-build-state.md');
  assert.strictEqual(result, path.join('specs', '.build-state', 'persistent-build-state'));
});

test('deriveStateDirFromSpec handles absolute paths', () => {
  const result = deriveStateDirFromSpec('/some/path/specs/2026-03-14-foo.md');
  assert.strictEqual(result, path.join('/some/path/specs', '.build-state', 'foo'));
});

console.log(`\nAll ${passed} tests passed.`);
