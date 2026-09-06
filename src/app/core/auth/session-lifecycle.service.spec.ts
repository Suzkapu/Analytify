import {TestBed} from '@angular/core/testing';
import {SessionLifecycleService} from './session-lifecycle.service';

describe('SessionLifecycleService', () => {
  it('aborts generation A and waits for its tracked work before generation B proceeds', async () => {
    const lifecycle = TestBed.inject(SessionLifecycleService);
    const generationA = lifecycle.capture();
    let finishA!: () => void;
    const workA = new Promise<void>(resolve => finishA = resolve);
    lifecycle.track(workA, generationA);

    let drained = false;
    const teardown = lifecycle.invalidateAndDrain().then(() => drained = true);
    expect(generationA.signal.aborted).toBeTrue();
    expect(lifecycle.isCurrent(generationA)).toBeFalse();
    expect(drained).toBeFalse();

    const generationB = lifecycle.capture();
    expect(generationB.id).not.toBe(generationA.id);
    expect(lifecycle.isCurrent(generationB)).toBeTrue();
    finishA();
    await teardown;
    expect(drained).toBeTrue();
  });
});
