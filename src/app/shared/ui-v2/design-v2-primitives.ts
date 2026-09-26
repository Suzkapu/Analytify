import {CommonModule} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
  signal
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {SharedModule} from '@shared/shared.module';
import {
  DesignV2KnownStatus,
  designV2StatusPresentation
} from './design-v2-status';

export type V2ActionVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'icon';
export type V2PageWidth = 'reading' | 'form' | 'default' | 'dashboard' | 'wide';

@Directive({selector: 'button[v2Button], a[v2Button]', standalone: true})
export class V2ButtonDirective {
  @Input() v2Button: V2ActionVariant = 'secondary';
  @Input() loading = false;
  @Input() disabled = false;

  @HostBinding('class') get classes(): string {
    return `v2-button v2-button--${this.v2Button}${this.loading ? ' is-loading' : ''}`;
  }
  @HostBinding('attr.aria-busy') get ariaBusy(): 'true' | null { return this.loading ? 'true' : null; }
  @HostBinding('attr.aria-disabled') get ariaDisabled(): 'true' | null { return this.loading || this.disabled ? 'true' : null; }
  @HostBinding('attr.disabled') get disabledAttribute(): '' | null { return this.loading || this.disabled ? '' : null; }

  @HostListener('click', ['$event'])
  preventLoadingAction(event: Event): void {
    if (!this.loading) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

@Component({
  selector: 'v2-page',
  standalone: true,
  template: `
    <article class="v2-page" [class]="'v2-page v2-page--' + width">
      <header class="v2-page__header">
        <div class="v2-page__copy">
          @if (eyebrow) { <p class="v2-page__eyebrow">{{ eyebrow }}</p> }
          <h1>{{ title }}</h1>
          @if (description) { <p class="v2-page__description">{{ description }}</p> }
        </div>
        <div class="v2-page__actions" aria-label="Page actions"><ng-content select="[v2PageActions]" /></div>
      </header>
      <div class="v2-page__tabs"><ng-content select="[v2PageTabs]" /></div>
      <div class="v2-page__toolbar"><ng-content select="[v2PageToolbar]" /></div>
      <div class="v2-page__sections"><ng-content /></div>
    </article>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2PageComponent {
  @Input({required: true}) title = '';
  @Input() eyebrow = '';
  @Input() description = '';
  @Input() width: V2PageWidth = 'default';
}

@Component({
  selector: 'v2-card',
  standalone: true,
  template: '<ng-content />',
  host: {'class': 'v2-card'},
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2CardComponent {}

@Component({
  selector: 'v2-list-row',
  standalone: true,
  template: '<ng-content />',
  host: {'class': 'v2-list-row'},
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ListRowComponent {}

@Component({
  selector: 'v2-section-header',
  standalone: true,
  template: `
    <header class="v2-section-header">
      <div><h2>{{ title }}</h2>@if (description) { <p>{{ description }}</p> }</div>
      <div class="v2-section-header__actions"><ng-content /></div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SectionHeaderComponent {
  @Input({required: true}) title = '';
  @Input() description = '';
}

@Component({
  selector: 'v2-status-badge',
  standalone: true,
  template: '<span class="v2-status" [class]="\'v2-status v2-status--\' + presentation.tone"><span aria-hidden="true"></span>{{ presentation.label }}</span>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2StatusBadgeComponent {
  private current: DesignV2KnownStatus = 'idle';
  presentation = designV2StatusPresentation(this.current);

  @Input({required: true}) set status(value: DesignV2KnownStatus) {
    this.current = value;
    this.presentation = designV2StatusPresentation(value);
  }
}

export interface V2Choice { id: string; label: string; disabled?: boolean; }

@Component({
  selector: 'v2-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="'v2-tabs v2-tabs--' + appearance" role="tablist" [attr.aria-label]="label">
      @for (tab of tabs; track tab.id) {
        <button type="button" role="tab" [id]="id + '-tab-' + tab.id"
          [attr.aria-selected]="tab.id === selected" [attr.aria-controls]="id + '-panel-' + tab.id"
          [tabIndex]="tab.id === selected ? 0 : -1" [disabled]="tab.disabled"
          (click)="select(tab)" (keydown)="onKeydown($event, tab)">{{ tab.label }}</button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2TabsComponent {
  @Input() id = 'v2-tabs';
  @Input() label = 'Sections';
  @Input() tabs: readonly V2Choice[] = [];
  @Input() selected = '';
  @Input() appearance: 'tabs' | 'segmented' = 'tabs';
  @Output() selectedChange = new EventEmitter<string>();

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  select(tab: V2Choice): void {
    if (!tab.disabled && tab.id !== this.selected) this.selectedChange.emit(tab.id);
  }

  onKeydown(event: KeyboardEvent, tab: V2Choice): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const enabled = this.tabs.filter(item => !item.disabled);
    if (!enabled.length) return;
    event.preventDefault();
    const current = Math.max(0, enabled.findIndex(item => item.id === tab.id));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
    this.selectedChange.emit(enabled[next].id);
    queueMicrotask(() => this.host.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]')[this.tabs.indexOf(enabled[next])]?.focus());
  }
}

@Component({
  selector: 'v2-search-filters',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="v2-search">
      <label [for]="id">{{ label }}</label>
      <div class="v2-search__field"><i class="pi pi-search" aria-hidden="true"></i>
        <input [id]="id" type="search" [placeholder]="placeholder" [ngModel]="query"
          (ngModelChange)="queryChange.emit($event)" [attr.aria-describedby]="description ? id + '-description' : null">
      </div>
      @if (description) { <p [id]="id + '-description'" class="v2-control-description">{{ description }}</p> }
    </div>
    @if (filters.length) {
      <div class="v2-filter-chips" aria-label="Filters">
        @for (filter of filters; track filter.id) {
          <button type="button" [class.is-selected]="activeFilters.includes(filter.id)"
            [attr.aria-pressed]="activeFilters.includes(filter.id)" [disabled]="filter.disabled"
            (click)="toggleFilter(filter)">{{ filter.label }}</button>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SearchFiltersComponent {
  @Input() id = 'v2-search';
  @Input() label = 'Search';
  @Input() placeholder = '';
  @Input() description = '';
  @Input() query = '';
  @Input() filters: readonly V2Choice[] = [];
  @Input() activeFilters: readonly string[] = [];
  @Output() queryChange = new EventEmitter<string>();
  @Output() activeFiltersChange = new EventEmitter<readonly string[]>();

  toggleFilter(filter: V2Choice): void {
    if (filter.disabled) return;
    const next = this.activeFilters.includes(filter.id)
      ? this.activeFilters.filter(id => id !== filter.id)
      : [...this.activeFilters, filter.id];
    this.activeFiltersChange.emit(next);
  }
}

@Component({
  selector: 'v2-toolbar',
  standalone: true,
  template: '<div class="v2-toolbar" role="toolbar" [attr.aria-label]="label"><ng-content /></div>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ToolbarComponent { @Input() label = 'Page tools'; }

@Component({
  selector: 'v2-state',
  standalone: true,
  imports: [V2ButtonDirective],
  template: `
    <section class="v2-state" [class]="'v2-state v2-state--' + kind"
      [attr.role]="kind === 'error' ? 'alert' : 'status'" [attr.aria-live]="kind === 'error' ? 'assertive' : 'polite'">
      @if (kind === 'loading') { <span class="v2-spinner" aria-hidden="true"></span> }
      @if (icon && kind !== 'loading') { <i [class]="'pi ' + icon" aria-hidden="true"></i> }
      <h2>{{ title }}</h2><p>{{ message }}</p>
      @if (actionLabel) { <button type="button" v2Button="secondary" (click)="action.emit()">{{ actionLabel }}</button> }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2StateComponent {
  @Input() kind: 'empty' | 'loading' | 'error' = 'empty';
  @Input({required: true}) title = '';
  @Input() message = '';
  @Input() icon = '';
  @Input() actionLabel = '';
  @Output() action = new EventEmitter<void>();
}

@Component({
  selector: 'v2-modal',
  standalone: true,
  imports: [SharedModule, V2ButtonDirective],
  template: `
    @if (open) {
      <div class="v2-modal-layer">
        <button class="v2-modal-backdrop" type="button" tabindex="-1" aria-label="Close dialog" (click)="requestClose()"></button>
        <section class="v2-modal" role="dialog" aria-modal="true" [attr.aria-labelledby]="id + '-title'"
          appAccessibleDialog [modalEscapeDisabled]="closeDisabled" (modalEscape)="requestClose()">
          <header><div><p class="v2-page__eyebrow">{{ eyebrow }}</p><h2 [id]="id + '-title'">{{ title }}</h2></div>
            <button type="button" v2Button="icon" aria-label="Close dialog" [disabled]="closeDisabled" (click)="requestClose()"><i class="pi pi-times" aria-hidden="true"></i></button>
          </header>
          <div class="v2-modal__body"><ng-content /></div>
          <footer><ng-content select="[v2ModalActions]" /></footer>
        </section>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ModalComponent {
  @Input() id = 'v2-modal';
  @Input({required: true}) title = '';
  @Input() eyebrow = '';
  @Input() open = false;
  @Input() closeDisabled = false;
  @Output() openChange = new EventEmitter<boolean>();
  @Output() closed = new EventEmitter<void>();

  requestClose(): void {
    if (this.closeDisabled) return;
    this.openChange.emit(false);
    this.closed.emit();
  }
}

export interface V2MenuItem extends V2Choice { danger?: boolean; }

@Component({
  selector: 'v2-overflow-menu',
  standalone: true,
  imports: [V2ButtonDirective],
  template: `
    <div class="v2-overflow">
      <button type="button" v2Button="icon" [attr.aria-label]="label" aria-haspopup="menu"
        [attr.aria-expanded]="isOpen()" (click)="toggle()"><i class="pi pi-ellipsis-v" aria-hidden="true"></i></button>
      @if (isOpen()) {
        <div class="v2-menu" role="menu" (keydown)="onMenuKeydown($event)">
          @for (item of items; track item.id) {
            <button type="button" role="menuitem" [disabled]="item.disabled" [class.is-danger]="item.danger"
              (click)="choose(item)">{{ item.label }}</button>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2OverflowMenuComponent {
  @Input() label = 'More actions';
  @Input() items: readonly V2MenuItem[] = [];
  @Output() itemSelected = new EventEmitter<string>();
  readonly isOpen = signal(false);

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  toggle(): void { this.isOpen.update(open => !open); }
  choose(item: V2MenuItem): void {
    if (item.disabled) return;
    this.itemSelected.emit(item.id);
    this.isOpen.set(false);
  }
  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.isOpen.set(false); this.focusTrigger(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' || (current < 0 && event.key === 'ArrowDown') ? 0
      : event.key === 'End' || current < 0 ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }
  @HostListener('document:keydown.escape') closeFromDocument(): void {
    if (this.isOpen()) { this.isOpen.set(false); this.focusTrigger(); }
  }
  private focusTrigger(): void { this.host.nativeElement.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus(); }
}

@Component({
  selector: 'v2-skeleton',
  standalone: true,
  template: '<span class="v2-skeleton" aria-hidden="true" [style.width]="width" [style.height]="height"></span><span class="v2-visually-hidden">{{ label }}</span>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SkeletonComponent {
  @Input() width = '100%';
  @Input() height = '1rem';
  @Input() label = 'Loading content';
}

export const DESIGN_V2_PRIMITIVES = [
  V2ButtonDirective, V2PageComponent, V2CardComponent, V2ListRowComponent, V2SectionHeaderComponent,
  V2StatusBadgeComponent, V2TabsComponent, V2SearchFiltersComponent, V2ToolbarComponent, V2StateComponent,
  V2ModalComponent, V2OverflowMenuComponent, V2SkeletonComponent
] as const;
