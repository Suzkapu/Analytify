import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {describe, expect, it} from 'vitest';
import {DesignV2ShellComponent} from './design-v2-shell.component';
import {DESIGN_V2_ACCOUNT_ACTIONS} from './design-v2-account-actions';

@Component({standalone: true, template: '<h1>Account action host</h1>'})
class ActionHost {}

async function setup() {
  TestBed.configureTestingModule({providers: [provideRouter([
    {path: '', component: DesignV2ShellComponent, children: [{path: 'account', component: ActionHost}]}
  ])]});
  const harness = await RouterTestingHarness.create('/account');
  const host = harness.fixture.debugElement.query(By.directive(ActionHost));
  const shell = harness.fixture.debugElement.query(By.directive(DesignV2ShellComponent)).componentInstance as DesignV2ShellComponent;
  return {actions: host.injector.get(DESIGN_V2_ACCOUNT_ACTIONS), shell};
}

describe('shared account-action boundary', () => {
  it('resolves the existing shell and opens backup consent without enabling backup', async () => {
    const {actions, shell} = await setup();
    expect(actions).toBe(shell);
    shell.actionError.set('Previous failure');
    actions.requestBackupEnable();
    expect(shell.backupConfirmationOpen()).toBe(true);
    expect(actions.actionError()).toBe('');
    shell.closeConfirmation(); expect(shell.backupConfirmationOpen()).toBe(false);
  });

  it('preserves an in-flight action and its feedback when backup management is requested', async () => {
    const {actions, shell} = await setup();
    shell.actionRunning.set(true); shell.actionError.set('Pending action feedback');
    actions.requestBackupEnable();
    expect(shell.backupConfirmationOpen()).toBe(false);
    expect(actions.actionRunning()).toBe(true); expect(actions.actionError()).toBe('Pending action feedback');
  });
});
