import {Component, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';

import {SongLeagueService} from '@core/song-league/song-league.service';
import {SongLeagueRejoinRequest} from '@core/song-league/song-league.models';
import {PushNotificationService} from '@core/notifications/push-notification.service';

@Component({
    selector: 'app-song-league-claim',
    templateUrl: './song-league-claim.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SongLeagueClaimComponent implements OnInit {
  joinState: 'joining' | 'joined' | 'error' = 'joining';
  showNotificationPrompt = false;
  isEnablingNotifications = false;
  errorMessage = '';
  notificationError = '';
  rejoinRequest: SongLeagueRejoinRequest | null = null;
  canRequestRejoin = false;
  isRequestingRejoin = false;
  private joinedLeagueId = '';
  private inviteToken = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private songLeague: SongLeagueService,
    private pushNotifications: PushNotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.inviteToken = this.route.snapshot.paramMap.get('token') || '';
    await this.tryJoin();
  }

  async requestRejoin(): Promise<void> {
    if (this.isRequestingRejoin) return;
    this.isRequestingRejoin = true;
    this.errorMessage = '';
    try {
      this.rejoinRequest = await this.songLeague.requestRejoin(this.inviteToken);
      this.canRequestRejoin = false;
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'The rejoin request could not be sent.';
    } finally {
      this.isRequestingRejoin = false;
    }
  }

  async retryJoin(): Promise<void> {
    if (this.joinState === 'joining') return;
    this.joinState = 'joining';
    this.errorMessage = '';
    await this.tryJoin();
  }

  private async tryJoin(): Promise<void> {
    try {
      const leagueId = await this.songLeague.claimLeague(this.inviteToken);
      this.joinedLeagueId = leagueId;
      this.joinState = 'joined';
      const settings = await this.pushNotifications.loadSettings().catch(() => null);
      if (settings?.supported && settings.permission !== 'denied' && !settings.active) {
        this.showNotificationPrompt = true;
        return;
      }
      await this.openLeague();
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'This Song League invitation is invalid or unavailable.';
      if (this.errorMessage.includes('owner must approve')) {
        this.rejoinRequest = await this.songLeague.getMyRejoinRequest(this.inviteToken).catch(() => null);
        this.canRequestRejoin = !this.rejoinRequest || ['declined', 'expired', 'joined'].includes(this.rejoinRequest.status);
      }
      this.joinState = 'error';
    }
  }

  async enableNotifications(): Promise<void> {
    if (this.isEnablingNotifications) return;
    this.isEnablingNotifications = true;
    this.notificationError = '';
    try {
      const settings = await this.pushNotifications.setSongLeagueEnabled(true);
      if (!settings.active) {
        this.notificationError = 'Notifications are not active on this device yet.';
        return;
      }
      await this.openLeague();
    } catch (error) {
      this.notificationError = (error as any)?.message || 'Notifications could not be enabled on this device.';
    } finally {
      this.isEnablingNotifications = false;
    }
  }

  skipNotifications(): void {
    if (this.isEnablingNotifications) return;
    void this.openLeague();
  }

  private async openLeague(): Promise<void> {
    this.showNotificationPrompt = false;
    await this.router.navigate(['/song-league', this.joinedLeagueId], {replaceUrl: true});
  }
}
