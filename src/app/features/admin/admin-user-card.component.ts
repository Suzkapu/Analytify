import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SyncTaskKey} from '@core/admin/admin.models';
import {V2ButtonDirective} from '@shared/ui-v2/design-v2-primitives';
import {V2PreferenceRowComponent} from '@shared/ui-v2/v2-preference-row.component';
import {AdminUserScheduleDraft} from './admin-user-interval-validation';
import {AdminUserSaveState} from './admin-user-save-state';
import {AdminUserTaskEditorComponent} from './admin-user-task-editor.component';
import {AdminUserSaveFeedbackComponent} from './admin-user-save-feedback.component';
import {AdminUserRefreshActionComponent} from './admin-user-refresh-action.component';
import {validAdminTimestamp} from './admin-timestamp';

const OPTIONAL_FIELDS = ['historyEnabled', 'shortTermEnabled', 'mediumTermEnabled', 'longTermEnabled',
  'songLeaguePlaylistsEnabled', 'sharedPlaylistsEnabled'] as const;
const REQUIRED_TASKS: readonly SyncTaskKey[] = ['stats_short_term', 'song_league_playlists', 'shared_playlists'];

/** Canonical1125:35373. Parent owns drafts, disclosure and privileged effects. */
@Component({
  selector: 'v2-admin-user-card', standalone: true,
  imports: [DatePipe, FormsModule, V2ButtonDirective, V2PreferenceRowComponent, AdminUserTaskEditorComponent,
    AdminUserSaveFeedbackComponent, AdminUserRefreshActionComponent],
  templateUrl: './admin-user-card.component.html', styleUrl: './admin-user-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminUserCardComponent {
  @Input({required: true}) user!: AdminUserScheduleDraft;
  @Input() expanded = false;
  @Input() busy = false;
  @Input() reviewBusy = false;
  @Input() state: AdminUserSaveState | null = null;
  @Input() refreshRequired = false;
  @Output() readonly disclosureToggle = new EventEmitter<void>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly run = new EventEmitter<void>();
  @Output() readonly review = new EventEmitter<HTMLElement>();
  @Output() readonly refresh = new EventEmitter<void>();
  private failedAvatarUrl = '';

  get pending(): boolean { return this.user.spotifyId.startsWith('pending:'); }
  get avatarUrl(): string { return this.user.profilePicUrl !== this.failedAvatarUrl ? this.user.profilePicUrl : ''; }
  avatarFailed(): void { this.failedAvatarUrl = this.user.profilePicUrl; }
  get optionalCount(): number { return OPTIONAL_FIELDS.filter(field => this.user[field]).length; }
  get requiredCount(): number { return REQUIRED_TASKS.filter(task => this.user.requiredTasks?.[task]?.trim()).length; }
  get successTimestamp(): string | null { return validAdminTimestamp(this.user.lastSuccessAt); }
  get nextTimestamp(): string | null { return validAdminTimestamp(this.user.nextEffectiveRunAt ?? null); }
  get runUnavailableReason(): string {
    if (this.pending) return 'Finish Spotify verification and connect Cloud Backup before running tasks.';
    if (!this.user.backupActive) return 'Turn on Cloud Backup before running tasks.';
    if (!this.user.hasRefreshToken) return 'Reconnect Spotify before running tasks.';
    return '';
  }
  requiredReason(task: SyncTaskKey): string {
    const reason = this.user.requiredTasks?.[task];
    return reason ? `${reason} Optional scheduling remains separate.` : '';
  }
}
