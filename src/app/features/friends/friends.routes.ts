import {Routes} from '@angular/router';
import {designV2RouteData} from '@core/navigation/design-v2-route-data';
import {V2FriendsLayoutComponent} from './v2-friends-layout.component';
import {V2FriendsPageComponent} from './v2-friends-page.component';

export const FRIENDS_ROUTES: Routes = [{
  path: '', component: V2FriendsLayoutComponent, children: [
    {path: '', pathMatch: 'full', component: V2FriendsPageComponent, data: {...designV2RouteData('friends', 'Your friends', 'full', 'social'), friendsView: 'friends'}},
    {path: 'add', component: V2FriendsPageComponent, data: {...designV2RouteData('friends', 'Add a friend', 'full', 'social', {mobileBack: true}), friendsView: 'add'}},
    {path: 'invitations', component: V2FriendsPageComponent, data: {...designV2RouteData('friends', 'Friend invitations', 'full', 'social', {mobileBack: true}), friendsView: 'invitations'}},
    {path: 'invite/:token', component: V2FriendsPageComponent, data: {...designV2RouteData('friends', 'Friend invitation', 'full', 'social', {mobileBack: true}), friendsView: 'review'}}
  ]
}];
