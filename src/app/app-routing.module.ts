import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {LoginPageComponent} from "./components/login-page/login-page.component";
import {CallbackComponent} from "./components/callback/callback.component";
import {PlaylistsComponent} from "./components/playlists/playlists.component";
import {SongsComponent} from "./components/songs/songs.component";
import {ArtistDetailsComponent} from "./components/artist-details/artist-details.component";
import {PlaylistAnalysisComponent} from "./components/playlist-analysis/playlist-analysis.component";
import {UserStatsComponent} from "./components/user-stats/user-stats.component";
import {LegalComponent} from "./components/legal/legal.component";
import {ListeningHistoryComponent} from "./components/listening-history/listening-history.component";

const routes: Routes = [
  {path: '', component: LoginPageComponent},
  {path: 'login', component: LoginPageComponent},
  {path: 'callback', component: CallbackComponent},
  {path: 'playlists', component: PlaylistsComponent},
  {path: 'songs/:id', component: SongsComponent},
  {path: 'artistDetails/:id', component: ArtistDetailsComponent},
  {path: 'analysis/:id', component: PlaylistAnalysisComponent},
  {path: 'stats', component: UserStatsComponent},
  {path: 'legal', component: LegalComponent},
  {path: 'history', component: ListeningHistoryComponent},
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
