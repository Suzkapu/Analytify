import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, signal} from '@angular/core';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {V2ButtonDirective} from './design-v2-primitives';

export interface SnapshotCalendarCell {
  dateKey: string;
  dayNumber: number;
  optionId: string | null;
  isAvailable: boolean;
  isSelected: boolean;
  isToday: boolean;
  ariaLabel: string;
}
export type SnapshotCalendarState = 'ready' | 'loading' | 'empty' | 'unavailable' | 'refreshing' | 'refresh-failed';

@Component({
  selector: 'v2-snapshot-calendar', standalone: true,
  imports: [AccessibleDialogDirective, V2ButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calendar-overlay" (click)="dismiss.emit()">
      <section class="calendar" role="dialog" aria-modal="true" [attr.aria-labelledby]="headingId"
        appAccessibleDialog (modalEscape)="dismiss.emit()" (click)="$event.stopPropagation()">
        <h2 class="purpose" [id]="headingId">{{ target() === 'ranking' ? 'VIEW SNAPSHOT' : 'COMPARE SNAPSHOT' }}</h2>
        @if (showGrid()) {
          <header class="month"><p [id]="monthId">{{ month() }}</p>
            <button type="button" v2Button="secondary" class="month-action" aria-label="Previous saved month" [disabled]="!enabled() || !canPrevious()" (click)="requestMonth(-1, $event)"><img src="assets/design-v2/calendar-previous.svg" alt=""></button>
            <button type="button" v2Button="secondary" class="month-action" aria-label="Next saved month" [disabled]="!enabled() || !canNext()" (click)="requestMonth(1, $event)"><img src="assets/design-v2/calendar-next.svg" alt=""></button>
          </header>
        }
        <div class="calendar-body">
          @if (state() === 'loading') {
            <div class="initial-loading" role="status" aria-live="polite" aria-busy="true">
              <p class="loading-label"><img class="progress" src="assets/design-v2/calendar-progress.svg" alt=""><strong>Loading saved dates…</strong></p>
              <p>Only dates with saved rankings can be selected.</p>
              <div class="control-skeletons" aria-hidden="true">@for (row of skeletonRows; track row) { <div class="control-skeleton"><span></span><span></span></div> }</div>
            </div>
          } @else if (state() === 'empty') {
            <div class="message" role="status"><strong>No saved dates yet</strong><p>Saved dates will appear here once you have more history.</p></div>
          } @else if (state() === 'unavailable') {
            <div class="message error" role="alert"><strong>Saved dates unavailable</strong><p>We couldn’t load your saved dates. Try again.</p></div>
          }
          @if (state() === 'refreshing') {
            <p class="refresh" role="status" aria-live="polite"><img class="progress" src="assets/design-v2/calendar-progress.svg" alt=""><span>Refreshing saved dates…</span></p>
          } @else if (state() === 'refresh-failed') {
            <div class="message" role="alert"><strong>Saved dates not refreshed</strong><p>You can use saved dates below or retry.</p></div>
          }
          @if (showGrid()) {
            <div class="weekdays" aria-hidden="true">@for (weekday of weekdays; track $index) { <span>{{ weekday }}</span> }</div>
            <div class="weeks" role="grid" [attr.aria-labelledby]="monthId">
              @for (week of weeks(); track $index) {
                <div class="week" role="row">
                  @for (day of week; track $index) {
                    <div class="cell" role="gridcell" [attr.aria-selected]="day?.isSelected ? 'true' : null" [attr.aria-disabled]="!day?.isAvailable || !enabled() ? 'true' : null">
                      @if (day) {
                        @if (day.isAvailable && day.optionId) {
                          <button type="button" class="day" [class.selected]="day.isSelected" [disabled]="!enabled()"
                            [attr.data-date]="day.dateKey" [attr.tabindex]="focusedDate() === day.dateKey ? 0 : -1"
                            [attr.appModalInitialFocus]="focusedDate() === day.dateKey ? '' : null"
                            [attr.aria-label]="day.ariaLabel" [attr.aria-current]="day.isToday ? 'date' : null"
                            (focus)="focusedDate.set(day.dateKey)" (keydown)="onDayKey($event, day)" (click)="requestDate(day, $event)">{{ day.dayNumber }}</button>
                        } @else { <span class="unavailable-day" [attr.aria-label]="day.ariaLabel">{{ day.dayNumber }}</span> }
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
        <footer class="calendar-footer">
          @if (failed()) { <button type="button" class="retry" v2Button="secondary" [disabled]="!enabled()" [attr.appModalInitialFocus]="!focusedDate() ? '' : null" (click)="requestRetry($event)">Retry</button> }
          @else { <p>Saved dates are green.</p> }
          @if (allowToday()) { <button type="button" v2Button="secondary" [disabled]="!enabled()" (click)="requestToday($event)">Today</button> }
          <button type="button" v2Button="secondary" [attr.appModalInitialFocus]="!focusedDate() && !failed() ? '' : null" (click)="dismiss.emit()">Close</button>
        </footer>
      </section>
    </div>
  `,
  styleUrl: './v2-snapshot-calendar.component.scss'
})
export class V2SnapshotCalendarComponent {
  private static nextId = 0;
  readonly headingId = `v2-snapshot-calendar-${++V2SnapshotCalendarComponent.nextId}`;
  readonly monthId = `${this.headingId}-month`;
  readonly state = input<SnapshotCalendarState>('ready');
  readonly target = input<'ranking' | 'comparison'>('ranking');
  readonly days = input<readonly (SnapshotCalendarCell | null)[]>([]);
  readonly month = input('');
  readonly canPrevious = input(false);
  readonly canNext = input(false);
  readonly allowToday = input(false);
  readonly enabled = input(true);
  readonly dateSelected = output<{day: SnapshotCalendarCell; event: Event}>();
  readonly monthChanged = output<{direction: -1 | 1; event: Event}>();
  readonly today = output<Event>();
  readonly retry = output<Event>();
  readonly dismiss = output<void>();
  readonly focusedDate = signal('');
  readonly weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  readonly skeletonRows = [0, 1, 2];
  readonly showGrid = computed(() => ['ready', 'refreshing', 'refresh-failed'].includes(this.state()));
  readonly failed = computed(() => this.state() === 'unavailable' || this.state() === 'refresh-failed');
  readonly weeks = computed(() => {
    const cells = [...this.days()];
    while (cells.length % 7) cells.push(null);
    return Array.from({length: cells.length / 7}, (_, i) => cells.slice(i * 7, i * 7 + 7));
  });
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusRequested = signal(false);
  private readonly fallbackFocusRequested = signal(false);
  private requestedDay: number | null = null;

  constructor() {
    effect(() => {
      const enabled = this.enabled(), failed = this.failed();
      const eligible = this.showGrid() && enabled ? this.days().filter((d): d is SnapshotCalendarCell => !!d?.isAvailable && !!d.optionId) : [];
      const current = this.focusedDate();
      const wasRetryFocused = this.element.nativeElement.contains(document.activeElement)
        && (document.activeElement as HTMLElement)?.classList.contains('retry');
      if (this.requestedDay === null && eligible.some(d => d.dateKey === current)) {
        if (wasRetryFocused && !failed) this.fallbackFocusRequested.set(true);
        return;
      }
      const preferred = this.requestedDay ?? Number(current.slice(-2));
      const selected = eligible.find(d => d.isSelected);
      const closest = preferred ? [...eligible].sort((a, b) => Math.abs(a.dayNumber - preferred) - Math.abs(b.dayNumber - preferred))[0] : undefined;
      const next = (!current && this.requestedDay === null ? selected : undefined) ?? closest ?? eligible[0];
      const wasGridFocused = this.element.nativeElement.contains(document.activeElement) && !!(document.activeElement as HTMLElement)?.dataset?.['date'];
      this.focusedDate.set(next?.dateKey ?? '');
      if (next && (wasGridFocused || this.requestedDay !== null)) this.focusRequested.set(true);
      if (!next && (wasGridFocused || (wasRetryFocused && (!failed || !enabled)))) this.fallbackFocusRequested.set(true);
      this.requestedDay = null;
    });
    afterRenderEffect(() => {
      const date = this.focusedDate();
      if (this.fallbackFocusRequested()) {
        this.element.nativeElement.querySelector<HTMLButtonElement>('.calendar-footer button:last-child')?.focus();
        this.fallbackFocusRequested.set(false);
      }
      if (!this.focusRequested()) return;
      this.element.nativeElement.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)?.focus();
      this.focusRequested.set(false);
    });
  }

  requestDate(day: SnapshotCalendarCell, event: Event): void {
    const live = this.days().find(d => d?.dateKey === day.dateKey && d.optionId === day.optionId);
    if (this.enabled() && this.showGrid() && live?.isAvailable && live.optionId) this.dateSelected.emit({day: live, event});
  }
  requestRetry(event: Event): void { if (this.enabled() && this.failed()) this.retry.emit(event); }
  requestToday(event: Event): void { if (this.enabled() && this.allowToday()) this.today.emit(event); }
  requestMonth(direction: -1 | 1, event: Event): void {
    if (!this.enabled() || !this.showGrid() || !(direction < 0 ? this.canPrevious() : this.canNext())) return;
    this.requestedDay = this.days().find(d => d?.dateKey === this.focusedDate())?.dayNumber ?? null;
    this.monthChanged.emit({direction, event});
  }
  onDayKey(event: KeyboardEvent, day: SnapshotCalendarCell): void {
    const cells = this.days(), index = cells.findIndex(d => d?.dateKey === day.dateKey);
    const moves: Record<string, number> = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7};
    if (!this.enabled() || !this.showGrid() || index < 0) return;
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault(); this.requestMonth(event.key === 'PageUp' ? -1 : 1, event); return;
    }
    let candidates: (SnapshotCalendarCell | null)[] = [];
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); candidates = cells.slice(index - index % 7, index - index % 7 + 7);
      if (event.key === 'End') candidates.reverse();
    } else if (event.key in moves) {
      event.preventDefault(); const destination = index + moves[event.key];
      candidates = moves[event.key] > 0 ? cells.slice(Math.max(0, destination)) : cells.slice(0, Math.max(0, destination + 1)).reverse();
    } else return;
    const next = candidates.find(d => d?.isAvailable && d.optionId);
    if (next) { this.focusedDate.set(next.dateKey); this.focusRequested.set(true); }
  }
}
