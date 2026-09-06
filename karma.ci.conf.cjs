module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {clearContext: false},
    reporters: ['progress'],
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/spoti-front'),
      subdir: '.',
      reporters: [
        {type: 'html'},
        {type: 'lcovonly'},
        {type: 'json-summary'},
        {type: 'text-summary'}
      ],
      check: {
        global: {
          statements: 55,
          branches: 40,
          functions: 51,
          lines: 59
        }
      }
    },
    browsers: ['ChromeHeadless'],
    restartOnFileChange: false,
    singleRun: true
  });
};
