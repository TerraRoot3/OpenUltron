#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'electron-install-log.txt');
const env = {
  ...process.env,
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_CUSTOM_DIR: '{{ version }}'
};
fs.writeFileSync(outPath, 'Starting install...\n');
const p = spawn('node', [path.join(root, 'node_modules', 'electron', 'install.js')], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe']
});
let stdout = '';
let stderr = '';
p.stdout.on('data', d => { stdout += d; });
p.stderr.on('data', d => { stderr += d; });
p.on('close', code => {
  const log = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nEXIT: ${code}\n`;
  fs.writeFileSync(outPath, log);
  console.log('Log written to electron-install-log.txt');
  process.exit(code);
});
