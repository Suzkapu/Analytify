import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {ArtistDetailsUiModule} from '../artist-details/artist-details.module';
import {V2ButtonDirective, V2PageComponent} from '@shared/ui-v2';

@Component({
  selector: 'app-v2-artist-details-page',
  standalone: true,
  imports: [RouterLink, V2ButtonDirective, V2PageComponent, ArtistDetailsUiModule],
  template: `
    <v2-page eyebrow="Library" title="Artist details"
      description="See the artist and their songs in this playlist." width="default">
      <a v2PageActions v2Button="tertiary" [routerLink]="backLink">
        <i class="pi pi-arrow-left" aria-hidden="true"></i> Back to playlists
      </a>
      <div class="v2-library-feature v2-library-feature--artist"><app-artist-details /></div>
    </v2-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2ArtistDetailsPageComponent {
  readonly backLink = history.state?.playlistId
    ? this.navigation.commands('songs', {id: history.state.playlistId})
    : this.navigation.commands('playlists');
  constructor(private readonly navigation: DesignNavigationService) {}
}
