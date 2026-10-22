import {ChangeDetectionStrategy, Component, computed, inject, input, output} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {DESIGN_V2_NAVIGATION, DesignV2NavigationItem} from '@core/navigation/design-v2-navigation.model';

/** Shared destinations/profile for canonical sidebar869:73478 and mobile menu105:3505. */
@Component({
  selector: 'v2-navigation-panel', standalone: true, imports: [RouterLink],
  template: `<div class="navigation-panel" [class.panel--sidebar]="mode() !== 'drawer'" [class.panel--compact]="mode() === 'compact'">
      <button appModalInitialFocus type="button" class="drawer-brand" [attr.aria-label]="brandLabel()" [attr.aria-expanded]="mode() === 'drawer' ? null : mode() === 'expanded'" (click)="brandActivated.emit()">
        <img src="assets/design-v2/product-logo.png" width="32" height="32" alt=""><span>Analytify</span>
      </button>
      <nav class="navigation-groups v2-tool-links" aria-label="All destinations">
        @for (group of groups; track group.label) {
          <div class="navigation-group">
            <p class="navigation-group__title">{{ group.label }}</p>
            @for (item of group.items; track item.id) {
              <a class="drawer-link" [attr.aria-label]="item.id === 'compare-room' ? 'Compare playlists' : item.label" [attr.title]="mode() === 'compact' ? item.label : null" [routerLink]="navigation.commands(item.destination)"
                [attr.aria-current]="active(item) ? 'page' : null" (click)="destinationSelected.emit()">
                <i class="pi {{ item.icon }}" aria-hidden="true"></i><span>{{ item.id === 'compare-room' ? 'Compare playlists' : item.label }}</span>
              </a>
            }
          </div>
        }
        @if (isAdmin()) {
          <div class="navigation-group">
            <p class="navigation-group__title">Administrator only</p>
            <a class="drawer-link" aria-label="Administration" [routerLink]="navigation.commands('admin')" (click)="destinationSelected.emit()">
              <i class="pi pi-cog" aria-hidden="true"></i><span>Administration</span>
            </a>
          </div>
        }
      </nav>
      <a class="drawer-profile" [routerLink]="navigation.commands('settingsAccount')" (click)="destinationSelected.emit()" aria-label="Settings">
        <span class="drawer-avatar" aria-hidden="true">
          @if (profilePicUrl()) {<img [src]="profilePicUrl()" alt="" (error)="profileImageFailed.emit()">}
          @else {<span>{{ displayName().slice(0, 1).toLocaleUpperCase() }}</span>}
        </span>
        <span class="drawer-identity"><strong>{{ displayName() }}</strong><span>Settings</span></span>
      </a>
    </div>`,
  styleUrl: './v2-navigation-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2NavigationPanelComponent {
  readonly navigation = inject(DesignNavigationService);
  readonly currentUrl = input.required<string>();
  readonly displayName = input.required<string>();
  readonly profilePicUrl = input<string | null>(null);
  readonly isAdmin = input(false);
  readonly mode = input<'drawer' | 'expanded' | 'compact'>('drawer');
  readonly brandActivated = output<void>();
  readonly destinationSelected = output<void>();
  readonly brandLabel = computed(() => this.mode() === 'drawer' ? 'Close navigation menu' : this.mode() === 'compact' ? 'Expand navigation sidebar' : 'Collapse navigation sidebar');
  readonly profileImageFailed = output<void>();
  readonly groups = [
    {label: 'Library', items: this.items('playlists')},
    {label: 'Listening', items: this.items('stats', 'history')},
    {label: 'Social', items: this.items('friends', 'song-league', 'private-sharing')},
    {label: 'Tools', items: this.items('compare-room')}
  ];
  active(item: DesignV2NavigationItem): boolean {
    const destination = this.navigation.commands(item.destination).join('/');
    const current = this.currentUrl().split(/[?#]/, 1)[0];
    return current === destination || current.startsWith(`${destination}/`);
  }
  private items(...ids: string[]): DesignV2NavigationItem[] {
    return ids.map(id => DESIGN_V2_NAVIGATION.find(item => item.id === id)!);
  }
}
