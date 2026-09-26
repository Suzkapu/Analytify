import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {SongsUiModule} from '../songs/songs.module';
import {V2ButtonDirective, V2PageComponent} from '@shared/ui-v2';

@Component({
  selector: 'app-v2-songs-page',
  standalone: true,
  imports: [RouterLink, V2ButtonDirective, V2PageComponent, SongsUiModule],
  template: `
    <v2-page eyebrow="Library" title="Playlist contents"
      description="Browse the artists, songs, and albums in this playlist." width="dashboard">
      <a v2PageActions v2Button="tertiary" [routerLink]="backLink">
        <i class="pi pi-arrow-left" aria-hidden="true"></i> Back to playlists
      </a>
      <div class="v2-library-feature v2-library-feature--songs"><app-songs /></div>
    </v2-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2SongsPageComponent {
  readonly backLink = this.navigation.commands('playlists');
  constructor(private readonly navigation: DesignNavigationService) {}
}
