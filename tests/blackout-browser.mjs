import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv[2] || 'http://127.0.0.1:5173/agro-website-/';
const run = promisify(execFile);
let stdout;
try {
  ({ stdout } = await run(process.execPath, [path.join(root, 'verification/feature-probe.mjs'), url, path.join(root, 'verification/blackout-probe.js')], { timeout: 300000, maxBuffer: 4 * 1024 * 1024 }));
} catch (error) {
  stdout = error.stdout;
  if (!stdout) throw error;
  process.exitCode = 1;
}
const report = JSON.parse(stdout);
await fs.writeFile(path.join(root, 'verification', url.startsWith('file:') ? 'blackout-offline-results.json' : 'blackout-browser-results.json'), JSON.stringify({ url, at: new Date().toISOString(), ...report }, null, 2));
console.log(report.error ? `FAIL: ${report.error}` : `PASS: ${report.result.passed} redesigned-showroom checks`);
if (report.logs.length) console.log(JSON.stringify(report.logs, null, 2));
if (report.error) process.exitCode = 1;
