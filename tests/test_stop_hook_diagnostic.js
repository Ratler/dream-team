#!/usr/bin/env node
'use strict';

/**
 * Diagnostic test for Stop hook behavior.
 *
 * Part 1: Verifies the hook script works when called directly.
 * Part 2: Must be checked manually after invoking /dream-team:test-stop
 *
 * Usage:
 *   node tests/test_stop_hook_diagnostic.js          # Run Part 1 + check Part 2
 *   node tests/test_stop_hook_diagnostic.js --clean   # Clear the log file
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_SCRIPT = path.join(__dirname, '..', 'hooks', 'test_stop_hook.js');
const LOG_FILE = path.join(process.env.HOME || '/tmp', '.dream-team-stop-hook-test.log');

function clean() {
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
    console.log(`Cleared: ${LOG_FILE}`);
  } else {
    console.log(`Already clean: ${LOG_FILE} does not exist`);
  }
}

function countLogEntries() {
  if (!fs.existsSync(LOG_FILE)) return 0;
  const content = fs.readFileSync(LOG_FILE, 'utf8').trim();
  if (!content) return 0;
  return content.split('\n').length;
}

function runPart1() {
  console.log('=== Part 1: Direct invocation test ===\n');

  // Clear log first
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

  const beforeCount = countLogEntries();
  console.log(`Log entries before: ${beforeCount}`);

  // Call the hook script directly (pipe empty JSON as stdin)
  try {
    const result = execSync(`echo '{}' | node "${HOOK_SCRIPT}"`, { encoding: 'utf8' });
    const parsed = JSON.parse(result);
    console.log(`Hook output: ${JSON.stringify(parsed)}`);
    console.log(`Hook result: ${parsed.result}`);
  } catch (err) {
    console.log(`Hook execution failed: ${err.message}`);
    if (err.stdout) console.log(`stdout: ${err.stdout}`);
    process.exit(1);
  }

  const afterCount = countLogEntries();
  console.log(`Log entries after: ${afterCount}`);

  if (afterCount > beforeCount) {
    console.log('\nPART 1 PASS: Hook script works when called directly.');
  } else {
    console.log('\nPART 1 FAIL: Hook script did not write to log file.');
    process.exit(1);
  }

  // Show log contents
  console.log(`\nLog contents:`);
  console.log(fs.readFileSync(LOG_FILE, 'utf8'));
}

function runPart2Check() {
  console.log('=== Part 2: SKILL.md Stop hook check ===\n');

  const count = countLogEntries();

  if (count === 0) {
    console.log(`Log file: ${fs.existsSync(LOG_FILE) ? 'exists but empty' : 'does not exist'}`);
    console.log('\nNo Stop hook entries found.');
    console.log('');
    console.log('To test if Stop hooks fire from SKILL.md:');
    console.log('  1. Run: node tests/test_stop_hook_diagnostic.js --clean');
    console.log('  2. In a NEW Claude Code session, invoke: /dream-team:test-stop');
    console.log('  3. Let Claude respond and finish');
    console.log('  4. Run: node tests/test_stop_hook_diagnostic.js');
    console.log('  5. Check Part 2 output for results');
    console.log('');
    console.log('STATUS: UNKNOWN — skill has not been invoked yet, or Stop hooks are not firing.');
  } else if (count === 1) {
    // Only the Part 1 direct invocation entry
    console.log(`Log has ${count} entry (from Part 1 direct test only).`);
    console.log('\nIf you already invoked /dream-team:test-stop:');
    console.log('  PART 2 FAIL: Stop hooks in SKILL.md are NOT firing (bug #19225 confirmed).');
    console.log('\nIf you have NOT invoked /dream-team:test-stop yet:');
    console.log('  Run the test steps above and re-check.');
  } else {
    // More than 1 entry — the skill Stop hook fired!
    console.log(`Log has ${count} entries.`);
    console.log('\nLog contents:');
    console.log(fs.readFileSync(LOG_FILE, 'utf8'));
    console.log('PART 2 PASS: Stop hooks in SKILL.md ARE firing! Bug may be fixed.');
  }
}

// Main
const args = process.argv.slice(2);

if (args.includes('--clean')) {
  clean();
} else {
  runPart1();
  console.log('\n' + '='.repeat(50) + '\n');
  runPart2Check();
}
