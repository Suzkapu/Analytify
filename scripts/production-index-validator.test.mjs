import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProductionIndex} from './production-index-validator.mjs';

const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';

test('accepts a directly active stylesheet and responsive viewport', () => {
  const html = `<head>${viewport}<link rel="stylesheet" href="styles.hash.css"></head>`;
  assert.equal(validateProductionIndex(html, asset => asset === 'styles.hash.css'), 1);
});

test('rejects an index without a device-width viewport', () => {
  const html = '<head><link rel="stylesheet" href="styles.hash.css"></head>';
  assert.throws(() => validateProductionIndex(html, () => true), /device-width viewport/);
});

test('rejects Angular print-only CSS activation that strict CSP blocks', () => {
  const html = `<head>${viewport}<link rel="stylesheet" href="styles.hash.css" media="print" onload="this.media='all'"></head>`;
  assert.throws(() => validateProductionIndex(html, () => true), /inline JavaScript blocked by CSP/);
});

test('rejects a stylesheet link whose hashed artifact is missing', () => {
  const html = `<head>${viewport}<link rel="stylesheet" href="styles.missing.css"></head>`;
  assert.throws(() => validateProductionIndex(html, () => false), /missing from the build artifact/);
});
