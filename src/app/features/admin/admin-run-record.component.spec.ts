import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {AdminSyncRun} from '@core/admin/admin.models';
import {AdminRunRecordComponent} from './admin-run-record.component';

const baseline: AdminSyncRun = {
  id: 'synthetic-run', userId: 'synthetic-user', displayName: 'Synthetic listener',
  taskKey: 'listening_history', status: 'succeeded', triggerType: 'manual',
  requestedAt: '2026-10-26T10:00:00Z', startedAt: '2026-10-26T10:00:01Z',
  finishedAt: '2026-10-26T10:00:09Z', error: null, details: {}
};

async function mount(changes: Partial<AdminSyncRun> = {}) {
  await TestBed.configureTestingModule({imports: [AdminRunRecordComponent]}).compileComponents();
  const fixture = TestBed.createComponent(AdminRunRecordComponent);
  fixture.componentRef.setInput('run', {...baseline, ...changes});
  fixture.componentRef.setInput('label', 'Listening history');
  fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  return {fixture, page, text: () => page.textContent?.replace(/\s+/g, ' ').trim() ?? ''};
}

describe('administration run audit record', () => {
  it.each(['2026-99-24T08:00:00Z', '2026-10-00T08:00:00Z', '2026-10-24T08:00:00+99:99', '2026-10-24T24:00:00Z'])(
    'does not display an invalid calendar, time or offset value %s', async value => {
      const {page, text} = await mount({requestedAt: value, startedAt: value, finishedAt: value});
      expect(page.querySelectorAll('time')).toHaveLength(0);
      expect(text()).toContain('No duration available');
      expect(text()).not.toContain('Invalid Date');
    });

  it('does not claim a finished time for an incomplete success record', async () => {
    const {page, text} = await mount({finishedAt: null});
    expect(page.querySelectorAll('time')).toHaveLength(2);
    expect(text()).toContain('No finished time · No duration available');
    expect(text()).not.toContain('In progress');
  });
  it('renders offset timestamps in explicit UTC while retaining the exact machine-readable source', async () => {
    const source = '2026-10-26T12:00:01+02:00';
    const {page, text} = await mount({requestedAt: source, startedAt: source,
      finishedAt: '2026-10-26T12:00:09+02:00'});
    const times = [...page.querySelectorAll('time')];
    expect(times[0].getAttribute('datetime')).toBe(source);
    expect(times[1].getAttribute('datetime')).toBe(source);
    expect(times[0].textContent).toContain('10:00 UTC');
    expect(times[1].textContent).toContain('10:00:01 UTC');
    expect(times[2].textContent).toContain('10:00:09 UTC');
    expect(text()).toContain('8s');
  });

  it('preserves subsecond elapsed durations rather than rounding them away', async () => {
    const {text} = await mount({startedAt: '2026-10-26T10:00:01.000Z',
      finishedAt: '2026-10-26T10:00:01.250Z'});
    expect(text()).toContain('0.25s');
    expect(text()).not.toContain('No duration available');
  });

  it('retains repeated warning events without losing either occurrence', async () => {
    const warning = 'A partial Spotify page was returned';
    const {page} = await mount({details: {warnings: [warning, warning]}});
    expect([...page.querySelectorAll('p')].filter(paragraph => paragraph.textContent === warning)).toHaveLength(2);
  });

  it('handles a legacy null details payload without inventing warnings', async () => {
    const {text} = await mount({details: null as unknown as AdminSyncRun['details']});
    expect(text()).toContain('Succeeded');
    expect(text()).not.toContain('Succeeded · Warning');
  });

  it('rejects bare year values instead of treating them as ISO audit timestamps', async () => {
    const {page, text} = await mount({requestedAt: '2026', startedAt: '2026', finishedAt: '2026'});
    expect(page.querySelectorAll('time')).toHaveLength(0);
    expect(text()).toContain('No duration available');
    expect(text()).not.toContain('0s');
  });

  it('rejects impossible calendar dates instead of displaying a normalized fabricated date', async () => {
    const impossible = '2026-02-30T10:00:00Z';
    const {page, text} = await mount({requestedAt: impossible, startedAt: impossible, finishedAt: impossible});
    expect(page.querySelectorAll('time')).toHaveLength(0);
    expect(text()).toContain('No duration available');
    expect(text()).not.toContain('2 Mar');
  });

  it.each(['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const)(
    'identifies %s records with explicit text rather than colour alone', async status => {
      const {page, text} = await mount({status});
      expect(text()).toContain(status.charAt(0).toUpperCase() + status.slice(1));
      expect(text()).toContain('Listening history');
      expect(text()).toContain('Synthetic listener');
      expect(text()).toContain('Manual');
      expect(page.querySelector('button, input, select, textarea, [role="button"]')).toBeNull();
    });

  it('shows the requested, started and finished audit timestamps and measured duration', async () => {
    const {page, text} = await mount({triggerType: 'scheduled'});
    expect(text()).toContain('Scheduled');
    for (const label of ['Requested', 'Started', 'Finished']) expect(text()).toContain(label);
    expect(text()).toContain('8s');
    expect([...page.querySelectorAll('time')].map(time => time.getAttribute('datetime'))).toEqual([
      baseline.requestedAt, baseline.startedAt, baseline.finishedAt
    ]);
  });

  it('distinguishes successful warnings and keeps only nonempty string warnings', async () => {
    const {text} = await mount({details: {warnings: ['Spotify returned a partial page', '', '   ', null, 42, {secret: 'do not render'}]}});
    expect(text()).toContain('Succeeded · Warning');
    expect(text()).toContain('Spotify returned a partial page');
    expect(text()).not.toContain('42');
    expect(text()).not.toContain('do not render');
    expect(text()).not.toContain('[object Object]');
  });

  it.each([{}, {warnings: []}, {warnings: [' ', null, false]}, {warnings: 'not an array'}])(
    'does not invent warnings from malformed or absent warning details %j', async details => {
      const {text} = await mount({details});
      expect(text()).toContain('Succeeded');
      expect(text()).not.toContain('Succeeded · Warning');
    });

  it('renders service errors and warnings as literal untrusted text', async () => {
    const error = '<img src=x onerror="alert(1)">';
    const warning = '<script>alert(2)</script>';
    const {page, text} = await mount({status: 'failed', error, details: {warnings: [warning]}});
    expect(text()).toContain(error);
    expect(text()).toContain(warning);
    expect(page.querySelector('img, script, [onerror]')).toBeNull();
    expect(text()).not.toContain('Succeeded · Warning');
  });

  it('identifies a queued record that has never started without a fabricated duration', async () => {
    const {text} = await mount({status: 'queued', startedAt: null, finishedAt: null});
    expect(text()).toContain('Not started');
    expect(text()).toContain('No duration available');
    expect(text()).not.toContain('Invalid Date');
  });

  it('keeps a running record distinguishable from a completed record', async () => {
    const {text} = await mount({status: 'running', finishedAt: null});
    expect(text()).toContain('In progress');
    expect(text()).toContain('No finished time yet');
    expect(text()).not.toContain('8s');
  });

  it.each([
    {requestedAt: 'not-a-date', startedAt: 'invalid', finishedAt: 'invalid'},
    {startedAt: null, finishedAt: baseline.finishedAt},
    {startedAt: baseline.finishedAt, finishedAt: baseline.startedAt}
  ])('does not manufacture duration from missing, invalid or reversed times %j', async changes => {
    const {page, text} = await mount(changes);
    expect(text()).toContain('No duration available');
    expect(text()).not.toMatch(/Invalid Date|NaN|Infinity|-8s/);
    for (const time of page.querySelectorAll('time')) {
      expect(Number.isFinite(Date.parse(time.getAttribute('datetime') ?? ''))).toBe(true);
    }
  });

  it('supports genuinely zero duration', async () => {
    const {text} = await mount({finishedAt: baseline.startedAt});
    expect(text()).toContain('0s');
    expect(text()).not.toContain('No duration available');
  });

  it('replaces record identity, status, timestamps and feedback when refreshed inputs arrive', async () => {
    const {fixture, text} = await mount({status: 'running', finishedAt: null, error: 'Old error'});
    fixture.componentRef.setInput('label', 'Shared playlists');
    fixture.componentRef.setInput('run', {...baseline, displayName: 'Replacement listener',
      triggerType: 'scheduled', details: {warnings: ['Replacement warning']}});
    fixture.detectChanges();
    expect(text()).toContain('Shared playlists');
    expect(text()).toContain('Replacement listener');
    expect(text()).toContain('Succeeded · Warning');
    expect(text()).toContain('Replacement warning');
    expect(text()).toContain('8s');
    expect(text()).not.toContain('Listening history');
    expect(text()).not.toContain('Synthetic listener');
    expect(text()).not.toContain('Old error');
    expect(text()).not.toContain('In progress');
  });
});
