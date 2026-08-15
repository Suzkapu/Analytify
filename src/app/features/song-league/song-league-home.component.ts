import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';

import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SongLeague} from '@core/song-league/song-league.models';
import {SongLeagueService} from '@core/song-league/song-league.service';
import {SiteSettingsService} from '@core/settings/site-settings.service';
import {AdminService} from '@core/admin/admin.service';

@Component({
  selector: 'app-song-league-home',
  templateUrl: './song-league-home.component.html'
})
export class SongLeagueHomeComponent implements OnInit {
  leagues: SongLeague[] = [];
  isLoading = true;
  isCreating = false;
  showCreateForm = false;
  leagueName = '';
  errorMessage = '';
  inviteUrl = '';
  inviteCopied = false;
  createdLeagueId = '';
  allowLeagueCreation = true;
  isAdmin = false;

  constructor(
    public auth: SpotifyAuthService,
    private songLeague: SongLeagueService,
    private siteSettings: SiteSettingsService,
    private admin: AdminService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    const [settings, isAdmin] = await Promise.all([
      this.siteSettings.load().catch(() => ({announcement: '', allowSongLeagueCreation: true})),
      this.admin.isAdmin()
    ]);
    this.allowLeagueCreation = settings.allowSongLeagueCreation;
    this.isAdmin = isAdmin;
    await this.load();
  }

  get canCreateLeague(): boolean {
    return this.auth.isBackupActive() && (this.allowLeagueCreation || this.isAdmin);
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.leagues = await this.songLeague.listLeagues();
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Your Song Leagues could not be loaded.');
    } finally {
      this.isLoading = false;
    }
  }

  async createLeague(): Promise<void> {
    const name = this.leagueName.trim();
    if (!name || this.isCreating) return;
    this.isCreating = true;
    this.errorMessage = '';
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vienna';
      const created = await this.songLeague.createLeague(name, timezone);
      this.inviteUrl = created.inviteUrl;
      this.createdLeagueId = created.leagueId;
      this.leagueName = '';
      this.showCreateForm = false;
      await this.load();
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The Song League could not be created.');
    } finally {
      this.isCreating = false;
    }
  }

  async copyInvite(): Promise<void> {
    if (!this.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.inviteCopied = true;
      window.setTimeout(() => this.inviteCopied = false, 2_000);
    } catch {
      this.errorMessage = 'The invitation could not be copied. Select the URL manually.';
    }
  }

  openCreatedLeague(): void {
    if (this.createdLeagueId) void this.router.navigate(['/song-league', this.createdLeagueId]);
  }

  trackLeague(_: number, league: SongLeague): string {
    return league.id;
  }

  private describeError(error: unknown, fallback: string): string {
    return (error as any)?.message || (error as any)?.details || fallback;
  }
}
