import {APP_INITIALIZER, NgModule, Optional, SkipSelf} from '@angular/core';
import {HTTP_INTERCEPTORS, HttpClientModule} from '@angular/common/http';

import {SpotifyAuthInterceptor} from '@core/auth/spotify-auth.interceptor';
import {StorageService} from '@core/data-access/storage/storage.service';

export function initializeStorage(storageService: StorageService) {
  return () => storageService.initFromDB();
}

@NgModule({
  imports: [HttpClientModule],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: SpotifyAuthInterceptor,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeStorage,
      deps: [StorageService],
      multi: true
    }
  ]
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule: CoreModule | null) {
    if (parentModule) {
      throw new Error('CoreModule must only be imported by AppModule.');
    }
  }
}
