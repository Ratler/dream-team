#!/usr/bin/env node
'use strict';

/**
 * Tests for the markdown-table-formatter integration in the TaskCompleted hook.
 *
 * Verifies:
 * - Hook exits 0 when no .md files in task description
 * - Hook exits 0 when .md files are present (regardless of formatter availability)
 * - extractMdFiles correctly parses file paths from descriptions
 * - Non-existent .md files are skipped gracefully
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const hookScript = path.join(__dirname, '..', 'hooks', 'validate_task_completed.js');
let passed = 0;
let failed = 0;
let tmpDir;

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

function runHook(input, env) {
  const hookEnv = Object.assign({}, process.env, {
    DREAM_TEAM_LOG_DIR: tmpDir
  }, env || {});
  const result = spawnSync('node', [hookScript], {
    input: JSON.stringify(input),
    env: hookEnv,
    encoding: 'utf8'
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function makeInput(overrides) {
  return Object.assign({
    session_id: 'test-session-fmt',
    cwd: '/test/formatter',
    hook_event_name: 'TaskCompleted',
    task_id: 'fmt-task-1',
    task_subject: 'Format test task',
    task_description: '',
    teammate_name: '',
    team_name: ''
  }, overrides);
}

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-team-fmt-test-'));
}

function cleanup() {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- Tests ---

console.log('\nTaskCompleted Markdown Formatter Tests');
console.log('======================================\n');

setup();

try {
  // 1. No .md files in task description — hook exits 0, no formatting attempted
  test('No .md files in description exits 0 without formatting', () => {
    const input = makeInput({
      task_description: '[agent-type: builder]\n## Task Complete\n**Files changed**:\n- src/index.js — added feature\n- src/utils.js — helper'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
    const stderrLower = result.stderr.toLowerCase();
    assert(!stderrLower.includes('markdown-table-formatter') && !stderrLower.includes('formatted markdown'),
      'Should not mention formatter when no .md files present');
  });

  // 2. .md files present — exits 0 regardless of formatter availability
  test('.md files present exits 0 and handles formatter gracefully', () => {
    const input = makeInput({
      task_description: '[agent-type: docs]\n## Documentation Complete\n**Files changed**:\n- README.md — updated features\n- docs/api.md — added API docs'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
    // The hook should attempt formatting — stderr will contain either:
    // - "not installed" (formatter missing)
    // - "Formatted markdown tables" (formatter ran)
    // - "No formatting changes" (formatter ran but no changes)
    const stderrLower = result.stderr.toLowerCase();
    assert(stderrLower.includes('format') || stderrLower.includes('not installed'),
      `Expected formatter-related message in stderr, got: ${result.stderr}`);
  });

  // 3. Empty task description — exits 0
  test('Empty task description exits 0 without formatting', () => {
    const input = makeInput({ task_description: '' });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
  });

  // 4. Non-existent .md files — exits 0, files skipped gracefully
  test('Non-existent .md files are skipped gracefully', () => {
    const input = makeInput({
      task_description: '[agent-type: builder]\n**Files changed**:\n- src/app.js — logic\n- nonexistent/fake.md — does not exist\n- src/test.ts — tests'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
    // File doesn't exist, so formatting is skipped — no crash
  });

  // 5. Description with em-dash after .md filename — file path correctly extracted
  test('Extracts .md filenames before em-dash descriptions', () => {
    // Use files that actually exist in the project
    const input = makeInput({
      task_description: '**Files changed**:\n- agents/docs.md — new agent'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
    const stderrLower = result.stderr.toLowerCase();
    // Should attempt formatting since agents/docs.md exists
    assert(stderrLower.includes('format') || stderrLower.includes('not installed'),
      `Expected formatter-related message for existing .md file, got: ${result.stderr}`);
  });

  // 6. No files section at all — exits 0
  test('Description without file list exits 0', () => {
    const input = makeInput({
      task_description: '[agent-type: reviewer]\n## Code Review\n**Status**: Approved\nEverything looks good.'
    });
    const result = runHook(input);
    assert(result.status === 0, `Expected exit 0, got ${result.status}`);
  });

} finally {
  cleanup();
}

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);
if (failed > 0) process.exit(1);
