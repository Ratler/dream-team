#!/usr/bin/env node
'use strict';

/**
 * Stop hook: Validates that the newest spec file contains all required sections
 * for its declared mode (sequential, delegated, team), plus structural checks:
 * - No unresolved <if> tags
 * - All tasks have a Tests field
 * - Dependency graph is valid (no dangling refs, no cycles)
 * - Skip Review For references valid task IDs or agent types
 * - Warns (but doesn't block) if spec-version is missing
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = 'specs';
const DEFAULT_EXT = '.md';
const MAX_AGE_MS = 5 * 60 * 1000;

const BASE_SECTIONS = [
  '## Task Description',
  '## Objective',
  '## Relevant Files',
  '## Step by Step Tasks',
  '## Documentation Requirements',
  '## Acceptance Criteria',
  '## Validation Commands',
];

const DELEGATED_SECTIONS = [
  '## Team Members',
  '## Review Policy',
];

// Team mode does NOT require Team Members — the orchestrator derives agents
// dynamically from per-task Agent Type fields.
// Delegated mode still requires Team Members for its explicit dispatch list.
const TEAM_SECTIONS = [
  '## Team Configuration',
  '## Review Policy',
];

const VALID_AGENT_TYPES = [
  'builder', 'researcher', 'reviewer', 'validator',
  'architect', 'tester', 'debugger', 'security-reviewer',
];

function parseArgs(argv) {
  const args = { directory: DEFAULT_DIR, extension: DEFAULT_EXT };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--directory' || argv[i] === '-d') && argv[i + 1]) {
      args.directory = argv[++i];
    } else if ((argv[i] === '--extension' || argv[i] === '-e') && argv[i + 1]) {
      args.extension = argv[++i];
    }
  }
  return args;
}

function findNewestFile(directory, extension) {
  if (!fs.existsSync(directory)) return null;

  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const now = Date.now();

  const files = fs.readdirSync(directory)
    .filter(f => f.endsWith(ext))
    .map(f => {
      const full = path.join(directory, f);
      const stat = fs.statSync(full);
      return { path: full, mtime: stat.mtimeMs };
    })
    .filter(f => (now - f.mtime) <= MAX_AGE_MS)
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].path : null;
}

function extractMode(content) {
  const lines = content.split('\n');
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      const match = line.match(/^mode:\s*(.+)$/);
      if (match) return match[1].trim();
    }
  }
  return null;
}

function extractFrontmatterField(content, field) {
  const lines = content.split('\n');
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = line.match(new RegExp(`^${escapedField}:\\s*(.+)$`));
      if (match) return match[1].trim();
    }
  }
  return null;
}

function getRequiredSections(mode) {
  switch (mode) {
    case 'delegated':
      return [...BASE_SECTIONS, ...DELEGATED_SECTIONS];
    case 'team':
      return [...BASE_SECTIONS, ...TEAM_SECTIONS];
    case 'sequential':
    default:
      return [...BASE_SECTIONS];
  }
}

/**
 * Check for unresolved <if> and </if> tags in spec content.
 * Returns array of { line, content } for each match.
 */
function checkUnresolvedIfTags(content) {
  const lines = content.split('\n');
  const found = [];

  // Skip frontmatter
  let inFrontmatter = false;
  let pastFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    if (!pastFrontmatter) {
      if (lines[i].trim() === '---') {
        if (inFrontmatter) { pastFrontmatter = true; continue; }
        inFrontmatter = true;
        continue;
      }
      if (!inFrontmatter) pastFrontmatter = true;
      if (!pastFrontmatter) continue;
    }

    if (/^<if\s/.test(lines[i].trim()) || /^<\/if>/.test(lines[i].trim())) {
      found.push({ line: i + 1, content: lines[i].trim() });
    }
  }
  return found;
}

/**
 * Parse tasks from the Step by Step Tasks section.
 * Returns array of { name, taskId, dependsOn, hasTests }.
 */
