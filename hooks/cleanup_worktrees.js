#!/usr/bin/env node
'use strict';

/**
 * Stop hook: Cleans up agent worktrees after a Dream Team build completes.
 *
 * Workflow:
 *   1. Run `git worktree prune` to clear stale registry entries.
 *   2. Walk .claude/worktrees/agent-* on disk.
 *   3. Remove orphan dirs (on-disk but not in `git worktree list`).
 *   4. For registered worktrees: remove only if clean (no uncommitted changes)
 *      and not locked. Delete the matching `worktree-agent-<id>` branch too.
 *   5. Skip and report anything locked or dirty — those signal "do not touch".
 *
 * Always exits 0. Cleanup failures must never block the build from completing;
 * task validation is `validate_build_complete.js`'s job.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function safe(fn) {
  try { return fn(); } catch { return null; }
}

function gitOk(args, opts) {
  try {
    execSync(`git ${args}`, Object.assign({ encoding: 'utf8', stdio: 'pipe' }, opts));
    return true;
  } catch {
    return false;
  }
}

function listRegistered(cwd) {
  const out = safe(() => execSync('git worktree list --porcelain', { cwd, encoding: 'utf8' })) || '';
  const map = new Map();
  let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length), locked: false };
      map.set(cur.path, cur);
    } else if (line === 'locked' && cur) {
      cur.locked = true;
    }
  }
  return map;
}

function cleanupOne(cwd, name) {
  const dir = path.join(cwd, '.claude', 'worktrees', name);
  const stat = safe(() => fs.statSync(dir));
  if (!stat || !stat.isDirectory()) return { name, action: 'skip', reason: 'not a directory' };

  const registered = listRegistered(cwd).get(dir);

  if (registered && registered.locked) {
    return { name, action: 'skip', reason: 'locked' };
  }

  if (registered) {
    const dirty = safe(() => execSync('git status --porcelain', { cwd: dir, encoding: 'utf8' })) || '';
    if (dirty.trim().length > 0) {
      return { name, action: 'skip', reason: 'uncommitted changes' };
    }
    if (!gitOk(`worktree remove "${dir}"`, { cwd })) {
      return { name, action: 'skip', reason: 'git worktree remove failed' };
    }
    gitOk(`branch -D "worktree-${name}"`, { cwd });
    return { name, action: 'removed', reason: 'registered+clean' };
  }

  // Orphan: not in registry, just rm -rf
  if (safe(() => fs.rmSync(dir, { recursive: true, force: true })) === null) {
    // null can mean rmSync returned undefined (success) — re-check via stat
    if (safe(() => fs.statSync(dir))) {
      return { name, action: 'skip', reason: 'rm failed' };
    }
  }
  return { name, action: 'removed', reason: 'orphan' };
}

function main() {
  // Drain stdin (hook protocol)
  let input = {};
  if (!process.stdin.isTTY) {
    try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {}
  }

  const cwd = input.cwd || process.cwd();
  const wtDir = path.join(cwd, '.claude', 'worktrees');

  if (!fs.existsSync(wtDir)) {
    process.stdout.write(JSON.stringify({ result: 'continue', message: 'no worktrees dir' }));
    process.exit(0);
  }

  // Prune stale registry entries first
  gitOk('worktree prune', { cwd });

  let entries = [];
  try { entries = fs.readdirSync(wtDir); } catch {}

  const results = entries
    .filter(n => /^agent-[a-f0-9]+$/.test(n))
    .map(n => cleanupOne(cwd, n));

  const removed = results.filter(r => r.action === 'removed').map(r => r.name);
  const skipped = results.filter(r => r.action === 'skip').map(r => `${r.name} (${r.reason})`);

  const parts = [];
  if (removed.length) parts.push(`removed ${removed.length}: ${removed.join(', ')}`);
  if (skipped.length) parts.push(`kept ${skipped.length}: ${skipped.join(', ')}`);

  const message = parts.length ? `worktree cleanup: ${parts.join('; ')}` : 'no worktrees to clean';
  console.error(`[dream-team] ${message}`);

  process.stdout.write(JSON.stringify({ result: 'continue', message }));
  process.exit(0);
}

main();
