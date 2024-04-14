import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {LoginPageComponent} from "./components/login-page/login-page.component";
import {CallbackComponent} from "./components/callback/callback.component";
import {PlaylistsComponent} from "./components/playlists/playlists.component";
import {ArtistsComponent} from "./components/artists/artists.component";
import {ArtistDetailsComponent} from "./components/artist-details/artist-details.component";
import {TagComponent} from "./components/tag/tag.component";
import {TagManagerComponent} from "./components/tag-manager/tag-manager.component";

const routes: Routes = [
  {path: '', component: LoginPageComponent},
  {path: 'login', component: LoginPageComponent},
  {path: 'callback', component: CallbackComponent},
  {path: 'playlists', component: PlaylistsComponent},
  {path: 'artists/:id', component: ArtistsComponent},
  {path: 'artistDetails/:id', component: ArtistDetailsComponent},
  {path: 'tag', component: TagComponent},
  {path: 'tagManager', component: TagManagerComponent}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {
}
