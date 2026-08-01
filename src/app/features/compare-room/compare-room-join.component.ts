import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {CompareRoomGuestService} from '@core/compare-room/compare-room-guest.service';
import {
  CompareMergeProposal,
  CompareParticipant,
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
  participant: CompareParticipant | null = null;
  proposal: CompareMergeProposal | null = null;
  saveResult: CompareSaveResult | null = null;
  errorMessage = '';
  hasApproved = false;

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
    private spotify: ParticipantSpotifyService
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

  async selectPlaylist(playlistId: string): Promise<void> {
    const playlist = this.playlists.find(item => item.id === playlistId);
    if (!playlist || !this.participant) return;
    this.stage = 'loading';
    this.participant = {...this.participant, playlist, tracks: [], status: 'loading', error: undefined};
    await this.guest.publishParticipant(this.participant);
    try {
      const token = await this.transientAuth.getAccessToken();
      const tracks = await this.spotify.getPlaylistTracks(playlist, token);
      this.participant = {
        ...this.participant,
        tracks,
        status: 'ready',
        dataSource: 'spotify'
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

  async approve(): Promise<void> {
    if (!this.proposal || !this.participant) return;
    try {
      await this.guest.approve(this.proposal.id);
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
      this.playlists = await this.spotify.getPlaylists(token, profile.id);
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
      this.saveResult = await this.spotify.createPlaylist(token, proposal.name, proposal.description, proposal.tracks);
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
