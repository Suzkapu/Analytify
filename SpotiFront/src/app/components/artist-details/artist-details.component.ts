import {Component, OnDestroy, OnInit} from '@angular/core';
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {ActivatedRoute} from "@angular/router";
import {BackendService} from "../../services/backend/backend.service";

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

  constructor(private route: ActivatedRoute, private spotifyDataService: SpotifyDataService, private backendService: BackendService) {
    this.route.params.subscribe((params) => {
      this.loadArtistDetails(params['id']); //Tream: 6vNAKgK5d74N1I0zTxRPDp
      this.tracks = history.state.tracks;
      console.log(this.tracks)
    });
  }

  ngOnInit() {
    document.body.classList.add('no-scroll'); // Add class to body
    this.getTags();
    this.getTracksFromTag()
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

  getTags() {
    this.backendService.getAllTags().subscribe((data) => {
      this.allTags = data;
    });
  }

  getTracksFromTag() {
    for (let i = 0; i < this.tracks.length; i++) {
      this.backendService.getAllTagsFromTrack(this.tracks[i].id).subscribe((data) => {
        console.log(data);
        if (data != null) {
          this.tracks[i].tags = data;
          console.log(this.tracks);
        }
        //this.tracks[i].tags = "Happy";
        console.log(this.tracks[i].tags);
      });
    }
  }

  addTagToTrack(track: any) {
    for (var i = 0; i < track.tags.length; i++) {
      console.log(track)
      this.backendService.addTagToTrack(track.id, track.tags[i].id, track.name, track.album.images[0].url).subscribe((data) => {
        console.log(data);
      });
    }
  }
}
