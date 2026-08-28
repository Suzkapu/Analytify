import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {RouterModule, Routes} from '@angular/router';

import {PersonalSpotifyConnectComponent} from './personal-spotify-connect.component';
import {PersonalSpotifyCallbackComponent} from './personal-spotify-callback.component';
import {CloudAccessComponent} from './cloud-access.component';

const routes: Routes = [
  {path: 'connect', component: PersonalSpotifyConnectComponent},
  {path: 'callback', component: PersonalSpotifyCallbackComponent},
  {path: 'cloud-access', component: CloudAccessComponent}
];

@NgModule({
  declarations: [PersonalSpotifyConnectComponent, PersonalSpotifyCallbackComponent, CloudAccessComponent],
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes)]
})
export class PersonalSpotifyModule {}

