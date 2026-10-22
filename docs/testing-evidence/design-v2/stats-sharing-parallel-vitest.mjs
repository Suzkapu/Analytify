import base from '../../../vitest.base.config.mjs';
export default {test: {...base.test, maxWorkers: 1, coverage: {reportsDirectory: 'docs/testing-evidence/design-v2/stats-sharing-parallel-coverage'}}};
