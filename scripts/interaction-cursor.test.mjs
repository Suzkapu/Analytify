import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../src/styles.scss', import.meta.url), 'utf8');

test('interactive controls expose a pointer without overriding text selection', () => {
  assert.match(styles, /:where\(a\[href\], button, select,[\s\S]*\[role='button'\][\s\S]*cursor: pointer !important/);
  assert.match(styles, /input\[type='checkbox'\]/);
  assert.match(styles, /input\[type='radio'\]/);
  assert.match(styles, /input\[type='text'\][\s\S]*textarea\)[\s\S]*cursor: text !important/);
});

test('disabled and aria-disabled controls expose a blocked cursor', () => {
  assert.match(styles, /\[disabled\][\s\S]*\[aria-disabled='true'\][\s\S]*cursor: not-allowed !important/);
});
