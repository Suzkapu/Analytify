import {Injectable, OnDestroy, computed, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {MobileShortcutId, decodeMobileShortcutPreference, toggleMobileShortcut} from './mobile-shortcut-policy';

interface PreferenceOwner {actor: string; generation: SessionGeneration;}
interface OwnedSelection {owner: PreferenceOwner; value: readonly MobileShortcutId[];}
type PreferenceFeedback = '' | 'loading' | 'refreshing' | 'saving' | 'load-error' | 'save-error';

/** Canonical Navigation688:41515 and persistence feedback999:32270. */
@Injectable({providedIn: 'root'})
export class DesignV2MobileShortcutPreferencesService implements OnDestroy {
  private readonly cache = signal<OwnedSelection | null>(null);
  readonly selection = computed(() => this.cache()?.value ?? null);
  private readonly feedbackState = signal<PreferenceFeedback>('');
  readonly feedback = this.feedbackState.asReadonly();
  readonly loading = computed(() => this.feedback() === 'loading' || this.feedback() === 'refreshing');
  readonly saving = computed(() => this.feedback() === 'saving');
  readonly error = computed(() => this.feedback() === 'load-error' ? 'Navigation preferences could not be loaded'
    : this.feedback() === 'save-error' ? 'Navigation changes could not be saved' : '');
  private readonly limitState = signal('');
  readonly limitMessage = this.limitState.asReadonly();
  private readonly auth = inject(SpotifyAuthService);
  private readonly storage = inject(StorageService);
  private readonly lifecycle = inject(SessionLifecycleService);
  private loadRequest: {owner: PreferenceOwner; promise: Promise<void>} | null = null;
  private failedSave: OwnedSelection | null = null;
  private revision = 0;
  private destroyed = false;

  constructor() {
    this.auth.logout$.pipe(takeUntilDestroyed()).subscribe(() => {this.revision++; this.clear();});
  }

  load(): Promise<void> {
    const cache = this.cache();
    if (cache && this.ownerCurrent(cache.owner)) return Promise.resolve();
    if (this.loadRequest && this.ownerCurrent(this.loadRequest.owner)) return this.loadRequest.promise;
    return this.reload();
  }

  reload(): Promise<void> {
    if (this.destroyed || this.auth.sessionExiting()) return Promise.resolve();
    const actor = this.auth.getUserId();
    if (!actor) {this.revision++; this.clear(); return Promise.resolve();}
    const cache = this.cache();
    if (cache && !this.ownerCurrent(cache.owner)) this.clear();
    if (this.saving()) return Promise.resolve();
    const owner = {actor, generation: this.lifecycle.capture()};
    const revision = ++this.revision;
    this.failedSave = null; this.limitState.set('');
    this.feedbackState.set(this.cache() ? 'refreshing' : 'loading');
    const promise = (async () => {
      try {
        await this.storage.hydrateItems([this.key(owner)], {readFailure: 'reject'});
        if (this.current(owner, revision)) {
          const value = decodeMobileShortcutPreference(this.storage.getItem(this.key(owner)));
          this.cache.set({owner, value}); this.feedbackState.set('');
        }
      } catch {
        if (this.current(owner, revision)) this.feedbackState.set('load-error');
      } finally {
        if (revision === this.revision && !this.ownerCurrent(owner)) this.clear();
      }
    })();
    this.loadRequest = {owner, promise};
    void promise.finally(() => {if (this.loadRequest?.promise === promise) this.loadRequest = null;});
    return promise;
  }

  async toggle(id: string): Promise<void> {
    const cache = this.mutationCache();
    if (!cache) return;
    const result = toggleMobileShortcut(cache.value, id);
    if (result.limitReached) {
      this.limitState.set('Five shortcuts selected. Remove one before adding another.'); return;
    }
    if (result.selection.length === cache.value.length) return;
    await this.save(cache, result.selection);
  }

  async retry(): Promise<void> {
    if (this.destroyed) return;
    const cache = this.mutationCache();
    if (this.loading() || this.saving()) return;
    if (cache && this.failedSave) {
      await this.save(cache, this.failedSave.value);
    } else await this.reload();
  }

  ngOnDestroy(): void {this.destroyed = true; this.revision++; this.clear();}

  private async save(previous: OwnedSelection, value: readonly MobileShortcutId[]): Promise<void> {
    const owner = previous.owner;
    const revision = ++this.revision;
    this.failedSave = null; this.limitState.set('');
    this.cache.set({owner, value}); this.feedbackState.set('saving');
    try {
      await this.storage.setLocalItemDurably(this.key(owner), JSON.stringify(value));
      if (this.current(owner, revision)) this.feedbackState.set('');
    } catch {
      if (this.current(owner, revision)) {
        this.cache.set(previous); this.failedSave = {owner, value}; this.feedbackState.set('save-error');
      }
    } finally {
      if (revision === this.revision && !this.ownerCurrent(owner)) this.clear();
    }
  }

  private mutationCache(): OwnedSelection | null {
    const cache = this.cache();
    if (cache && !this.ownerCurrent(cache.owner)) {this.revision++; this.clear(); return null;}
    if (this.destroyed || this.loading() || this.saving() || this.feedback() === 'load-error') return null;
    return cache;
  }

  private ownerCurrent(owner: PreferenceOwner): boolean {
    return !this.destroyed && !this.auth.sessionExiting() && owner.actor === this.auth.getUserId() && this.lifecycle.isCurrent(owner.generation);
  }

  private current(owner: PreferenceOwner, revision: number): boolean {
    return revision === this.revision && this.ownerCurrent(owner);
  }

  private key(owner: PreferenceOwner): string {return `design-v2:mobile-shortcuts:${owner.actor}`;}

  private clear(): void {
    this.cache.set(null); this.feedbackState.set(''); this.limitState.set('');
    this.failedSave = null; this.loadRequest = null;
  }
}
