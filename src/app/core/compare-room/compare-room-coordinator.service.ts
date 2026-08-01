import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import * as QRCode from 'qrcode';
import {
  CompareInvitation,
  CompareMergeMode,
  CompareMergeProposal,
  CompareParticipant,
  CompareParticipantMergeStats,
  ComparePlaylist,
  CompareRoomMessage,
  CompareSaveResult,
  CompareTrack
} from './compare-room.models';
import {CompareRoomTransportService} from './compare-room-transport.service';
import {PlaylistIntersectionService} from './playlist-intersection.service';

@Injectable({providedIn: 'root'})
export class CompareRoomCoordinatorService {
  readonly participants$ = new BehaviorSubject<CompareParticipant[]>([]);
  readonly invitations$ = new BehaviorSubject<CompareInvitation[]>([]);
  readonly proposal$ = new BehaviorSubject<CompareMergeProposal | null>(null);
  readonly sharedTracks$ = new BehaviorSubject<CompareTrack[]>([]);
  readonly error$ = new BehaviorSubject<string | null>(null);

  private roomId = '';
  private acceptedParticipantIds = new Set<string>();
  private participantTrackBuffers = new Map<string, CompareTrack[]>();

  constructor(
    private transport: CompareRoomTransportService,
    private intersection: PlaylistIntersectionService
  ) {}

  get currentRoomId(): string {
    return this.roomId;
  }

  async createRoom(mainParticipant?: CompareParticipant): Promise<void> {
    this.resetState();
    this.roomId = this.randomToken(24);
    await this.transport.connect(this.roomId, message => this.handleMessage(message));
    if (mainParticipant) {
      this.acceptedParticipantIds.add(mainParticipant.id);
      this.participants$.next([mainParticipant]);
    }
  }

  async addInvitation(): Promise<CompareInvitation> {
    if (!this.roomId) throw new Error('Create the room before inviting participants.');
    const id = this.randomToken(10);
    const secret = this.randomToken(24);
    const joinUrl = `${window.location.origin}/compare-room/join/${this.roomId}` +
      `#invitation=${encodeURIComponent(id)}&secret=${encodeURIComponent(secret)}`;
    const invitation: CompareInvitation = {
      id,
      secret,
      joinUrl,
      qrDataUrl: await QRCode.toDataURL(joinUrl, {
        width: 260,
        margin: 2,
        color: {dark: '#08120c', light: '#ffffff'}
      })
    };
    this.invitations$.next([...this.invitations$.value, invitation]);
    this.invalidateProposal();
    return invitation;
  }

  async cancelInvitation(invitationId: string): Promise<void> {
    const invitation = this.invitations$.value.find(item => item.id === invitationId);
    if (!invitation) return;

    // Remove the slot immediately so a claimed-but-stalled join cannot keep the
    // host UI locked while the best-effort notification is sent to the guest.
    this.invitations$.next(this.invitations$.value.filter(item => item.id !== invitationId));
    if (invitation?.claimedBy) {
      await this.removeParticipant(invitation.claimedBy);
    } else {
      this.invalidateProposal();
    }
  }

  updateLocalParticipant(participant: CompareParticipant): void {
    this.upsertParticipant(participant);
    this.invalidateProposal();
  }

  getReadyParticipants(): CompareParticipant[] {
    return this.participants$.value.filter(participant =>
      participant.status === 'ready' && this.selectedPlaylists(participant).length > 0
    );
  }

  canPrepareResult(): boolean {
    const participants = this.participants$.value;
    const allInvitationSlotsReady = this.invitations$.value.every(invitation =>
      !!invitation.claimedBy && participants.some(participant => participant.id === invitation.claimedBy)
    );
    return participants.length >= 2 && allInvitationSlotsReady && participants.every(participant =>
      participant.status === 'ready' && this.selectedPlaylists(participant).length > 0
    );
  }

  prepareProposal(name?: string, mode: CompareMergeMode = 'intersection'): CompareMergeProposal | null {
    if (!this.canPrepareResult()) return null;
    const participants = this.participants$.value;
    const participantTracks = participants.map(participant => participant.tracks);
    const tracks = mode === 'union'
      ? this.intersection.union(participantTracks)
      : this.intersection.intersect(participantTracks);
    this.sharedTracks$.next(tracks);
    if (tracks.length === 0) {
      this.proposal$.next(null);
      return null;
    }
    const participantNames = participants.map(participant => participant.displayName);
    const defaultName = `${mode === 'union' ? 'Merged playlists' : 'Shared songs'} — ${participantNames.join(', ')}`;
    const participantStats = this.buildParticipantStats(participants, tracks);
    const descriptionsByParticipant = Object.fromEntries(participants.map(participant => [
      participant.id,
      this.buildParticipantDescription(participant, participantStats, tracks.length, mode)
    ]));
    const proposal: CompareMergeProposal = {
      id: this.randomToken(12),
      name: (name?.trim() || defaultName).slice(0, 100),
      description: this.buildGenericDescription(participantNames, tracks.length, mode),
      descriptionsByParticipant,
      mode,
      tracks,
      trackCount: tracks.length,
      participantNames,
      participantStats
    };
    this.proposal$.next(proposal);
    this.participants$.next(participants.map(participant => ({
      ...participant,
      approvedProposalId: participant.isMainProfile ? proposal.id : undefined,
      result: undefined
    })));
    void this.transport.send({
      type: 'merge-proposal',
      proposal: {...proposal, tracks: []}
    }).catch(error => this.reportError(error));
    return proposal;
  }

