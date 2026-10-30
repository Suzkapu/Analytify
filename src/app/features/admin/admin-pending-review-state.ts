export type AdminPendingReviewPhase = 'reviewing' | 'blocked' | 'eligible' | 'deleting' | 'review-error' |
  'delete-error' | 'deleted-read-error' | 'deleted-refreshing' | 'reconciling';
export interface AdminPendingReviewView {
  phase: AdminPendingReviewPhase;
  userId: string;
  displayName: string;
  spotifyId: string;
  createdAt: string;
  blockers: string[];
  message: string;
}
