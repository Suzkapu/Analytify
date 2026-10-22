const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

// Compile the real source at its real filename so V8 includes entrypoint coverage.
// Replacements apply only to this module's direct service boundaries.
function loadIsolated(relative, replacements = {}, {main = false} = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  isolated.require = name => Object.hasOwn(replacements, name) ? replacements[name] : Module.prototype.require.call(isolated, name);
  const previousMain = process.mainModule;
  try {
    if (main) process.mainModule = isolated;
    isolated._compile(fs.readFileSync(filename, 'utf8'), filename);
    return isolated.exports;
  } finally { process.mainModule = previousMain; }
}
module.exports = {loadIsolated};
