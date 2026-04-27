#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hookPath = path.join(__dirname, '..', 'hooks', 'cleanup_worktrees.js');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS: ${name}`); passed++; }
  catch (e) { console.log(`  FAIL: ${name} — ${e.message}`); failed++; }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function runHook(cwd) {
  const input = JSON.stringify({ cwd });
  const escaped = input.replace(/'/g, "'\\''");
  const out = execSync(`echo '${escaped}' | node "${hookPath}"`, {
    encoding: 'utf8',
    timeout: 10000,
  });
  return JSON.parse(out.trim());
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-cleanup-'));
  sh('git init -q -b main', dir);
  sh('git config user.email t@t', dir);
  sh('git config user.name t', dir);
  fs.writeFileSync(path.join(dir, 'README.md'), 'hi');
  sh('git add . && git commit -q -m init', dir);
  fs.mkdirSync(path.join(dir, '.claude', 'worktrees'), { recursive: true });
  return dir;
}

function rm(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

console.log('Testing cleanup_worktrees.js...\n');

test('returns continue when no worktrees dir exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-cleanup-empty-'));
  try {
    const r = runHook(dir);
    assert(r.result === 'continue', `expected continue, got ${JSON.stringify(r)}`);
  } finally { rm(dir); }
});

test('removes orphan dirs (on-disk but not registered)', () => {
  const dir = makeRepo();
  try {
    const orphan = path.join(dir, '.claude', 'worktrees', 'agent-deadbeef');
    fs.mkdirSync(orphan);
    fs.writeFileSync(path.join(orphan, 'junk'), 'x');

    const r = runHook(dir);
    assert(r.result === 'continue', `expected continue, got ${JSON.stringify(r)}`);
    assert(!fs.existsSync(orphan), 'orphan dir should be removed');
    assert(r.message.includes('removed'), `message should report removed: ${r.message}`);
  } finally { rm(dir); }
});

test('removes registered+clean worktree and deletes its branch', () => {
  const dir = makeRepo();
  try {
    const wt = path.join(dir, '.claude', 'worktrees', 'agent-cafe1234');
    sh(`git worktree add -b worktree-agent-cafe1234 "${wt}"`, dir);

    runHook(dir);

    assert(!fs.existsSync(wt), 'worktree dir should be removed');
    const branches = sh('git branch --list worktree-agent-cafe1234', dir).trim();
    assert(branches === '', `branch should be deleted, got: ${branches}`);
  } finally { rm(dir); }
});

test('keeps locked worktrees', () => {
  const dir = makeRepo();
  try {
    const wt = path.join(dir, '.claude', 'worktrees', 'agent-aaaa1111');
    sh(`git worktree add -b worktree-agent-aaaa1111 "${wt}"`, dir);
    sh(`git worktree lock "${wt}"`, dir);

    const r = runHook(dir);
    assert(fs.existsSync(wt), 'locked worktree should be kept');
    assert(r.message.includes('locked'), `message should mention locked: ${r.message}`);
    sh(`git worktree unlock "${wt}"`, dir);
  } finally { rm(dir); }
});

test('keeps registered worktrees with uncommitted changes', () => {
  const dir = makeRepo();
  try {
    const wt = path.join(dir, '.claude', 'worktrees', 'agent-bbbb2222');
    sh(`git worktree add -b worktree-agent-bbbb2222 "${wt}"`, dir);
    fs.writeFileSync(path.join(wt, 'dirty'), 'modified');

    const r = runHook(dir);
    assert(fs.existsSync(wt), 'dirty worktree should be kept');
    assert(r.message.includes('uncommitted'), `message should mention uncommitted: ${r.message}`);
  } finally { rm(dir); }
});

test('ignores non-agent-prefix dirs in worktrees folder', () => {
  const dir = makeRepo();
  try {
    const stray = path.join(dir, '.claude', 'worktrees', 'something-else');
    fs.mkdirSync(stray);
    fs.writeFileSync(path.join(stray, 'note'), 'x');

    runHook(dir);
    assert(fs.existsSync(stray), 'non-agent dir should be untouched');
  } finally { rm(dir); }
});

test('handles mixed scenario: orphan + clean + dirty', () => {
  const dir = makeRepo();
  try {
    // orphan
    const orphan = path.join(dir, '.claude', 'worktrees', 'agent-aaaaaaaa');
    fs.mkdirSync(orphan);
    // clean registered
    const clean = path.join(dir, '.claude', 'worktrees', 'agent-bbbbbbbb');
    sh(`git worktree add -b worktree-agent-bbbbbbbb "${clean}"`, dir);
    // dirty registered
    const dirty = path.join(dir, '.claude', 'worktrees', 'agent-cccccccc');
    sh(`git worktree add -b worktree-agent-cccccccc "${dirty}"`, dir);
    fs.writeFileSync(path.join(dirty, 'wip'), 'x');

    const r = runHook(dir);
    assert(!fs.existsSync(orphan), 'orphan removed');
    assert(!fs.existsSync(clean), 'clean removed');
    assert(fs.existsSync(dirty), 'dirty kept');
    assert(r.message.includes('removed 2'), `expected removed 2, got: ${r.message}`);
    assert(r.message.includes('kept 1'), `expected kept 1, got: ${r.message}`);
  } finally { rm(dir); }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
