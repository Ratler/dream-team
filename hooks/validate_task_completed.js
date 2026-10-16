#!/usr/bin/env node
'use strict';

/**
 * TaskCompleted hook: Logs task completions and persists build state.
 *
 * Three responsibilities (implemented in lib/task-completion.js, shared with
 * bin/task-state.js for Claude Code builds without the Task* tools):
 * 1. Audit logging — appends JSON line to ~/.claude/dream-team/logs/<cwd>.jsonl
 * 2. Build state — updates per-task state file in specs/.build-state/<spec>/
 * 3. Markdown formatting — runs markdown-table-formatter on .md files if installed
 *
 * Uses native agent_type field (since Claude Code 2.1.69) with fallback
 * to [agent-type: X] tag in task description for older versions.
 *
 * Exit codes:
 *   0 = always (logging only, never blocks)
 */

const fs = require('fs');
const path = require('path');
const { recordTaskCompletion } = require(
  path.join(__dirname, '..', 'lib', 'task-completion')
);

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

    recordTaskCompletion(input);

    process.exit(0);
  } catch (err) {
    // Fail open — don't block the build for hook bugs
    console.error(`[dream-team] TaskCompleted hook error (allowing through): ${err.message}`);
    process.exit(0);
  }
}

main();
