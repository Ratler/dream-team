#!/usr/bin/env node
'use strict';

/**
 * Task completion recording, shared by the TaskCompleted hook and the
 * bin/task-state.js CLI (used when the native Task* tools are unavailable).
 *
 * Three responsibilities:
 * 1. Audit logging — appends JSON line to ~/.claude/dream-team/logs/<cwd>.jsonl
 * 2. Build state — updates per-task state file in specs/.build-state/<spec>/
 * 3. Markdown formatting — runs markdown-table-formatter on .md files if installed
 *
 * Input uses the TaskCompleted hook payload shape: cwd, task_id, task_subject,
 * task_description, agent_type, teammate_name, team_name, session_id.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { findActiveStateDir, readTask, writeTask, readAllTasks } = require(
  path.join(__dirname, 'build-state')
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
    // Log errors to stderr but don't fail the caller
    console.error(`[dream-team] Failed to write audit log: ${err.message}`);
  }
}

/**
 * Persist completed task state to the build-state directory.
 * Uses stateDir when given, otherwise finds the active build under input.cwd.
 * Matches the task by ID or subject, and updates it.
 * Returns the matched task ID, or null.
 */
function updateBuildState(input, agentType, stateDir) {
  try {
    const cwd = input.cwd;
    if (!stateDir) {
      if (!cwd) return null;
      stateDir = findActiveStateDir(cwd);
    }
    if (!stateDir) return null;

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
      return null;
    }

    const taskData = readTask(stateDir, matchedId);
    if (!taskData) return null;

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
    return matchedId;
  } catch (err) {
    console.error(`[dream-team] Build state update failed (non-fatal): ${err.message}`);
    return null;
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
        // Skip files with uncommitted changes: the commit below would sweep
        // them in under a "style" message.
        const dirty = execSync(`git status --porcelain -- ${file}`, { stdio: 'pipe', encoding: 'utf8' }).trim();
        if (dirty) {
          console.error(`[dream-team] Skipping ${file}: uncommitted changes, not formatting`);
          continue;
        }
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

/**
 * Record a task completion: audit log, build state, markdown formatting.
 * Returns { agentType, matchedId }.
 */
function recordTaskCompletion(input, options) {
  const opts = options || {};
  const agentType = resolveAgentType(input);
  writeLogEntry(input, agentType);
  const matchedId = updateBuildState(input, agentType, opts.stateDir);
  formatMarkdownTables(input);
  return { agentType, matchedId };
}

module.exports = {
  resolveAgentType,
  sanitizePath,
  getLogDir,
  writeLogEntry,
  updateBuildState,
  extractMdFiles,
  formatMarkdownTables,
  recordTaskCompletion,
};
