#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const hookPath = path.join(__dirname, '..', 'hooks', 'validate_spec_exists.js');
const testDir = path.join(__dirname, '_tmp_specs');
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

function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

function runHook(dir, ext) {
  try {
    const output = execSync(
      `echo '{}' | node "${hookPath}" --directory "${dir}" --extension "${ext || '.md'}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return JSON.parse(output.trim());
  } catch (err) {
    // Hook exits with code 1 for block results — parse stdout from error
    if (err.stdout) return JSON.parse(err.stdout.trim());
    throw err;
  }
}

console.log('Testing validate_spec_exists.js...\n');

cleanup();

test('blocks when directory does not exist', () => {
  const result = runHook(testDir, '.md');
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
});

test('blocks when directory is empty', () => {
  fs.mkdirSync(testDir, { recursive: true });
  const result = runHook(testDir, '.md');
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
});

test('continues when recent spec file exists', () => {
  const specFile = path.join(testDir, 'test-spec.md');
  fs.writeFileSync(specFile, '# Test\n');
  const result = runHook(testDir, '.md');
  assert(result.result === 'continue', `expected "continue", got "${result.result}"`);
});

test('blocks when file has wrong extension', () => {
  const result = runHook(testDir, '.json');
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
});

cleanup();

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
