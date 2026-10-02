export const COVERAGE_METRICS = ['statements', 'branches', 'functions', 'lines'];

export function isDesignV2BehaviorSource(path) {
  const normalized = path.replaceAll('\\', '/');
  if (!normalized.endsWith('.ts') || normalized.endsWith('.spec.ts') || normalized.endsWith('/index.ts')) return false;
  // Declarative lazy-route entries are tested by the routing suite. Their
  // import callbacks are intentionally not executed by component unit tests.
  if (normalized === 'src/app/design-v2-routing.module.ts') return false;
  return normalized.includes('/design-v2/') || normalized.includes('/design-v2-')
    || normalized.includes('/ambient/') || normalized.includes('/v2-')
    || normalized.startsWith('src/app/core/navigation/design-');
}

export function coverageRegressions(sources, summary, baseline) {
  const entries = new Map(Object.entries(summary).map(([path, value]) => {
    const normalized = path.replaceAll('\\', '/');
    return [normalized.slice(normalized.indexOf('src/')), value];
  }));
  const failures = [];
  for (const source of sources) {
    const entry = entries.get(source);
    if (!entry) {
      failures.push(`${source}: missing coverage evidence`);
      continue;
    }
    for (const metric of COVERAGE_METRICS) {
      const value = entry[metric];
      const maximum = baseline[source]?.[metric] ?? 0;
      if (!value || !Number.isInteger(value.total) || !Number.isInteger(value.covered)
        || value.total < 0 || value.covered < 0 || value.covered > value.total) {
        failures.push(`${source}: invalid ${metric} coverage evidence`);
      } else if (value.total - value.covered > maximum) {
        failures.push(`${source}: ${value.total - value.covered} uncovered ${metric}, maximum ${maximum}`);
      }
    }
  }
  return failures;
}
