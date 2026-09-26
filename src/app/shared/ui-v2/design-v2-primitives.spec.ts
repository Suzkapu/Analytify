import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {
  DESIGN_V2_PRIMITIVES,
  V2ButtonDirective,
  V2ModalComponent,
  V2OverflowMenuComponent,
  V2SearchFiltersComponent,
  V2StateComponent,
  V2StatusBadgeComponent,
  V2TabsComponent
} from './design-v2-primitives';

@Component({
  standalone: true,
  imports: [...DESIGN_V2_PRIMITIVES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <v2-page title="Your playlists" eyebrow="Library" description="Choose something to play." width="reading">
      <button v2PageActions v2Button="primary">Create</button>
      <v2-tabs v2PageTabs id="page-tabs" [tabs]="tabs" selected="all" />
      <v2-toolbar v2PageToolbar label="Playlist tools"><button v2Button="secondary">Sort</button></v2-toolbar>
      <v2-section-header title="Saved" description="Your saved playlists"><button v2Button="tertiary">Edit</button></v2-section-header>
      <v2-card><v2-list-row>Playlist row</v2-list-row></v2-card>
      <v2-skeleton width="12rem" height="2rem" label="Loading playlists" />
    </v2-page>
  `
})
class PrimitivesHostComponent {
  readonly tabs = [{id: 'all', label: 'All'}, {id: 'saved', label: 'Saved'}];
}

describe('Design v2 presentational primitives', () => {
  let fixture: ComponentFixture<PrimitivesHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [PrimitivesHostComponent]}).compileComponents();
    fixture = TestBed.createComponent(PrimitivesHostComponent);
    fixture.detectChanges();
  });

  it('composes a constrained page with named chrome and stable loading space', () => {
    const page = fixture.nativeElement.querySelector('.v2-page');
    const skeleton = fixture.nativeElement.querySelector('.v2-skeleton') as HTMLElement;

    expect(page.classList).toContain('v2-page--reading');
    expect(page.querySelector('h1').textContent).toContain('Your playlists');
    expect(page.querySelector('.v2-page__actions button').textContent).toContain('Create');
    expect(page.querySelector('[role="toolbar"]').getAttribute('aria-label')).toBe('Playlist tools');
    expect(page.querySelector('.v2-card .v2-list-row').textContent).toContain('Playlist row');
    expect(skeleton.style.width).toBe('12rem');
    expect(skeleton.style.height).toBe('2rem');
    expect(fixture.nativeElement.textContent).toContain('Loading playlists');
  });
});

@Component({
  standalone: true,
  imports: [V2ButtonDirective],
  template: '<button v2Button="danger" [loading]="loading" (click)="recordClick()">Delete</button>'
})
class ButtonHostComponent {
  loading = false;
  clicks = 0;
  recordClick(): void { this.clicks += 1; }
}

describe('V2ButtonDirective', () => {
  it('applies an explicit semantic variant and suppresses actions while loading', async () => {
    await TestBed.configureTestingModule({imports: [ButtonHostComponent]}).compileComponents();
    const fixture = TestBed.createComponent(ButtonHostComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.classList).toContain('v2-button--danger');
    button.click();
    expect(fixture.componentInstance.clicks).toBe(1);

    fixture.componentInstance.loading = true;
    fixture.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });
});

describe('V2StatusBadgeComponent', () => {
  it('renders mapped wording and tone instead of the raw backend enum', async () => {
    await TestBed.configureTestingModule({imports: [V2StatusBadgeComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2StatusBadgeComponent);
    fixture.componentRef.setInput('status', 'authorizing');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Waiting for approval');
    expect(fixture.nativeElement.textContent).not.toContain('authorizing');
    expect(fixture.nativeElement.querySelector('.v2-status--info')).not.toBeNull();
  });
});

describe('V2TabsComponent', () => {
  it('exposes tab semantics, skips disabled choices, and supports arrow navigation', async () => {
    await TestBed.configureTestingModule({imports: [V2TabsComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2TabsComponent);
    fixture.componentRef.setInput('id', 'stats');
    fixture.componentRef.setInput('label', 'Stats range');
    fixture.componentRef.setInput('tabs', [
      {id: 'short', label: 'Short'}, {id: 'medium', label: 'Medium', disabled: true}, {id: 'long', label: 'Long'}
    ]);
    fixture.componentRef.setInput('selected', 'short');
    fixture.componentRef.setInput('appearance', 'segmented');
    const selected = vi.fn();
    fixture.componentInstance.selectedChange.subscribe(selected);
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('[role="tablist"]');
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(list.getAttribute('aria-label')).toBe('Stats range');
    expect(list.classList).toContain('v2-tabs--segmented');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].disabled).toBe(true);
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
    expect(selected).toHaveBeenCalledWith('long');
    tabs[1].click();
    expect(selected).toHaveBeenCalledTimes(1);
  });
});

describe('V2SearchFiltersComponent', () => {
  it('labels search, emits query changes, and toggles enabled filters', async () => {
    await TestBed.configureTestingModule({imports: [V2SearchFiltersComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2SearchFiltersComponent);
    fixture.componentRef.setInput('id', 'playlist-search');
    fixture.componentRef.setInput('label', 'Search playlists');
    fixture.componentRef.setInput('description', 'Search by title or owner.');
    fixture.componentRef.setInput('filters', [
      {id: 'saved', label: 'Saved'}, {id: 'mine', label: 'Mine', disabled: true}
    ]);
    fixture.componentRef.setInput('activeFilters', ['saved']);
    const queryChange = vi.fn();
    const filtersChange = vi.fn();
    fixture.componentInstance.queryChange.subscribe(queryChange);
    fixture.componentInstance.activeFiltersChange.subscribe(filtersChange);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'mix';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    expect(input.labels?.[0].textContent).toContain('Search playlists');
    expect(input.getAttribute('aria-describedby')).toBe('playlist-search-description');
    expect(queryChange).toHaveBeenCalledWith('mix');

    const chips = fixture.nativeElement.querySelectorAll('.v2-filter-chips button');
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    chips[0].click();
    expect(filtersChange).toHaveBeenCalledWith([]);
    chips[1].click();
    expect(filtersChange).toHaveBeenCalledTimes(1);
  });
});

describe('V2StateComponent', () => {
  it.each([
    ['empty', 'status', 'polite'], ['loading', 'status', 'polite'], ['error', 'alert', 'assertive']
  ] as const)('renders the %s state with the correct announcement behavior', async (kind, role, live) => {
    await TestBed.configureTestingModule({imports: [V2StateComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2StateComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('title', 'State title');
    fixture.componentRef.setInput('message', 'State detail');
    fixture.detectChanges();
    const state = fixture.nativeElement.querySelector('.v2-state');
    expect(state.getAttribute('role')).toBe(role);
    expect(state.getAttribute('aria-live')).toBe(live);
    expect(Boolean(state.querySelector('.v2-spinner'))).toBe(kind === 'loading');
  });

  it('renders and emits an optional recovery action', async () => {
    await TestBed.configureTestingModule({imports: [V2StateComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2StateComponent);
    fixture.componentRef.setInput('title', 'Could not load');
    fixture.componentRef.setInput('actionLabel', 'Try again');
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(action).toHaveBeenCalledOnce();
  });
});

describe('V2ModalComponent', () => {
  beforeEach(() => vi.useFakeTimers({advanceTimeDelta: 1, shouldAdvanceTime: true}));
  afterEach(() => vi.useRealTimers());

  it('mounts only while open, uses dialog semantics, and emits a close request', async () => {
    await TestBed.configureTestingModule({imports: [V2ModalComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2ModalComponent);
    fixture.componentRef.setInput('title', 'Confirm change');
    fixture.componentRef.setInput('open', true);
    const openChange = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.openChange.subscribe(openChange);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('v2-modal-title');
    fixture.nativeElement.querySelector('[aria-label="Close dialog"]').click();
    expect(openChange).toHaveBeenCalledWith(false);
    expect(closed).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps a non-dismissible dialog open', async () => {
    await TestBed.configureTestingModule({imports: [V2ModalComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2ModalComponent);
    fixture.componentRef.setInput('title', 'Saving');
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('closeDisabled', true);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    fixture.componentInstance.requestClose();
    expect(closed).not.toHaveBeenCalled();
    expect((fixture.nativeElement.querySelector('.v2-modal > header [aria-label="Close dialog"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('V2OverflowMenuComponent', () => {
  it('opens on demand, emits enabled choices, and closes', async () => {
    await TestBed.configureTestingModule({imports: [V2OverflowMenuComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2OverflowMenuComponent);
    fixture.componentRef.setInput('items', [
      {id: 'rename', label: 'Rename'}, {id: 'delete', label: 'Delete', danger: true},
      {id: 'locked', label: 'Locked', disabled: true}
    ]);
    const selected = vi.fn();
    fixture.componentInstance.itemSelected.subscribe(selected);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = fixture.nativeElement.querySelectorAll('[role="menuitem"]');
    expect(items[1].classList).toContain('is-danger');
    items[2].click();
    expect(selected).not.toHaveBeenCalled();
    items[0].click();
    fixture.detectChanges();
    expect(selected).toHaveBeenCalledWith('rename');
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('supports menu arrow keys and Escape focus restoration', async () => {
    await TestBed.configureTestingModule({imports: [V2OverflowMenuComponent]}).compileComponents();
    const fixture = TestBed.createComponent(V2OverflowMenuComponent);
    fixture.componentRef.setInput('items', [{id: 'one', label: 'One'}, {id: 'two', label: 'Two'}]);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    const menu = fixture.nativeElement.querySelector('[role="menu"]');
    menu.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true, cancelable: true}));
    expect((document.activeElement as HTMLElement).textContent).toContain('One');
    menu.dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true, cancelable: true}));
    expect((document.activeElement as HTMLElement).textContent).toContain('Two');
    menu.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
