#!/usr/bin/env node
'use strict';

/**
 * Stop hook: Validates that all tasks are completed before allowing
 * the build skill to finish.
 *
 * Reads task list from stdin (provided by the Stop hook event).
 */

const fs = require('fs');

function main() {
  try {
    let input = {};
    if (!process.stdin.isTTY) {
      try {
        const raw = fs.readFileSync(0, 'utf8');
        input = JSON.parse(raw);
      } catch {}
    }

    const tasks = input.tasks || [];

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
        `Use TaskList to check current status and TaskUpdate to mark tasks as completed.`;
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
