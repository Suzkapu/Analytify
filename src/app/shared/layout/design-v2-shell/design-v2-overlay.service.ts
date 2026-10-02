import {ComponentRef, Injectable, Type, ViewContainerRef, signal} from '@angular/core';

/** A single shell-owned mount point for Design v2 dialogs and sheets. */
@Injectable()
export class DesignV2OverlayService {
  readonly active = signal(false);
  private host?: ViewContainerRef;
  private activeReference?: ComponentRef<unknown>;
  private pending = false;
  private generation = 0;
  private closedSubscription?: {unsubscribe(): void};

  register(host: ViewContainerRef): void {
    if (this.host === host) return;
    this.close();
    this.host = host;
  }

  unregister(host: ViewContainerRef): void {
    if (this.host !== host) return;
    this.close();
    this.host = undefined;
  }

  async open<T>(loader: () => Promise<Type<T>>): Promise<ComponentRef<T> | null> {
    const host = this.host;
    if (!host || this.activeReference || this.pending) return null;
    const generation = ++this.generation;
    this.pending = true;
    try {
      const component = await loader();
      if (this.host !== host || generation !== this.generation) return null;
      const reference = host.createComponent(component);
      this.activeReference = reference as ComponentRef<unknown>;
      this.active.set(true);
      const closed = (reference.instance as {closed?: {subscribe: (callback: () => void) => {unsubscribe(): void}}}).closed;
      this.closedSubscription = closed?.subscribe(() => this.close(reference));
      reference.onDestroy(() => {
        if (this.activeReference !== reference) return;
        this.closedSubscription?.unsubscribe();
        this.closedSubscription = undefined;
        this.activeReference = undefined;
        this.active.set(false);
      });
      return reference;
    } finally {
      if (generation === this.generation) this.pending = false;
    }
  }

  close(reference?: ComponentRef<unknown>): void {
    if (reference && reference !== this.activeReference) return;
    ++this.generation;
    this.pending = false;
    const activeReference = this.activeReference;
    this.activeReference = undefined;
    this.closedSubscription?.unsubscribe();
    this.closedSubscription = undefined;
    this.active.set(false);
    activeReference?.destroy();
  }

  get hasActiveOverlay(): boolean {
    return Boolean(this.activeReference);
  }
}
