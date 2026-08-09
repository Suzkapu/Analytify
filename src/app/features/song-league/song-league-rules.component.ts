import {Component, HostListener} from '@angular/core';

@Component({
  selector: 'app-song-league-rules',
  templateUrl: './song-league-rules.component.html',
  styleUrls: ['./song-league-rules.component.scss']
})
export class SongLeagueRulesComponent {
  isOpen = false;

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.close();
  }
}