  allParticipantsApproved(): boolean {
    const proposal = this.proposal$.value;
    const participants = this.participants$.value;
    return !!proposal && participants.length >= 2 && participants.every(participant =>
      participant.approvedProposalId === proposal.id
    );
  }

  async executeProposal(): Promise<void> {
    const proposal = this.proposal$.value;
    if (!proposal || !this.allParticipantsApproved()) {
      throw new Error('Every participant must approve the shared playlist first.');
    }
    this.participants$.next(this.participants$.value.map(participant => ({
      ...participant,
      status: 'saving',
      result: undefined
    })));
    await this.transport.send({type: 'create-playlist-start', proposal: {...proposal, tracks: []}});
    for (let index = 0; index < proposal.tracks.length; index += 100) {
      await this.transport.send({
        type: 'create-playlist-track-chunk',
        proposalId: proposal.id,
        tracks: proposal.tracks.slice(index, index + 100)
      });
    }
    await this.transport.send({type: 'create-playlist-commit', proposalId: proposal.id});
  }

  setLocalSaveResult(participantId: string, result: CompareSaveResult): void {
    const participant = this.participants$.value.find(item => item.id === participantId);
    if (!participant) return;
    this.upsertParticipant({...participant, result, status: result.success ? 'complete' : 'error'});
  }

  isFinished(): boolean {
    return this.participants$.value.length >= 2 && this.participants$.value.every(participant =>
      participant.status === 'complete' || participant.status === 'error'
    );
  }

  async removeParticipant(participantId: string): Promise<void> {
    this.acceptedParticipantIds.delete(participantId);
    this.participantTrackBuffers.delete(participantId);
    this.participants$.next(this.participants$.value.filter(item => item.id !== participantId));
    this.invitations$.next(this.invitations$.value.map(invitation =>
      invitation.claimedBy === participantId ? {...invitation, claimedBy: undefined} : invitation
    ));
    this.invalidateProposal();
    await this.transport.send({type: 'remove-participant', participantId});
  }

  async closeRoom(): Promise<void> {
    if (this.roomId) {
      await this.transport.send({type: 'room-closed'}).catch(() => {});
    }
    await this.transport.disconnect();
    this.resetState();
  }

  private handleMessage(message: CompareRoomMessage): void {
    if (message.type === 'join-request') {
      const invitation = this.invitations$.value.find(item =>
        item.id === message.invitationId && item.secret === message.invitationSecret
      );
      if (!invitation || invitation.claimedBy) {
        void this.transport.send({
          type: 'join-rejected',
          participantId: message.participantId,
          reason: invitation?.claimedBy ? 'This invitation has already been used.' : 'This invitation is invalid.'
        });
        return;
      }
      invitation.claimedBy = message.participantId;
      this.invitations$.next([...this.invitations$.value]);
      this.acceptedParticipantIds.add(message.participantId);
      void this.transport.send({type: 'join-accepted', participantId: message.participantId});
      return;
    }

    if (message.type === 'participant-state') {
      if (!this.acceptedParticipantIds.has(message.participant.id)) return;
      const duplicateAccount = this.participants$.value.find(participant =>
        participant.id !== message.participant.id &&
        participant.spotifyUserId === message.participant.spotifyUserId
      );
      if (duplicateAccount) {
        this.acceptedParticipantIds.delete(message.participant.id);
        this.invitations$.next(this.invitations$.value.map(invitation =>
          invitation.claimedBy === message.participant.id ? {...invitation, claimedBy: undefined} : invitation
        ));
        void this.transport.send({
          type: 'join-rejected',
          participantId: message.participant.id,
          reason: `${duplicateAccount.displayName} is already in this room.`
        });
        return;
      }
    } else if ('participantId' in message && !this.acceptedParticipantIds.has(message.participantId)) {
      return;
    }
    if (message.type === 'participant-state') {
      if (message.participant.status === 'loading') {
        this.participantTrackBuffers.set(message.participant.id, []);
      }
      this.upsertParticipant(message.participant);
      this.invalidateProposal();
    } else if (message.type === 'participant-track-chunk') {
      const tracks = this.participantTrackBuffers.get(message.participantId) || [];
      tracks.push(...message.tracks);
      this.participantTrackBuffers.set(message.participantId, tracks);
    } else if (message.type === 'participant-tracks-complete') {
      const bufferedTracks = this.participantTrackBuffers.get(message.participant.id) || [];
      this.participantTrackBuffers.delete(message.participant.id);
      if (bufferedTracks.length !== message.total) {
        this.upsertParticipant({
          ...message.participant,
          tracks: [],
          status: 'error',
          error: 'Some playlist data was lost while joining. Please select the playlist again.'
        });
      } else {
        this.upsertParticipant({...message.participant, tracks: bufferedTracks, status: 'ready'});
      }
      this.invalidateProposal();
    } else if (message.type === 'proposal-approval') {
      const participant = this.participants$.value.find(item => item.id === message.participantId);
      if (participant && this.proposal$.value?.id === message.proposalId) {
        this.upsertParticipant({...participant, approvedProposalId: message.proposalId});
      }
    } else if (message.type === 'save-result') {
      this.setLocalSaveResult(message.participantId, message.result);
    }
  }

