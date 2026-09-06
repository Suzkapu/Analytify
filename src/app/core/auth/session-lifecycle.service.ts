import {Injectable} from '@angular/core';

export interface SessionGeneration {
  readonly id: number;
  readonly signal: AbortSignal;
}

@Injectable({providedIn: 'root'})
export class SessionLifecycleService {
  private generationId = 1;
  private controller = new AbortController();
  private readonly pending = new Map<number, Set<Promise<unknown>>>();

  capture(): SessionGeneration {
    return {id: this.generationId, signal: this.controller.signal};
  }

  isCurrent(generation: SessionGeneration): boolean {
    return generation.id === this.generationId && !generation.signal.aborted;
  }

  track<T>(promise: Promise<T>, generation = this.capture()): Promise<T> {
    const tasks = this.pending.get(generation.id) || new Set<Promise<unknown>>();
    this.pending.set(generation.id, tasks);
    tasks.add(promise);
    void promise.finally(() => {
      tasks.delete(promise);
      if (tasks.size === 0) this.pending.delete(generation.id);
    }).catch(() => {});
    return promise;
  }

  async invalidateAndDrain(): Promise<void> {
    const previousId = this.generationId;
    const previousTasks = [...(this.pending.get(previousId) || [])];
    this.controller.abort(new DOMException('Session ended.', 'AbortError'));
    this.generationId += 1;
    this.controller = new AbortController();
    await Promise.allSettled(previousTasks);
    this.pending.delete(previousId);
  }

  async drainCurrent(): Promise<void> {
    while (this.pending.get(this.generationId)?.size) {
      await Promise.allSettled([...(this.pending.get(this.generationId) || [])]);
    }
  }
}
