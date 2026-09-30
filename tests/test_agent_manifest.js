#!/usr/bin/env node
/**
 * Test: agents/MANIFEST.md must list every agent with the same model as the
 * agent definition's `model:` frontmatter. Orchestrators dispatch from the
 * manifest, so drift would silently change which model runs a role.
 */
const fs = require('fs');
const path = require('path');

const agentsDir = path.join(__dirname, '..', 'agents');
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

console.log('Agent Manifest Tests\n====================\n');

const manifest = fs.readFileSync(path.join(agentsDir, 'MANIFEST.md'), 'utf8');
const manifestModels = {};
for (const line of manifest.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length > 3 && /^[a-z][a-z-]*$/.test(cells[1]) && cells[1] !== 'agent') {
    manifestModels[cells[1]] = cells[2];
  }
}

const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && f !== 'MANIFEST.md');

for (const file of agentFiles) {
  const name = path.basename(file, '.md');
  test(`${name} model matches manifest`, () => {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const match = content.match(/^model:\s*(\S+)/m);
    assert(match, `${file} has no model frontmatter`);
    assert(name in manifestModels, `${name} missing from MANIFEST.md`);
    assert(manifestModels[name] === match[1], `manifest says ${manifestModels[name]}, ${file} says ${match[1]}`);
  });
}

test('manifest lists no unknown agents', () => {
  const known = new Set(agentFiles.map((f) => path.basename(f, '.md')));
  const unknown = Object.keys(manifestModels).filter((n) => !known.has(n));
  assert(unknown.length === 0, `unknown agents in manifest: ${unknown.join(', ')}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
