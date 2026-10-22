import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {V2ButtonDirective} from './design-v2-primitives';

export type FriendsFeedbackState = 'loading' | 'refreshing' | 'busy' | 'load-error' | 'change-error' | 'unavailable' | 'profile-required' | 'link-unavailable' | 'owner-unavailable' | 'accepted' | 'declined';

const FRIENDS_FEEDBACK: Record<FriendsFeedbackState, readonly [string, string]> = {
  loading: ['Loading friends…', 'Your friends and incoming requests will appear here.'],
  refreshing: ['Refreshing friends…', 'Your current friends stay visible while we check for updates.'],
  busy: ['Updating your request…', 'Please wait while we confirm this action. Other request actions are temporarily unavailable.'],
  'load-error': ['Friends could not be loaded', 'Retry to load your friends and requests. No friend action is available until your account is confirmed.'],
  'change-error': ['Your change could not be confirmed', 'Retry the same request to confirm the result. Your invitation stays private and does not share listening data.'],
  unavailable: ['This invitation is unavailable', 'It may have been revoked or answered, or belong to another account. Ask your friend for a new invitation.'],
  'profile-required': ['Confirm your Spotify account', 'Connect your verified Spotify account before viewing friends or answering invitations.'],
  'link-unavailable': ['Link unavailable in this session', 'This invitation was created in another session. You can revoke it and create a new invitation to share from here.'],
  'owner-unavailable': ['Your invitation is no longer active', 'It was answered or revoked. Create a new invitation when you want to invite someone else.'],
  accepted: ['Friend request accepted', 'You can choose what to share with friends. Accepting this request does not grant access to your playlists or listening data.'],
  declined: ['Friend request declined', 'This invitation cannot be used again. Your existing friends and sharing permissions are unchanged.']
};

/** Canonical Friends feedback1008:32348. Mutation failure does not imply rollback. */
@Component({
  selector: 'v2-friends-feedback',
  standalone: true,
  imports: [V2ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="feedback" [attr.role]="alert() ? 'alert' : 'status'"
      [attr.aria-live]="alert() ? 'assertive' : 'polite'" [attr.aria-busy]="pending() ? 'true' : null">
      <h3>{{ copy()[0] }}</h3>
      <p>{{ copy()[1] }}</p>
      @if (retryable()) {
        <button type="button" v2Button="primary" (click)="requestRetry()"><span class="sync" aria-hidden="true"></span>Retry</button>
      }
      @if (state() === 'owner-unavailable') {<button type="button" v2Button="primary" (click)="createInvitation.emit()">Create new invitation</button>}
      @if (state() === 'accepted' || state() === 'declined') {<button type="button" v2Button="primary" (click)="viewFriends.emit()">View friends</button>}
    </section>
  `,
  styleUrl: './v2-friends-feedback.component.scss'
})
export class V2FriendsFeedbackComponent {
  readonly state = input<FriendsFeedbackState>('loading');
  readonly retry = output<void>();
  readonly createInvitation = output<void>();
  readonly viewFriends = output<void>();
  readonly copy = computed(() => FRIENDS_FEEDBACK[this.state()]);
  readonly pending = computed(() => this.state() === 'loading' || this.state() === 'refreshing' || this.state() === 'busy');
  readonly alert = computed(() => this.state() === 'load-error' || this.state() === 'change-error' || this.state() === 'unavailable' || this.state() === 'profile-required');
  readonly retryable = computed(() => this.state() === 'load-error' || this.state() === 'change-error');
  requestRetry(): void { if (this.retryable()) this.retry.emit(); }
}
