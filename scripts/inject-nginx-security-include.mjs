import {readFileSync, writeFileSync} from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: inject-nginx-security-include.mjs <input> <output>');
}

const includeDirective = 'include /etc/nginx/snippets/analytify-security.conf;';
const source = readFileSync(inputPath, 'utf8');
if (source.includes(includeDirective)) {
  writeFileSync(outputPath, source);
  process.exit(0);
}

const locationPattern = /^(\s*)location\s+\/\s*\{[^\n]*$/m;
if (!locationPattern.test(source)) {
  throw new Error('The Analytify virtual host has no exact location / block.');
}

const rendered = source.replace(locationPattern, (line, indent) =>
  `${line}\n${indent}  ${includeDirective}`
);
writeFileSync(outputPath, rendered);
