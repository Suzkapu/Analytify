import {Component, OnInit} from '@angular/core';
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {ActivatedRoute, Router} from "@angular/router";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";

@Component({
  selector: 'app-callback',
  templateUrl: './callback.component.html',
  styleUrls: ['./callback.component.scss']
})
export class CallbackComponent implements OnInit {
  playlists: any[] = [];

  constructor(private router: Router, private route: ActivatedRoute, private authService: SpotifyAuthService, private spotifyDataService: SpotifyDataService) {
  }

  //Sets the access token
  ngOnInit() {
    this.route.fragment.subscribe((fragment: string | null) => {
      if (fragment) {
        this.authService.setAccessTokenFromFragment(fragment);
        if (this.authService.isAuthenticated()) {
          this.router.navigate(['/playlists']);
        }
      }
    });
  }
}
