import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {V2RankingFlameComponent} from './v2-ranking-flame.component';

describe('ranking flame accessible states', () => {
  it('distinguishes a hot mover from a Top 10 debut and removes stale badges', () => {
    const fixture = TestBed.createComponent(V2RankingFlameComponent);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(element.querySelector('svg')).toBeNull();

    fixture.componentRef.setInput('kind', 'hot');
    fixture.detectChanges();
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Hot mover');
    expect(element.querySelector('title')?.textContent).toBe('Hot mover');
    expect(element.querySelector('.debut')).toBeNull();

    fixture.componentRef.setInput('kind', 'debut');
    fixture.detectChanges();
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Top 10 debut');
    expect(element.querySelector('title')?.textContent).toBe('Top 10 debut');
    expect(element.querySelector('svg.debut')).not.toBeNull();
    expect(element.querySelector('button, a, [tabindex]')).toBeNull();

    fixture.componentRef.setInput('kind', null);
    fixture.detectChanges();
    expect(element.querySelector('[role="img"]')).toBeNull();
    fixture.destroy();
  });
});
