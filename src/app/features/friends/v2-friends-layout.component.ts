import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {V2FriendsController} from './v2-friends.controller';

/** Keeps actor-owned invitation state across Friends tabs; leaving the feature destroys it. */
@Component({
  selector: 'v2-friends-layout', standalone: true, imports: [RouterOutlet],
  providers: [V2FriendsController], template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2FriendsLayoutComponent {}
