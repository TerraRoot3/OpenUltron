#!/usr/bin/env node
const path = require('path');
const installPath = path.join(__dirname, 'node_modules', 'electron', 'install.js');
process.chdir(__dirname);
try {
  require(installPath);
} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
  process.exit(1);
}
