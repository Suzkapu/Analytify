import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {StatsShareClaimComponent} from './stats-share-claim.component';
import {NO_ERRORS_SCHEMA} from '@angular/core';
import {describe, expect, it, beforeEach, vi} from 'vitest';

describe('StatsShareClaimComponent', () => {
  let fixture: ComponentFixture<StatsShareClaimComponent>;
  let component: StatsShareClaimComponent;
  const sharing = {
    previewAccessInvite: vi.fn(),
    acceptShareInvite: vi.fn(),
    declineShareInvite: vi.fn()
  };
  const router = {navigate: vi.fn()};

  beforeEach(() => {
    vi.clearAllMocks();
    sharing.previewAccessInvite.mockResolvedValue({kind: 'share', displayName: 'Owner', imageUrl: '', expiresAt: 'later'});
    sharing.acceptShareInvite.mockResolvedValue('request-id');
    sharing.declineShareInvite.mockResolvedValue(undefined);
    router.navigate.mockResolvedValue(true);
    TestBed.configureTestingModule({
      declarations: [StatsShareClaimComponent],
      providers: [
        {provide: StatsSharingService, useValue: sharing},
        {provide: ActivatedRoute, useValue: {snapshot: {paramMap: {get: () => 'private-token'}}}},
        {provide: Router, useValue: router}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(StatsShareClaimComponent);
    component = fixture.componentInstance;
  });

  it('previews the owner and grants access only after acceptance', async () => {
    await component.ngOnInit();
    expect(sharing.previewAccessInvite).toHaveBeenCalledWith('private-token');
    expect(component.preview?.displayName).toBe('Owner');

    await component.respond(true);
    expect(sharing.acceptShareInvite).toHaveBeenCalledWith('private-token');
    expect(router.navigate).toHaveBeenCalledWith(['/shared-playlists'], {replaceUrl: true});
  });

  it('consumes a declined share without granting access', async () => {
    await component.ngOnInit();
    await component.respond(false);
    expect(sharing.declineShareInvite).toHaveBeenCalledWith('private-token');
    expect(sharing.acceptShareInvite).not.toHaveBeenCalled();
  });
});
