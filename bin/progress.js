#!/usr/bin/env node
'use strict';

const path = require('path');
const { readMeta, readAllTasks, deriveStateDirFromSpec } = require(
  path.join(__dirname, '..', 'lib', 'build-state')
);

function formatDuration(ms) {
  if (ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '\u2026';
}

/**
 * Topological sort of tasks by dependsOn.
 * Falls back to alphabetical for ties.
 */
function sortTasks(tasks) {
  const entries = Object.entries(tasks);
  const visited = new Set();
  const order = [];

  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const task = tasks[id];
    if (task && task.dependsOn) {
      for (const dep of task.dependsOn) {
        visit(dep);
      }
    }
    order.push(id);
  }

  // Sort alphabetically first for deterministic tie-breaking
  entries.sort(([a], [b]) => a.localeCompare(b));
  for (const [id] of entries) {
    visit(id);
  }
  return order;
}

function main() {
  const specPath = process.argv[2];
  if (!specPath) {
    process.stdout.write('Usage: node bin/progress.js <path-to-spec>\n');
    process.exit(1);
  }

  const stateDir = deriveStateDirFromSpec(specPath);

  let meta;
  try {
    meta = readMeta(stateDir);
  } catch {
    process.stdout.write(`No build state found for ${specPath}\n`);
    process.exit(1);
  }

  const tasks = readAllTasks(stateDir);
  const taskIds = sortTasks(tasks);
  const now = Date.now();

  // Header
  const specName = path.basename(stateDir);
  process.stdout.write(`\nBuild: ${specName} (${meta.mode || 'unknown'})\n`);
  process.stdout.write(`Branch: ${meta.branch || '—'}\n`);
  process.stdout.write(`Started: ${formatTimestamp(meta.startedAt)} | Updated: ${formatTimestamp(meta.lastUpdated)} | Compactions: ${meta.compactions || 0}\n\n`);

  // Table header
  const COL_NUM = 4;
  const COL_TASK = 24;
  const COL_STATUS = 13;
  const COL_AGENT = 10;
  const COL_DUR = 10;
  const COL_COMMIT = 9;

  const header = [
    '#'.padStart(COL_NUM),
    'Task'.padEnd(COL_TASK),
    'Status'.padEnd(COL_STATUS),
    'Agent'.padEnd(COL_AGENT),
    'Duration'.padEnd(COL_DUR),
    'Commit'.padEnd(COL_COMMIT),
  ].join('  ');
  process.stdout.write(`${header}\n`);

  // Table rows
  taskIds.forEach((id, index) => {
    const task = tasks[id];
    if (!task) return;

    const num = String(index + 1).padStart(COL_NUM);
    const name = truncate(task.name || id, COL_TASK).padEnd(COL_TASK);

    const statusStr = (task.status || 'pending').padEnd(COL_STATUS);
    const marker = task.status === 'in_progress' ? '\u25B6  ' : '   ';

    const agent = (task.agentType || '—').padEnd(COL_AGENT);

    let duration = '—';
    if (task.status === 'completed' && task.startedAt && task.completedAt) {
      duration = formatDuration(new Date(task.completedAt) - new Date(task.startedAt));
    } else if (task.status === 'in_progress' && task.startedAt) {
      duration = formatDuration(now - new Date(task.startedAt));
    }
    duration = duration.padEnd(COL_DUR);

    const commit = task.commitSha ? task.commitSha.substring(0, 7) : '—';

    process.stdout.write(`${num}  ${name}${marker}${statusStr}${agent}  ${duration}  ${commit}\n`);
  });

  // Summary
  const completed = taskIds.filter(id => tasks[id] && tasks[id].status === 'completed').length;
  const total = taskIds.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  process.stdout.write(`\nProgress: ${completed}/${total} tasks (${pct}%)\n\n`);
}

main();
