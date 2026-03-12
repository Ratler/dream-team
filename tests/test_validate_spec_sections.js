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

// --- Helper: build a valid spec with proper task structure ---
function validSequentialSpec(overrides = {}) {
  const tasks = overrides.tasks || [
    '### 1. Setup',
    '- **Task ID**: setup',
    '- **Depends On**: none',
    '- **Description**: Set up the project',
    '- **Tests**: N/A',
    '',
    '### 2. Build',
    '- **Task ID**: build-it',
    '- **Depends On**: setup',
    '- **Description**: Build the feature',
    '- **Tests**: tests/test_build.js',
  ].join('\n');

  const sections = [
    '---', `mode: ${overrides.mode || 'sequential'}`,
    ...(overrides.specVersion !== false ? ['spec-version: 1'] : []),
    '---',
    '## Task Description', 'A task',
    '## Objective', 'An objective',
    '## Relevant Files', 'Some files',
    '## Step by Step Tasks', '', tasks, '',
    ...(overrides.extraSections || []),
    '## Documentation Requirements', 'Some docs',
    '## Acceptance Criteria', 'Some criteria',
    '## Validation Commands', 'Some commands',
  ];
  return sections.join('\n');
}

function validDelegatedSpec(overrides = {}) {
  const tasks = overrides.tasks || [
    '### 1. Setup',
    '- **Task ID**: setup',
    '- **Depends On**: none',
    '- **Description**: Set up the project',
    '- **Tests**: N/A',
    '- **Assigned To**: Builder',
    '- **Agent Type**: builder',
    '',
    '### 2. Review',
    '- **Task ID**: review-all',
    '- **Depends On**: setup',
    '- **Description**: Review everything',
    '- **Tests**: N/A',
    '- **Assigned To**: Reviewer',
    '- **Agent Type**: reviewer',
  ].join('\n');

  const reviewPolicy = overrides.reviewPolicy || [
    '## Review Policy',
    '- **Review After**: each task',
    '- **Fix Loop Trigger**: Critical and Important',
    '- **Max Retries**: 3',
    `- **Skip Review For**: ${overrides.skipReviewFor || 'none'}`,
  ].join('\n');

  const sections = [
    '---', 'mode: delegated', 'spec-version: 1', '---',
    '## Task Description', 'A task',
    '## Objective', 'An objective',
    '## Relevant Files', 'Some files',
    '## Step by Step Tasks', '', tasks, '',
    '## Team Members', '- Builder', '  - **Role**: build', '  - **Agent Type**: builder',
    reviewPolicy,
    '## Documentation Requirements', 'Some docs',
    '## Acceptance Criteria', 'Some criteria',
    '## Validation Commands', 'Some commands',
  ];
  return sections.join('\n');
}

// --- Unresolved <if> tag tests ---

cleanup();
test('blocks spec with unresolved <if> tag', () => {
  writeSpec('test.md', validSequentialSpec({
    extraSections: ['<if mode is delegated>', '## Team Members', 'Some members', '</if>'],
  }));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('unresolved'), `reason should mention unresolved: ${result.reason}`);
});

cleanup();
test('blocks spec with closing </if> tag', () => {
  writeSpec('test.md', validSequentialSpec({
    extraSections: ['</if>'],
  }));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('unresolved'), `reason should mention unresolved: ${result.reason}`);
});

cleanup();
test('continues for spec without any <if> tags', () => {
  writeSpec('test.md', validSequentialSpec());
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
});

// --- Missing Tests field ---

cleanup();
test('blocks spec with task missing Tests field', () => {
  writeSpec('test.md', validSequentialSpec({
    tasks: [
      '### 1. Setup',
      '- **Task ID**: setup',
      '- **Depends On**: none',
      '- **Description**: Set up the project',
      '',
      '### 2. Build',
      '- **Task ID**: build-it',
      '- **Depends On**: setup',
      '- **Description**: Build the feature',
      '- **Tests**: tests/test_build.js',
    ].join('\n'),
  }));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('Setup'), `reason should mention task name "Setup": ${result.reason}`);
});

cleanup();
test('continues for spec where all tasks have Tests field', () => {
  writeSpec('test.md', validSequentialSpec());
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
});

// --- Dependency graph: dangling reference ---

cleanup();
test('blocks spec with dangling dependency reference', () => {
  writeSpec('test.md', validSequentialSpec({
    tasks: [
      '### 1. Setup',
      '- **Task ID**: setup',
      '- **Depends On**: nonexistent-task',
      '- **Description**: Set up the project',
      '- **Tests**: N/A',
    ].join('\n'),
  }));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('nonexistent-task'), `reason should mention "nonexistent-task": ${result.reason}`);
});

// --- Dependency graph: circular dependency ---

cleanup();
test('blocks spec with circular dependencies', () => {
  writeSpec('test.md', validSequentialSpec({
    tasks: [
      '### 1. Task A',
      '- **Task ID**: task-a',
      '- **Depends On**: task-b',
      '- **Description**: Does A',
      '- **Tests**: N/A',
      '',
      '### 2. Task B',
      '- **Task ID**: task-b',
      '- **Depends On**: task-a',
      '- **Description**: Does B',
      '- **Tests**: N/A',
    ].join('\n'),
  }));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('circular') || result.reason.includes('CYCLES'), `reason should mention cycle: ${result.reason}`);
});

// --- Dependency graph: valid DAG ---

cleanup();
test('continues for spec with valid dependency DAG', () => {
  writeSpec('test.md', validSequentialSpec({
    tasks: [
      '### 1. Foundation',
      '- **Task ID**: foundation',
      '- **Depends On**: none',
      '- **Description**: Lay the foundation',
      '- **Tests**: N/A',
      '',
      '### 2. Walls',
      '- **Task ID**: walls',
      '- **Depends On**: foundation',
      '- **Description**: Build the walls',
      '- **Tests**: tests/test_walls.js',
      '',
      '### 3. Roof',
      '- **Task ID**: roof',
      '- **Depends On**: walls',
      '- **Description**: Add the roof',
      '- **Tests**: tests/test_roof.js',
    ].join('\n'),
  }));
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
});

// --- Skip Review For validation ---

cleanup();
test('blocks delegated spec with invalid Skip Review For entries', () => {
  writeSpec('test.md', validDelegatedSpec({
    skipReviewFor: 'review tasks, validate-all',
  }));
  const result = runHook(testDir);
  assert(result.result === 'block', `expected "block", got "${result.result}"`);
  assert(result.reason.includes('review tasks'), `reason should mention "review tasks": ${result.reason}`);
});

cleanup();
test('continues for delegated spec with valid task ID Skip Review For', () => {
  writeSpec('test.md', validDelegatedSpec({
    skipReviewFor: 'setup, review-all',
  }));
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
});

cleanup();
test('continues for delegated spec with agent type Skip Review For', () => {
  writeSpec('test.md', validDelegatedSpec({
    skipReviewFor: 'researcher, validator',
  }));
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
});

// --- spec-version warning (soft, no block) ---

cleanup();
test('continues (with warning) for spec without spec-version', () => {
  writeSpec('test.md', validSequentialSpec({ specVersion: false }));
  const result = runHook(testDir);
  assert(result.result === 'continue', `expected "continue", got "${result.result}": ${result.reason || ''}`);
  assert(result.message && result.message.includes('spec-version'), `message should warn about spec-version: ${result.message}`);
});

cleanup();
console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
