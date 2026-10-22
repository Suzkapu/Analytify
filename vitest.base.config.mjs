import {availableParallelism} from 'node:os';

// Bound concurrent Angular/jsdom environments; retain each test's deadline.
export default {test: {maxWorkers: Math.min(4, availableParallelism())}};
