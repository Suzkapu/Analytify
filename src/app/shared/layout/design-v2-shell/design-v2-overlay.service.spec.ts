import {Component, EventEmitter, ViewContainerRef} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {DesignV2OverlayService} from './design-v2-overlay.service';

@Component({standalone: true, template: '<p>Overlay content</p>'})
class OverlayStubComponent {
  readonly closed = new EventEmitter<void>();
}

@Component({standalone: true, template: '<p>No close output</p>'})
class OverlayWithoutOutputComponent {}

@Component({standalone: true, template: '<ng-container #mount></ng-container>'})
class OverlayHostStubComponent {
  constructor(readonly container: ViewContainerRef) {}
}

describe('DesignV2OverlayService', () => {
  function setup() {
    TestBed.configureTestingModule({providers: [DesignV2OverlayService]});
    const fixture = TestBed.createComponent(OverlayHostStubComponent);
    const service = TestBed.inject(DesignV2OverlayService);
    service.register(fixture.componentInstance.container);
    return {fixture, service};
  }

  it('does not load a component without a registered host', async () => {
    const service = new DesignV2OverlayService();
    const loader = vi.fn(async () => OverlayStubComponent);
    expect(await service.open(loader)).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it('rejects duplicate pending opens and cancels a dismissed load', async () => {
    const {service} = setup();
    let resolve!: (component: typeof OverlayStubComponent) => void;
    const pending = service.open(() => new Promise<typeof OverlayStubComponent>(done => {resolve = done;}));
    const duplicateLoader = vi.fn(async () => OverlayStubComponent);
    expect(await service.open(duplicateLoader)).toBeNull();
    expect(duplicateLoader).not.toHaveBeenCalled();
    service.close();
    resolve(OverlayStubComponent);
    expect(await pending).toBeNull();
    expect(service.hasActiveOverlay).toBe(false);
    expect(await service.open(async () => OverlayStubComponent)).not.toBeNull();
  });

  it('never mounts an old pending load into a replacement host', async () => {
    const {fixture, service} = setup();
    let resolve!: (component: typeof OverlayStubComponent) => void;
    const oldLoad = service.open(() => new Promise<typeof OverlayStubComponent>(done => {resolve = done;}));
    const replacement = TestBed.createComponent(OverlayHostStubComponent);
    service.register(replacement.componentInstance.container);
    service.unregister(fixture.componentInstance.container);
    const current = await service.open(async () => OverlayStubComponent);
    resolve(OverlayStubComponent);
    expect(await oldLoad).toBeNull();
    expect(service.hasActiveOverlay).toBe(true);
    service.unregister(replacement.componentInstance.container);
    expect(current?.hostView.destroyed).toBe(true);
    expect(service.active()).toBe(false);
  });

  it('releases the pending lock when loading fails', async () => {
    const {service} = setup();
    await expect(service.open(async () => {throw new Error('Import failed');})).rejects.toThrow('Import failed');
    expect(await service.open(async () => OverlayStubComponent)).not.toBeNull();
  });

  it('an obsolete load cannot unlock a newer pending request', async () => {
    const {service} = setup();
    let resolveOld!: (component: typeof OverlayStubComponent) => void;
    let resolveNew!: (component: typeof OverlayStubComponent) => void;
    const old = service.open(() => new Promise<typeof OverlayStubComponent>(resolve => {resolveOld = resolve;}));
    service.close();
    const current = service.open(() => new Promise<typeof OverlayStubComponent>(resolve => {resolveNew = resolve;}));
    resolveOld(OverlayStubComponent);
    expect(await old).toBeNull();
    const duplicate = vi.fn(async () => OverlayStubComponent);
    expect(await service.open(duplicate)).toBeNull();
    expect(duplicate).not.toHaveBeenCalled();
    resolveNew(OverlayStubComponent);
    expect(await current).not.toBeNull();
  });

  it('supports explicit close without a component close output and preserves a repeated registration', async () => {
    const {fixture, service} = setup();
    const reference = await service.open(async () => OverlayWithoutOutputComponent);
    service.register(fixture.componentInstance.container);
    expect(reference?.hostView.destroyed).toBe(false);
    service.close();
    expect(reference?.hostView.destroyed).toBe(true);
    expect(service.active()).toBe(false);
  });

  it('keeps a current overlay open when an old reference closes or emits again', async () => {
    const {service} = setup();
    const old = await service.open(async () => OverlayStubComponent);
    service.close();
    expect(old?.instance.closed.observers).toHaveLength(0);
    const current = await service.open(async () => OverlayStubComponent);
    service.close(old!);
    old?.instance.closed.emit();
    expect(current?.hostView.destroyed).toBe(false);
    expect(service.hasActiveOverlay).toBe(true);
  });

  it('recovers when the host destroys a component directly', async () => {
    const {fixture, service} = setup();
    await service.open(async () => OverlayStubComponent);
    fixture.componentInstance.container.clear();
    expect(service.active()).toBe(false);
    expect(service.hasActiveOverlay).toBe(false);
    expect(await service.open(async () => OverlayStubComponent)).not.toBeNull();
  });
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
