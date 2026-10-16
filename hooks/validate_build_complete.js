#!/usr/bin/env node
'use strict';

/**
 * Stop hook: Validates that all tasks are completed before allowing
 * the build skill to finish.
 *
 * Reads task list from stdin (provided by the Stop hook event). When the
 * input carries no tasks (Claude Code builds without the Task* tools), falls
 * back to the build-state files whose _meta.json branch matches the current
 * git branch.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readMeta, readAllTasks } = require(
  path.join(__dirname, '..', 'lib', 'build-state')
);

/**
 * Build a task list from the build state for the current git branch.
 * Returns [] when there is no matching build.
 */
function tasksFromBuildState(cwd) {
  let branch;
  try {
    branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: 'pipe'
    }).trim();
  } catch {
    return [];
  }
  const baseDir = path.join(cwd, 'specs', '.build-state');
  let entries;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stateDir = path.join(baseDir, entry.name);
    let meta;
    try {
      meta = readMeta(stateDir);
    } catch {
      continue;
    }
    if (meta.branch !== branch) continue;
    const tasks = readAllTasks(stateDir);
    return Object.entries(tasks).map(([id, t]) => ({
      id, subject: t.name || id, status: t.status, specFile: meta.specFile
    }));
  }
  return [];
}

function main() {
  try {
    let input = {};
    if (!process.stdin.isTTY) {
      try {
        const raw = fs.readFileSync(0, 'utf8');
        input = JSON.parse(raw);
      } catch {}
    }

    // Log last_assistant_message to stderr when available (visible in debug mode)
    if (input.last_assistant_message) {
      const truncated = input.last_assistant_message.substring(0, 200);
      console.error(`[dream-team] last_assistant_message: ${truncated}`);
    }

    let tasks = input.tasks || [];
    const fromState = tasks.length === 0;
    if (fromState) tasks = tasksFromBuildState(input.cwd || process.cwd());

    if (tasks.length === 0) {
      process.stdout.write(JSON.stringify({
        result: 'continue',
        message: 'No tasks to validate.'
      }));
      process.exit(0);
    }

    const incomplete = tasks.filter(t => t.status !== 'completed');

    if (incomplete.length === 0) {
      process.stdout.write(JSON.stringify({
        result: 'continue',
        message: `All ${tasks.length} tasks completed.`
      }));
      process.exit(0);
    } else {
      const listing = incomplete
        .map(t => `  - [${t.status}] ${t.subject} (id: ${t.id})`)
        .join('\n');
      const reason =
        `VALIDATION FAILED: ${incomplete.length} task(s) are not completed.\n\n` +
        `INCOMPLETE TASKS:\n${listing}\n\n` +
        `ACTION REQUIRED: Complete all remaining tasks before stopping. ` +
        (fromState
          ? `Use \`node ${path.join(__dirname, '..', 'bin', 'task-state.js')} ${incomplete[0].specFile} next\` ` +
            `to check current status and \`... complete <task-id>\` to mark tasks as completed.`
          : `Use TaskList to check current status and TaskUpdate to mark tasks as completed.`);
      process.stdout.write(JSON.stringify({ result: 'block', reason }));
      process.exit(1);
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({
      result: 'continue',
      message: `Validation error (allowing through): ${err.message}`
    }));
    process.exit(0);
  }
}

main();