function parseTasks(content) {
  // Extract everything after "## Step by Step Tasks"
  const tasksMatch = content.match(/## Step by Step Tasks\s*\n([\s\S]*?)(?=\n## (?!#)|$)/);
  if (!tasksMatch) return [];

  const tasksSection = tasksMatch[1];
  // Split on task headers: ### 1. Task Name, ### N-1. Code Review, ### N. Final Validation
  const taskBlocks = tasksSection.split(/(?=^### \S+\.\s)/m).filter(b => b.trim());

  return taskBlocks.map(block => {
    const nameMatch = block.match(/^### \S+\.\s+(.+)/m);
    const idMatch = block.match(/\*\*Task ID\*\*:\s*(.+)/);
    const depsMatch = block.match(/\*\*Depends On\*\*:\s*(.+)/);
    const hasTests = /\*\*Tests\*\*:/.test(block);

    const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
    const taskId = idMatch ? idMatch[1].trim() : null;
    const depsRaw = depsMatch ? depsMatch[1].trim() : 'none';
    const dependsOn = depsRaw === 'none'
      ? []
      : depsRaw.split(',').map(d => d.trim()).filter(Boolean);

    return { name, taskId, dependsOn, hasTests };
  });
}

/**
 * Check that all properly structured tasks (those with a Task ID) have a Tests field.
 * Returns array of task names missing the field.
 */
function checkMissingTestsField(tasks) {
  return tasks.filter(t => t.taskId && !t.hasTests).map(t => t.name);
}

/**
 * Validate dependency graph: check for dangling refs and cycles.
 * Returns { danglingRefs: [{taskId, references}], cycles: [string] }.
 */
function validateDependencyGraph(tasks) {
  const taskIds = new Set(tasks.map(t => t.taskId).filter(Boolean));
  const danglingRefs = [];
  const adjacency = {};

  for (const task of tasks) {
    if (!task.taskId) continue;
    adjacency[task.taskId] = [];

    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        danglingRefs.push({ taskId: task.taskId, references: dep });
      } else {
        // dep -> task.taskId (dep must complete before task)
        if (!adjacency[dep]) adjacency[dep] = [];
      }
    }
  }

  // Detect cycles using DFS coloring
  // WHITE=0, GRAY=1, BLACK=2
  const color = {};
  for (const id of taskIds) color[id] = 0;

  // Build forward adjacency: task.taskId depends on dep → edge from dep to task.taskId
  const forward = {};
  for (const id of taskIds) forward[id] = [];
  for (const task of tasks) {
    if (!task.taskId) continue;
    for (const dep of task.dependsOn) {
      if (taskIds.has(dep)) {
        forward[dep].push(task.taskId);
      }
    }
  }

  const cycles = [];
  const path = [];

  function dfs(node) {
    color[node] = 1; // GRAY
    path.push(node);
    for (const neighbor of (forward[node] || [])) {
      if (color[neighbor] === 1) {
        // Found cycle — extract it from path
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).concat(neighbor);
        cycles.push(cycle.join(' -> '));
      } else if (color[neighbor] === 0) {
        dfs(neighbor);
      }
    }
    path.pop();
    color[node] = 2; // BLACK
  }

  for (const id of taskIds) {
    if (color[id] === 0) dfs(id);
  }

  return { danglingRefs, cycles };
}

/**
 * Validate Skip Review For entries against task IDs and agent types.
 * Returns array of invalid entries.
 */
function validateSkipReviewFor(content, tasks) {
  const match = content.match(/\*\*Skip Review For\*\*:\s*(.+)/);
  if (!match) return [];

  const value = match[1].trim();
  if (value === 'none') return [];

  const taskIds = new Set(tasks.map(t => t.taskId).filter(Boolean));
  const entries = value.split(',').map(e => e.trim()).filter(Boolean);
  const invalid = [];

  for (const entry of entries) {
    if (!taskIds.has(entry) && !VALID_AGENT_TYPES.includes(entry)) {
      invalid.push(entry);
    }
  }

  return invalid;
}

function block(reason) {
  process.stdout.write(JSON.stringify({ result: 'block', reason }));
  process.exit(1);
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

    const args = parseArgs(process.argv);
    const newest = findNewestFile(args.directory, args.extension);

    if (!newest) {
      block(
        `VALIDATION FAILED: No recent spec file found in ${args.directory}/.\n\n` +
        `ACTION REQUIRED: Create a spec file in ${args.directory}/ before completing.`
      );
    }

    const content = fs.readFileSync(newest, 'utf8');
    const mode = extractMode(content);

    if (!mode) {
      block(
        `VALIDATION FAILED: Spec file "${newest}" has no mode: field in frontmatter.\n\n` +
        `ACTION REQUIRED: Add a frontmatter block with mode: sequential|delegated|team.`
      );
    }

    // 1. Section presence check
    const required = getRequiredSections(mode);
    const missing = required.filter(section => !content.includes(section));

    if (missing.length > 0) {
      const missingList = missing.map(s => `  - ${s}`).join('\n');
      block(
        `VALIDATION FAILED: Spec "${newest}" (mode: ${mode}) is missing ${missing.length} required section(s).\n\n` +
        `MISSING SECTIONS:\n${missingList}\n\n` +
        `ACTION REQUIRED: Add the missing sections to "${newest}". Do not stop until all sections are present.`
      );
    }

    // 2. Unresolved <if> tags
    const ifTags = checkUnresolvedIfTags(content);
    if (ifTags.length > 0) {
      const tagList = ifTags.map(t => `  - Line ${t.line}: ${t.content}`).join('\n');
      block(
        `VALIDATION FAILED: Spec "${newest}" contains ${ifTags.length} unresolved template tag(s).\n\n` +
        `UNRESOLVED TAGS:\n${tagList}\n\n` +
        `ACTION REQUIRED: Remove or resolve all <if> and </if> tags. These are template directives that should not appear in generated specs.`
      );
    }

    // 3. Parse tasks for remaining checks
    const tasks = parseTasks(content);

    // 4. Missing Tests field
    if (tasks.length > 0) {
      const missingTests = checkMissingTestsField(tasks);
      if (missingTests.length > 0) {
        const taskList = missingTests.map(n => `  - ${n}`).join('\n');
        block(
          `VALIDATION FAILED: Spec "${newest}" has ${missingTests.length} task(s) missing the **Tests** field.\n\n` +
          `TASKS MISSING TESTS:\n${taskList}\n\n` +
          `ACTION REQUIRED: Add a **Tests** field to every task. Use "N/A" for tasks with no testable code.`
        );
      }
    }

    // 5. Dependency graph validation
    if (tasks.length > 0) {
      const { danglingRefs, cycles } = validateDependencyGraph(tasks);

      if (danglingRefs.length > 0) {
        const refList = danglingRefs.map(r => `  - Task "${r.taskId}" references unknown task ID "${r.references}"`).join('\n');
        block(
          `VALIDATION FAILED: Spec "${newest}" has ${danglingRefs.length} dangling dependency reference(s).\n\n` +
          `DANGLING REFERENCES:\n${refList}\n\n` +
          `ACTION REQUIRED: Fix the "Depends On" fields to reference only valid Task IDs defined in the spec.`
        );
      }

      if (cycles.length > 0) {
        const cycleList = cycles.map(c => `  - ${c}`).join('\n');
        block(
          `VALIDATION FAILED: Spec "${newest}" has circular dependencies.\n\n` +
          `CYCLES:\n${cycleList}\n\n` +
          `ACTION REQUIRED: Remove circular dependencies so tasks can be executed in order.`
        );
      }
    }

    // 6. Skip Review For validation (delegated/team only)
    if (mode === 'delegated' || mode === 'team') {
      const invalidSkip = validateSkipReviewFor(content, tasks);
      if (invalidSkip.length > 0) {
        const entryList = invalidSkip.map(e => `  - "${e}"`).join('\n');
        block(
          `VALIDATION FAILED: Spec "${newest}" has invalid "Skip Review For" entries.\n\n` +
          `INVALID ENTRIES:\n${entryList}\n\n` +
          `ACTION REQUIRED: "Skip Review For" must contain comma-separated task IDs or agent types ` +
          `(${VALID_AGENT_TYPES.join(', ')}). Use "none" to review everything.`
        );
      }
    }

    // 7. spec-version warning (soft — don't block)
    const specVersion = extractFrontmatterField(content, 'spec-version');
    const warnings = [];
    if (!specVersion) {
      warnings.push('spec-version field missing from frontmatter (consider adding spec-version: 1)');
    }

    const warningText = warnings.length > 0 ? ` Warnings: ${warnings.join('; ')}` : '';
    process.stdout.write(JSON.stringify({
      result: 'continue',
      message: `Spec "${newest}" passed all validation checks for mode "${mode}".${warningText}`
    }));
    process.exit(0);

  } catch (err) {
    process.stdout.write(JSON.stringify({
      result: 'continue',
      message: `Validation error (allowing through): ${err.message}`
    }));
    process.exit(0);
  }
}

main();
