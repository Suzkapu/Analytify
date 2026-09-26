import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {PlaylistAnalysisUiModule} from '../playlist-analysis/playlist-analysis.module';
import {V2ButtonDirective, V2PageComponent} from '@shared/ui-v2';

@Component({
  selector: 'app-v2-analysis-page',
  standalone: true,
  imports: [RouterLink, V2ButtonDirective, V2PageComponent, PlaylistAnalysisUiModule],
  template: `
    <v2-page eyebrow="Library" title="Playlist analysis"
      description="A focused overview of this playlist’s size, timeline, and standout songs." width="dashboard">
      <a v2PageActions v2Button="tertiary" [routerLink]="backLink">
        <i class="pi pi-arrow-left" aria-hidden="true"></i> Back to playlists
      </a>
      <div class="v2-library-feature v2-library-feature--analysis"><app-playlist-analysis /></div>
    </v2-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2AnalysisPageComponent {
  readonly backLink = this.navigation.commands('playlists');
  constructor(private readonly navigation: DesignNavigationService) {}
}
