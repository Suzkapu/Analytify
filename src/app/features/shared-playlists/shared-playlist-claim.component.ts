import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';

@Component({
  selector: 'app-shared-playlist-claim',
  templateUrl: './shared-playlist-claim.component.html',
  styleUrls: ['./shared-playlist-claim.component.scss']
})
export class SharedPlaylistClaimComponent implements OnInit {
  isClaiming = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sharing: PlaylistSharingService
  ) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') || '';
    try {
      const shareId = await this.sharing.claimShare(token);
      await this.router.navigate(['/shared-playlists', shareId], {replaceUrl: true});
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'This share link is invalid, already claimed, or revoked.';
      this.isClaiming = false;
    }
  }
}
