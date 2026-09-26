import {ChangeDetectionStrategy, Component} from '@angular/core';
import {PlaylistsUiModule} from '../playlists/playlists.module';
import {V2PageComponent} from '@shared/ui-v2';

@Component({
  selector: 'app-v2-playlists-page',
  standalone: true,
  imports: [V2PageComponent, PlaylistsUiModule],
  template: `
    <v2-page eyebrow="Your Spotify library" title="Your playlists"
      description="Open a playlist, search its songs, or see a quick summary." width="dashboard">
      <div class="v2-library-feature v2-library-feature--playlists"><app-playlists /></div>
    </v2-page>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2PlaylistsPageComponent {}
