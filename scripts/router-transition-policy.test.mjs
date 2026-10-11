import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hasConfiguredNativeTransitions} from './router-transition-policy.mjs';

const source = `
import {NgModule} from '@angular/core';
import {provideRouter, withViewTransitions} from '@angular/router';
export const options = {skipInitialTransition: true};
@NgModule({providers: [provideRouter(routes, withViewTransitions(options))]})
export class Routing {}
`;

test('recognizes the actual configured public provider feature', () => {
  assert.equal(hasConfiguredNativeTransitions(source), true);
});
test('rejects removed motion, first-render animation and misleading text', () => {
  for (const disabled of [
    source.replace('withViewTransitions(options)', 'withPreloading(strategy)'),
    source.replace('skipInitialTransition: true', 'skipInitialTransition: false'),
    source.replace('withViewTransitions(options)', 'withViewTransitions()'),
    source.replace('providers: [provideRouter(routes, withViewTransitions(options))]', 'providers: []') + '\n// enableViewTransitions: true; withViewTransitions(options)',
    source.replace('providers:', 'unusedFeatures:'),
    source.replace("from '@angular/router'", "from './fake-router'"),
    source.replace("from '@angular/core'", "from './fake-core'")
  ]) assert.equal(hasConfiguredNativeTransitions(disabled), false, disabled);
});
