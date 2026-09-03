function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function cutoffLocalParts(now, timezone) {
  const parts = zonedParts(now, timezone);
  if (parts.hour >= 1) return {...parts, hour: 1, minute: 0, second: 0};
  const previousNoonUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1, 12));
  const previous = zonedParts(previousNoonUtc, timezone);
  return {...previous, hour: 1, minute: 0, second: 0};
}

function dailyCutoff(now = new Date(), timezone = 'Europe/Vienna') {
  const target = cutoffLocalParts(now, timezone);
  const targetClock = Date.UTC(target.year, target.month - 1, target.day, target.hour, 0, 0);
  let candidate = targetClock;
  for (let attempt = 0; attempt < 3; attempt++) {
    const actual = zonedParts(new Date(candidate), timezone);
    const actualClock = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate += targetClock - actualClock;
  }
  return new Date(candidate);
}

function snapshotDate(now = new Date(), timezone = 'Europe/Vienna') {
  const cutoff = cutoffLocalParts(now, timezone);
  const year = cutoff.year;
  const month = String(cutoff.month).padStart(2, '0');
  const day = String(cutoff.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cutoffTimestamp(now = new Date(), timezone = 'Europe/Vienna') {
  return dailyCutoff(now, timezone).toISOString();
}

function isFridayInTimezone(now = new Date(), timezone = 'Europe/Vienna') {
  return new Intl.DateTimeFormat('en-US', {timeZone: timezone, weekday: 'short'}).format(now) === 'Fri';
}

module.exports = {dailyCutoff, snapshotDate, cutoffTimestamp, isFridayInTimezone};
