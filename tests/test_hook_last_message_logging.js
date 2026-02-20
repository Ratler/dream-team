#!/usr/bin/env node
'use strict';

/**
 * Tests that all Stop hook scripts log last_assistant_message to stderr
 * when present in stdin input, and do not log when absent.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const hooksDir = path.join(__dirname, '..', 'hooks');
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

function setup() {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  // Create a valid spec file for hooks that check for it
  const specContent = [
    '---',
    'mode: sequential',
    '---',
    '# Plan: Test',
    '## Task Description',
    'Test',
    '## Objective',
    'Test',
    '## Relevant Files',
    '- test.js',
    '## Step by Step Tasks',
    '### 1. Test',
    '## Documentation Requirements',
    'None',
    '## Acceptance Criteria',
    '- test',
    '## Validation Commands',
    '```',
    'echo ok',
    '```',
  ].join('\n');
  fs.writeFileSync(path.join(testDir, 'test-spec.md'), specContent);
}

function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

function runHook(hookFile, stdinJson, extraArgs) {
  const args = extraArgs || [];
  const result = spawnSync('node', [hookFile, ...args], {
    input: JSON.stringify(stdinJson),
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    exitCode: result.status,
  };
}

console.log('Testing last_assistant_message logging...\n');

setup();

// --- validate_spec_exists.js ---

const specExistsHook = path.join(hooksDir, 'validate_spec_exists.js');

test('validate_spec_exists: logs last_assistant_message to stderr when present', () => {
  const input = { last_assistant_message: 'Spec file has been created at specs/test.md' };
  const result = runHook(specExistsHook, input, ['--directory', testDir]);
  assert(result.stderr.includes('[dream-team] last_assistant_message:'),
    `expected stderr to contain log, got: "${result.stderr}"`);
  assert(result.stderr.includes('Spec file has been created'),
    `expected stderr to contain message content`);
});

test('validate_spec_exists: does NOT log when last_assistant_message is absent', () => {
  const input = {};
  const result = runHook(specExistsHook, input, ['--directory', testDir]);
  assert(!result.stderr.includes('[dream-team] last_assistant_message'),
    `expected no log in stderr, got: "${result.stderr}"`);
});

test('validate_spec_exists: does not change exit code when last_assistant_message present', () => {
  const input = { last_assistant_message: 'done' };
  const result = runHook(specExistsHook, input, ['--directory', testDir]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}`);
  const parsed = JSON.parse(result.stdout);
  assert(parsed.result === 'continue', `expected continue, got ${parsed.result}`);
});

test('validate_spec_exists: truncates messages longer than 200 characters', () => {
  const longMessage = 'A'.repeat(300);
  const input = { last_assistant_message: longMessage };
  const result = runHook(specExistsHook, input, ['--directory', testDir]);
  // The logged portion should be at most 200 chars of the message
  const logLine = result.stderr;
  assert(!logLine.includes('A'.repeat(201)),
    `expected message to be truncated to 200 chars`);
});

// --- validate_build_complete.js ---

const buildCompleteHook = path.join(hooksDir, 'validate_build_complete.js');

test('validate_build_complete: logs last_assistant_message to stderr when present', () => {
  const input = {
    tasks: [{ id: '1', subject: 'test', status: 'completed' }],
    last_assistant_message: 'Build is complete, all tasks done.',
  };
  const result = runHook(buildCompleteHook, input, []);
  assert(result.stderr.includes('[dream-team] last_assistant_message:'),
    `expected stderr to contain log, got: "${result.stderr}"`);
  assert(result.stderr.includes('Build is complete'),
    `expected stderr to contain message content`);
});

test('validate_build_complete: does NOT log when last_assistant_message is absent', () => {
  const input = { tasks: [{ id: '1', subject: 'test', status: 'completed' }] };
  const result = runHook(buildCompleteHook, input, []);
  assert(!result.stderr.includes('[dream-team] last_assistant_message'),
    `expected no log in stderr, got: "${result.stderr}"`);
});

test('validate_build_complete: does not change exit behavior with last_assistant_message', () => {
  const input = {
    tasks: [{ id: '1', subject: 'test', status: 'pending' }],
    last_assistant_message: 'Almost done',
  };
  const result = runHook(buildCompleteHook, input, []);
  assert(result.exitCode === 1, `expected exit 1, got ${result.exitCode}`);
  const parsed = JSON.parse(result.stdout);
  assert(parsed.result === 'block', `expected block, got ${parsed.result}`);
});

// --- validate_spec_sections.js ---

const specSectionsHook = path.join(hooksDir, 'validate_spec_sections.js');

test('validate_spec_sections: logs last_assistant_message to stderr when present', () => {
  const input = { last_assistant_message: 'Spec sections validated successfully.' };
  const result = runHook(specSectionsHook, input, ['--directory', testDir]);
  assert(result.stderr.includes('[dream-team] last_assistant_message:'),
    `expected stderr to contain log, got: "${result.stderr}"`);
  assert(result.stderr.includes('Spec sections validated'),
    `expected stderr to contain message content`);
});

test('validate_spec_sections: does NOT log when last_assistant_message is absent', () => {
  const input = {};
  const result = runHook(specSectionsHook, input, ['--directory', testDir]);
  assert(!result.stderr.includes('[dream-team] last_assistant_message'),
    `expected no log in stderr, got: "${result.stderr}"`);
});

test('validate_spec_sections: does not change exit code when last_assistant_message present', () => {
  const input = { last_assistant_message: 'done' };
  const result = runHook(specSectionsHook, input, ['--directory', testDir]);
  assert(result.exitCode === 0, `expected exit 0, got ${result.exitCode}`);
  const parsed = JSON.parse(result.stdout);
  assert(parsed.result === 'continue', `expected continue, got ${parsed.result}`);
});

cleanup();

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
