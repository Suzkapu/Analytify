import {ComponentFixture, TestBed} from '@angular/core/testing';
import {RouterOutlet} from '@angular/router';
import {describe, expect, it} from 'vitest';
import {DESIGN_VARIANT} from '@core/navigation/design-navigation';
import {DesignV2ShellComponent} from './design-v2-shell.component';

describe('DesignV2ShellComponent', () => {
  it('provides one scoped host for all v2 child routes', async () => {
    await TestBed.configureTestingModule({
      declarations: [DesignV2ShellComponent],
      imports: [RouterOutlet],
      providers: [{provide: DESIGN_VARIANT, useValue: 'new'}]
    }).compileComponents();
    const fixture: ComponentFixture<DesignV2ShellComponent> = TestBed.createComponent(DesignV2ShellComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.designVariant).toBe('new');
    expect(fixture.nativeElement.querySelector('[data-design-variant="new"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('router-outlet').length).toBe(1);
  });
});
