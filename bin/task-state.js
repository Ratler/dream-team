#!/usr/bin/env node
'use strict';

/**
 * Task tracking CLI for builds where the native Task* tools
 * (TaskCreate/TaskUpdate/TaskList/TaskGet) are unavailable.
 *
 * The build-state directory becomes the task list. `complete` does what the
 * TaskCompleted hook does (audit log, state persistence, markdown formatting),
 * since that hook never fires without the Task* tools.
 *
 * Usage:
 *   node bin/task-state.js <spec-path> start <task-id>
 *   node bin/task-state.js <spec-path> complete <task-id> [--agent-type <type>]  (report on stdin)
 *   node bin/task-state.js <spec-path> commit <task-id> <sha>
 *   node bin/task-state.js <spec-path> next
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readTask, writeTask, readAllTasks, deriveStateDirFromSpec } = require(
  path.join(__dirname, '..', 'lib', 'build-state')
);
const { recordTaskCompletion } = require(
  path.join(__dirname, '..', 'lib', 'task-completion')
);

const USAGE =
  'Usage:\n' +
  '  node bin/task-state.js <spec-path> start <task-id>\n' +
  '  node bin/task-state.js <spec-path> complete <task-id> [--agent-type <type>]  (report on stdin)\n' +
  '  node bin/task-state.js <spec-path> commit <task-id> <sha>\n' +
  '  node bin/task-state.js <spec-path> next\n';

function fail(message) {
  process.stderr.write(`[dream-team] ${message}\n`);
  process.exit(1);
}

function requireTask(stateDir, taskId) {
  if (!taskId) fail(`missing <task-id>\n${USAGE}`);
  const task = readTask(stateDir, taskId);
  if (!task) fail(`no task "${taskId}" in ${stateDir}`);
  return task;
}

function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function cmdStart(stateDir, taskId) {
  const task = requireTask(stateDir, taskId);
  task.status = 'in_progress';
  task.startedAt = task.startedAt || new Date().toISOString();
  writeTask(stateDir, taskId, task);
  process.stdout.write(`${taskId}: in_progress\n`);
}

function cmdComplete(stateDir, taskId, args) {
  const task = requireTask(stateDir, taskId);
  const flagIdx = args.indexOf('--agent-type');
  const flagType = flagIdx >= 0 ? args[flagIdx + 1] : null;
  const report = readStdin().trim();
  const hasTag = /\[agent-type:\s*[^\]]+\]/.test(report);

  const { matchedId } = recordTaskCompletion({
    cwd: process.cwd(),
    task_id: taskId,
    task_subject: task.name || '',
    task_description: report,
    agent_type: flagType || (hasTag ? '' : task.agentType || ''),
  }, { stateDir });

  if (!matchedId) fail(`failed to record completion for "${taskId}"`);
  process.stdout.write(`${taskId}: completed\n`);
}

function cmdCommit(stateDir, taskId, sha) {
  const task = requireTask(stateDir, taskId);
  if (!sha) fail(`missing <sha>\n${USAGE}`);
  let fullSha;
  let files;
  try {
    fullSha = execFileSync('git', ['rev-parse', '--verify', `${sha}^{commit}`], { encoding: 'utf8' }).trim();
    files = execFileSync('git', ['show', '--name-only', '--format=', fullSha], { encoding: 'utf8' })
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  } catch (err) {
    fail(`cannot read commit "${sha}": ${err.message}`);
  }
  task.commitSha = fullSha;
  task.filesChanged = Array.from(new Set([...(task.filesChanged || []), ...files]));
  writeTask(stateDir, taskId, task);
  process.stdout.write(`${taskId}: commit ${fullSha.substring(0, 7)} (${files.length} files)\n`);
}

function cmdNext(stateDir) {
  const tasks = readAllTasks(stateDir);
  const ids = Object.keys(tasks).sort();
  const isDone = id => tasks[id] && tasks[id].status === 'completed';
  const lines = [];
  for (const id of ids) {
    const task = tasks[id];
    if (task.status === 'completed') continue;
    const deps = task.dependsOn || [];
    const blockers = deps.filter(d => !isDone(d));
    const state = task.status === 'in_progress'
      ? 'in_progress'
      : blockers.length === 0 ? 'ready' : `blocked by ${blockers.join(', ')}`;
    lines.push(`${id} [${task.agentType || 'unknown'}] ${state}`);
  }
  if (lines.length === 0) {
    process.stdout.write('All tasks completed.\n');
    return;
  }
  process.stdout.write(lines.join('\n') + '\n');
}

function main() {
  const [specPath, command, ...rest] = process.argv.slice(2);
  if (!specPath || !command) {
    process.stdout.write(USAGE);
    process.exit(1);
  }

  const stateDir = deriveStateDirFromSpec(specPath);
  if (!fs.existsSync(stateDir)) {
    fail(`no build state at ${stateDir} — initialize it at build start (see the build skill's Build State section)`);
  }

  switch (command) {
    case 'start':
      return cmdStart(stateDir, rest[0]);
    case 'complete':
      return cmdComplete(stateDir, rest[0], rest.slice(1));
    case 'commit':
      return cmdCommit(stateDir, rest[0], rest[1]);
    case 'next':
      return cmdNext(stateDir);
    default:
      process.stdout.write(USAGE);
      process.exit(1);
  }
}

main();
