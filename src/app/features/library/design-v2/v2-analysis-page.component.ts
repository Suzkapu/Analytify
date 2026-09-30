import {ChangeDetectionStrategy, Component, Optional} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ActivatedRoute, Router, RouterLink} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';
import {V2ButtonDirective, V2CardComponent, V2PageComponent, V2SectionHeaderComponent, V2StateComponent} from '@shared/ui-v2';
import {PlaylistAnalysisController} from '../playlist-analysis/playlist-analysis.component';
import {PlaylistAnalysisUiModule} from '../playlist-analysis/playlist-analysis.module';

@Component({
  selector: 'app-v2-analysis-page', standalone: true,
  imports: [CommonModule, RouterLink, PlaylistAnalysisUiModule, V2ButtonDirective, V2CardComponent, V2PageComponent, V2SectionHeaderComponent, V2StateComponent],
  template: `
    <v2-page eyebrow="Playlist analysis" [title]="playlistName || 'Playlist analysis'"
      description="A focused overview of this playlist’s size, timeline, and standout songs.">
      <a v2PageActions v2Button="tertiary" [routerLink]="backLink"><i class="pi pi-arrow-left"></i> Back to playlists</a>
      @if (cooldownMessage) { <div class="v2-analysis-warning" role="status"><i class="pi pi-exclamation-triangle"></i>{{ cooldownMessage }}</div> }
      @if (isLoading) {
        <v2-state kind="loading" title="Analyzing playlist data…"
          [message]="totalTracks ? loadedTracksCount + ' of ' + totalTracks + ' songs loaded' : 'Finding cached playlist data…'" />
      } @else {
        @if (isLoadingTracks || isLoadingArtists) { <div class="v2-analysis-refresh" role="status"><i class="pi pi-spin pi-spinner"></i> Updating playlist details…</div> }
        <section class="v2-metric-grid" aria-label="Playlist statistics">
          @for (metric of metrics; track metric.label) {
            <v2-card class="v2-metric"><i class="pi {{ metric.icon }}"></i><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong></v2-card>
          }
        </section>
        <div class="v2-analysis-columns">
          <section><v2-section-header title="Top artists" description="Most frequent artists in this playlist" />
            <ol class="v2-frequency-list">@for (artist of topArtists; track artist.id; let rank = $index) { <li><span><em>{{ rank + 1 }}</em>{{ artist.name }}</span><strong>{{ artist.count }}</strong></li> }</ol>
          </section>
          <section><v2-section-header title="Top albums" description="Most frequent albums in this playlist" />
            <ol class="v2-frequency-list">@for (album of topAlbums; track album.name; let rank = $index) { <li><span><em>{{ rank + 1 }}</em>{{ album.name }}</span><strong>{{ album.count }}</strong></li> }</ol>
          </section>
        </div>
        <div class="v2-analysis-columns">
          <section><v2-section-header title="Release highlights" description="Oldest and newest releases" />
            <div class="v2-highlight-list">
              @if (oldestTrack) { <ng-container *ngTemplateOutlet="highlight; context: {$implicit: oldestTrack, label: 'Oldest release', value: getYearFromDate(oldestTrack.album?.release_date)}" /> }
              @if (newestTrack) { <ng-container *ngTemplateOutlet="highlight; context: {$implicit: newestTrack, label: 'Newest release', value: getYearFromDate(newestTrack.album?.release_date)}" /> }
            </div>
          </section>
          <section><v2-section-header title="Song length extremes" description="Shortest and longest songs" />
            <div class="v2-highlight-list">
              @if (shortestTrack) { <ng-container *ngTemplateOutlet="highlight; context: {$implicit: shortestTrack, label: 'Shortest song', value: formatDurationShort(shortestTrack.duration_ms)}" /> }
              @if (longestTrack) { <ng-container *ngTemplateOutlet="highlight; context: {$implicit: longestTrack, label: 'Longest song', value: formatDurationShort(longestTrack.duration_ms)}" /> }
            </div>
          </section>
        </div>
      }
    </v2-page>
    <ng-template #highlight let-track let-label="label" let-value="value">
      <button type="button" class="v2-highlight" [disabled]="!track.external_urls?.spotify" (click)="openTrackClick(track.external_urls?.spotify)">
        <img [src]="track.album?.images?.[0]?.url || 'assets/Analytify-96.webp'" width="58" height="58" alt="" loading="lazy">
        <span><small>{{ label }}</small><strong>{{ track.name }}</strong><em>{{ track.artist_name }}</em></span><b>{{ value }}</b>
      </button>
    </ng-template>
  `,
  styleUrl: './v2-analysis-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2AnalysisPageComponent extends PlaylistAnalysisController {
  readonly backLink = this.navigation.commands('playlists');
  constructor(route: ActivatedRoute, auth: SpotifyAuthService, router: Router, storage: StorageService,
    loader: PlaylistLoaderService, @Optional() readonly navigation: DesignNavigationService) {
    super(route, auth, router, storage, loader, navigation);
  }
  get metrics(): Array<{label: string; icon: string; value: string | number}> {
    return [
      {label: 'Total songs', icon: 'pi-hashtag', value: this.uniqueTracksCount},
      {label: 'Artists', icon: 'pi-users', value: this.uniqueArtistsCount},
      {label: 'Albums', icon: 'pi-clone', value: this.uniqueAlbumsCount},
      {label: 'Total length', icon: 'pi-clock', value: this.totalDurationFormatted},
      {label: 'Explicit', icon: 'pi-exclamation-circle', value: this.explicitCount},
      {label: 'Average song length', icon: 'pi-hourglass', value: this.averageDurationFormatted}
    ];
  }
}
