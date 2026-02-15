#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
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

function readFile(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

console.log('Testing frontend design integration...\n');

// --- Guidelines template ---

test('templates/frontend-design-guidelines.md exists', () => {
  assert(fs.existsSync(path.join(root, 'templates', 'frontend-design-guidelines.md')), 'file not found');
});

const guidelines = readFile('templates/frontend-design-guidelines.md');

test('guidelines contains Aesthetic Direction Reference section', () => {
  assert(guidelines.includes('## Aesthetic Direction Reference'), 'missing section');
});

test('guidelines contains Anti-Generic Rules section', () => {
  assert(guidelines.includes('## Anti-Generic Rules'), 'missing section');
});

test('guidelines contains Typography Principles section', () => {
  assert(guidelines.includes('## Typography Principles'), 'missing section');
});

test('guidelines contains Color & Theme section', () => {
  assert(guidelines.includes('## Color & Theme'), 'missing section');
});

test('guidelines contains Animation Timing Table section', () => {
  assert(guidelines.includes('## Animation Timing Table'), 'missing section');
});

test('guidelines contains Interaction Patterns section', () => {
  assert(guidelines.includes('## Interaction Patterns'), 'missing section');
});

test('guidelines contains Accessibility Requirements section', () => {
  assert(guidelines.includes('## Accessibility Requirements'), 'missing section');
});

test('guidelines contains Component Library Recommendations section', () => {
  assert(guidelines.includes('## Component Library Recommendations'), 'missing section');
});

test('guidelines contains Layout Principles section', () => {
  assert(guidelines.includes('## Layout Principles'), 'missing section');
});

test('guidelines mentions React in component library section', () => {
  assert(guidelines.includes('### React'), 'missing React section');
});

test('guidelines mentions Vue in component library section', () => {
  assert(guidelines.includes('### Vue'), 'missing Vue section');
});

test('guidelines lists ~10 aesthetic styles', () => {
  const styles = ['Minimal', 'Editorial', 'Playful', 'Brutalist', 'Luxury', 'Retro-Futuristic', 'Organic', 'Art Deco', 'Industrial', 'Soft'];
  for (const style of styles) {
    assert(guidelines.includes(style), `missing aesthetic style: ${style}`);
  }
});

// --- Spec template ---

const specTemplate = readFile('templates/spec-template.md');

test('spec template contains frontend-design in frontmatter', () => {
  assert(specTemplate.includes('frontend-design:'), 'missing frontend-design frontmatter field');
});

test('spec template contains Design Direction section', () => {
  assert(specTemplate.includes('## Design Direction'), 'missing Design Direction section');
});

test('spec template contains frontend-design conditional marker', () => {
  assert(specTemplate.includes('<if frontend-design is true>'), 'missing conditional marker');
});

test('spec template Design Direction has Aesthetic Style field', () => {
  assert(specTemplate.includes('**Aesthetic Style**'), 'missing Aesthetic Style field');
});

test('spec template Design Direction has Stack field', () => {
  assert(specTemplate.includes('**Stack**'), 'missing Stack field');
});

test('spec template Design Direction has Component Libraries field', () => {
  assert(specTemplate.includes('**Component Libraries**'), 'missing Component Libraries field');
});

test('spec template Design Direction has Design Notes field', () => {
  assert(specTemplate.includes('**Design Notes**'), 'missing Design Notes field');
});

// --- Plan skill ---

const planSkill = readFile('skills/plan/SKILL.md');

test('plan skill mentions design direction', () => {
  assert(planSkill.includes('Design direction') || planSkill.includes('design direction'), 'missing design direction reference');
});

test('plan skill mentions aesthetic', () => {
  assert(planSkill.includes('aesthetic'), 'missing aesthetic reference');
});

test('plan skill mentions frontend-design: true', () => {
  assert(planSkill.includes('frontend-design: true'), 'missing frontend-design: true reference');
});

// --- Spec-writing skills ---

const specSequential = readFile('skills/spec-sequential/SKILL.md');

test('spec-sequential mentions frontend-design', () => {
  assert(specSequential.includes('frontend-design'), 'missing frontend-design reference');
});

test('spec-sequential mentions Design Direction', () => {
  assert(specSequential.includes('Design Direction'), 'missing Design Direction reference');
});

const specDelegated = readFile('skills/spec-delegated/SKILL.md');

test('spec-delegated mentions frontend-design', () => {
  assert(specDelegated.includes('frontend-design'), 'missing frontend-design reference');
});

test('spec-delegated mentions Design Direction', () => {
  assert(specDelegated.includes('Design Direction'), 'missing Design Direction reference');
});

const specTeam = readFile('skills/spec-team/SKILL.md');

test('spec-team mentions frontend-design', () => {
  assert(specTeam.includes('frontend-design'), 'missing frontend-design reference');
});

test('spec-team mentions Design Direction', () => {
  assert(specTeam.includes('Design Direction'), 'missing Design Direction reference');
});

// --- Build skill ---

const buildSkill = readFile('skills/build/SKILL.md');

test('build skill mentions frontend-design-guidelines.md', () => {
  assert(buildSkill.includes('frontend-design-guidelines.md'), 'missing guidelines template reference');
});

test('build skill mentions frontend-design in frontmatter parsing', () => {
  assert(buildSkill.includes('frontend-design'), 'missing frontend-design reference');
});

test('build skill has Frontend Design Instructions section', () => {
  assert(buildSkill.includes('### Frontend Design Instructions'), 'missing Frontend Design Instructions section');
});

test('build skill frontend-design injection is builder-only', () => {
  assert(buildSkill.includes('every **builder** agent dispatch prompt'), 'not builder-only');
});

// --- Agents ---

test('agents/builder.md is NOT modified (no frontend-design reference)', () => {
  const builder = readFile('agents/builder.md');
  assert(!builder.includes('frontend-design'), 'builder agent should not reference frontend-design — guidelines are injected contextually by the build skill');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
