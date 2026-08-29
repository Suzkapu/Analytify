import {readFileSync} from 'node:fs';

const template = readFileSync(
  'src/app/features/insights/user-stats/user-stats.component.html',
  'utf8'
);
const component = readFileSync(
  'src/app/features/insights/user-stats/user-stats.component.ts',
  'utf8'
);

const checks = [
  ['primary side renders a calendar dialog', template.includes('id="stats-history-calendar"')],
  ['comparison side renders a calendar dialog', template.includes('id="stats-compare-calendar"')],
  ['primary calendar uses snapshot availability days', template.includes('let day of historyCalendarDays')],
  ['comparison calendar uses snapshot availability days', template.includes('let day of compareCalendarDays')],
  ['calendar legend is removed', !template.includes('compare-calendar-legend')],
  ['saved-snapshot help text is removed', !template.includes('Only saved snapshots can be selected')],
  ['comparison options exclude the primary snapshot', component.includes("this.snapshotOptions.filter(opt => opt.id !== this.selectedSnapshotId)")],
  ['both calendars share one availability builder', component.includes("this.refreshSnapshotCalendar('history'") && component.includes("this.refreshSnapshotCalendar('compare'")]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`Stats calendar checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Both stats comparison sides use the shared availability calendar.');
}
