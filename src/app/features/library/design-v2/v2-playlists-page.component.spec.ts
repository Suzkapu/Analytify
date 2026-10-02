import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {V2PlaylistsPageComponent} from './v2-playlists-page.component';

describe('V2PlaylistsPageComponent', () => {
  it('updates the search and delegates filtering once', () => {
    const component = Object.create(V2PlaylistsPageComponent.prototype) as V2PlaylistsPageComponent;
    const filter = vi.spyOn(component, 'onSearchChange').mockImplementation(() => {});
    component.updateSearch('playlist');
    expect(component.searchText).toBe('playlist');
    expect(filter).toHaveBeenCalledOnce();
  });
  it.each([false, true])('changes saved visibility only when needed from %s', initial => {
    const component = Object.create(V2PlaylistsPageComponent.prototype) as V2PlaylistsPageComponent;
    component.showSavedPlaylists = initial;
    const toggle = vi.spyOn(component, 'toggleSavedPlaylists').mockImplementation(() => {
      component.showSavedPlaylists = !component.showSavedPlaylists;
    });
    component.setSavedFilter(initial ? ['saved'] : []);
    expect(toggle).not.toHaveBeenCalled();
    component.setSavedFilter(initial ? [] : ['saved']);
    expect(toggle).toHaveBeenCalledOnce();
    expect(component.showSavedPlaylists).toBe(!initial);
  });
  it('reserves the playlist toolbar before cached or remote data arrives', async () => {
    await TestBed.configureTestingModule({imports: [V2PlaylistsPageComponent], providers: [provideRouter([])]})
      .compileComponents();
    const fixture = TestBed.createComponent(V2PlaylistsPageComponent);
    fixture.componentInstance.isLoadingPlaylists = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('v2-toolbar')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[type="search"]')).toBeTruthy();
  });
  it('provides the v2 playlist route frame', async () => {
    await TestBed.configureTestingModule({imports: [V2PlaylistsPageComponent], providers: [provideRouter([])]})
      .overrideComponent(V2PlaylistsPageComponent, {set: {template: '<p>Playlists</p>', imports: []}})
      .compileComponents();
    expect(TestBed.createComponent(V2PlaylistsPageComponent).componentInstance).toBeTruthy();
  });
});
