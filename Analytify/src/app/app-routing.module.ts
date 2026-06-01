import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {LoginPageComponent} from "./components/login-page/login-page.component";
import {CallbackComponent} from "./components/callback/callback.component";
import {PlaylistsComponent} from "./components/playlists/playlists.component";
import {ArtistsComponent} from "./components/artists/artists.component";
import {ArtistDetailsComponent} from "./components/artist-details/artist-details.component";
import {PlaylistAnalysisComponent} from "./components/playlist-analysis/playlist-analysis.component";
import {UserStatsComponent} from "./components/user-stats/user-stats.component";

const routes: Routes = [
  {path: '', component: LoginPageComponent},
  {path: 'login', component: LoginPageComponent},
  {path: 'callback', component: CallbackComponent},
  {path: 'playlists', component: PlaylistsComponent},
  {path: 'artists/:id', component: ArtistsComponent},
  {path: 'artistDetails/:id', component: ArtistDetailsComponent},
  {path: 'analysis/:id', component: PlaylistAnalysisComponent},
  {path: 'stats', component: UserStatsComponent},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
