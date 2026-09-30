import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {describe, expect, it} from 'vitest';
import {V2ArtistDetailsPageComponent} from './v2-artist-details-page.component';

describe('V2ArtistDetailsPageComponent', () => {
  it('keeps its fallback back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2ArtistDetailsPageComponent],
      providers: [provideRouter([])]
    }).overrideComponent(V2ArtistDetailsPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2ArtistDetailsPageComponent).componentInstance.backLink).toEqual(['/playlists']);
  });
});
