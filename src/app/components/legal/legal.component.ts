import { Component } from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'app-legal',
  templateUrl: './legal.component.html',
  styleUrls: ['./legal.component.scss']
})
export class LegalComponent {
  constructor(private location: Location) {}

  goBack(): void {
    this.location.back();
  }
}
