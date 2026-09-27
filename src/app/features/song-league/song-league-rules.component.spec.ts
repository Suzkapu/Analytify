import {ComponentFixture, TestBed} from '@angular/core/testing';
import {describe, expect, it, beforeEach} from 'vitest';
import {SharedModule} from '@shared/shared.module';
import {SongLeagueRulesComponent} from './song-league-rules.component';

describe('SongLeagueRulesComponent', () => {
  let fixture: ComponentFixture<SongLeagueRulesComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [SharedModule], declarations: [SongLeagueRulesComponent]});
    fixture = TestBed.createComponent(SongLeagueRulesComponent);
    fixture.detectChanges();
  });

  it('keeps rules behind an accessible disclosure and closes them again', () => {
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    component.open();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')?.textContent).toContain('How Song League works');
    component.close();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
});
