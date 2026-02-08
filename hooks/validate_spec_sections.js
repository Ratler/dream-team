#!/usr/bin/env node
'use strict';

/**
 * Stop hook: Validates that the newest spec file contains all required sections
 * for its declared mode (sequential, delegated, team).
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
// dynamically from per-task Assigned To and Agent Type fields.
// Delegated mode still requires Team Members for its explicit dispatch list.
const TEAM_SECTIONS = [
  '## Team Configuration',
  '## Review Policy',
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

function main() {
  try {
    if (!process.stdin.isTTY) {
      try { fs.readFileSync(0, 'utf8'); } catch {}
    }

    const args = parseArgs(process.argv);
    const newest = findNewestFile(args.directory, args.extension);

    if (!newest) {
      const reason =
        `VALIDATION FAILED: No recent spec file found in ${args.directory}/.\n\n` +
        `ACTION REQUIRED: Create a spec file in ${args.directory}/ before completing.`;
      process.stdout.write(JSON.stringify({ result: 'block', reason }));
      process.exit(1);
    }

    const content = fs.readFileSync(newest, 'utf8');
    const mode = extractMode(content);

    if (!mode) {
      const reason =
        `VALIDATION FAILED: Spec file "${newest}" has no mode: field in frontmatter.\n\n` +
        `ACTION REQUIRED: Add a frontmatter block with mode: sequential|delegated|team.`;
      process.stdout.write(JSON.stringify({ result: 'block', reason }));
      process.exit(1);
    }

    const required = getRequiredSections(mode);
    const missing = required.filter(section => !content.includes(section));

    if (missing.length === 0) {
      process.stdout.write(JSON.stringify({
        result: 'continue',
        message: `Spec "${newest}" has all ${required.length} required sections for mode "${mode}"`
      }));
      process.exit(0);
    } else {
      const missingList = missing.map(s => `  - ${s}`).join('\n');
      const reason =
        `VALIDATION FAILED: Spec "${newest}" (mode: ${mode}) is missing ${missing.length} required section(s).\n\n` +
        `MISSING SECTIONS:\n${missingList}\n\n` +
        `ACTION REQUIRED: Add the missing sections to "${newest}". Do not stop until all sections are present.`;
      process.stdout.write(JSON.stringify({ result: 'block', reason }));
      process.exit(1);
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({
      result: 'continue',
      message: `Validation error (allowing through): ${err.message}`
    }));
    process.exit(0);
  }
}

main();
