import {NgModule, isDevMode} from '@angular/core';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {LoginPageComponent} from './components/login-page/login-page.component';
import {ButtonModule} from "primeng/button";
import {HttpClientModule} from "@angular/common/http";
import {CallbackComponent} from './components/callback/callback.component';
import {PlaylistsComponent} from './components/playlists/playlists.component';
import {CardModule} from "primeng/card";
import {SongsComponent} from './components/songs/songs.component';
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
import { ServiceWorkerModule } from '@angular/service-worker';
import { FooterComponent } from './components/footer/footer.component';
import { LegalComponent } from './components/legal/legal.component';


@NgModule({
  declarations: [
    AppComponent,
    LoginPageComponent,
    CallbackComponent,
    PlaylistsComponent,
    SongsComponent,
    ArtistDetailsComponent,
    PlaylistAnalysisComponent,
    UserStatsComponent,
    FooterComponent,
    LegalComponent,
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
    TableModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    })
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: SpotifyAuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent],
})
export class AppModule {
}
