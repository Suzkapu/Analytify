import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';

import {SongLeagueService} from '@core/song-league/song-league.service';
import {PushNotificationService} from '@core/notifications/push-notification.service';

@Component({
  selector: 'app-song-league-claim',
  templateUrl: './song-league-claim.component.html'
})
export class SongLeagueClaimComponent implements OnInit {
  isJoining = true;
  showNotificationPrompt = false;
  isEnablingNotifications = false;
  errorMessage = '';
  notificationError = '';
  private joinedLeagueId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private songLeague: SongLeagueService,
    private pushNotifications: PushNotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') || '';
    try {
      const leagueId = await this.songLeague.claimLeague(token);
      this.joinedLeagueId = leagueId;
      const settings = await this.pushNotifications.loadSettings().catch(() => null);
      if (settings?.supported && !settings.active) {
        this.isJoining = false;
        this.showNotificationPrompt = true;
        return;
      }
      await this.openLeague();
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'This Song League invitation is invalid or unavailable.';
      this.isJoining = false;
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
