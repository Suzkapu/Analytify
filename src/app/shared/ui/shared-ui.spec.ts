import {TestBed} from '@angular/core/testing';
import {SharedModule} from '../shared.module';
import {MetricCardComponent} from './metric-card/metric-card.component';
import {PageStateComponent} from './page-state/page-state.component';

describe('shared UI segments', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({imports: [SharedModule]});
  });

  it('renders a consistent loading state with an accessible status role', () => {
    const fixture = TestBed.createComponent(PageStateComponent);
    fixture.componentInstance.loading = true;
    fixture.componentInstance.icon = 'pi-spinner';
    fixture.componentInstance.title = 'Loading music…';
    fixture.detectChanges();

    const state = fixture.nativeElement.querySelector('.shared-page-state') as HTMLElement;
    expect(state.getAttribute('role')).toBe('status');
    expect(state.textContent).toContain('Loading music…');
    expect(state.querySelector('.pi-spin')).not.toBeNull();
  });

  it('renders the common metric label and value', () => {
    const fixture = TestBed.createComponent(MetricCardComponent);
    fixture.componentInstance.label = 'Artists';
    fixture.componentInstance.value = 444;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('small').textContent).toContain('Artists');
    expect(fixture.nativeElement.querySelector('strong').textContent).toContain('444');
  });

  it('replaces a pending metric with its real value immediately when loading completes', () => {
    const fixture = TestBed.createComponent(MetricCardComponent);
    fixture.componentInstance.label = 'Albums';
    fixture.componentInstance.value = 27;
    fixture.componentInstance.loading = true;
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.shared-metric-card') as HTMLElement;
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.querySelector('.metric-loading')).not.toBeNull();
    expect(card.querySelector('strong')).toBeNull();

    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    expect(card.querySelector('.metric-loading')).toBeNull();
    expect(card.querySelector('strong')?.textContent).toContain('27');
  });
});
