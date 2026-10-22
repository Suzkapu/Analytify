import {ChangeDetectionStrategy, Component, HostListener, OnInit, inject} from '@angular/core';
import {DesignV2MobileShortcutPreferencesService} from '@core/navigation/design-v2-mobile-shortcut-preferences.service';
import {DESIGN_V2_NAVIGATION} from '@core/navigation/design-v2-navigation.model';
import {MOBILE_SHORTCUT_IDS} from '@core/navigation/mobile-shortcut-policy';
import {V2ButtonDirective} from '@shared/ui-v2/design-v2-primitives';
import {V2InlineStatusComponent} from '@shared/ui-v2/v2-inline-status.component';
import {V2ShortcutChoiceComponent} from '@shared/ui-v2/v2-shortcut-choice.component';

const FEEDBACK = {
  loading: ['Loading navigation preferences', 'Checking the shortcuts saved for this Spotify account on this device.'],
  refreshing: ['Refreshing navigation preferences', 'Your current shortcuts stay available while saved choices are checked.'],
  saving: ['Saving navigation preferences', 'Your selection applies now. Wait for this device to finish saving before changing another shortcut.'],
  'load-error': ['Navigation preferences could not be loaded', 'Saved shortcuts could not be read. Retry before changing your selection.'],
  'save-error': ['Navigation changes could not be saved', 'Your last saved shortcuts were restored. Retry to save your requested selection.']
} as const;

@Component({
  selector: 'v2-settings-navigation-preferences', standalone: true,
  imports: [V2ShortcutChoiceComponent, V2InlineStatusComponent, V2ButtonDirective],
  template: `<section class="navigation-preferences" aria-labelledby="navigation-preferences-title">
    <h2 id="navigation-preferences-title">Bottom navigation</h2>
    <p>Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.</p>
    @if (feedbackCopy(); as copy) {
      <v2-inline-status [title]="copy[0]" [description]="copy[1]" [busy]="preferences.loading() || preferences.saving()" [error]="!!preferences.error()">
        @if (preferences.error()) {<button type="button" v2Button="primary" (click)="preferences.retry()"><i class="pi pi-sync" aria-hidden="true"></i>Retry</button>}
      </v2-inline-status>
    }
    @if (preferences.selection(); as selected) {<p role="status">{{ selected.length }} of 5 shortcuts selected</p>}
    @if (preferences.limitMessage()) {<p role="status">{{ preferences.limitMessage() }}</p>}
    <div class="navigation-preferences__choices" aria-label="Bottom navigation shortcuts">
      @for (item of choices; track item.id) {
        <v2-shortcut-choice [label]="item.label" [icon]="item.icon" [selected]="isSelected(item.id)"
          [disabled]="!preferences.selection() || preferences.loading() || preferences.saving() || preferences.feedback() === 'load-error'"
          (changeRequested)="preferences.toggle(item.id)" />
      }
    </div>
  </section>`,
  styles: `:host {display:block; min-width:0;} .navigation-preferences {display:flex; flex-direction:column; gap:12px; min-width:0;} h2 {margin:0; height:24px; font-size:20px; font-weight:600; line-height:28px;} p {margin:0; line-height:24px; overflow-wrap:anywhere;} .navigation-preferences>p:first-of-type {color:var(--v2-color-text-muted);} .navigation-preferences__choices {display:flex; flex-direction:column; gap:12px;} v2-inline-status button {width:min(100%,260px); min-height:48px; font-size:14px; font-weight:600; line-height:20px;} v2-inline-status button .pi {font-size:18px; width:18px; height:18px;}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SettingsNavigationComponent implements OnInit {
  readonly preferences = inject(DesignV2MobileShortcutPreferencesService);
  readonly choices = MOBILE_SHORTCUT_IDS.map(id => {
    const item = DESIGN_V2_NAVIGATION.find(item => item.id === id)!;
    return {...item, label: id === 'compare-room' ? 'Compare' : item.label};
  });
  ngOnInit(): void {void this.preferences.load();}
  @HostListener('window:focus') refresh(): void {void this.preferences.reload();}
  isSelected(id: string): boolean {return this.preferences.selection()?.some(item => item === id) ?? false;}
  feedbackCopy(): readonly [string, string] | null {
    const state = this.preferences.feedback();
    return state ? FEEDBACK[state] : null;
  }
}
