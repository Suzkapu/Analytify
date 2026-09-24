import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {StatsAccessInvitePreview} from '@core/sharing/stats-sharing.models';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';

@Component({
  selector: 'app-stats-share-claim',
  templateUrl: './stats-share-claim.component.html',
  styleUrls: ['./shared-playlist-claim.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class StatsShareClaimComponent implements OnInit {
  preview: StatsAccessInvitePreview | null = null;
  isLoading = true;
  isResponding = false;
  errorMessage = '';
  private token = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private statsSharing: StatsSharingService
  ) {}

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    try {
      this.preview = await this.statsSharing.previewAccessInvite(this.token);
      if (this.preview.kind !== 'share') throw new Error('This is not a stats share link.');
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'This stats share link is unavailable.';
    } finally {
      this.isLoading = false;
    }
  }

  async respond(accept: boolean): Promise<void> {
    if (!this.preview || this.isResponding) return;
    this.isResponding = true;
    this.errorMessage = '';
    try {
      if (accept) await this.statsSharing.acceptShareInvite(this.token);
      else await this.statsSharing.declineShareInvite(this.token);
      await this.router.navigate(['/shared-playlists'], {replaceUrl: true});
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'Your answer could not be saved.';
      this.isResponding = false;
    }
  }
}
