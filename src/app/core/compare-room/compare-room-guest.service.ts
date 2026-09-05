import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {
  CompareMergeProposal,
  CompareParticipant,
  CompareRoomMessage,
  CompareSaveResult
} from './compare-room.models';
import {CompareRoomTransportService} from './compare-room-transport.service';
import {MAX_COMPARE_CHUNK_TRACKS, MAX_COMPARE_TRACKS, proposalContentHash} from './compare-room-integrity';

@Injectable({providedIn: 'root'})
export class CompareRoomGuestService {
  readonly accepted$ = new BehaviorSubject<boolean>(false);
  readonly proposal$ = new BehaviorSubject<CompareMergeProposal | null>(null);
  readonly createRequest$ = new BehaviorSubject<CompareMergeProposal | null>(null);
  readonly removed$ = new BehaviorSubject<boolean>(false);
  readonly closed$ = new BehaviorSubject<boolean>(false);
  readonly error$ = new BehaviorSubject<string | null>(null);

  private participantId = '';
  private createProposalBuffer: CompareMergeProposal | null = null;
  private consumedProposalIds = new Set<string>();

  constructor(private transport: CompareRoomTransportService) {}

  async join(roomId: string, invitationId: string, invitationSecret: string): Promise<string> {
    this.reset();
    this.participantId = this.randomToken(18);
    await this.transport.claimInvitation(roomId, invitationId, invitationSecret, this.participantId);
    await this.transport.connect(roomId, envelope => this.handleMessage(envelope.message));
    this.accepted$.next(true);
    return this.participantId;
  }

  async publishParticipant(participant: CompareParticipant): Promise<void> {
    if (participant.id !== this.participantId) {
      throw new Error('The participant identity does not match this Compare Room session.');
    }
    if (participant.tracks.length > MAX_COMPARE_TRACKS) {
      throw new Error(`Compare Room participants are limited to ${MAX_COMPARE_TRACKS} tracks.`);
    }
    if (participant.tracks.length === 0) {
      await this.transport.send({type: 'participant-state', participant});
      return;
    }
    await this.transport.send({
      type: 'participant-state',
      participant: {...participant, tracks: [], status: 'loading'}
    });
    for (let index = 0; index < participant.tracks.length; index += MAX_COMPARE_CHUNK_TRACKS) {
      await this.transport.send({
        type: 'participant-track-chunk',
        participantId: participant.id,
        tracks: participant.tracks.slice(index, index + MAX_COMPARE_CHUNK_TRACKS)
      });
    }
    await this.transport.send({
      type: 'participant-tracks-complete',
      participant: {...participant, tracks: []},
      total: participant.tracks.length
    });
  }

  async approve(proposalId: string, contentHash: string): Promise<void> {
    await this.transport.send({type: 'proposal-approval', participantId: this.participantId, proposalId, contentHash});
  }

  async publishSaveResult(result: CompareSaveResult): Promise<void> {
    await this.transport.send({type: 'save-result', participantId: this.participantId, result});
  }

  async leave(): Promise<void> {
    await this.transport.disconnect();
    this.reset();
  }

  private handleMessage(message: CompareRoomMessage): void {
    if (message.type === 'merge-proposal') {
      this.proposal$.next(message.proposal);
    } else if (message.type === 'merge-proposal-cancelled') {
      this.proposal$.next(null);
    } else if (message.type === 'create-playlist-start') {
      this.createProposalBuffer = {...message.proposal, tracks: []};
    } else if (message.type === 'create-playlist-track-chunk') {
      if (this.createProposalBuffer?.id === message.proposalId) {
        if (this.createProposalBuffer.tracks.length + message.tracks.length > MAX_COMPARE_TRACKS) {
          this.createProposalBuffer = null;
          this.error$.next('The shared playlist exceeded the Compare Room track limit.');
          return;
        }
        this.createProposalBuffer.tracks.push(...message.tracks);
      }
    } else if (message.type === 'create-playlist-commit') {
      void this.commitCreateProposal(message.proposalId);
    } else if (message.type === 'remove-participant' && message.participantId === this.participantId) {
      this.removed$.next(true);
    } else if (message.type === 'room-closed') {
      this.closed$.next(true);
    }
  }

  private reset(): void {
    this.participantId = '';
    this.accepted$.next(false);
    this.proposal$.next(null);
    this.createRequest$.next(null);
    this.removed$.next(false);
    this.closed$.next(false);
    this.error$.next(null);
    this.createProposalBuffer = null;
    this.consumedProposalIds.clear();
  }

  private async commitCreateProposal(proposalId: string): Promise<void> {
    const proposal = this.createProposalBuffer;
    this.createProposalBuffer = null;
    if (!proposal || proposal.id !== proposalId || proposal.tracks.length !== proposal.trackCount ||
      this.consumedProposalIds.has(proposalId)) {
      this.error$.next('Some shared tracks were lost or replayed before playlist creation. Ask the host to try again.');
      return;
    }
    if (await proposalContentHash(proposal) !== proposal.contentHash) {
      this.error$.next('The shared playlist changed after you approved it. Nothing was created.');
      return;
    }
    this.consumedProposalIds.add(proposalId);
    this.createRequest$.next(proposal);
  }

  private randomToken(byteCount: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
}
