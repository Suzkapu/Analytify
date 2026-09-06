import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {SongLeagueClaimComponent} from './song-league-claim.component';
import {SongLeagueDetailComponent} from './song-league-detail.component';
import {SongLeagueHomeComponent} from './song-league-home.component';
import {SongLeagueRulesComponent} from './song-league-rules.component';

@NgModule({
  declarations: [
    SongLeagueHomeComponent,
    SongLeagueDetailComponent,
    SongLeagueClaimComponent,
    SongLeagueRulesComponent
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      {path: '', pathMatch: 'full', component: SongLeagueHomeComponent},
      {path: 'join/:token', component: SongLeagueClaimComponent},
      {path: ':leagueId', component: SongLeagueDetailComponent}
    ])
  ]
})
export class SongLeagueModule {}
