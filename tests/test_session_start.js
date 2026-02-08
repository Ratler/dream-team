#!/usr/bin/env node
/**
 * Test: session_start.js should output valid JSON with hookSpecificOutput.
 * Pipe empty JSON stdin and verify output structure.
 */
const { execSync } = require('child_process');
const path = require('path');

const hookPath = path.join(__dirname, '..', 'hooks', 'session_start.js');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

console.log('Testing session_start.js...\n');

// Run the hook with empty stdin
const output = execSync(`echo '{}' | node "${hookPath}"`, {
  encoding: 'utf8',
  env: { ...process.env, CLAUDE_PLUGIN_ROOT: path.join(__dirname, '..') }
});

let parsed;
test('outputs valid JSON', () => {
  parsed = JSON.parse(output.trim());
  assert(typeof parsed === 'object', 'output is not an object');
});

test('has hookSpecificOutput', () => {
  assert(parsed.hookSpecificOutput, 'missing hookSpecificOutput');
});

test('has hookEventName set to SessionStart', () => {
  assert(
    parsed.hookSpecificOutput.hookEventName === 'SessionStart',
    `hookEventName is "${parsed.hookSpecificOutput.hookEventName}", expected "SessionStart"`
  );
});

test('has additionalContext with dream-team content', () => {
  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert(ctx, 'missing additionalContext');
  assert(ctx.includes('dream-team'), 'additionalContext does not mention dream-team');
  assert(ctx.includes('spec-sequential'), 'additionalContext does not mention spec-sequential');
  assert(ctx.includes('spec-delegated'), 'additionalContext does not mention spec-delegated');
  assert(ctx.includes('spec-team'), 'additionalContext does not mention spec-team');
  assert(ctx.includes('/dream-team:plan'), 'additionalContext does not mention /dream-team:plan');
  assert(ctx.includes('build'), 'additionalContext does not mention build');
  assert(ctx.includes('/dream-team:debug'), 'additionalContext does not mention /dream-team:debug');
  assert(ctx.includes('debugger'), 'additionalContext does not mention debugger agent');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
