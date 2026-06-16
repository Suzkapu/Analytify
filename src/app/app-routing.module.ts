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

import {spotifyAuthGuard} from "./services/auth/spotify-auth.guard";
import {redirectLoggedInGuard} from "./services/auth/redirect-logged-in.guard";

const routes: Routes = [
  {path: '', component: LoginPageComponent, canActivate: [redirectLoggedInGuard]},
  {path: 'login', component: LoginPageComponent, canActivate: [redirectLoggedInGuard]},
  {path: 'callback', component: CallbackComponent},
  {path: 'playlists', component: PlaylistsComponent, canActivate: [spotifyAuthGuard]},
  {path: 'songs/:id', component: SongsComponent, canActivate: [spotifyAuthGuard]},
  {path: 'artistDetails/:id', component: ArtistDetailsComponent, canActivate: [spotifyAuthGuard]},
  {path: 'analysis/:id', component: PlaylistAnalysisComponent, canActivate: [spotifyAuthGuard]},
  {path: 'stats', component: UserStatsComponent, canActivate: [spotifyAuthGuard]},
  {path: 'legal', component: LegalComponent},
  {path: 'history', component: ListeningHistoryComponent, canActivate: [spotifyAuthGuard]},
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
