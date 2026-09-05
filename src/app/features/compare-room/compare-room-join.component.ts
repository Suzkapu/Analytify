import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {CompareGuestPlaylistSourceService} from '@core/compare-room/compare-guest-playlist-source.service';
import {CompareRoomGuestService} from '@core/compare-room/compare-room-guest.service';
import {
  CompareMergeProposal,
  CompareParticipant,
  CompareParticipantMergeStats,
  ComparePlaylist,
  CompareSaveResult
} from '@core/compare-room/compare-room.models';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {TransientParticipantAuthService} from '@core/compare-room/transient-participant-auth.service';
import {filter, Subscription, take} from 'rxjs';

@Component({
  selector: 'app-compare-room-join',
  templateUrl: './compare-room-join.component.html',
  styleUrls: ['./compare-room-join.component.scss']
})
export class CompareRoomJoinComponent implements OnInit, OnDestroy {
  stage: 'invited' | 'joining' | 'selecting' | 'loading' | 'ready' | 'review' | 'saving' | 'complete' | 'error' = 'invited';
  playlists: ComparePlaylist[] = [];
  selectedPlaylistIds: string[] = [];
  playlistQuery = '';
  participant: CompareParticipant | null = null;
  proposal: CompareMergeProposal | null = null;
  saveResult: CompareSaveResult | null = null;
  errorMessage = '';
  hasApproved = false;
  playlistDataSource: 'local' | 'cloud' | 'spotify' | null = null;