  private upsertParticipant(participant: CompareParticipant): void {
    const participants = [...this.participants$.value];
    const index = participants.findIndex(item => item.id === participant.id);
    if (index >= 0) participants[index] = participant;
    else participants.push(participant);
    this.participants$.next(participants);
  }

  private selectedPlaylists(participant: CompareParticipant): ComparePlaylist[] {
    if (participant.playlists?.length) return participant.playlists;
    return participant.playlist ? [participant.playlist] : [];
  }

  private buildParticipantStats(
    participants: CompareParticipant[],
    resultTracks: CompareTrack[]
  ): CompareParticipantMergeStats[] {
    const resultIds = new Set(resultTracks.map(track => track.id));
    return participants.map(participant => {
      const selectedTrackIds = new Set(participant.tracks.map(track => track.id));
      const includedTrackCount = [...selectedTrackIds].filter(id => resultIds.has(id)).length;
      const selectedTrackCount = selectedTrackIds.size;
      return {
        participantId: participant.id,
        selectedPlaylistCount: this.selectedPlaylists(participant).length,
        selectedTrackCount,
        includedTrackCount,
        includedPercentage: selectedTrackCount === 0 ? 0 : Math.round(includedTrackCount / selectedTrackCount * 100)
      };
    });
  }

  private buildParticipantDescription(
    participant: CompareParticipant,
    stats: CompareParticipantMergeStats[],
    resultTrackCount: number,
    mode: CompareMergeMode
  ): string {
    const participantStats = stats.find(item => item.participantId === participant.id);
    if (!participantStats) return '';
    const playlistLabel = participantStats.selectedPlaylistCount === 1 ? 'playlist' : 'playlists';
    const modeLabel = mode === 'union' ? 'All-songs merge' : 'Shared-songs merge';
    return [
      `${modeLabel} with ${stats.length} participants.`,
      `${participantStats.includedTrackCount} of ${participantStats.selectedTrackCount} unique usable tracks from your ${participantStats.selectedPlaylistCount} selected ${playlistLabel} included (${participantStats.includedPercentage}%).`,
      `${resultTrackCount} unique tracks in the result. Created with Analytify.`
    ].join(' ').slice(0, 300);
  }

  private buildGenericDescription(
    participantNames: string[],
    resultTrackCount: number,
    mode: CompareMergeMode
  ): string {
    const modeLabel = mode === 'union' ? 'All-songs merge' : 'Shared-songs merge';
    return `${modeLabel} for ${participantNames.join(', ')} · ${resultTrackCount} unique tracks · Created with Analytify.`.slice(0, 300);
  }

  private invalidateProposal(): void {
    const hadProposal = !!this.proposal$.value;
    this.proposal$.next(null);
    this.sharedTracks$.next([]);
    this.participants$.next(this.participants$.value.map(participant => ({
      ...participant,
      approvedProposalId: undefined,
      result: undefined
    })));
    if (hadProposal) {
      void this.transport.send({type: 'merge-proposal-cancelled'}).catch(error => this.reportError(error));
    }
  }

  private reportError(error: unknown): void {
    this.error$.next(error instanceof Error ? error.message : 'The Compare Room encountered an error.');
  }

  private resetState(): void {
    this.roomId = '';
    this.acceptedParticipantIds.clear();
    this.participantTrackBuffers.clear();
    this.participants$.next([]);
    this.invitations$.next([]);
    this.proposal$.next(null);
    this.sharedTracks$.next([]);
    this.error$.next(null);
  }

  private randomToken(byteCount: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
}
