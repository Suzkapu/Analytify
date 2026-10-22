import {provideZoneChangeDetection} from '@angular/core';
import {platformBrowserDynamic} from '@angular/platform-browser-dynamic';
import {AppModule} from './app/app.module';
import {DESIGN_V2_FRIENDS_BACKEND_READY} from './app/core/friends/friends.service';
import {environment} from './environments/environment';

// This entry point is selected only by the dedicated browser-testing build.
// Refuse to enable experimental RPCs if its environment replacement is missing.
if (environment.production || environment.supabaseUrl !== 'http://127.0.0.1:54321') {
  throw new Error('Browser fixtures require the isolated loopback environment.');
}
platformBrowserDynamic().bootstrapModule(AppModule, {
  applicationProviders: [provideZoneChangeDetection(), {provide: DESIGN_V2_FRIENDS_BACKEND_READY, useValue: true}]
}).catch(error => {console.error('Browser fixture application failed to start', error);});
