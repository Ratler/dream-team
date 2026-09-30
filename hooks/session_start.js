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
  const guide = `You have dream-team installed — structured planning and execution for development projects.

**Workflow**: brainstorm → spec → build
1. /dream-team:plan <prompt> — interactive brainstorming. Produces no files; recommends an execution tier.
2. Write the spec (after brainstorming): /dream-team:spec-sequential (cheapest, single session) | /dream-team:spec-delegated (dispatches sub-agents) | /dream-team:spec-team (parallel Claude instances, highest cost).
3. /dream-team:build <path-to-spec> — executes the spec using the mode in its frontmatter.

Ad-hoc: /dream-team:debug <issue> — systematic debugging, standalone.

Delegated/team builds use specialized agents (builder, researcher, architect, reviewer, security-reviewer, tester, validator, debugger, docs, scout, merger) — see the Agent tool's available agent types for their descriptions.`;

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
