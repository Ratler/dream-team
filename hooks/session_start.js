#!/usr/bin/env node
'use strict';

/**
 * SessionStart hook for Dream Team plugin.
 * Injects a condensed usage guide into the session context so Claude
 * knows which skills are available and when to use each one.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..');

function buildContext() {
  const guide = `You have dream-team installed.

Dream Team provides structured planning and execution for development projects across three tiers.

**Workflow**: brainstorm → spec → build

**Step 1 — Brainstorm**:
- /dream-team:plan <prompt> — Interactive brainstorming session. Explores the codebase, asks clarifying questions, proposes approaches, validates the task breakdown. Produces no files. Recommends an execution tier at the end.

**Step 2 — Write Spec** (run after brainstorming):
- /dream-team:spec-sequential — Write a sequential spec. Cheapest. Single-session, tasks run one at a time.
- /dream-team:spec-delegated — Write a delegated spec. Dispatches specialized sub-agents (builder, researcher, etc.).
- /dream-team:spec-team — Write a team spec. Spawns separate Claude instances that collaborate. Most powerful, highest cost.

**Step 3 — Build**:
- /dream-team:build <path-to-spec> — Reads a spec file, detects mode from frontmatter, executes using the appropriate strategy.

**Ad-hoc Commands** (standalone, not part of the workflow):
- /dream-team:debug <issue> — Systematic debugging session. Reproduces issue, investigates root cause, applies targeted fix, verifies resolution. Uses Playwright MCP for frontend debugging when available.

**Available Agents** (for delegated and team modes):
- builder: writes code, implements features with TDD (opus)
- researcher: read-only exploration and context gathering (sonnet)
- architect: design decisions and structural recommendations (opus)
- reviewer: qualitative code review with severity categories (sonnet)
- security-reviewer: proactive security audit with structured checklist (opus)
- tester: writes and runs tests, TDD workflow (sonnet)
- validator: final mechanical pass/fail verification (haiku)
- debugger: systematic debugging, reproduces and fixes issues (opus)`;

  return guide;
}

function buildSystemMessage() {
  let version = 'unknown';
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    version = manifest.version;
  } catch {}
  return `Dream Team v${version} loaded — use /dream-team:plan to start`;
}

function main() {
  try {
    // Consume stdin (required by hook protocol)
    if (!process.stdin.isTTY) {
      try { fs.readFileSync(0, 'utf8'); } catch {}
    }

    const context = buildContext();

    const output = {
      systemMessage: buildSystemMessage(),
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context
      }
    };

    process.stdout.write(JSON.stringify(output));
  } catch (err) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'Dream Team plugin loaded (context injection error).'
      }
    }));
  }
}

main();
