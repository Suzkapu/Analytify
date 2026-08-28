module.exports = function configureSupabaseIntegration(config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      clearContext: false,
      args: [
        '--analytify-supabase-integration',
        process.env.SUPABASE_INTEGRATION_URL || '',
        process.env.SUPABASE_INTEGRATION_ANON_KEY || ''
      ]
    },
    reporters: ['progress', 'kjhtml'],
    jasmineHtmlReporter: {suppressAll: true},
    browsers: ['ChromeHeadless'],
    singleRun: true,
    restartOnFileChange: false,
    browserNoActivityTimeout: 60_000,
    captureTimeout: 60_000
  });
};
