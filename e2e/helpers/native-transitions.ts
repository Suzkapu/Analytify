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

/** Observe native promises and callback timing without replacing their returned values. */
export async function observeNativeTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const environment = () => {
      const active = document.activeElement;
      return {visibility: document.visibilityState, focused: active ? {
        tag: active.tagName, role: active.getAttribute('role'), tabIndex: (active as HTMLElement).tabIndex
      } : null};
    };
    type Record = {id: number; startedUrl: string; stage: string; elapsedMs: number; error?: string; callbackError?: string} & ReturnType<typeof environment>;
    const probe = {pending: 0, starts: 0, errors: [] as string[], records: [] as Record[],
      environmentEvents: [] as ({stage: string; atMs: number} & ReturnType<typeof environment>)[]};
    Object.assign(window, {analytifyNativeTransitionProbe: probe});
    for (const event of ['visibilitychange', 'focusin']) document.addEventListener(event, () => {
      // Bound diagnostic metadata; never capture account names, values or invitation URLs.
      if (probe.environmentEvents.length === 256) probe.environmentEvents.shift();
      probe.environmentEvents.push({stage: event, atMs: performance.now(), ...environment()});
    }, {capture: true, passive: true});
    const native = document.startViewTransition?.bind(document);
    if (!native) return;
    document.startViewTransition = (...args: Parameters<typeof native>) => {
      const id = probe.starts + 1, startedUrl = location.pathname.replace(/(\/friends\/invite\/)[^/]+/, '$1:token'), start = performance.now();
      const record = (stage: string, error?: unknown, callbackError?: unknown) => {
        probe.records.push({id, startedUrl, stage, elapsedMs: performance.now() - start, ...environment(),
          ...(error === undefined ? {} : {error: String(error)}),
          ...(callbackError === undefined ? {} : {callbackError: String(callbackError)})});
        if (error !== undefined) probe.errors.push(String(error));
      };
      const wrap = (update: ViewTransitionUpdateCallback): ViewTransitionUpdateCallback => function(this: unknown, ...callbackArgs: Parameters<ViewTransitionUpdateCallback>) {
        record('callback-enter');
        try {
          const result = Reflect.apply(update, this, callbackArgs) as ReturnType<ViewTransitionUpdateCallback>;
          record('callback-returned');
          // Native updateCallbackDone below observes settlement without reading or
          // assimilating a returned thenable a second time. Return its identity unchanged.
          return result;
        } catch (error) {
          record('callback-threw', undefined, error);
          throw error;
        }
      };
      const supplied = args[0];
      if (typeof supplied === 'function') args[0] = wrap(supplied);
      else if (supplied) {
        // Preserve native dictionary read order and getter receivers, including
        // inherited/non-enumerable fields. Read each field only when native does.
        args[0] = new Proxy(Object.create(null) as StartViewTransitionOptions, {get(_target, key) {
          const value: unknown = Reflect.get(supplied, key, supplied);
          return key === 'update' && typeof value === 'function' ? wrap(value as ViewTransitionUpdateCallback) : value;
        }});
      }
      const transition = native(...args);
      probe.starts++;
      probe.pending++;
      void transition.ready.then(() => record('ready'), error => record('ready-rejected', error));
      void transition.updateCallbackDone.then(() => {record('callback-settled'); record('updated');}, error => {
        record('callback-rejected', undefined, error); record('update-rejected', error);
      });
      void transition.finished.then(() => {probe.pending--; record('finished');}, error => {probe.pending--; record('finish-rejected', error);});
      return transition;
    };
  });
}

export async function expectNativeTransitionsSettled(page: Page): Promise<void> {
  try {
    await expect.poll(() => page.evaluate(() => {
      const probe = (window as unknown as {analytifyNativeTransitionProbe: {pending: number; errors: string[]}}).analytifyNativeTransitionProbe;
      return {pending: probe.pending, errors: probe.errors};
    })).toEqual({pending: 0, errors: []});
  } catch (error) {
    try {
      const probe = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
      await test.info().attach('native-transition-failure', {body: JSON.stringify(probe, null, 2), contentType: 'application/json'});
    } catch { /* A closed page or attachment failure must not replace the original assertion. */ }
    throw error;
  }
}

/** Use only when the workflow deliberately starts navigation before the prior animation finishes. */
export async function expectNativeNavigationRecovery(page: Page): Promise<void> {
  await expect.poll(async () => transitionRecovery(await page.evaluate(() =>
    (window as unknown as {analytifyNativeTransitionProbe: TransitionSnapshot}).analytifyNativeTransitionProbe
  ))).toEqual({pending: 0, missingUpdates: 0, missingFinishes: 0, unmatchedErrors: 0, unexpectedErrors: []});
}
