import {describe, expect, it, vi} from 'vitest';
import {CompareRoomCallbackComponent} from './compare-room-callback.component';

describe('CompareRoomCallbackComponent', () => {
  it('returns to the exact v2 join route saved before Spotify authorization', async () => {
    const returnUrl = '/new/compare-room/join/room-1#invitation=invite&secret=secret';
    const router = {navigateByUrl: vi.fn().mockResolvedValue(true)};
    const auth = {handleCallback: vi.fn().mockResolvedValue(returnUrl)};
    const route = {snapshot: {queryParamMap: {get: (key: string) => ({code: 'code', state: 'state'} as any)[key]}}};
    const component = new CompareRoomCallbackComponent(route as any, router as any, auth as any);

    await component.ngOnInit();

    expect(auth.handleCallback).toHaveBeenCalledWith('code', 'state');
    expect(router.navigateByUrl).toHaveBeenCalledWith(returnUrl);
  });

  it('keeps an incomplete callback on an actionable error state', async () => {
    const route = {snapshot: {queryParamMap: {get: () => null}}};
    const component = new CompareRoomCallbackComponent(route as any, {} as any, {} as any);

    await component.ngOnInit();

    expect(component.errorMessage).toContain('complete authorization response');
  });
});
