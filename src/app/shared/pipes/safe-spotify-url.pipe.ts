import {Pipe, PipeTransform} from '@angular/core';
import {sanitizeSpotifyUrl, SpotifyEntityType} from '@core/navigation/spotify-url';

@Pipe({name: 'safeSpotifyUrl'})
export class SafeSpotifyUrlPipe implements PipeTransform {
  transform(value: unknown, expectedType?: SpotifyEntityType): string | null {
    return sanitizeSpotifyUrl(value, expectedType);
  }
}
