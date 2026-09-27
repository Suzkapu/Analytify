import {Component, EventEmitter, ViewContainerRef} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {DesignV2OverlayService} from './design-v2-overlay.service';

@Component({standalone: true, template: '<p>Overlay content</p>'})
class OverlayStubComponent {
  readonly closed = new EventEmitter<void>();
}

@Component({standalone: true, template: '<ng-container #mount></ng-container>'})
class OverlayHostStubComponent {
  constructor(readonly container: ViewContainerRef) {}
}

describe('DesignV2OverlayService', () => {
  it('mounts only one overlay and destroys it when its close event fires', async () => {
    TestBed.configureTestingModule({providers: [DesignV2OverlayService]});
    const fixture = TestBed.createComponent(OverlayHostStubComponent);
    const host = fixture.componentInstance.container;
    const service = TestBed.inject(DesignV2OverlayService);
    service.register(host);

    const reference = await service.open(async () => OverlayStubComponent);
    const duplicate = await service.open(async () => OverlayStubComponent);
    expect(reference).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(service.active()).toBe(true);

    reference?.instance.closed.emit();
    expect(service.active()).toBe(false);
  });
});
