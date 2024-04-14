import {Component, OnDestroy, OnInit} from '@angular/core';
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {ActivatedRoute} from "@angular/router";

@Component({
  selector: 'app-artist-details',
  templateUrl: './artist-details.component.html',
  styleUrls: ['./artist-details.component.scss'],
})
export class ArtistDetailsComponent implements OnInit, OnDestroy {
  artist: any = {};
  tracks: any[] = [];
  allTags: any;
  selectedTag: any;

  constructor(private route: ActivatedRoute, private spotifyDataService: SpotifyDataService) {
    this.route.params.subscribe((params) => {
      this.loadArtistDetails(params['id']); //Tream: 6vNAKgK5d74N1I0zTxRPDp
      this.tracks = history.state.tracks;
      console.log(this.tracks)
    });
  }

  ngOnInit() {
    document.body.classList.add('no-scroll'); // Add class to body
  }

  ngOnDestroy() {
    document.body.classList.remove('no-scroll'); // Remove class from body when component is destroyed
  }

  loadArtistDetails(id: string) {
    this.spotifyDataService.getSingleArtist(id).subscribe((artist: any) => {
      this.artist = artist;
    });
  }

  openTrackClick(url: string) {
    window.location.href = url;
  }

  openArtistClick() {
    window.location.href = this.artist.external_urls.spotify;
  }
}
