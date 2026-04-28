#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const hookPath = path.join(__dirname, '..', 'hooks', 'block_nested_agent.js');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS: ${name}`); passed++; }
  catch (e) { console.log(`  FAIL: ${name} — ${e.message}`); failed++; }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function runHook(stdinData) {
  const input = JSON.stringify(stdinData);
  const escaped = input.replace(/'/g, "'\\''");
  const out = execSync(`echo '${escaped}' | node "${hookPath}"`, {
    encoding: 'utf8',
    timeout: 5000,
  });
  return JSON.parse(out.trim());
}

console.log('Testing block_nested_agent.js...\n');

test('allows non-Agent tool through', () => {
  const r = runHook({ toolName: 'Read', cwd: '/root/proj/.claude/worktrees/agent-abc123' });
  assert(Object.keys(r).length === 0, `expected {}, got ${JSON.stringify(r)}`);
});

test('allows Agent call from outside any worktree', () => {
  const r = runHook({ toolName: 'Agent', cwd: '/root/myproject' });
  assert(Object.keys(r).length === 0, `expected {}, got ${JSON.stringify(r)}`);
});

test('blocks Agent call from inside an agent worktree', () => {
  const r = runHook({ toolName: 'Agent', cwd: '/root/proj/.claude/worktrees/agent-a1b2c3d4' });
  assert(r.decision === 'block', `expected block, got ${JSON.stringify(r)}`);
  assert(r.reason.includes('worktree'), 'reason should mention worktree');
});

test('blocks Task call from inside an agent worktree (legacy tool name)', () => {
  const r = runHook({ toolName: 'Task', cwd: '/root/proj/.claude/worktrees/agent-deadbeef' });
  assert(r.decision === 'block', `expected block, got ${JSON.stringify(r)}`);
});

test('blocks even when path is nested deeper inside the worktree', () => {
  const r = runHook({ toolName: 'Agent', cwd: '/root/proj/.claude/worktrees/agent-feed42/src/components' });
  assert(r.decision === 'block', `expected block, got ${JSON.stringify(r)}`);
});

test('does not match a directory called .claude/worktrees/agent_xyz (wrong separator)', () => {
  const r = runHook({ toolName: 'Agent', cwd: '/root/proj/.claude/worktrees/agent_xyz' });
  assert(Object.keys(r).length === 0, `expected {}, got ${JSON.stringify(r)}`);
});

test('does not match a path with similar but unrelated segment name', () => {
  const r = runHook({ toolName: 'Agent', cwd: '/root/proj/agent-abc123' });
  assert(Object.keys(r).length === 0, `expected {}, got ${JSON.stringify(r)}`);
});

test('snake_case fallback (tool_name)', () => {
  const r = runHook({ tool_name: 'Agent', cwd: '/root/proj/.claude/worktrees/agent-abc' });
  assert(r.decision === 'block', `expected block, got ${JSON.stringify(r)}`);
});

test('handles missing cwd gracefully (uses process.cwd which is not a worktree)', () => {
  const r = runHook({ toolName: 'Agent' });
  // process.cwd() running tests is the test invocation dir, not a worktree
  assert(Object.keys(r).length === 0, `expected {}, got ${JSON.stringify(r)}`);
});

test('handles malformed input (fail open)', () => {
  const out = execSync(`echo 'not json' | node "${hookPath}"`, { encoding: 'utf8', timeout: 5000 });
  const r = JSON.parse(out.trim());
  assert(Object.keys(r).length === 0, `expected {}, got ${JSON.stringify(r)}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
