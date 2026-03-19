#!/usr/bin/env node
'use strict';

/**
 * TaskCompleted hook: Logs task completions and persists build state.
 *
 * Three responsibilities:
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
const { execSync } = require('child_process');
const { findActiveStateDir, readTask, writeTask, readAllTasks } = require(
  path.join(__dirname, '..', 'lib', 'build-state')
);

/**
 * Resolve agent type from hook input.
 * Prefers native agent_type field (available since Claude Code 2.1.69),
 * falls back to [agent-type: <type>] tag in task description.
 */
function resolveAgentType(input) {
  if (input.agent_type) return input.agent_type;
  const description = input.task_description || '';
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

/**
 * Persist completed task state to the build-state directory.
 * Finds the active build, matches the task by ID or subject, and updates it.
 */
function updateBuildState(input, agentType) {
  try {
    const cwd = input.cwd;
    if (!cwd) return;

    const stateDir = findActiveStateDir(cwd);
    if (!stateDir) return;

    // Try to match by task_id first, then by task_subject against task names
    const taskId = input.task_id || '';
    let matchedId = null;

    if (taskId) {
      const existing = readTask(stateDir, taskId);
      if (existing) {
        matchedId = taskId;
      } else {
        // Normalize: try kebab-case version of the task_id
        const kebab = taskId.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const existing2 = readTask(stateDir, kebab);
        if (existing2) matchedId = kebab;
      }
    }

    // Fallback: match by task_subject against task name fields
    if (!matchedId && input.task_subject) {
      const allTasks = readAllTasks(stateDir);
      for (const [id, task] of Object.entries(allTasks)) {
        if (task.name === input.task_subject) {
          matchedId = id;
          break;
        }
      }
    }

    if (!matchedId) {
      console.error(`[dream-team] Build state: no matching task for id="${taskId}" subject="${input.task_subject || ''}"`);
      return;
    }

    const taskData = readTask(stateDir, matchedId);
    if (!taskData) return;

    taskData.status = 'completed';
    taskData.completedAt = new Date().toISOString();
    taskData.agentType = agentType;
    taskData.description = input.task_description || null;

    // Extract commit SHA from description
    const desc = input.task_description || '';
    const commitMatch = desc.match(/commit\s+([a-f0-9]{7,40})/i);
    if (commitMatch) taskData.commitSha = commitMatch[1];

    // Extract files changed from description (lines starting with "- " after Files heading)
    const filesMatch = desc.match(/files?\s*(?:changed|modified|created)?:?\s*\n((?:\s*-\s+.+\n?)+)/i);
    if (filesMatch) {
      taskData.filesChanged = filesMatch[1]
        .split('\n')
        .map(l => l.replace(/^\s*-\s+/, '').trim())
        .filter(Boolean);
    }

    writeTask(stateDir, matchedId, taskData);
    console.error(`[dream-team] Build state: marked "${matchedId}" as completed`);
  } catch (err) {
    console.error(`[dream-team] Build state update failed (non-fatal): ${err.message}`);
  }
}

/**
 * Extract .md file paths from task description.
 * Looks for file paths ending in .md in "Files changed" or similar sections.
 */
function extractMdFiles(description) {
  if (!description) return [];
  const mdFiles = [];
  // Match lines that contain file paths ending in .md
  const lines = description.split('\n');
  for (const line of lines) {
    // Match patterns like "- path/to/file.md" or "- path/to/file.md — description"
    const match = line.match(/^\s*-\s+([^\s—–-]+\.md)/);
    if (match) {
      mdFiles.push(match[1]);
    }
  }
  return mdFiles;
}

/**
 * Run markdown-table-formatter on .md files changed during a task.
 * Noop if the formatter is not installed or no .md files were changed.
 */
function formatMarkdownTables(input) {
  try {
    const description = input.task_description || '';
    const mdFiles = extractMdFiles(description);
    if (mdFiles.length === 0) return;

    // Check if markdown-table-formatter is installed
    try {
      execSync('which markdown-table-formatter', { stdio: 'pipe' });
    } catch {
      console.error('[dream-team] markdown-table-formatter not installed, skipping table formatting');
      return;
    }

    // Validate and format each .md file
    const formatted = [];
    for (const file of mdFiles) {
      try {
        // Sanitize: only allow safe file path characters
        if (!/^[a-zA-Z0-9_./-]+$/.test(file)) {
          console.error(`[dream-team] Skipping file with unsafe characters: ${file}`);
          continue;
        }
        // Only format files that exist
        if (!fs.existsSync(file)) continue;
        execSync(`markdown-table-formatter ${file}`, { stdio: 'pipe' });
        formatted.push(file);
      } catch (err) {
        console.error(`[dream-team] Failed to format ${file}: ${err.message}`);
      }
    }

    // Commit formatted files if any were changed
    if (formatted.length > 0) {
      try {
        const safeFiles = formatted.map(f => `"${f}"`).join(' ');
        execSync(`git add ${safeFiles} && git commit -m "style: format markdown tables"`, { stdio: 'pipe' });
        console.error(`[dream-team] Formatted markdown tables in: ${formatted.join(', ')}`);
      } catch {
        // No changes after formatting, or git error — not fatal
        console.error('[dream-team] No formatting changes to commit (tables already formatted)');
      }
    }
  } catch (err) {
    console.error(`[dream-team] Markdown formatting failed (non-fatal): ${err.message}`);
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

    const agentType = resolveAgentType(input);

    // Log the completion (all agent types)
    writeLogEntry(input, agentType);

    // Persist to build state (if active build exists)
    updateBuildState(input, agentType);

    // Format markdown tables in changed .md files (if formatter is installed)
    formatMarkdownTables(input);

    process.exit(0);
  } catch (err) {
    // Fail open — don't block the build for hook bugs
    console.error(`[dream-team] TaskCompleted hook error (allowing through): ${err.message}`);
    process.exit(0);
  }
}

main();
