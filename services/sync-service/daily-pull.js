// Compatibility entry point for hosts still invoking the former cron filename.
// All scheduling and work now lives in the configurable sync service.
require('./index').main([]).catch(error => {
  console.error('[Sync service] Compatibility run failed:', error);
  process.exitCode = 1;
});
