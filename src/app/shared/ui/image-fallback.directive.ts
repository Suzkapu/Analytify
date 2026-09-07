import {Directive, ElementRef, HostListener} from '@angular/core';

const AVATAR_FALLBACK = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"%3E%3Crect width="96" height="96" rx="48" fill="%23222925"/%3E%3Ccircle cx="48" cy="37" r="15" fill="%2389938d"/%3E%3Cpath d="M20 84c2-19 13-29 28-29s26 10 28 29" fill="%2389938d"/%3E%3C/svg%3E';

@Directive({
  selector: 'img[appImageFallback]',
  standalone: false
})
export class ImageFallbackDirective {
  constructor(private readonly element: ElementRef<HTMLImageElement>) {}

  @HostListener('error')
  handleError(): void {
    const image = this.element.nativeElement;
    if (image.dataset['fallbackApplied'] === 'true') return;
    image.dataset['fallbackApplied'] = 'true';
    image.src = AVATAR_FALLBACK;
  }
}
