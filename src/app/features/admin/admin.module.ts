import {NgModule} from '@angular/core';
import {RouterModule} from '@angular/router';

import {SharedModule} from '@shared/shared.module';
import {AdminComponent} from './admin.component';
import {AdminPolicyEditorComponent} from './admin-policy-editor.component';
import {AdminRunRecordComponent} from './admin-run-record.component';
import {AdminRunFeedbackComponent} from './admin-run-feedback.component';
import {AdminUserCardComponent} from './admin-user-card.component';
import {AdminPendingReviewDialogComponent} from './admin-pending-review-dialog.component';

@NgModule({
  declarations: [AdminComponent],
  imports: [
    SharedModule,
    AdminPolicyEditorComponent,
    AdminRunRecordComponent, AdminRunFeedbackComponent, AdminUserCardComponent, AdminPendingReviewDialogComponent,
    RouterModule.forChild([{path: '', component: AdminComponent}])
  ]
})
export class AdminModule {}
