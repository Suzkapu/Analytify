import {CommonModule} from '@angular/common';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {StatsRequestClaimComponent} from './stats-request-claim.component';

describe('StatsRequestClaimComponent', () => {
  let fixture: ComponentFixture<StatsRequestClaimComponent>;
  let component: StatsRequestClaimComponent;
  let statsSharing: jasmine.SpyObj<StatsSharingService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    statsSharing = jasmine.createSpyObj<StatsSharingService>('StatsSharingService', ['claimAccessInvite']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    statsSharing.claimAccessInvite.and.resolveTo('request-id');
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      declarations: [StatsRequestClaimComponent],
      imports: [CommonModule],
      providers: [
        {provide: StatsSharingService, useValue: statsSharing},
        {provide: Router, useValue: router},
        {provide: ActivatedRoute, useValue: {snapshot: {paramMap: {get: () => 'private-token'}}}}
      ]
    });
    fixture = TestBed.createComponent(StatsRequestClaimComponent);
    component = fixture.componentInstance;
  });

  it('claims the link and routes to the existing accept-or-decline popup', async () => {
    await component.ngOnInit();

    expect(statsSharing.claimAccessInvite).toHaveBeenCalledOnceWith('private-token');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/shared-playlists'], {replaceUrl: true});
  });

  it('keeps an invalid link on a helpful error screen', async () => {
    statsSharing.claimAccessInvite.and.rejectWith(new Error('This stats request link has expired.'));

    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.isOpening).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('This stats request link has expired.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