  private roomId = '';
  private invitationId = '';
  private invitationSecret = '';
  private participantId = '';
  private hasJoinedRoom = false;
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private transientAuth: TransientParticipantAuthService,
    private guest: CompareRoomGuestService,
    private spotify: ParticipantSpotifyService,
    private source: CompareGuestPlaylistSourceService
  ) {}

  ngOnInit(): void {
    this.roomId = this.route.snapshot.paramMap.get('roomId') || '';
    const fragment = new URLSearchParams(this.route.snapshot.fragment || '');
    this.invitationId = fragment.get('invitation') || '';
    this.invitationSecret = fragment.get('secret') || '';
    if (!this.roomId || !this.invitationId || !this.invitationSecret) {
      this.fail('This Compare Room invitation is incomplete. Ask the host for a new QR code.');
      return;
    }

    this.subscriptions.add(this.guest.accepted$.pipe(filter(Boolean), take(1)).subscribe(() => {
      void this.loadParticipant();
    }));
    this.subscriptions.add(this.guest.proposal$.subscribe(proposal => {
      this.proposal = proposal;
      this.hasApproved = false;
      if (proposal && (this.stage === 'ready' || this.stage === 'review')) this.stage = 'review';
      if (!proposal && this.stage === 'review') this.stage = 'ready';
    }));
    this.subscriptions.add(this.guest.createRequest$.pipe(filter((value): value is CompareMergeProposal => !!value)).subscribe(proposal => {
      void this.createPlaylist(proposal);
    }));
    this.subscriptions.add(this.guest.removed$.pipe(filter(Boolean)).subscribe(() => {
      this.fail('The host removed this participant from the room.');
      this.transientAuth.clear();
    }));
    this.subscriptions.add(this.guest.closed$.pipe(filter(Boolean)).subscribe(() => {
      if (this.stage !== 'complete') this.fail('The host closed this Compare Room.');
      this.transientAuth.clear();
    }));
    this.subscriptions.add(this.guest.error$.pipe(filter((value): value is string => !!value)).subscribe(value => this.fail(value)));

    if (this.transientAuth.hasSession()) {
      void this.connectToRoom();
    }
  }

  async connectSpotify(): Promise<void> {
    this.stage = 'joining';
    try {
      await this.transientAuth.startAuthorization(this.router.url);
    } catch (error) {
      this.fail(this.describeError(error));
    }
  }

  togglePlaylist(playlistId: string, checked: boolean): void {
    this.selectedPlaylistIds = checked
      ? [...this.selectedPlaylistIds, playlistId]
      : this.selectedPlaylistIds.filter(id => id !== playlistId);
  }

  isPlaylistSelected(playlistId: string): boolean {
    return this.selectedPlaylistIds.includes(playlistId);
  }

  async applyPlaylistSelection(): Promise<void> {
    const selectedPlaylists = this.selectedPlaylistIds
      .map(id => this.playlists.find(item => item.id === id))
      .filter((playlist): playlist is ComparePlaylist => !!playlist);
    if (selectedPlaylists.length === 0 || !this.participant) return;
    this.stage = 'loading';
    this.participant = {
      ...this.participant,
      playlist: selectedPlaylists[0],
      playlists: selectedPlaylists,
      tracks: [],
      status: 'loading',
      error: undefined
    };
    await this.guest.publishParticipant(this.participant);
    try {
      const token = await this.transientAuth.getAccessToken();
      const result = await this.source.loadSelection(
        selectedPlaylists,
        token,
        this.participant.spotifyUserId
      );
      this.participant = {
        ...this.participant,
        tracks: result.tracks,
        status: 'ready',
        dataSource: result.source
      };
      await this.guest.publishParticipant(this.participant);
      this.proposal = null;
      this.hasApproved = false;
      this.stage = 'ready';
    } catch (error) {
      this.participant = {...this.participant, status: 'error', error: this.describeError(error)};
      await this.guest.publishParticipant(this.participant).catch(() => {});
      this.fail(this.participant.error || 'Could not load that playlist.');
    }
  }

  get filteredPlaylists(): ComparePlaylist[] {
    const query = this.playlistQuery.trim().toLocaleLowerCase();
    if (!query) return this.playlists;
    return this.playlists.filter(playlist => playlist.name.toLocaleLowerCase().includes(query));
  }

  get selectedPlaylistCount(): number {
    return this.participant?.playlists?.length || (this.participant?.playlist ? 1 : 0);
  }

  get participantProposalStats(): CompareParticipantMergeStats | undefined {
    if (!this.participant || !this.proposal) return undefined;
    return this.proposal.participantStats?.find(stats => stats.participantId === this.participant?.id);
  }

  async approve(): Promise<void> {
    if (!this.proposal || !this.participant) return;
    try {
      await this.guest.approve(this.proposal.id, this.proposal.contentHash);
      this.hasApproved = true;
    } catch (error) {
      this.fail(this.describeError(error));
    }
  }

  async leave(): Promise<void> {
    await this.guest.leave();
    this.transientAuth.clear();
    await this.router.navigate(['/login']);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.hasJoinedRoom) {
      void this.guest.leave();
      this.transientAuth.clear();
    }
  }

  private async connectToRoom(): Promise<void> {
    this.stage = 'joining';
    try {
      this.participantId = await this.guest.join(this.roomId, this.invitationId, this.invitationSecret);
      this.hasJoinedRoom = true;
      window.setTimeout(() => {
        if (!this.guest.accepted$.value && this.stage === 'joining') {
          this.fail('The host did not respond. Ask them to keep the room open and generate a new invitation.');
        }
      }, 20_000);
    } catch (error) {
      this.fail(this.describeError(error));
    }
  }

  private async loadParticipant(): Promise<void> {
    try {
      const token = await this.transientAuth.getAccessToken();
      const profile = await this.spotify.getProfile(token);
      this.participant = {
        id: this.participantId,
        invitationId: this.invitationId,
        spotifyUserId: profile.id,
        displayName: profile.display_name || profile.id,
        imageUrl: profile.images?.[0]?.url || '',
        status: 'selecting',
        tracks: []
      };
      await this.guest.publishParticipant(this.participant);
      const playlistResult = await this.source.loadPlaylists(token, profile.id);
      this.playlists = playlistResult.playlists;
      this.playlistDataSource = playlistResult.source;
      this.stage = 'selecting';
    } catch (error) {
      this.fail(this.describeError(error));
    }
  }

  private async createPlaylist(proposal: CompareMergeProposal): Promise<void> {
    if (!this.hasApproved || !this.participant || this.stage === 'saving' || this.stage === 'complete') return;
    this.stage = 'saving';
    this.participant = {...this.participant, status: 'saving'};
    try {
      const token = await this.transientAuth.getAccessToken();
      const description = proposal.descriptionsByParticipant?.[this.participant.id] || proposal.description;
      this.saveResult = await this.spotify.createPlaylist(token, proposal.name, description, proposal.tracks);
    } catch (error) {
      this.saveResult = {
        success: false,
        playlistName: proposal.name,
        addedTracks: 0,
        error: this.describeError(error)
      };
    }
    await this.guest.publishSaveResult(this.saveResult).catch(() => {});
    this.stage = this.saveResult.success ? 'complete' : 'error';
    if (!this.saveResult.success) this.errorMessage = this.saveResult.error || 'Playlist creation failed.';
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.stage = 'error';
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'An unexpected Compare Room error occurred.';
  }
}
