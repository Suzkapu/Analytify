import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';

@Component({
  selector: 'app-stats-request-claim',
  templateUrl: './stats-request-claim.component.html',
  styleUrls: ['./shared-playlist-claim.component.scss']
})
export class StatsRequestClaimComponent implements OnInit {
  isOpening = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private statsSharing: StatsSharingService
  ) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') || '';
    try {
      await this.statsSharing.claimAccessInvite(token);
      await this.router.navigate(['/shared-playlists'], {replaceUrl: true});
    } catch (error) {
      this.errorMessage = (error as any)?.message
        || 'This stats request link is invalid, expired, or has already been used.';
      this.isOpening = false;
    }
  }
}
