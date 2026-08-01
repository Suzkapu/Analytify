import {Component, HostListener, OnDestroy, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {CompareRoomCoordinatorService} from '@core/compare-room/compare-room-coordinator.service';
import {
  CompareInvitation,
  CompareMergeProposal,
  CompareParticipant,
  ComparePlaylist,
  CompareTrack
} from '@core/compare-room/compare-room.models';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {firstValueFrom, Subscription} from 'rxjs';

@Component({
  selector: 'app-compare-room-shell',
  templateUrl: './compare-room-shell.component.html',
  styleUrls: ['./compare-room-shell.component.scss']
})
export class CompareRoomShellComponent implements OnInit, OnDestroy {
  participants: CompareParticipant[] = [];
  invitations: CompareInvitation[] = [];
  sharedTracks: CompareTrack[] = [];
  proposal: CompareMergeProposal | null = null;
  mainPlaylists: ComparePlaylist[] = [];
  mainParticipantId = '';
  playlistName = '';
  errorMessage = '';
  isStarting = true;
  isAddingParticipant = false;
  isPreparing = false;
  isExecuting = false;
  isDesktop = window.innerWidth >= 900;
  readonly enteredAuthenticated = this.auth.isAuthenticated();

  private subscriptions = new Subscription();
  private mainAccessToken = '';

  constructor(
    public coordinator: CompareRoomCoordinatorService,
    private auth: SpotifyAuthService,
    private source: ComparePlaylistSourceService,
    private spotify: ParticipantSpotifyService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    this.subscriptions.add(this.coordinator.participants$.subscribe(value => this.participants = value));
    this.subscriptions.add(this.coordinator.invitations$.subscribe(value => this.invitations = value));
    this.subscriptions.add(this.coordinator.sharedTracks$.subscribe(value => this.sharedTracks = value));
    this.subscriptions.add(this.coordinator.proposal$.subscribe(value => {
      this.proposal = value;
      if (value) this.playlistName = value.name;
    }));
    this.subscriptions.add(this.coordinator.error$.subscribe(value => {
      if (value) this.errorMessage = value;
    }));

    if (!this.isDesktop) {
      this.isStarting = false;
      return;
    }

    try {
      let mainParticipant: CompareParticipant | undefined;
      if (this.enteredAuthenticated) {
        this.mainAccessToken = await this.getMainAccessToken();
        const profile = await this.spotify.getProfile(this.mainAccessToken);
        this.mainParticipantId = this.randomId();
        mainParticipant = {
          id: this.mainParticipantId,
          spotifyUserId: profile.id,
          displayName: profile.display_name || profile.id,
          imageUrl: profile.images?.[0]?.url || '',
          status: 'selecting',
          tracks: [],
          isMainProfile: true
        };
        this.mainPlaylists = await this.source.loadMainPlaylists(
          this.mainAccessToken,
          this.auth.getUserId() || profile.id
        );
      }
      await this.coordinator.createRoom(mainParticipant);
      const initialInvitations = mainParticipant ? 1 : 2;
      for (let index = 0; index < initialInvitations; index++) {
        await this.coordinator.addInvitation();
      }
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.isStarting = false;
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.isDesktop = window.innerWidth >= 900;
  }

  async selectMainPlaylist(playlistId: string): Promise<void> {
    const participant = this.participants.find(item => item.id === this.mainParticipantId);
    const playlist = this.mainPlaylists.find(item => item.id === playlistId);
    if (!participant || !playlist) return;
    const loadingParticipant: CompareParticipant = {
      ...participant,
      playlist,
      tracks: [],
      status: 'loading',
      error: undefined,
      dataSource: undefined
    };
    this.coordinator.updateLocalParticipant(loadingParticipant);
    try {
      const result = await this.source.loadMainTracks(
        playlist,
        await this.getMainAccessToken(),
        this.auth.getUserId() || participant.spotifyUserId
      );
      this.coordinator.updateLocalParticipant({
        ...loadingParticipant,
        tracks: result.tracks,
        status: 'ready',
        dataSource: result.source
      });
    } catch (error) {
      this.coordinator.updateLocalParticipant({
        ...loadingParticipant,
        status: 'error',
        error: this.describeError(error)
      });
    }
  }

  async addParticipant(): Promise<void> {
    this.isAddingParticipant = true;
    try {
      await this.coordinator.addInvitation();
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.isAddingParticipant = false;
    }
  }

  removeParticipant(participantId: string): void {
    void this.coordinator.removeParticipant(participantId).catch(error => {
      this.errorMessage = this.describeError(error);
    });
  }

  cancelInvitation(invitationId: string): void {
    this.coordinator.cancelInvitation(invitationId);
  }

  prepareResult(): void {
    this.isPreparing = true;
    this.errorMessage = '';
    const proposal = this.coordinator.prepareProposal(this.playlistName);
    if (!proposal && this.coordinator.canPrepareResult()) {
      this.errorMessage = 'No songs are shared by everyone. Remove a participant or select different playlists.';
    }
    this.isPreparing = false;
  }

  updateProposalName(): void {
    if (!this.proposal) return;
    this.coordinator.prepareProposal(this.playlistName);
  }

  async execute(): Promise<void> {
    if (!this.proposal || this.isExecuting) return;
    this.isExecuting = true;
    this.errorMessage = '';
    try {
      await this.coordinator.executeProposal();
      const mainParticipant = this.participants.find(item => item.isMainProfile);
      if (mainParticipant) {
        const result = await this.spotify.createPlaylist(
          await this.getMainAccessToken(),
          this.proposal.name,
          this.proposal.description,
          this.proposal.tracks
        );
        this.coordinator.setLocalSaveResult(mainParticipant.id, result);
      }
    } catch (error) {
      this.errorMessage = this.describeError(error);
    } finally {
      this.isExecuting = false;
    }
  }

  async startAnother(): Promise<void> {
    await this.coordinator.closeRoom();
    window.location.reload();
  }

  async leaveRoom(): Promise<void> {
    await this.coordinator.closeRoom();
    await this.router.navigate([this.enteredAuthenticated ? '/playlists' : '/login']);
  }

  copyInvitation(invitation: CompareInvitation): void {
    navigator.clipboard?.writeText(invitation.joinUrl).catch(() => {});
  }

  participantForInvitation(invitation: CompareInvitation): CompareParticipant | undefined {
    return this.participants.find(participant => participant.id === invitation.claimedBy);
  }

  get readyCount(): number {
    return this.participants.filter(participant => participant.status === 'ready').length;
  }

  get participantSlotCount(): number {
    return this.participants.length + this.visibleInvitations.length;
  }

  get visibleInvitations(): CompareInvitation[] {
    return this.invitations.filter(invitation =>
      !invitation.claimedBy || !this.participants.some(participant => participant.id === invitation.claimedBy)
    );
  }

  get awaitingApprovals(): string[] {
    if (!this.proposal) return [];
    return this.participants
      .filter(participant => participant.approvedProposalId !== this.proposal?.id)
      .map(participant => participant.displayName);
  }

  get allFinished(): boolean {
    return this.coordinator.isFinished();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    void this.coordinator.closeRoom();
  }

  trackParticipant(_: number, participant: CompareParticipant): string {
    return participant.id;
  }

  trackInvitation(_: number, invitation: CompareInvitation): string {
    return invitation.id;
  }

  trackTrack(_: number, track: CompareTrack): string {
    return track.id;
  }

  private randomId(): string {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  }

  private async getMainAccessToken(): Promise<string> {
    if (this.auth.isTokenExpired()) {
      const refreshed = await firstValueFrom(this.auth.refreshToken());
      this.mainAccessToken = refreshed.access_token;
    } else {
      this.mainAccessToken = this.auth.getAccessToken() || this.mainAccessToken;
    }
    if (!this.mainAccessToken) throw new Error('The main Spotify session is unavailable.');
    return this.mainAccessToken;
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'The Compare Room encountered an unexpected error.';
  }
}
