import {mapWithConcurrency, runAfterNextPaint} from './async-load';

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
});
