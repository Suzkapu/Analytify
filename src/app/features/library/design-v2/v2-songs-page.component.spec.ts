import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {DESIGN_VARIANT} from '@core/navigation/design-navigation';
import {V2SongsPageComponent} from './v2-songs-page.component';

describe('V2SongsPageComponent', () => {
  it('keeps its back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2SongsPageComponent],
      providers: [
        {provide: DESIGN_VARIANT, useValue: 'new'},
        {provide: Router, useValue: {navigate: vi.fn(), createUrlTree: vi.fn()}}
      ]
    }).overrideComponent(V2SongsPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2SongsPageComponent).componentInstance.backLink).toEqual(['/new', 'playlists']);
  });
});
