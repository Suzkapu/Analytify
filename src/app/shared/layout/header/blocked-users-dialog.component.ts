import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output} from '@angular/core';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {BlockedStatsUser} from '@core/sharing/stats-sharing.models';
import {SharedModule} from '../../shared.module';

@Component({
  selector: 'app-blocked-users-dialog',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './blocked-users-dialog.component.html',
  styleUrl: './blocked-users-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockedUsersDialogComponent implements OnInit {
  @Output() readonly closed = new EventEmitter<void>();

  blockedUsers: BlockedStatsUser[] = [];
  unblockCandidate: BlockedStatsUser | null = null;
  isLoading = true;
  isUnblocking = false;
  error = '';

  constructor(
    private readonly statsSharing: StatsSharingService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.blockedUsers = await this.statsSharing.listBlockedUsers();
    } catch (error) {
      this.error = (error as {message?: string})?.message || 'Blocked users could not be loaded.';
    } finally {
      this.isLoading = false;
      this.changeDetector.markForCheck();
    }
  }

  close(): void {
    if (!this.isUnblocking) this.closed.emit();
  }

  async confirmUnblock(): Promise<void> {
    if (!this.unblockCandidate || this.isUnblocking) return;
    const user = this.unblockCandidate;
    this.isUnblocking = true;
    this.error = '';
    try {
      await this.statsSharing.unblockUser(user.userId);
      this.blockedUsers = this.blockedUsers.filter(item => item.userId !== user.userId);
      this.unblockCandidate = null;
    } catch (error) {
      this.error = (error as {message?: string})?.message || 'This user could not be unblocked.';
    } finally {
      this.isUnblocking = false;
      this.changeDetector.markForCheck();
    }
  }
}
