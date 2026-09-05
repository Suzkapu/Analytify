import {existsSync, readFileSync} from 'node:fs';
import {validateProductionIndex} from './production-index-validator.mjs';

const indexPath = 'dist/spoti-front/index.html';
const html = readFileSync(indexPath, 'utf8');
const stylesheetCount = validateProductionIndex(
  html,
  asset => existsSync(`dist/spoti-front/${asset}`)
);

console.log(`Production index check passed (${stylesheetCount} directly active stylesheet link).`);
