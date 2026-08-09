import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';

import {SongLeagueService} from '@core/song-league/song-league.service';

@Component({
  selector: 'app-song-league-claim',
  templateUrl: './song-league-claim.component.html'
})
export class SongLeagueClaimComponent implements OnInit {
  isJoining = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private songLeague: SongLeagueService
  ) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') || '';
    try {
      const leagueId = await this.songLeague.claimLeague(token);
      await this.router.navigate(['/song-league', leagueId], {replaceUrl: true});
    } catch (error) {
      this.errorMessage = (error as any)?.message || 'This Song League invitation is invalid or unavailable.';
      this.isJoining = false;
    }
  }
}
