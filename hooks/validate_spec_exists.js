#!/usr/bin/env node
'use strict';

/**
 * Stop hook: Validates that a new spec file was created in the target directory.
 *
 * Exit 0 + {"result":"continue"} = allow
 * Exit 1 + {"result":"block","reason":"..."} = block
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = 'specs';
const DEFAULT_EXT = '.md';
const MAX_AGE_MS = 5 * 60 * 1000;

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

function findRecentFiles(directory, extension) {
  if (!fs.existsSync(directory)) return [];

  const now = Date.now();
  const ext = extension.startsWith('.') ? extension : `.${extension}`;

  return fs.readdirSync(directory)
    .filter(f => f.endsWith(ext))
    .map(f => {
      const full = path.join(directory, f);
      const stat = fs.statSync(full);
      return { path: full, mtime: stat.mtimeMs };
    })
    .filter(f => (now - f.mtime) <= MAX_AGE_MS)
    .sort((a, b) => b.mtime - a.mtime);
}

function main() {
  try {
    if (!process.stdin.isTTY) {
      try { fs.readFileSync(0, 'utf8'); } catch {}
    }

    const args = parseArgs(process.argv);
    const recent = findRecentFiles(args.directory, args.extension);

    if (recent.length > 0) {
      const msg = `Spec file found: ${recent[0].path}`;
      process.stdout.write(JSON.stringify({ result: 'continue', message: msg }));
      process.exit(0);
    } else {
      const reason =
        `VALIDATION FAILED: No new spec file found in ${args.directory}/ with extension ${args.extension}.\n\n` +
        `ACTION REQUIRED: Use the Write tool to create a spec file in the ${args.directory}/ directory. ` +
        `Do not stop until the spec file has been created.`;
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
