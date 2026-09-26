import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {DESIGN_VARIANT} from '@core/navigation/design-navigation';
import {V2ArtistDetailsPageComponent} from './v2-artist-details-page.component';

describe('V2ArtistDetailsPageComponent', () => {
  it('keeps its fallback back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2ArtistDetailsPageComponent],
      providers: [
        {provide: DESIGN_VARIANT, useValue: 'new'},
        {provide: Router, useValue: {navigate: vi.fn(), createUrlTree: vi.fn()}}
      ]
    }).overrideComponent(V2ArtistDetailsPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2ArtistDetailsPageComponent).componentInstance.backLink[0]).toBe('/new');
  });
});
