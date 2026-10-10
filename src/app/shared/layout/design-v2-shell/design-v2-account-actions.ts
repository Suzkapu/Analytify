import {InjectionToken, Signal} from '@angular/core';

/** Shared action boundary for the shell and canonical Settings presentation. */
export interface DesignV2AccountActions {
  readonly displayName: Signal<string>;
  readonly profilePicUrl: Signal<string | null>;
  readonly actionRunning: Signal<boolean>;
  readonly actionError: Signal<string>;
  readonly authService: {isBackupActive(): boolean};
  requestLogout(): Promise<void>;
  requestClearData(): void;
  requestBackupChange(event: Event): void;
  requestBackupEnable(): void;
  profileImageFailed(): void;
}

export const DESIGN_V2_ACCOUNT_ACTIONS = new InjectionToken<DesignV2AccountActions>('Design v2 account actions');
