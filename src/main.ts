import {platformBrowserDynamic} from '@angular/platform-browser-dynamic';

import {AppModule} from './app/app.module';
import {createScopedLogger} from './app/core/diagnostics/app-logger';

const diagnostics = createScopedLogger('Application');

window.addEventListener('error', event => {
  diagnostics.error('Unhandled browser error', event.error || {message: event.message, source: event.filename});
});

window.addEventListener('unhandledrejection', event => {
  diagnostics.error('Unhandled promise rejection', event.reason);
});

diagnostics.step('Starting Angular application');
platformBrowserDynamic().bootstrapModule(AppModule)
  .then(() => diagnostics.success('Angular application started'))
  .catch(err => diagnostics.error('Angular application failed to start', err));
