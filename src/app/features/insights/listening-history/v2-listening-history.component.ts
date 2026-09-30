import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Optional} from '@angular/core';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {V2ListRowComponent, V2PageComponent, V2SectionHeaderComponent, V2StateComponent} from '@shared/ui-v2';
import {ListeningHistoryController} from './listening-history.component';
import {ListeningHistoryUiModule} from './listening-history.module';

@Component({
  selector: 'app-v2-listening-history', standalone: true,
  imports: [ListeningHistoryUiModule, V2ListRowComponent, V2PageComponent, V2SectionHeaderComponent, V2StateComponent],
  template: `
    <v2-page eyebrow="Listening activity" title="Recently played" description="Your latest Spotify plays, ordered from newest to oldest.">
      @if (isLoadingRecentlyPlayed) {
        <v2-state kind="loading" title="Loading listening history…" />
      } @else if (!recentlyPlayedTracks.length) {
        <v2-state [kind]="recentlyPlayedError ? 'error' : 'empty'" [icon]="recentlyPlayedError ? 'pi-exclamation-circle' : 'pi-history'"
          [title]="recentlyPlayedError ? 'Recent plays unavailable' : 'No recent tracks'"
          [message]="recentlyPlayedError || 'Your latest Spotify plays will appear here when they are available.'" />
      } @else {
        <div class="v2-history-groups">
          @for (group of historyDayGroups; track group.key) {
            <section [attr.aria-label]="group.label">
              <v2-section-header [title]="group.label" [description]="group.items.length + (group.items.length === 1 ? ' play' : ' plays')" />
              <div class="v2-history-list">
                @for (item of group.items; track trackHistoryItem($index, item)) {
                  <v2-list-row class="v2-history-row">
                    <time [attr.datetime]="playedAtDateTime(item.played_at)">{{ formatPlayedAt(item.played_at) }}</time>
                    <button type="button" class="v2-history-art" [disabled]="!item.track.external_urls?.spotify"
                      [attr.aria-label]="'Open ' + item.track.name + ' on Spotify'" (click)="openTrackClick(item.track.external_urls?.spotify)">
                      <img [src]="item.track.album?.images?.[0]?.url || 'assets/Analytify-96.webp'" width="58" height="58" [alt]="item.track.name + ' cover'" loading="lazy">
                    </button>
                    <span class="v2-history-copy"><strong>{{ item.track.name }}</strong><span>{{ getTrackArtist(item.track) }}</span></span>
                    @if (item.track.explicit) { <span class="v2-history-explicit" title="Explicit">E</span> }
                  </v2-list-row>
                }
              </div>
            </section>
          }
        </div>
      }
    </v2-page>
  `,
  styleUrl: './v2-listening-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ListeningHistoryComponent extends ListeningHistoryController {
  constructor(spotifyData: SpotifyDataService, auth: SpotifyAuthService, storage: StorageService,
    supabase: SupabaseService, @Optional() changeDetector?: ChangeDetectorRef) {
    super(spotifyData, auth, storage, supabase, changeDetector);
  }
}
