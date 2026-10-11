import {expect, Page} from '@playwright/test';

/** Observe native promises without changing callbacks, animations or return values. */
export async function observeNativeTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = {pending: 0, starts: 0, errors: [] as string[]};
    Object.assign(window, {analytifyNativeTransitionProbe: probe});
    const native = document.startViewTransition?.bind(document);
    if (!native) return;
    document.startViewTransition = (...args: Parameters<typeof native>) => {
      const transition = native(...args);
      probe.starts++;
      probe.pending++;
      const capture = (error: unknown) => {probe.errors.push(String(error));};
      void transition.ready.catch(capture);
      void transition.updateCallbackDone.catch(capture);
      void transition.finished.then(() => {probe.pending--;}, error => {probe.pending--; capture(error);});
      return transition;
    };
  });
}

export async function expectNativeTransitionsSettled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const probe = (window as Window & {analytifyNativeTransitionProbe: {pending: number; errors: string[]}}).analytifyNativeTransitionProbe;
    return {pending: probe.pending, errors: probe.errors};
  })).toEqual({pending: 0, errors: []});
}
