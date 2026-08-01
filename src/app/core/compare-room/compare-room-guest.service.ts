import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {
  CompareMergeProposal,
  CompareParticipant,
  CompareRoomMessage,
  CompareSaveResult
} from './compare-room.models';
import {CompareRoomTransportService} from './compare-room-transport.service';

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

  constructor(private transport: CompareRoomTransportService) {}

  async join(roomId: string, invitationId: string, invitationSecret: string): Promise<string> {
    this.reset();
    this.participantId = this.randomToken(18);
    await this.transport.connect(roomId, message => this.handleMessage(message));
    await this.transport.send({
      type: 'join-request',
      invitationId,
      invitationSecret,
      participantId: this.participantId
    });
    return this.participantId;
  }

  async publishParticipant(participant: CompareParticipant): Promise<void> {
    if (participant.tracks.length === 0) {
      await this.transport.send({type: 'participant-state', participant});
      return;
    }
    await this.transport.send({
      type: 'participant-state',
      participant: {...participant, tracks: [], status: 'loading'}
    });
    for (let index = 0; index < participant.tracks.length; index += 100) {
      await this.transport.send({
        type: 'participant-track-chunk',
        participantId: participant.id,
        tracks: participant.tracks.slice(index, index + 100)
      });
    }
    await this.transport.send({
      type: 'participant-tracks-complete',
      participant: {...participant, tracks: []},
      total: participant.tracks.length
    });
  }

  async approve(proposalId: string): Promise<void> {
    await this.transport.send({type: 'proposal-approval', participantId: this.participantId, proposalId});
  }

  async publishSaveResult(result: CompareSaveResult): Promise<void> {
    await this.transport.send({type: 'save-result', participantId: this.participantId, result});
  }

  async leave(): Promise<void> {
    await this.transport.disconnect();
    this.reset();
  }

  private handleMessage(message: CompareRoomMessage): void {
    if (message.type === 'join-accepted' && message.participantId === this.participantId) {
      this.accepted$.next(true);
    } else if (message.type === 'join-rejected' && message.participantId === this.participantId) {
      this.error$.next(message.reason);
    } else if (message.type === 'merge-proposal') {
      this.proposal$.next(message.proposal);
    } else if (message.type === 'merge-proposal-cancelled') {
      this.proposal$.next(null);
    } else if (message.type === 'create-playlist-start') {
      this.createProposalBuffer = {...message.proposal, tracks: []};
    } else if (message.type === 'create-playlist-track-chunk') {
      if (this.createProposalBuffer?.id === message.proposalId) {
        this.createProposalBuffer.tracks.push(...message.tracks);
      }
    } else if (message.type === 'create-playlist-commit') {
      if (
        this.createProposalBuffer?.id === message.proposalId &&
        this.createProposalBuffer.tracks.length === this.createProposalBuffer.trackCount
      ) {
        this.createRequest$.next(this.createProposalBuffer);
      } else {
        this.error$.next('Some shared tracks were lost before playlist creation. Ask the host to try again.');
      }
      this.createProposalBuffer = null;
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
  }

  private randomToken(byteCount: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
}
