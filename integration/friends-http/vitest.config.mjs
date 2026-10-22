import base from '../../vitest.base.config.mjs';

export default {test: {...base.test, maxWorkers: 1, fileParallelism: false, reporters: ['verbose']}};
