import {expect, test, type Page} from '@playwright/test';

interface TransitionRecord {id: number; stage: string; error?: string;}
interface TransitionSnapshot {pending: number; starts: number; errors: string[]; records: TransitionRecord[];}

/** A superseded animation must still complete its DOM callback and finished promise. */
export function transitionRecovery(snapshot: TransitionSnapshot) {
  const failed = snapshot.records.filter(record => record.error !== undefined);
  return {
    pending: snapshot.pending,
    missingUpdates: snapshot.starts - snapshot.records.filter(record => record.stage === 'updated').length,
    missingFinishes: snapshot.starts - snapshot.records.filter(record => record.stage === 'finished').length,
    unmatchedErrors: snapshot.errors.length - failed.length,
    unexpectedErrors: failed.filter(record => !(record.stage === 'ready-rejected' && record.id < snapshot.starts
      && record.error === 'AbortError: Transition was skipped. New ViewTransition started')).map(record => record.error)
  };
}

/** Observe native promises without changing callbacks, animations or return values. */
export async function observeNativeTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = {pending: 0, starts: 0, errors: [] as string[], records: [] as {id: number; startedUrl: string; stage: string; elapsedMs: number; error?: string}[]};
    Object.assign(window, {analytifyNativeTransitionProbe: probe});
    const native = document.startViewTransition?.bind(document);
    if (!native) return;
    document.startViewTransition = (...args: Parameters<typeof native>) => {
      const transition = native(...args);
      probe.starts++;
      probe.pending++;
      const id = probe.starts, startedUrl = location.pathname, start = performance.now();
      const record = (stage: string, error?: unknown) => {
        probe.records.push({id, startedUrl, stage, elapsedMs: performance.now() - start, ...(error === undefined ? {} : {error: String(error)})});
        if (error !== undefined) probe.errors.push(String(error));
      };
      void transition.ready.then(() => record('ready'), error => record('ready-rejected', error));
      void transition.updateCallbackDone.then(() => record('updated'), error => record('update-rejected', error));
      void transition.finished.then(() => {probe.pending--; record('finished');}, error => {probe.pending--; record('finish-rejected', error);});
      return transition;
    };
  });
}

export async function expectNativeTransitionsSettled(page: Page): Promise<void> {
  try {
    await expect.poll(() => page.evaluate(() => {
      const probe = (window as Window & {analytifyNativeTransitionProbe: {pending: number; errors: string[]}}).analytifyNativeTransitionProbe;
      return {pending: probe.pending, errors: probe.errors};
    })).toEqual({pending: 0, errors: []});
  } catch (error) {
    const probe = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
    await test.info().attach('native-transition-failure', {body: JSON.stringify(probe, null, 2), contentType: 'application/json'});
    throw error;
  }
}

/** Use only when the workflow deliberately starts navigation before the prior animation finishes. */
export async function expectNativeNavigationRecovery(page: Page): Promise<void> {
  await expect.poll(async () => transitionRecovery(await page.evaluate(() =>
    (window as unknown as {analytifyNativeTransitionProbe: TransitionSnapshot}).analytifyNativeTransitionProbe
  ))).toEqual({pending: 0, missingUpdates: 0, missingFinishes: 0, unmatchedErrors: 0, unexpectedErrors: []});
}
