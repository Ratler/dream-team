#!/usr/bin/env node
'use strict';

/**
 * PostCompact hook: Increments compaction counter in build state metadata.
 *
 * Tracks how many context compactions have occurred during a build,
 * providing a signal for stalled or long-running builds.
 *
 * Exit codes:
 *   0 = always (never blocks)
 */

const fs = require('fs');
const path = require('path');
const { findActiveStateDir, readMeta, writeMeta } = require(
  path.join(__dirname, '..', 'lib', 'build-state')
);

function main() {
  try {
    let input = {};
    if (!process.stdin.isTTY) {
      try {
        const raw = fs.readFileSync(0, 'utf8');
        input = JSON.parse(raw);
      } catch {}
    }

    const cwd = input.cwd;
    if (cwd) {
      const stateDir = findActiveStateDir(cwd);
      if (stateDir) {
        const meta = readMeta(stateDir);
        meta.compactions = (meta.compactions || 0) + 1;
        writeMeta(stateDir, meta);
        console.error(`[dream-team] PostCompact: compaction #${meta.compactions} for ${meta.specFile || 'unknown'}`);
      }
    }
  } catch (err) {
    console.error(`[dream-team] PostCompact hook error (allowing through): ${err.message}`);
  }
  process.exit(0);
}

main();
