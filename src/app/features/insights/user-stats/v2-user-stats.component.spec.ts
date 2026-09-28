import {describe, expect, it, vi} from 'vitest';
import {V2UserStatsComponent} from './v2-user-stats.component';

describe('V2UserStatsComponent', () => {
  const createComponent = () => new V2UserStatsComponent(null as any, null as any, null as any, null as any);

  it('exposes the complete v2 period and category navigation', () => {
    const component = createComponent();

    expect(component.rangeTabs.map(tab => tab.id)).toEqual(['short_term', 'medium_term', 'long_term']);
    expect(component.categoryTabs.map(tab => tab.id)).toEqual(['tracks', 'artists', 'genres']);
  });

  it('delegates v2 tab changes to the shared stats controller', () => {
    const component = createComponent();
    const changeCategory = vi.spyOn(component, 'changeCategory');

    component.changeCategoryValue('genres');

    expect(changeCategory).toHaveBeenCalledWith('genres');
  });

  it('delegates native date controls to the shared snapshot behavior', () => {
    const component = createComponent();
    const history = vi.spyOn(component, 'selectHistorySnapshot');
    const compare = vi.spyOn(component, 'selectCompareSnapshot');

    component.selectHistoryValue('current');
    component.selectCompareValue('snapshot-id');

    expect(history).toHaveBeenCalledWith('current', expect.any(Event));
    expect(compare).toHaveBeenCalledWith('snapshot-id', expect.any(Event));
  });
});
