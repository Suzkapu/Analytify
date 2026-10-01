import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Optional} from '@angular/core';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';
import {SharedModule} from '@shared/shared.module';
import {
  V2ButtonDirective, V2CardComponent, V2PageComponent, V2SearchFiltersComponent,
  V2StateComponent, V2ToolbarComponent
} from '@shared/ui-v2';
import {PlaylistsController} from '../playlists/playlists.component';
import {PlaylistsUiModule} from '../playlists/playlists.module';

@Component({
  selector: 'app-v2-playlists-page',
  standalone: true,
  imports: [RouterLink, SharedModule, PlaylistsUiModule, V2ButtonDirective, V2CardComponent, V2PageComponent,
    V2SearchFiltersComponent, V2StateComponent, V2ToolbarComponent],
  template: `
    <v2-page eyebrow="Your Spotify library" title="Your playlists"
      description="Open a playlist, search its songs, or see a quick summary.">
      @if (playlists.length) {
        <span v2PageActions class="v2-playlist-count" [attr.aria-label]="playlists.length + ' playlists'">{{ playlists.length }} playlists</span>
      }
      @if (isRefreshingPlaylists) { <p class="v2-library-sync" role="status"><i class="pi pi-spin pi-spinner"></i> Checking Spotify for updates…</p> }
        <v2-toolbar v2PageToolbar label="Playlist controls">
          <v2-search-filters id="v2-playlist-search" label="Search playlists" placeholder="Search your playlists"
            [query]="searchText" [filters]="savedPlaylistCount ? savedFilter : []"
            [activeFilters]="showSavedPlaylists ? ['saved'] : []"
            (queryChange)="updateSearch($event)" (activeFiltersChange)="setSavedFilter($event)" />
          <button type="button" v2Button="secondary" [attr.aria-label]="sortDirectionLabel"
            [attr.aria-pressed]="isSortedByCount" (click)="sortPlaylistsByTracks()">
            <i class="pi" [ngClass]="{'pi-sort-alt': sortOrder === 'none', 'pi-sort-amount-down': sortOrder === 'desc', 'pi-sort-amount-up': sortOrder === 'asc'}"></i>
            {{ sortDirectionLabel }}
          </button>
        </v2-toolbar>
      @if (spotifyPolicyNotice) { <div class="v2-library-notice" role="status">This feature is unavailable while Analytify awaits written Spotify policy approval.</div> }
      @if (isLoadingPlaylists && !playlists.length) {
        <v2-state kind="loading" title="Loading your playlists…" message="Checking your local cache and saved Spotify library." />
      } @else if (!playlists.length) {
        <v2-state icon="pi-list" title="No playlists found" message="Your Spotify playlists will appear here once they are available." />
      } @else if (!filteredPlaylists.length) {
        <v2-state icon="pi-search" title="No matching playlists" message="Try another search or clear the active playlist filters.">
          <button type="button" v2Button="secondary" (click)="clearPlaylistFilters()">Clear filters</button>
        </v2-state>
      } @else {
        <section class="v2-playlist-grid" aria-label="Your playlists">
          @for (playlist of filteredPlaylists; track trackPlaylist($index, playlist)) {
            <v2-card class="v2-playlist-card">
              <a class="v2-playlist-artwork" [href]="spotifyPlaylistUrl(playlist) | safeSpotifyUrl:'playlist'"
                target="_blank" rel="noopener noreferrer" [attr.aria-label]="'Open ' + playlist.name + ' on Spotify'">
                <img [src]="playlist.images?.[0]?.url || 'https://misc.scdn.co/liked-songs/liked-songs-300.png'"
                  loading="lazy" decoding="async" width="84" height="84" [alt]="playlist.name + ' cover'">
              </a>
              <div class="v2-playlist-copy">
                @if (isSavedPlaylist(playlist)) { <span class="v2-playlist-saved"><i class="pi pi-bookmark"></i> Saved@if (playlist.owner?.display_name) { from {{ playlist.owner.display_name }}}</span> }
                <h2>{{ playlist.name }}</h2>
                <p class="v2-playlist-total">{{ playlist.tracks?.total || 0 }} {{ playlist.tracks?.total === 1 ? 'song' : 'songs' }}</p>
                @if (playlist.description) { <p class="v2-playlist-description">{{ playlist.description }}</p> }
              </div>
              <div class="v2-playlist-actions">
                <a v2Button="primary" [routerLink]="songsLink(playlist.id)"><i class="pi pi-list"></i> Open</a>
                <a v2Button="secondary" [routerLink]="analysisLink(playlist.id)"><i class="pi pi-chart-bar"></i> Analyze</a>
              </div>
            </v2-card>
          }
        </section>
      }
    </v2-page>
  `,
  styleUrl: './v2-playlists-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2PlaylistsPageComponent extends PlaylistsController {
  readonly savedFilter = [{id: 'saved', label: 'Saved from others'}];
  constructor(route: ActivatedRoute, router: Router, spotifyData: SpotifyDataService, auth: SpotifyAuthService,
    storage: StorageService, loader: PlaylistLoaderService, @Optional() navigation: DesignNavigationService,
    changeDetector: ChangeDetectorRef) {
    super(route, router, spotifyData, auth, storage, loader, navigation, changeDetector);
  }
  updateSearch(query: string): void { this.searchText = query; this.onSearchChange(); }
  setSavedFilter(filters: readonly string[]): void {
    const next = filters.includes('saved');
    if (next !== this.showSavedPlaylists) this.toggleSavedPlaylists();
  }
}
