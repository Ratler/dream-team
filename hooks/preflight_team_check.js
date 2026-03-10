#!/usr/bin/env node
'use strict';

/**
 * PreToolUse hook: Checks that CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is enabled
 * before allowing a build skill invocation with a team-mode spec.
 *
 * Fires on every Skill tool call (matcher: "Skill" in hooks.json).
 * Reads toolInput from stdin, checks if it's the build skill, parses the
 * spec frontmatter, and blocks if mode is "team" without the env var set.
 *
 * Output protocol:
 *   {} = allow through
 *   {"decision": "block", "reason": "..."} = block the tool call
 * Always exits 0.
 */

const fs = require('fs');

function allow() {
  process.stdout.write('{}');
  process.exit(0);
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function parseFrontmatterMode(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const modeMatch = match[1].match(/^mode:\s*(.+)$/m);
  return modeMatch ? modeMatch[1].trim() : null;
}

function main() {
  let input = {};
  try {
    if (!process.stdin.isTTY) {
      const raw = fs.readFileSync(0, 'utf8');
      input = JSON.parse(raw);
    }
  } catch {
    return allow();
  }

  // PreToolUse uses camelCase; fall back to snake_case defensively
  const toolInput = input.toolInput || input.tool_input || {};
  const skill = (toolInput.skill || '').trim();

  // Only intercept the build skill
  if (skill !== 'build' && skill !== 'dream-team:build') {
    return allow();
  }

  const specPath = (toolInput.args || '').trim();

  // No spec path — let the build skill handle missing args
  if (!specPath) {
    return allow();
  }

  // Check the spec file exists
  if (!fs.existsSync(specPath)) {
    return block(`Spec file not found: ${specPath}. Check the path and try again.`);
  }

  // Read and parse frontmatter
  let content;
  try {
    content = fs.readFileSync(specPath, 'utf8');
  } catch {
    return allow();
  }

  const mode = parseFrontmatterMode(content);

  // No mode or non-team mode — allow through
  if (!mode || mode !== 'team') {
    return allow();
  }

  // Team mode — check env var
  const envVal = (process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS || '').trim().toLowerCase();
  if (envVal === '1' || envVal === 'true') {
    return allow();
  }

  return block(
    'This spec uses mode: team, which requires agent teams to be enabled.\n\n' +
    'Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in your environment or Claude Code settings and try again.'
  );
}

main();
