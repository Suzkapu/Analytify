import {ChangeDetectionStrategy, Component, NgZone, Optional} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {ImageHealingService} from '@core/sync/image-healing/image-healing.service';
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';
import {SharedModule} from '@shared/shared.module';
import {
  V2ButtonDirective, V2CardComponent, V2ListRowComponent, V2PageComponent,
  V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent
} from '@shared/ui-v2';
import {SongsController} from '../songs/songs.component';
import {SongsUiModule} from '../songs/songs.module';

@Component({
  selector: 'app-v2-songs-page',
  standalone: true,
  imports: [RouterLink, SharedModule, SongsUiModule, V2ButtonDirective, V2CardComponent, V2ListRowComponent,
    V2PageComponent, V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent],
  template: `
    <v2-page eyebrow="Playlist explorer" [title]="playlistName || 'Playlist contents'"
      description="Browse the artists, songs, and albums in this playlist.">
      <a v2PageActions v2Button="tertiary" [routerLink]="backLink"><i class="pi pi-arrow-left"></i> Back to playlists</a>
      @if (!isLoading && artists.length) {
        <v2-tabs v2PageTabs id="playlist-view" label="Choose playlist view" appearance="segmented"
          [tabs]="viewTabs" [selected]="viewStyle" (selectedChange)="selectView($event)" />
      }
      @if (!isLoading && artists.length) {
        <v2-toolbar v2PageToolbar label="Playlist view controls">
          <v2-search-filters [id]="'v2-' + viewStyle + '-search'" [label]="searchLabel"
            [placeholder]="searchLabel" [query]="activeSearch" (queryChange)="updateSearch($event)" />
          @if (viewStyle === 'artists') {
            <button type="button" v2Button="secondary" (click)="sortArtistsByTracks()"><i class="pi pi-sort-alt"></i> Sort by count</button>
          } @else if (viewStyle === 'albums' && !selectedAlbum) {
            <button type="button" v2Button="secondary" (click)="sortAlbumsByTracks()"><i class="pi pi-sort-alt"></i> Sort by count</button>
          } @else if (viewStyle === 'songs') {
            <label class="v2-native-select">Sort songs
              <select [ngModel]="trackSortKey" (ngModelChange)="selectSort($event)">
                @for (option of sortOptions; track option.value) { <option [value]="option.value">{{ option.label }}</option> }
              </select>
            </label>
          }
        </v2-toolbar>
      }
      @if (cooldownMessage) { <div class="v2-library-warning" role="status"><i class="pi pi-exclamation-triangle"></i>{{ cooldownMessage }}</div> }
      @if (isLoading || isLoadingTracks || isLoadingArtists) {
        <v2-state kind="loading" title="Loading playlist details…"
          [message]="totalTracks ? loadedTracksCount + ' of ' + totalTracks + ' songs loaded' : 'Finding cached playlist data…'" />
      } @else if (!artists.length) {
        <v2-state icon="pi-users" title="No playlist details found" message="This playlist does not contain any available artist or song data." />
      } @else if (viewStyle === 'artists') {
        <section class="v2-artist-grid" aria-label="Artists in playlist">
          @for (artist of filteredArtists.slice(0, displayedArtistsCount); track trackArtistItem($index, artist)) {
            <v2-card class="v2-artist-card">
              <button type="button" class="v2-media-action" [disabled]="!artist.external_urls?.spotify"
                [attr.aria-label]="'Open ' + artist.name + ' on Spotify'" (click)="openArtistClick(artist.external_urls?.spotify)">
                <img [src]="artist.images?.[2]?.url || artist.images?.[0]?.url || 'assets/Analytify-96.webp'"
                  (error)="onArtistImageError(artist, $event)" width="64" height="64" [alt]="artist.name + ' photo'" loading="lazy">
              </button>
              <div><h2>{{ artist.name }}</h2><p>{{ artist.tracks.length }} {{ artist.tracks.length === 1 ? 'song' : 'songs' }}</p></div>
              <button type="button" v2Button="secondary" (click)="artistDetails(artist.id)">Details</button>
            </v2-card>
          }
        </section>
      } @else if (viewStyle === 'songs') {
        @if (!filteredTracks.length) { <v2-state icon="pi-search" title="No songs found" message="Try another song or artist search." /> }
        <section class="v2-track-list" aria-label="Songs in playlist">
          @for (track of filteredTracks.slice(0, displayedTracksCount); track trackSongItem($index, track); let index = $index) {
            <v2-list-row class="v2-track-row">
              <span class="v2-track-index">{{ index + 1 }}</span>
              <button type="button" class="v2-media-action" [disabled]="!track.external_urls?.spotify"
                [attr.aria-label]="'Open ' + track.name + ' on Spotify'" (click)="openTrackClick(track.external_urls?.spotify)">
                <img [src]="track.album?.images?.[0]?.url || 'assets/Analytify-96.webp'" width="54" height="54" [alt]="track.name + ' cover'" loading="lazy">
              </button>
              <div class="v2-track-copy"><strong>{{ track.name }}</strong><span>{{ track.artists?.[0]?.name || 'Unknown artist' }}</span></div>
              <div class="v2-track-meta">@if (track.explicit) { <span class="v2-explicit">E</span> }<span>{{ formatDurationShort(track.duration_ms) }}</span></div>
            </v2-list-row>
          }
        </section>
      } @else {
        @if (selectedAlbum) {
          <button type="button" v2Button="tertiary" (click)="closeAlbumDetails()"><i class="pi pi-arrow-left"></i> Back to albums</button>
        }
        <section class="v2-album-grid" aria-label="Albums in playlist">
          @for (album of (selectedAlbum ? [selectedAlbum] : filteredAlbums.slice(0, displayedAlbumsCount)); track album.id || album.name) {
            <v2-card class="v2-album-card" (click)="!selectedAlbum && openAlbumDetails(album)">
              <img [src]="album.imageUrl || 'assets/Analytify-96.webp'" width="80" height="80" [alt]="album.name + ' cover'" loading="lazy">
              <div><h2>{{ album.name }}</h2><p>{{ album.artists?.[0] || 'Unknown artist' }}</p><small>{{ album.tracks?.length || album.count || 0 }} songs</small></div>
            </v2-card>
          }
        </section>
      }
    </v2-page>
  `,
  styleUrl: './v2-songs-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SongsPageComponent extends SongsController {
  readonly backLink = this.navigation.commands('playlists');
  readonly viewTabs = [{id: 'artists', label: 'Artists'}, {id: 'songs', label: 'Songs'}, {id: 'albums', label: 'Albums'}];
  constructor(route: ActivatedRoute, router: Router, auth: SpotifyAuthService, storage: StorageService,
    loader: PlaylistLoaderService, imageHealing: ImageHealingService, zone: NgZone,
    @Optional() readonly navigation: DesignNavigationService) {
    super(route, router, auth, storage, loader, imageHealing, zone, navigation);
  }
  get searchLabel(): string { return this.viewStyle === 'artists' ? 'Search artists' : this.viewStyle === 'songs' ? 'Search songs or artists' : 'Search albums or artists'; }
  get activeSearch(): string { return this.viewStyle === 'artists' ? this.searchText : this.viewStyle === 'songs' ? this.trackSearchText : this.albumSearchText; }
  selectView(value: string): void { this.viewStyle = value as typeof this.viewStyle; if (this.viewStyle !== 'albums') this.closeAlbumDetails(); }
  updateSearch(value: string): void {
    if (this.viewStyle === 'artists') { this.searchText = value; this.filterArtists(); }
    else if (this.viewStyle === 'songs') { this.trackSearchText = value; this.filterAndSortTracks(); }
    else { this.albumSearchText = value; this.filterAlbums(); }
  }
  selectSort(value: string): void { this.trackSortKey = value; this.sortAscending = this.getDefaultSortDirection(value); this.filterAndSortTracks(); }
}
