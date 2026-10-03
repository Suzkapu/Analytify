import {Component, inject, OnInit} from '@angular/core';
import {Router} from '@angular/router';

export function forwardToPreview(url: string, location: Pick<Location, 'assign'>): void {
  if (!/^\/new(?:[/?#]|$)/.test(url)) throw new Error('Invalid preview destination.');
  location.assign(url);
}

@Component({
  standalone: true,
  template: '<p role="status">Opening the new design…</p>'
})
export class PreviewHandoffComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    // OAuth callbacks remain registered at the stable URLs. Resume the preview
    // with a full document load rather than rendering it in the stable app.
    forwardToPreview(this.router.url, window.location);
  }
}
