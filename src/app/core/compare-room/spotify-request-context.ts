import {HttpContextToken} from '@angular/common/http';

/** Prevents the normal main-profile interceptor from replacing a guest token. */
export const TRANSIENT_SPOTIFY_REQUEST = new HttpContextToken<boolean>(() => false);
