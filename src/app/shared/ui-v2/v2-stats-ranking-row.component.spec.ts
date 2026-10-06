import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {V2StatsRankingRowComponent} from './v2-stats-ranking-row.component';

describe('canonical Stats ranking row', () => {
  it('refreshes row identity and permissions without retaining old action labels or dispatching disabled handoffs', () => {
    const fixture=TestBed.createComponent(V2StatsRankingRowComponent);
    const spotify=vi.fn(),history=vi.fn();
    fixture.componentInstance.spotifyRequested.subscribe(spotify);
    fixture.componentInstance.historyRequested.subscribe(history);
    for(const [name,value] of Object.entries({name:'Previous song',rank:50,imageUrl:'previous-cover.png',
      supporting:'Previous artist',movement:'↑15',flameKind:'hot',spotifyAvailable:true})) fixture.componentRef.setInput(name,value);
    fixture.detectChanges();
    const element=fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('.artwork')!.click();
    expect(spotify).toHaveBeenCalledTimes(1);

    for(const [name,value] of Object.entries({kind:'artists',name:'Current artist',rank:1000,imageUrl:'current-photo.png',
      supporting:'',movement:'',flameKind:null,spotifyAvailable:false,historyAvailable:false})) fixture.componentRef.setInput(name,value);
    fixture.detectChanges();
    expect(element.querySelector('.rank')?.getAttribute('aria-label')).toBe('Rank 1000');
    expect(element.querySelector('strong')?.textContent).toBe('Current artist');
    expect(element.textContent).not.toMatch(/Previous|places|History/);
    expect(element.querySelector('svg, .history')).toBeNull();
    const artwork=element.querySelector<HTMLButtonElement>('.artwork')!;
    expect(artwork.getAttribute('aria-label')).toBe('Open Current artist on Spotify');
    expect(artwork.querySelector('img')?.getAttribute('src')).toBe('current-photo.png');
    expect(artwork.querySelector('img')?.getAttribute('alt')).toBe('Current artist photo');
    artwork.click();expect(spotify).toHaveBeenCalledTimes(1);expect(history).not.toHaveBeenCalled();

    fixture.componentRef.setInput('spotifyAvailable',true);
    fixture.componentRef.setInput('historyAvailable',true);
    fixture.detectChanges();
    const historyAction=element.querySelector<HTMLButtonElement>('.history')!;
    expect(historyAction.getAttribute('aria-label')).toBe('View position history for Current artist');
    artwork.click();historyAction.click();
    expect(spotify).toHaveBeenCalledTimes(2);expect(history).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('keeps original rank and movement readable and emits independent owner actions', () => {
    const fixture=TestBed.createComponent(V2StatsRankingRowComponent);
    for(const [name,value] of Object.entries({name:'Paper Planes',rank:2,imageUrl:'data:image/png;base64,AA==',
      supporting:'Luma',movement:'↑15',flameKind:'hot',spotifyAvailable:true})) fixture.componentRef.setInput(name,value);
    const spotify=vi.fn(),history=vi.fn();
    fixture.componentInstance.spotifyRequested.subscribe(spotify);
    fixture.componentInstance.historyRequested.subscribe(history);
    fixture.detectChanges();
    const element=fixture.nativeElement as HTMLElement;
    expect(element.querySelector('strong')?.textContent).toBe('Paper Planes');
    expect(element.querySelector('.copy span')?.textContent).toBe('Luma');
    expect(element.querySelector('.rank')?.getAttribute('aria-label')).toBe('Rank 2. ↑ 15 places');
    expect(element.querySelector('.rank-number')?.textContent).toBe('2');
    expect(element.querySelector('.rank-movement')?.textContent).toBe('↑ 15');
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Hot mover');
    const artwork=element.querySelector<HTMLButtonElement>('.artwork')!;
    expect(artwork.getAttribute('aria-label')).toBe('Open Paper Planes on Spotify');
    expect(artwork.querySelector('img')?.getAttribute('alt')).toBe('Paper Planes cover');
    artwork.click();expect(spotify).toHaveBeenCalledOnce();expect(history).not.toHaveBeenCalled();
    element.querySelector<HTMLButtonElement>('.history')!.click();
    expect(history).toHaveBeenCalledOnce();expect(spotify).toHaveBeenCalledOnce();
    expect(element.querySelector('button button, button a, [role="button"]')).toBeNull();
    fixture.destroy();
  });

  it('removes private History and stale badges when a row becomes shared and prevents missing-URL handoffs', () => {
    const fixture=TestBed.createComponent(V2StatsRankingRowComponent);
    for(const [name,value] of Object.entries({kind:'artists',name:'Neon Coast',rank:1,imageUrl:'data:image/png;base64,AA==',
      movement:'NEW',flameKind:'debut',spotifyAvailable:true})) fixture.componentRef.setInput(name,value);
    const spotify=vi.fn();fixture.componentInstance.spotifyRequested.subscribe(spotify);
    fixture.detectChanges();
    const element=fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.rank')?.getAttribute('aria-label')).toBe('Rank 1. New');
    expect(element.querySelector('.rank-movement')?.textContent).toBe('✦');
    expect(element.querySelector('img')?.getAttribute('alt')).toBe('Neon Coast photo');
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Top 10 debut');
    expect(element.querySelector('.history')?.getAttribute('aria-label')).toBe('View position history for Neon Coast');
    fixture.componentRef.setInput('historyAvailable',false);
    fixture.componentRef.setInput('spotifyAvailable',false);
    fixture.componentRef.setInput('flameKind',null);
    fixture.componentRef.setInput('movement','—');
    fixture.detectChanges();
    expect(element.querySelector('.history, svg')).toBeNull();
    expect(element.querySelector('.rank')?.getAttribute('aria-label')).toBe('Rank 1. Unchanged');
    expect(element.querySelector('.rank-movement')?.textContent).toBe('—');
    const artwork=element.querySelector<HTMLButtonElement>('.artwork')!;
    expect(artwork.disabled).toBe(true);artwork.click();expect(spotify).not.toHaveBeenCalled();
    expect(element.getAttribute('tabindex')).toBeNull();
    expect(element.getAttribute('role')).toBeNull();
    fixture.destroy();
  });

  it('reads singular/plural downward movement and clears absent movement without retaining an old caption', () => {
    const fixture=TestBed.createComponent(V2StatsRankingRowComponent);
    for(const [name,value] of Object.entries({name:'Atlas North',rank:3,imageUrl:'data:image/png;base64,AA=='})) fixture.componentRef.setInput(name,value);
    const element=fixture.nativeElement as HTMLElement;
    for(const [movement,caption,symbol] of [['↓1','↓ 1 place','↓ 1'],['↓2','↓ 2 places','↓ 2'],['Pending comparison','Pending comparison','Pending comparison'],['','','']]) {
      fixture.componentRef.setInput('movement',movement);fixture.detectChanges();
      expect(element.querySelector('.rank')?.getAttribute('aria-label')).toBe('Rank 3'+(caption?'. '+caption:''));
      expect(element.querySelector('.rank-movement')?.textContent ?? '').toBe(symbol);
      expect(element.querySelector('.copy span')).toBeNull();
      expect(element.querySelector('strong')?.textContent).toBe('Atlas North');
    }
    fixture.destroy();
  });
});
