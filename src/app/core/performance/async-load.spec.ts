import {KeyedSerialTaskQueue, mapWithConcurrency, runAfterNextPaint} from './async-load';

describe('async loading primitives', () => {
  it('runs bounded work concurrently while preserving input order', async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithConcurrency([1, 2, 3, 4], async value => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>(resolve => setTimeout(resolve, (5 - value) * 2));
      active--;
      return value * 10;
    }, 2);

    expect(result).toEqual([10, 20, 30, 40]);
    expect(maxActive).toBe(2);
  });

  it('defers background work instead of running it in the critical turn', () => {
    jasmine.clock().install();
    const task = jasmine.createSpy('task');

    runAfterNextPaint(task, 25);

    expect(task).not.toHaveBeenCalled();
    jasmine.clock().tick(25);
    expect(task).toHaveBeenCalledTimes(1);
    jasmine.clock().uninstall();
  });

  it('serializes writes for one key without blocking independent keys', async () => {
    const queue = new KeyedSerialTaskQueue();
    const releases: Array<() => void> = [];
    const started: string[] = [];
    const task = (label: string) => queue.run('daily-stats', async () => {
      started.push(label);
      await new Promise<void>(resolve => releases.push(resolve));
    });

    const first = task('first');
    const second = task('second');
    const independent = queue.run('other-range', async () => { started.push('independent'); });
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toEqual(['first', 'independent']);
    releases.shift()?.();
    await first;
    expect(started).toEqual(['first', 'independent', 'second']);
    releases.shift()?.();
    await Promise.all([second, independent]);
  });

  it('continues a keyed queue after an earlier write fails', async () => {
    const queue = new KeyedSerialTaskQueue();
    const failed = queue.run('snapshot', async () => { throw new Error('conflict'); });
    const recovered = queue.run('snapshot', async () => 'saved');

    await expectAsync(failed).toBeRejectedWithError('conflict');
    await expectAsync(recovered).toBeResolvedTo('saved');
  });
});
