#!/usr/bin/env node
'use strict';

/**
 * TaskCompleted hook: Logs all task completions to a per-project audit log.
 *
 * Reads task data from stdin (provided by the TaskCompleted hook event).
 *
 * Logging:
 *   - Appends a JSON line to ~/.claude/dream-team/logs/<sanitized-cwd>.jsonl
 *   - Override log directory with DREAM_TEAM_LOG_DIR env var (for testing)
 *
 * Exit codes:
 *   0 = always (logging only, never blocks)
 */

const fs = require('fs');
const path = require('path');

// Agent types (kept for reference, no longer used for validation)
// const VALIDATED_TYPES = ['builder', 'debugger'];

/**
 * Extract agent type from task description.
 * Looks for [agent-type: <type>] pattern.
 * Returns the type string or 'unknown' if not found.
 */
function extractAgentType(description) {
  if (!description) return 'unknown';
  const match = description.match(/\[agent-type:\s*([^\]]+)\]/);
  return match ? match[1].trim() : 'unknown';
}

/**
 * Sanitize cwd path for use as a filename.
 * Replaces '/' with '-' and removes leading '-'.
 */
function sanitizePath(cwd) {
  return cwd.replace(/\//g, '-').replace(/^-/, '');
}

/**
 * Get the log directory path.
 * Uses DREAM_TEAM_LOG_DIR env var if set, otherwise ~/.claude/dream-team/logs/
 */
function getLogDir() {
  if (process.env.DREAM_TEAM_LOG_DIR) {
    return process.env.DREAM_TEAM_LOG_DIR;
  }
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return path.join(home, '.claude', 'dream-team', 'logs');
}

/**
 * Append a JSON line to the audit log.
 */
function writeLogEntry(input, agentType) {
  try {
    const logDir = getLogDir();
    const cwd = input.cwd || 'unknown';
    const sanitized = sanitizePath(cwd);
    const logFile = path.join(logDir, `${sanitized}.jsonl`);

    // Create directory if it doesn't exist
    fs.mkdirSync(logDir, { recursive: true });

    const entry = {
      ts: new Date().toISOString(),
      task_id: input.task_id || '',
      task_subject: input.task_subject || '',
      agent_type: agentType,
      teammate: input.teammate_name || '',
      team: input.team_name || '',
      session: input.session_id || '',
      cwd: cwd
    };

    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Log errors to stderr but don't fail the hook
    console.error(`[dream-team] Failed to write audit log: ${err.message}`);
  }
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

    const description = input.task_description || '';
    const agentType = extractAgentType(description);

    // Log the completion (all agent types)
    writeLogEntry(input, agentType);

    process.exit(0);
  } catch (err) {
    // Fail open — don't block the build for hook bugs
    console.error(`[dream-team] TaskCompleted hook error (allowing through): ${err.message}`);
    process.exit(0);
  }
}

main();
