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
import {TagComponent} from './components/tag/tag.component';
import {DropdownModule} from "primeng/dropdown";
import {TagModule} from "primeng/tag";
import {MultiSelectModule} from "primeng/multiselect";
import {TagManagerComponent} from './components/tag-manager/tag-manager.component';
import {TableModule} from "primeng/table";


@NgModule({
  declarations: [
    AppComponent,
    LoginPageComponent,
    CallbackComponent,
    PlaylistsComponent,
    ArtistsComponent,
    ArtistDetailsComponent,
    TagComponent,
    TagManagerComponent
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
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {
}
