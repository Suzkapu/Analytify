import {ComponentRef, Injectable, Type, ViewContainerRef, signal} from '@angular/core';

/** A single shell-owned mount point for Design v2 dialogs and sheets. */
@Injectable()
export class DesignV2OverlayService {
  readonly active = signal(false);
  private host?: ViewContainerRef;
  private activeReference?: ComponentRef<unknown>;

  register(host: ViewContainerRef): void {
    this.host = host;
  }

  unregister(host: ViewContainerRef): void {
    if (this.host !== host) return;
    this.close();
    this.host = undefined;
  }

  async open<T>(loader: () => Promise<Type<T>>): Promise<ComponentRef<T> | null> {
    if (!this.host || this.activeReference) return null;
    const component = await loader();
    if (!this.host || this.activeReference) return null;
    const reference = this.host.createComponent(component);
    this.activeReference = reference as ComponentRef<unknown>;
    this.active.set(true);
    const closed = (reference.instance as {closed?: {subscribe: (callback: () => void) => unknown}}).closed;
    closed?.subscribe(() => this.close(reference));
    return reference;
  }

  close(reference?: ComponentRef<unknown>): void {
    if (reference && reference !== this.activeReference) return;
    this.activeReference?.destroy();
    this.activeReference = undefined;
    this.active.set(false);
  }

  get hasActiveOverlay(): boolean {
    return Boolean(this.activeReference);
  }
}
