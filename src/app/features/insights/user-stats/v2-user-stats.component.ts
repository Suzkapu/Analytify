import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Optional} from '@angular/core';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {V2ButtonDirective, V2CardComponent, V2ListRowComponent, V2PageComponent, V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent} from '@shared/ui-v2';
import {UserStatsController} from './user-stats.component';

@Component({
  selector: 'app-v2-user-stats', standalone: true,
  imports: [DatePipe, FormsModule, AccessibleDialogDirective, V2ButtonDirective, V2CardComponent, V2ListRowComponent, V2PageComponent,
    V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent],
  template: `
    <v2-page [eyebrow]="isSpyMode ? 'Approved shared access' : 'Personal listening'"
      [title]="isSpyMode ? ((spyDisplayName || 'Shared') + ' top listening') : 'Your top listening'"
      description="See top songs, artists, and genres, and how their rankings change.">
      @if (isRefreshingStats && !isSpyMode) { <p class="v2-stats-refresh" role="status"><i class="pi pi-spin pi-spinner"></i> Refreshing this range while cached stats stay visible…</p> }
      <v2-toolbar v2PageToolbar label="Statistics controls">
        <v2-tabs id="stats-range" label="Ranking period" appearance="segmented" [tabs]="rangeTabs" [selected]="selectedRange" (selectedChange)="changeRange($event)" />
        @if (snapshotOptions.length) {
          <label class="v2-stats-select">Ranking date<select [ngModel]="selectedSnapshotId" (ngModelChange)="selectHistoryValue($event)"><option value="current">Current</option>@for (option of snapshotOptions; track option.id) { <option [value]="option.id">{{ option.label }}</option> }</select></label>
          <label class="v2-stats-select">Compare against<select [ngModel]="compareSnapshotId" (ngModelChange)="selectCompareValue($event)"><option value="">Previous available date</option>@for (option of snapshotOptions; track option.id) { <option [value]="option.id" [disabled]="option.id === selectedSnapshotId">{{ option.label }}</option> }</select></label>
        }
      </v2-toolbar>
      <v2-tabs v2PageTabs id="stats-category" label="Ranking category" [tabs]="categoryTabs" [selected]="selectedCategory" (selectedChange)="changeCategoryValue($event)" />
      <v2-toolbar label="Search rankings">
        <v2-search-filters id="v2-stats-search" [label]="statsSearchPlaceholder" [placeholder]="statsSearchPlaceholder" [query]="statsSearchQuery" (queryChange)="onStatsSearchChange($event)" />
        <button type="button" v2Button="secondary" [attr.aria-pressed]="includePastStatsSearch" (click)="togglePastStatsSearch()"><i class="pi pi-history"></i> Search past</button>
      </v2-toolbar>
      @if (isLoading) {
        <v2-state kind="loading" [title]="isSpyMode ? 'Loading shared Spotify insights…' : 'Loading your Spotify insights…'" />
      } @else if (sharedStatsError) {
        <v2-state kind="error" icon="pi-lock" title="Shared stats unavailable" [message]="sharedStatsError" />
      } @else {
        @if (includePastStatsSearch && statsSearchQuery.trim().length >= 2 && selectedSnapshotId === 'current' && !isSpyMode) {
          <section class="v2-past-results" aria-live="polite"><h2>Historical ranking matches</h2>
            @if (isSearchingPastStats) { <v2-state kind="loading" title="Searching saved rankings…" /> }
            @else if (pastStatsSearchError || !pastTopResults.length) { <p>{{ pastStatsSearchError || 'No former ranking matches this search.' }}</p> }
            @else { <div class="v2-past-grid">@for (item of pastTopResults; track item.kind + ':' + item.id) { <button type="button" (click)="openPastTopResult(item)">@if (item.imageUrl) { <img [src]="item.imageUrl" width="48" height="48" alt=""> }<span><strong>{{ item.name }}</strong><small>{{ item.subtitle }}</small></span><i class="pi pi-chart-line"></i></button> }</div> }
          </section>
        }
        @if (selectedCategory === 'tracks') {
          @if (!filteredTracks.length) { <v2-state icon="pi-search" title="No top songs found" message="Try another search, date, or ranking period." /> }
          <div class="v2-ranking-list">
            @for (track of filteredTracks; track trackStatItem($index, track)) {
              <v2-list-row class="v2-ranking-row" role="button" tabindex="0" (click)="openTrendPopup(track, 'tracks')" (keydown)="onTrendCardKeydown($event, track, 'tracks')">
                <span class="v2-rank">{{ getStatsRankIndex(track, 'tracks') + 1 }}<small>{{ movementLabel(getTrend(track, getStatsRankIndex(track, 'tracks'), 'tracks')) }}</small></span>
                <button type="button" class="v2-ranking-art" [disabled]="!getTrackUrl(track)" (click)="$event.stopPropagation(); openTrackClick(getTrackUrl(track))" [attr.aria-label]="'Open ' + track.name + ' on Spotify'"><img [src]="getTrackCover(track)" width="58" height="58" [alt]="track.name + ' cover'" loading="lazy"></button>
                <span class="v2-ranking-copy"><strong>{{ track.name }}</strong><span>{{ getTrackArtist(track) }}</span></span><i class="pi pi-chart-line"></i>
              </v2-list-row>
            }
          </div>
          @if (!isSpyMode && filteredTracks.length) { <button type="button" v2Button="primary" [loading]="isCreatingPlaylist" (click)="createTopPlaylist()"><i class="pi pi-plus-circle"></i> Create playlist</button> }
        } @else if (selectedCategory === 'artists') {
          @if (!filteredArtists.length) { <v2-state icon="pi-search" title="No top artists found" message="Try another search, date, or ranking period." /> }
          <div class="v2-artist-rankings">@for (artist of filteredArtists; track trackStatItem($index, artist)) { <v2-card class="v2-ranked-artist" role="button" tabindex="0" (click)="openTrendPopup(artist, 'artists')" (keydown)="onTrendCardKeydown($event, artist, 'artists')"><span class="v2-rank-badge">{{ getStatsRankIndex(artist, 'artists') + 1 }}</span><button type="button" [disabled]="!getArtistUrl(artist)" (click)="$event.stopPropagation(); openArtistClick(getArtistUrl(artist))"><img [src]="getArtistImage(artist)" width="110" height="110" [alt]="artist.name + ' photo'" loading="lazy"></button><strong>{{ artist.name }}</strong><small>{{ movementLabel(getTrend(artist, getStatsRankIndex(artist, 'artists'), 'artists')) }}</small></v2-card> }</div>
        } @else {
          @if (!filteredGenres.length) { <v2-state icon="pi-search" title="No genre data found" message="Try another search, date, or ranking period." /> }
          <div class="v2-genre-rankings">@for (genre of filteredGenres; track genre.name) { <button type="button" class="v2-genre-row" (click)="openTrendPopup(genre, 'genres')"><span><strong>{{ genre.rank }}. {{ genre.name }}</strong><small>@if (genre.hasCompare) { {{ genre.trendType === 'new' ? 'New' : (genre.rankDiff || '—') }} }</small></span><b>{{ genre.percentage < 1 ? '<1' : genre.percentage }}%</b><span class="v2-genre-bar"><i [style.width.%]="genre.percentage_simple"></i></span></button> }</div>
        }
        @if (playlistCreationSuccessMessage) { <p class="v2-action-success" role="status">{{ playlistCreationSuccessMessage }}</p> }
        @if (playlistCreationError) { <p class="v2-action-error" role="alert">{{ playlistCreationError }}</p> }
      }
    </v2-page>
    @if (showTrendPopup) {
      <div class="v2-trend-overlay" (click)="closeTrendPopup($event)"><section class="v2-trend-dialog" role="dialog" aria-modal="true" aria-labelledby="v2-trend-title" aria-describedby="v2-trend-description" appAccessibleDialog (modalEscape)="closeTrendPopup()" (click)="$event.stopPropagation()">
        <button appModalInitialFocus type="button" class="v2-trend-close" aria-label="Close position history" (click)="closeTrendPopup()"><i class="pi pi-times"></i></button>
        <h2 id="v2-trend-title">{{ trendPopupItem?.name }} position history</h2><p id="v2-trend-description">Saved ranking positions for the selected period.</p>
        @if (isLoadingTrendData) { <v2-state kind="loading" title="Loading position history…" /> } @else { <ol class="v2-trend-points">@for (point of trendPopupPoints; track point.timestamp || $index) { <li><time>{{ point.timestamp | date:'mediumDate' }}</time><strong>#{{ point.rank || point.position || '—' }}</strong></li> }</ol> }
      </section></div>
    }
  `,
  styleUrl: './v2-user-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2UserStatsComponent extends UserStatsController {
  readonly rangeTabs = [{id: 'short_term', label: '4 weeks'}, {id: 'medium_term', label: '6 months'}, {id: 'long_term', label: '1 year'}];
  readonly categoryTabs = [{id: 'tracks', label: 'Songs'}, {id: 'artists', label: 'Artists'}, {id: 'genres', label: 'Genres'}];
  constructor(spotifyData: SpotifyDataService, auth: SpotifyAuthService, storage: StorageService, supabase: SupabaseService,
    @Optional() route?: ActivatedRoute, @Optional() statsSharing?: StatsSharingService,
    @Optional() changeDetector?: ChangeDetectorRef, @Optional() participantSpotify?: ParticipantSpotifyService) {
    super(spotifyData, auth, storage, supabase, route, statsSharing, changeDetector, participantSpotify);
  }
  changeCategoryValue(value: string): void { this.changeCategory(value as 'tracks' | 'artists' | 'genres'); }
  selectHistoryValue(value: string): void { this.selectHistorySnapshot(value, new Event('change')); }
  selectCompareValue(value: string): void { this.selectCompareSnapshot(value, new Event('change')); }
}
