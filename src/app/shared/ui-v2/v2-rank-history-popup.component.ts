import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {V2ButtonDirective} from './design-v2-primitives';
import {RankHistoryCategory, RankHistoryPosition, V2RankHistoryPlotComponent} from './v2-rank-history-plot.component';

/** Canonical Figma347:18014/744:24882: one responsive owner-history dialog. */
@Component({
  selector: 'v2-rank-history-popup', standalone: true,
  imports: [DatePipe, AccessibleDialogDirective, V2ButtonDirective, V2RankHistoryPlotComponent],
  template: `
    <div class="history-overlay" (click)="dismiss.emit()">
      <section class="history-dialog" role="dialog" aria-modal="true" [attr.aria-labelledby]="headingId"
        appAccessibleDialog (modalEscape)="dismiss.emit()" (click)="$event.stopPropagation()">
        <div class="history-body">
          <header class="history-header"><span class="entity-badge">
            @if (category() === 'tracks') { <img src="assets/design-v2/history-song.svg" alt="" /> }
            @else { <i [class]="entityIcon()" aria-hidden="true"></i> }
          </span>
            <div><h2 [id]="headingId">{{ title() }}<span class="visually-hidden"> position history</span></h2><p>{{ categoryLabel() }}</p></div>
          </header>
          <hr>
          <h3 class="history-heading"><i class="pi pi-chart-bar" aria-hidden="true"></i> Rank Position History</h3>
          @if (busy() && !validPoints().length && !retrying()) {
            <div class="history-feedback"><div class="initial-loading" role="status" aria-live="polite">
              <p class="loading-title"><img src="assets/design-v2/history-progress.svg" alt="" class="progress-icon">Loading position history…</p>
              <p>Fetching saved positions.</p><div class="chart-skeleton" aria-hidden="true"></div>
            </div></div>
          } @else {
            @if (failed() || busy()) {
              <div class="history-feedback" [attr.role]="busy() ? 'status' : 'alert'">
                <p class="feedback-title" [class.is-warning]="validPoints().length > 0" [class.is-error]="failed() && !busy() && !validPoints().length">
                  {{ busy() ? (validPoints().length ? 'Refreshing saved history…' : 'Retrying saved history…') : (validPoints().length ? 'Showing local positions' : 'History unavailable') }}
                </p>
                <p>{{ busy() ? (validPoints().length ? 'Available local positions stay visible while cloud history is retried.' : 'Checking the cloud again. You can close this window while history loads.') : (validPoints().length ? 'Cloud history could not be loaded. Available local positions remain visible below.' : 'Saved positions could not be loaded. Try again; your Stats view stays open.') }}</p>
                <button class="retry-button" type="button" v2Button="secondary" [loading]="busy()" (click)="retry.emit()">
                  @if (busy()) { <img src="assets/design-v2/history-retry-progress.svg" alt="" class="progress-icon"> }
                  {{ busy() ? 'Retrying…' : 'Retry history' }}
                </button>
              </div>
            }
            @if (validPoints().length >= 2) {
              @for (key of [context()]; track key) { <v2-rank-history-plot [points]="validPoints()" [category]="category()" /> }
              <button class="table-toggle" type="button" v2Button="secondary" [attr.aria-expanded]="showTable()"
                [attr.aria-controls]="tableId" (click)="showTable.set(!showTable())">{{ showTable() ? 'Hide saved positions' : 'View saved positions' }}</button>
              @if (showTable()) {
                <div class="positions-table" [id]="tableId"><table aria-label="Saved ranking positions"><thead><tr><th scope="col">Saved date</th><th scope="col">Position</th></tr></thead>
                  <tbody>@for (point of validPoints(); track point.timestamp) { <tr><td><time [attr.datetime]="point.timestamp | date:'yyyy-MM-dd'" [attr.aria-label]="point.timestamp | date:'d MMM yyyy'">{{ point.timestamp | date:'d MMM' }}</time></td><td>#{{ point.rank }}</td></tr> }</tbody>
                </table></div>
              }
            } @else if (validPoints().length === 1) {
              <div class="history-feedback"><p class="feedback-title">One saved position</p><p>A chart needs at least two saved positions. Your available position is shown below.</p>
                <p class="feedback-title"><time [attr.datetime]="validPoints()[0].timestamp | date:'yyyy-MM-dd'" [attr.aria-label]="validPoints()[0].timestamp | date:'d MMM yyyy'">{{ validPoints()[0].timestamp | date:'d MMM' }}</time> · #{{ validPoints()[0].rank }}</p>
              </div>
            } @else if (!busy() && !failed()) {
              <div class="history-feedback"><p class="feedback-title">No saved positions yet</p><p>History is recorded once daily when you visit your personal Stats. Try another period or ranking date.</p></div>
            }
          }
        </div>
        <button appModalInitialFocus class="close-button" type="button" v2Button="secondary" (click)="dismiss.emit()"><i class="pi pi-times" aria-hidden="true"></i> Close</button>
      </section>
    </div>
  `,
  styleUrl: './v2-rank-history-popup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2RankHistoryPopupComponent {
  private static nextId = 0;
  readonly headingId = `v2-rank-history-title-${++V2RankHistoryPopupComponent.nextId}`;
  readonly tableId = `${this.headingId}-positions`;
  readonly title = input.required<string>();
  readonly context = input('');
  readonly category = input<RankHistoryCategory>('tracks');
  readonly points = input<readonly RankHistoryPosition[]>([]);
  readonly busy = input(false);
  readonly failed = input(false);
  readonly retrying = input(false);
  readonly retry = output<void>();
  readonly dismiss = output<void>();
  readonly showTable = signal(false);
  readonly categoryLabel = computed(() => this.category() === 'tracks' ? 'Top Song' : this.category() === 'artists' ? 'Top Artist' : 'Top Genre');
  readonly entityIcon = computed(() => 'pi ' + (this.category() === 'artists' ? 'pi-user' : 'pi-chart-bar'));
  readonly validPoints = computed(() => {
    const limit = this.category() === 'tracks' ? 100 : this.category() === 'artists' ? 50 : 15;
    return this.points().filter(point => Number.isFinite(new Date(point.timestamp).getTime()) &&
      Number.isInteger(point.rank) && point.rank >= 1 && point.rank <= limit);
  });
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly closeFocusRequested = signal(false);
  private previousContext: string | null = null;
  constructor() {
    effect(() => {this.context(); this.showTable.set(false);});
    effect(() => {
      const context = this.context(), count = this.validPoints().length;
      const retryVisible = (this.failed() || this.busy()) && !(this.busy() && !count && !this.retrying());
      const active = document.activeElement as HTMLElement | null;
      if (active && this.element.nativeElement.contains(active)) {
        const plotRemoved = active.getAttribute('role') === 'slider' && (count < 2 || context !== this.previousContext);
        const disclosureRemoved = active.classList.contains('table-toggle') && count < 2;
        const retryRemoved = active.classList.contains('retry-button') && (!retryVisible || this.busy());
        if (plotRemoved || disclosureRemoved || retryRemoved) this.closeFocusRequested.set(true);
      }
      this.previousContext = context;
    });
    afterRenderEffect(() => {
      if (!this.closeFocusRequested()) return;
      this.element.nativeElement.querySelector<HTMLButtonElement>('.close-button')?.focus();
      this.closeFocusRequested.set(false);
    });
  }
}
