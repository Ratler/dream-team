#!/usr/bin/env node
'use strict';

/**
 * PreToolUse hook: Blocks Agent/Task tool calls from inside an agent worktree.
 *
 * Dream Team builder/debugger agents are spawned with isolation: "worktree",
 * which puts them in .claude/worktrees/agent-<id>/. If a worker agent tries
 * to spawn another agent (especially with isolation: "worktree"), Claude
 * Code creates a nested worktree — and recursively. Each level pays for a
 * fresh git clone, new SessionStart, and full context reload.
 *
 * The agents/*.md frontmatter sets `disallowedTools: Task, Agent` to block
 * this at the agent definition level. This hook is belt-and-braces: even
 * if a future agent omits the flag, this hook prevents the recursion.
 *
 * Output protocol:
 *   {} = allow through
 *   {"decision": "block", "reason": "..."} = block the tool call
 * Always exits 0.
 */

const fs = require('fs');

function allow() { process.stdout.write('{}'); process.exit(0); }
function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

const WORKTREE_PATH_RE = /\/\.claude\/worktrees\/agent-[a-f0-9]+(\/|$)/;

function main() {
  let input = {};
  try {
    if (!process.stdin.isTTY) {
      input = JSON.parse(fs.readFileSync(0, 'utf8'));
    }
  } catch {
    return allow();
  }

  const toolName = input.toolName || input.tool_name || '';
  if (toolName !== 'Agent' && toolName !== 'Task') return allow();

  const cwd = input.cwd || process.cwd();
  if (!WORKTREE_PATH_RE.test(cwd)) return allow();

  return block(
    `Refusing to spawn a sub-agent from inside a Dream Team worktree (cwd: ${cwd}).\n\n` +
    `Worker agents (builder, debugger, etc.) must not call Agent/Task — that creates ` +
    `recursive nested worktrees and explodes token usage. If additional work is needed, ` +
    `return control to the orchestrator and let it dispatch the next agent.`
  );
}

main();
