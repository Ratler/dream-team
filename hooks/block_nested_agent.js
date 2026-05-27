#!/usr/bin/env node
'use strict';

/**
 * PreToolUse hook: Blocks Agent/Task tool calls that would create a nested
 * worktree from inside an existing agent worktree.
 *
 * Dream Team builder/debugger agents are spawned with isolation: "worktree",
 * which puts them in .claude/worktrees/agent-<id>/. The recursion risk is
 * specifically when an agent inside a worktree spawns *another* worktree —
 * each level pays for a fresh git clone, new SessionStart, and full context
 * reload. Spawning a non-isolated agent (reviewer, validator, etc.) from
 * inside a worktree is not recursive and does not need to be blocked.
 *
 * We only block when BOTH conditions hold:
 *   1. The current cwd looks like an agent worktree path.
 *   2. The dispatched tool's input requests isolation: "worktree".
 *
 * The cwd-only check used to be sufficient, but Claude Code 2.1.x can leak
 * a completed background+worktree subagent's cwd into the orchestrator's
 * session cwd field, producing false positives on legitimate review/validate
 * dispatches. Gating on the dispatched tool's `isolation` field avoids that.
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

  const toolInput = input.toolInput || input.tool_input || {};
  if (toolInput.isolation !== 'worktree') return allow();

  return block(
    `Refusing to spawn a worktree-isolated sub-agent from inside a Dream Team worktree (cwd: ${cwd}).\n\n` +
    `Worker agents (builder, debugger, etc.) must not call Agent/Task with isolation: "worktree" — ` +
    `that creates recursive nested worktrees and explodes token usage. If additional work is needed, ` +
    `return control to the orchestrator and let it dispatch the next agent.`
  );
}

main();
