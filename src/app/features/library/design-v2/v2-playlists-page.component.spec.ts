import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {V2PlaylistsPageComponent} from './v2-playlists-page.component';

describe('V2PlaylistsPageComponent', () => {
  it('provides the v2 playlist route frame', async () => {
    await TestBed.configureTestingModule({imports: [V2PlaylistsPageComponent]})
      .overrideComponent(V2PlaylistsPageComponent, {set: {template: '<p>Playlists</p>', imports: []}})
      .compileComponents();
    expect(TestBed.createComponent(V2PlaylistsPageComponent).componentInstance).toBeTruthy();
  });
});
