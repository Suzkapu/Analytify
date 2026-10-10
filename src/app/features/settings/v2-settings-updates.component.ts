import {NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, effect, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {scheduleBounds, scheduleEditable, SyncTaskStatus} from '@core/sync/sync-schedule-policy';
import {humanInterval} from '@shared/layout/header/settings-sheet-view-model';
import {V2ButtonDirective, V2PageComponent} from '@shared/ui-v2/design-v2-primitives';
import {V2InlineStatusComponent} from '@shared/ui-v2/v2-inline-status.component';
import {V2IntervalPopupComponent} from '@shared/ui-v2/v2-interval-popup.component';
import {V2PreferenceRowComponent} from '@shared/ui-v2/v2-preference-row.component';
import {V2UpdateSettingsController} from './v2-update-settings.controller';

const labels: Record<string, string> = {listening_history: 'Listening history', stats_short_term: 'Short-term stats',
  stats_medium_term: 'Medium-term stats', stats_long_term: 'Long-term stats', song_league_playlists: 'Weekly league playlists', shared_playlists: 'Shared playlists'};
const icons: Record<string, string> = {listening_history: 'history', stats_short_term: 'stats', stats_medium_term: 'stats',
  stats_long_term: 'stats', song_league_playlists: 'league', shared_playlists: 'sharing'};
function title(task: string): string {return labels[task] || 'Automatic update';}

@Component({
  selector: 'v2-settings-updates', standalone: true,
  imports: [RouterLink, NgTemplateOutlet, V2InlineStatusComponent, V2ButtonDirective], providers: [V2UpdateSettingsController],
  template: `
    <section class="v2-updates" aria-label="Automatic update settings">
      <div class="v2-updates__intro"><h2>Automatic updates</h2><p>Choose which personal Spotify data updates in the background.</p></div>
      @if (state.error()) {
        <v2-inline-status title="Automatic updates could not be loaded" [description]="state.error()" [error]="true">
          <button type="button" v2Button="secondary" [disabled]="state.loading()" (click)="state.reload()">Retry</button>
        </v2-inline-status>
      } @else if (state.loading()) {
        <v2-inline-status [title]="state.tasks() ? 'Refreshing automatic updates' : 'Loading automatic updates'"
          [description]="state.tasks() ? 'Your saved schedules remain visible while they are checked.' : 'Checking saved schedules and required tasks.'" [busy]="true" />
      }
      @if (state.tasks(); as tasks) {
        @if (!tasks.length) {<v2-inline-status title="No automatic updates available" description="No schedules are available for this account yet." />}
        <div class="v2-updates__grid">
          @for (task of tasks; track task.task_key) {
            <ng-template #summary>
              <div class="v2-update-summary__heading">
                @if (icon(task); as iconUrl) {<img [src]="iconUrl" width="20" height="20" alt="">}
                <strong>{{ title(task.task_key) }}</strong>
                <span class="v2-update-summary__badge" [class.is-required]="task.feature_required" [class.is-active]="!task.feature_required && task.policy_available && task.effective_active">
                  @if (task.feature_required) {<img src="assets/design-v2/update-required.svg" width="16" height="16" alt="">}
                  {{ task.feature_required ? 'Required' : !task.policy_available ? 'Unavailable' : task.effective_active ? 'Active' : 'Disabled' }}
                </span>
                @if (editable(task)) {<img src="assets/design-v2/update-chevron.svg" width="20" height="20" alt="">}
              </div>
              <p>{{ editable(task) && !task.effective_active ? 'Update when you choose to enable it' : 'Every ' + task.interval_value + ' ' + task.interval_unit }}</p>
              @if (task.feature_required || !task.policy_available || !task.editable) {<p>{{ task.reasons.join(' · ') }}</p>}
            </ng-template>
            @if (editable(task)) {
              <a class="v2-update-summary" [attr.data-task]="task.task_key" [routerLink]="navigation.commands('settingsUpdate', {id: task.task_key})"><ng-container [ngTemplateOutlet]="summary" /></a>
            } @else {
              <article class="v2-update-summary" [attr.data-task]="task.task_key"><ng-container [ngTemplateOutlet]="summary" /></article>
            }
          }
        </div>
        <p class="v2-updates__note">Required updates stay on while you use the associated feature.</p>
      }
    </section>`,
  styleUrl: './v2-settings-updates.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsUpdatesComponent implements OnInit {
  readonly state = inject(V2UpdateSettingsController);
  readonly navigation = inject(DesignNavigationService);
  readonly title = title;
  readonly editable = scheduleEditable;
  icon(task: SyncTaskStatus): string {return icons[task.task_key] ? `assets/design-v2/update-${icons[task.task_key]}.svg` : '';}
  ngOnInit(): void {void this.state.reload();}
  @HostListener('window:focus') refresh(): void {void this.state.reload();}
}

@Component({
  selector: 'v2-settings-update-editor', standalone: true,
  imports: [V2PageComponent, V2InlineStatusComponent, V2PreferenceRowComponent, V2ButtonDirective, V2IntervalPopupComponent],
  providers: [V2UpdateSettingsController],
  template: `
    <v2-page [title]="title(state.taskKey() || '')" description="Edit this optional update. Required feature updates stay on."
      appearance="canonical" [showBack]="true" (backRequested)="navigation.navigate('settingsUpdates')">
      <section class="v2-update-editor" aria-label="Automatic update preference" [attr.aria-busy]="state.loading() || state.saving()">
        @if (state.loading()) {<v2-inline-status [title]="state.tasks() ? 'Refreshing automatic updates' : 'Loading automatic updates'" description="Checking saved schedules and required tasks." [busy]="true" />}
        @if (state.saving()) {<v2-inline-status title="Saving automatic updates" description="Wait for this change to finish before saving another." [busy]="true" />}
        @if (state.error()) {
          <v2-inline-status [title]="state.failedOperation() === 'save' ? 'Changes could not be saved' : 'Automatic updates could not be loaded'" [description]="state.error()" [error]="true">
            @if (state.failedOperation() === 'load') {<button type="button" v2Button="secondary" [disabled]="state.loading()" (click)="state.reload()">Retry</button>}
          </v2-inline-status>
        }
        @if (state.saved()) {<v2-inline-status title="Automatic updates saved" description="Your schedule now uses the saved preference." />}
        @if (state.selected(); as task) {
          @if (state.draft(); as draft) {
            <v2-preference-row label="Automatic updates" [description]="'Update ' + title(task.task_key).toLowerCase() + ' in the background.'" iconUrl="assets/design-v2/update-sync.svg"
              [checked]="draft.enabled" [disabled]="state.loading() || state.saving()" (checkedChange)="state.changeDraft({enabled:$event})" />
            <button class="v2-update-field" type="button" aria-haspopup="dialog" [disabled]="state.loading() || state.saving()" (click)="popup.set('value')"><strong>Every</strong><span>{{ draft.value }}</span></button>
            <button class="v2-update-field" type="button" aria-haspopup="dialog" [disabled]="state.loading() || state.saving()" (click)="popup.set('unit')"><strong>Unit</strong><span>{{ draft.unit }}</span></button>
            <v2-inline-status [title]="'Minimum interval: ' + humanInterval(task.minimum_interval_minutes)"
              [description]="'Choose an interval of ' + humanInterval(task.minimum_interval_minutes) + ' or longer.'" />
            @if (state.validation()) {<v2-inline-status title="Choose a valid interval" [description]="state.validation()" [error]="true" />}
            <button class="v2-update-save" type="button" v2Button="primary" [loading]="state.saving()" [disabled]="state.loading()" (click)="state.save()"><img src="assets/design-v2/update-save.svg" width="20" height="20" alt="">Save changes</button>
            <p class="v2-updates__note">Changes apply only after Save changes. Leaving through Back, Menu or any other navigation discards unsaved changes.</p>
            @if (popup(); as mode) {
              <v2-interval-popup [mode]="mode" [value]="draft.value" [unit]="draft.unit" [minimum]="bounds(task, draft.unit).min" [maximum]="bounds(task, draft.unit).max"
                (valueChosen)="state.changeDraft({value:$event}); popup.set(null)" (unitChosen)="state.changeDraft({unit:$event}); popup.set(null)" (cancelled)="popup.set(null)" />
            }
          } @else {
            <v2-inline-status [title]="task.feature_required ? 'This update is required' : 'This update is unavailable'"
              [description]="task.feature_required ? 'It stays on while you use the associated feature.' : 'It cannot be edited under the current account or site policy.'" />
          }
        } @else if (!state.loading() && !state.error()) {
          <v2-inline-status title="This update is unavailable" description="It cannot be edited under the current account or site policy." />
        }
      </section>
    </v2-page>`,
  styleUrl: './v2-settings-updates.component.scss', changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsUpdateEditorComponent implements OnInit {
  readonly state = inject(V2UpdateSettingsController);
  readonly navigation = inject(DesignNavigationService);
  readonly popup = signal<'value' | 'unit' | null>(null);
  readonly title = title;
  readonly humanInterval = humanInterval;
  readonly bounds = scheduleBounds;
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  constructor() {effect(() => {if (!this.state.draft()) this.popup.set(null);});}
  @HostListener('window:focus') refresh(): void {void this.state.reload();}
  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.popup.set(null); this.state.select(params.get('id') || ''); void this.state.reload();
    });
  }
}
