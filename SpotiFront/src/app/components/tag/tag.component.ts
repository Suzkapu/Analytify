import {Component, OnInit, ViewEncapsulation} from '@angular/core';
import {BackendService} from "../../services/backend/backend.service";
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";


@Component({
  selector: 'app-tag',
  templateUrl: './tag.component.html',
  styleUrls: ['./tag.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class TagComponent implements OnInit {
  allTags: any;
  selectedTag: any;
  tagsForSelectedTrack: any;

  TracksForSelectedTag: any[] = [];

  constructor(private backendService: BackendService, private spot: SpotifyDataService) {
  }

  ngOnInit(): void {
    this.getTags();
  }

  getTags() {
    this.backendService.getAllTags().subscribe((data) => {
      this.allTags = data;
    });
  }

  getTracksFromTag() {
    this.TracksForSelectedTag = [];
    this.backendService.getAllTracksFromTag(this.selectedTag.id).subscribe((data) => {
      console.log(data);
      this.tagsForSelectedTrack = data;
    });

    console.log(this.TracksForSelectedTag);
  }

  home() {
    window.location.href = "http://localhost:4200/playlists";
  }

  createNewTag() {
    window.location.href = "http://localhost:4200/tagManager";
  }
}
