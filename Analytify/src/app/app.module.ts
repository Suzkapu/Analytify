import {NgModule} from '@angular/core';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {LoginPageComponent} from './components/login-page/login-page.component';
import {ButtonModule} from "primeng/button";
import {HttpClientModule} from "@angular/common/http";
import {CallbackComponent} from './components/callback/callback.component';
import {PlaylistsComponent} from './components/playlists/playlists.component';
import {CardModule} from "primeng/card";
import {ArtistsComponent} from './components/artists/artists.component';
import {FormsModule} from "@angular/forms";
import {InputTextModule} from "primeng/inputtext";
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {ArtistDetailsComponent} from './components/artist-details/artist-details.component';
import {PlaylistAnalysisComponent} from './components/playlist-analysis/playlist-analysis.component';
import {UserStatsComponent} from './components/user-stats/user-stats.component';
import {DropdownModule} from "primeng/dropdown";
import {TagModule} from "primeng/tag";
import {MultiSelectModule} from "primeng/multiselect";
import {TableModule} from "primeng/table";
import {HTTP_INTERCEPTORS} from "@angular/common/http";
import {SpotifyAuthInterceptor} from "./services/auth/spotify-auth.interceptor";


@NgModule({
  declarations: [
    AppComponent,
    LoginPageComponent,
    CallbackComponent,
    PlaylistsComponent,
    ArtistsComponent,
    ArtistDetailsComponent,
    PlaylistAnalysisComponent,
    UserStatsComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    ButtonModule,
    HttpClientModule,
    CardModule,
    FormsModule,
    InputTextModule,
    DropdownModule,
    TagModule,
    MultiSelectModule,
    TableModule
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: SpotifyAuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent],
})
export class AppModule {
}
