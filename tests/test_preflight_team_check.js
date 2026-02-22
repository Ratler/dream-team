#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hookPath = path.join(__dirname, '..', 'hooks', 'preflight_team_check.js');
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

function runHook(stdinData, env) {
  const input = JSON.stringify(stdinData);
  const escaped = input.replace(/'/g, "'\\''");
  const envOpts = Object.assign({}, process.env, env || {});
  // Remove the env var by default so tests are isolated
  if (!env || !('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' in (env || {}))) {
    delete envOpts.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  }
  const output = execSync(
    `echo '${escaped}' | node "${hookPath}"`,
    { encoding: 'utf8', timeout: 5000, env: envOpts }
  );
  return JSON.parse(output.trim());
}

function makeTempSpec(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
  const file = path.join(dir, 'test-spec.md');
  fs.writeFileSync(file, content);
  return { dir, file };
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('Testing preflight_team_check.js...\n');

// 1. Non-build skill (camelCase)
test('allows non-build skill through', () => {
  const result = runHook({
    toolName: 'Skill',
    toolInput: { skill: 'plan', args: 'some args' }
  });
  assert(Object.keys(result).length === 0, `expected empty object, got ${JSON.stringify(result)}`);
});

// 2. Build skill, no args
test('allows build skill with no args through', () => {
  const result = runHook({
    toolName: 'Skill',
    toolInput: { skill: 'build' }
  });
  assert(Object.keys(result).length === 0, `expected empty object, got ${JSON.stringify(result)}`);
});

// 3. Build skill, missing spec file
test('blocks when spec file does not exist', () => {
  const result = runHook({
    toolName: 'Skill',
    toolInput: { skill: 'build', args: '/nonexistent/path/spec.md' }
  });
  assert(result.decision === 'block', `expected "block", got "${result.decision}"`);
  assert(result.reason.includes('not found'), `reason should mention "not found", got: ${result.reason}`);
});

// 4. Build skill, sequential mode
test('allows sequential mode through', () => {
  const { dir, file } = makeTempSpec('---\nmode: sequential\n---\n# Test\n');
  try {
    const result = runHook({
      toolName: 'Skill',
      toolInput: { skill: 'build', args: file }
    });
    assert(Object.keys(result).length === 0, `expected empty object, got ${JSON.stringify(result)}`);
  } finally {
    cleanup(dir);
  }
});

// 5. Build skill, team mode, env var = 1
test('allows team mode when env var is 1', () => {
  const { dir, file } = makeTempSpec('---\nmode: team\n---\n# Test\n');
  try {
    const result = runHook(
      { toolName: 'Skill', toolInput: { skill: 'build', args: file } },
      { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' }
    );
    assert(Object.keys(result).length === 0, `expected empty object, got ${JSON.stringify(result)}`);
  } finally {
    cleanup(dir);
  }
});

// 6. Build skill, team mode, env var = true
test('allows team mode when env var is true', () => {
  const { dir, file } = makeTempSpec('---\nmode: team\n---\n# Test\n');
  try {
    const result = runHook(
      { toolName: 'Skill', toolInput: { skill: 'build', args: file } },
      { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: 'true' }
    );
    assert(Object.keys(result).length === 0, `expected empty object, got ${JSON.stringify(result)}`);
  } finally {
    cleanup(dir);
  }
});

// 7. Build skill, team mode, env var = TRUE (case-insensitive)
test('allows team mode when env var is TRUE (case-insensitive)', () => {
  const { dir, file } = makeTempSpec('---\nmode: team\n---\n# Test\n');
  try {
    const result = runHook(
      { toolName: 'Skill', toolInput: { skill: 'build', args: file } },
      { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: 'TRUE' }
    );
    assert(Object.keys(result).length === 0, `expected empty object, got ${JSON.stringify(result)}`);
  } finally {
    cleanup(dir);
  }
});

// 8. Build skill, team mode, env var not set
test('blocks team mode when env var is not set', () => {
  const { dir, file } = makeTempSpec('---\nmode: team\n---\n# Test\n');
  try {
    const result = runHook(
      { toolName: 'Skill', toolInput: { skill: 'build', args: file } }
    );
    assert(result.decision === 'block', `expected "block", got "${result.decision}"`);
    assert(result.reason.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), `reason should mention env var`);
  } finally {
    cleanup(dir);
  }
});

// 9. Build skill, malformed frontmatter
test('allows through with malformed frontmatter (fail open)', () => {
  const { dir, file } = makeTempSpec('no frontmatter here\njust some text\n');
  try {
    const result = runHook({
      toolName: 'Skill',
      toolInput: { skill: 'build', args: file }
    });
    assert(Object.keys(result).length === 0, `expected empty object, got ${JSON.stringify(result)}`);
  } finally {
    cleanup(dir);
  }
});

// 10. dream-team:build variant
test('handles dream-team:build skill name', () => {
  const { dir, file } = makeTempSpec('---\nmode: team\n---\n# Test\n');
  try {
    const result = runHook(
      { toolName: 'Skill', toolInput: { skill: 'dream-team:build', args: file } }
    );
    assert(result.decision === 'block', `expected "block", got "${result.decision}"`);
    assert(result.reason.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), `reason should mention env var`);
  } finally {
    cleanup(dir);
  }
});

// 11. snake_case fallback (defensive compatibility)
test('works with snake_case field names (fallback)', () => {
  const { dir, file } = makeTempSpec('---\nmode: team\n---\n# Test\n');
  try {
    const result = runHook(
      { tool_name: 'Skill', tool_input: { skill: 'build', args: file } }
    );
    assert(result.decision === 'block', `expected "block", got "${result.decision}"`);
    assert(result.reason.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS'), `reason should mention env var`);
  } finally {
    cleanup(dir);
  }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
