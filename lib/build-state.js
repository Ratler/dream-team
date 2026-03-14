#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const META_FILE = '_meta.json';

/**
 * Create the state directory and write _meta.json.
 */
function initBuildState(stateDir, meta) {
  fs.mkdirSync(stateDir, { recursive: true });
  meta.lastUpdated = meta.lastUpdated || new Date().toISOString();
  fs.writeFileSync(
    path.join(stateDir, META_FILE),
    JSON.stringify(meta, null, 2) + '\n'
  );
}

/**
 * Read and parse _meta.json from stateDir.
 */
function readMeta(stateDir) {
  const raw = fs.readFileSync(path.join(stateDir, META_FILE), 'utf8');
  return JSON.parse(raw);
}

/**
 * Write meta object to _meta.json, updating lastUpdated.
 */
function writeMeta(stateDir, meta) {
  meta.lastUpdated = new Date().toISOString();
  fs.writeFileSync(
    path.join(stateDir, META_FILE),
    JSON.stringify(meta, null, 2) + '\n'
  );
}

/**
 * Read a single task state file. Returns null if not found.
 */
function readTask(stateDir, taskId) {
  const filePath = path.join(stateDir, `${taskId}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Write a task state file, updating lastUpdated.
 */
function writeTask(stateDir, taskId, taskData) {
  taskData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(
    path.join(stateDir, `${taskId}.json`),
    JSON.stringify(taskData, null, 2) + '\n'
  );
}

/**
 * Read all task state files (excludes _meta.json).
 * Returns object keyed by task ID.
 */
function readAllTasks(stateDir) {
  const tasks = {};
  let files;
  try {
    files = fs.readdirSync(stateDir);
  } catch (err) {
    if (err.code === 'ENOENT') return tasks;
    throw err;
  }
  for (const file of files) {
    if (file === META_FILE || !file.endsWith('.json')) continue;
    const taskId = file.replace(/\.json$/, '');
    try {
      const raw = fs.readFileSync(path.join(stateDir, file), 'utf8');
      tasks[taskId] = JSON.parse(raw);
    } catch {
      // Skip malformed files
    }
  }
  return tasks;
}

/**
 * Find the state directory with an active (incomplete) build.
 * Scans <cwd>/specs/.build-state/ for subdirectories.
 * Returns the first directory path with incomplete tasks, or null.
 */
function findActiveStateDir(cwd) {
  const baseDir = path.join(cwd, 'specs', '.build-state');
  let entries;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stateDir = path.join(baseDir, entry.name);
    const tasks = readAllTasks(stateDir);
    const taskIds = Object.keys(tasks);
    if (taskIds.length === 0) continue;
    const allCompleted = taskIds.every(id => tasks[id].status === 'completed');
    if (!allCompleted) return stateDir;
  }
  return null;
}

/**
 * Derive state directory path from a spec file path.
 * specs/2026-03-14-my-feature.md → specs/.build-state/my-feature
 */
function deriveStateDirFromSpec(specPath) {
  const basename = path.basename(specPath, '.md');
  // Strip date prefix: YYYY-MM-DD-
  const name = basename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  const specsDir = path.dirname(specPath);
  return path.join(specsDir, '.build-state', name);
}

module.exports = {
  initBuildState,
  readMeta,
  writeMeta,
  readTask,
  writeTask,
  readAllTasks,
  findActiveStateDir,
  deriveStateDirFromSpec,
};
