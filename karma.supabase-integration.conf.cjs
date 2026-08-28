module.exports = function configureSupabaseIntegration(config) {
  config.set({
    client: {
      args: [
        '--analytify-supabase-integration',
        process.env.SUPABASE_INTEGRATION_URL || '',
        process.env.SUPABASE_INTEGRATION_ANON_KEY || ''
      ]
    },
    browserNoActivityTimeout: 60_000,
    captureTimeout: 60_000
  });
};
