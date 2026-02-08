#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const hookPath = path.join(__dirname, '..', 'hooks', 'validate_spec_sections.js');
const testDir = path.join(__dirname, '_tmp_specs_sections');
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

function writeSpec(filename, content) {
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(path.join(testDir, filename), content);
}

function runHook(dir) {
  try {
    const output = execSync(
      `echo '{}' | node "${hookPath}" --directory "${dir}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return JSON.parse(output.trim());
  } catch (err) {
    // Hook exits with code 1 for block results — parse stdout from error
    if (err.stdout) return JSON.parse(err.stdout.trim());
    throw err;
  }
}

console.log('Testing validate_spec_sections.js...\n');

cleanup();
test('continues for valid sequential spec', () => {
  writeSpec('test.md', [
    '---', 'mode: sequential', '---',
    '## Task Description', 'A task',
    '## Objective', 'An objective',
    '## Relevant Files', 'Some files',
    '## Step by Step Tasks', 'Some tasks',
    '## Documentation Requirements', 'Some docs',
    '## Acceptance Criteria', 'Some criteria',
    '## Validation Commands', 'Some commands',
  ].join('\n'));
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
});

cleanup();
test('blocks sequential spec missing Acceptance Criteria', () => {
  writeSpec('test.md', [
    '---', 'mode: sequential', '---',
    '## Task Description', 'A task',
    '## Objective', 'An objective',
    '## Relevant Files', 'Files',
    '## Step by Step Tasks', 'Tasks',
    '## Documentation Requirements', 'Docs',
    '## Validation Commands', 'Commands',
  ].join('\n'));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('Acceptance Criteria'), `reason should mention missing section`);
});

cleanup();
test('blocks delegated spec missing Team Members', () => {
  writeSpec('test.md', [
    '---', 'mode: delegated', '---',
    '## Task Description', 'A task',
    '## Objective', 'Obj',
    '## Relevant Files', 'Files',
    '## Step by Step Tasks', 'Tasks',
    '## Documentation Requirements', 'Docs',
    '## Acceptance Criteria', 'Criteria',
    '## Validation Commands', 'Commands',
    '## Review Policy', 'Policy',
  ].join('\n'));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('Team Members'), `reason should mention Team Members`);
});

cleanup();
test('blocks team spec missing Team Configuration', () => {
  writeSpec('test.md', [
    '---', 'mode: team', '---',
    '## Task Description', 'A task',
    '## Objective', 'Obj',
    '## Relevant Files', 'Files',
    '## Step by Step Tasks', 'Tasks',
    '## Review Policy', 'Policy',
    '## Documentation Requirements', 'Docs',
    '## Acceptance Criteria', 'Criteria',
    '## Validation Commands', 'Commands',
  ].join('\n'));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('Team Configuration'), `reason should mention Team Configuration`);
});

cleanup();
test('continues for valid team spec with all sections (including optional Team Members)', () => {
  writeSpec('test.md', [
    '---', 'mode: team', '---',
    '## Task Description', 'A task',
    '## Objective', 'Obj',
    '## Relevant Files', 'Files',
    '## Step by Step Tasks', 'Tasks',
    '## Team Members', 'Optional but allowed',
    '## Team Configuration', 'Config',
    '## Review Policy', 'Policy',
    '## Documentation Requirements', 'Docs',
    '## Acceptance Criteria', 'Criteria',
    '## Validation Commands', 'Commands',
  ].join('\n'));
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
});

cleanup();
test('continues for team spec without Team Members', () => {
  writeSpec('test.md', [
    '---', 'mode: team', '---',
    '## Task Description', 'A task',
    '## Objective', 'Obj',
    '## Relevant Files', 'Files',
    '## Step by Step Tasks', 'Tasks',
    '## Team Configuration', 'Config',
    '## Review Policy', 'Policy',
    '## Documentation Requirements', 'Docs',
    '## Acceptance Criteria', 'Criteria',
    '## Validation Commands', 'Commands',
  ].join('\n'));
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue" (Team Members not required for team mode), got "${result.result}": ${result.reason || ''}`);
});

cleanup();
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
