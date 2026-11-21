// Upload the media script and update its existing deployment (same URL).
//   npm run media-script:deploy
// Needs `npx clasp login` once, and in backend/.env: MEDIA_SCRIPT_ID, MEDIA_FOLDER_URL,
// MEDIA_SCRIPT_SECRET and MEDIA_SCRIPT_URL. See README: "Media storage".
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));

const need = (key) => {
  const value = process.env[key]?.trim();
  if (!value) {
    console.error(`${key} is missing in backend/.env (see README: "Media storage").`);
    process.exit(1);
  }
  return value;
};
const scriptId = need('MEDIA_SCRIPT_ID');
const folderUrl = need('MEDIA_FOLDER_URL');
const secret = need('MEDIA_SCRIPT_SECRET');
const url = need('MEDIA_SCRIPT_URL');
const folderId = folderUrl.match(/\/folders\/([\w-]+)/)?.[1] ?? folderUrl;
const deploymentId = url.match(/\/s\/([\w-]+)\/exec/)?.[1];
if (!deploymentId) {
  console.error('MEDIA_SCRIPT_URL should look like https://script.google.com/macros/s/<id>/exec');
  process.exit(1);
}

// Both files are git-ignored: .clasp.json links this folder to your script, config.gs holds your values.
writeFileSync(`${dir}.clasp.json`, JSON.stringify({ scriptId, rootDir: '.' }, null, 2) + '\n');
writeFileSync(
  `${dir}config.gs`,
  `// Written by npm run media-script:deploy from backend/.env. Do not edit or commit.\nconst CONFIG = ${JSON.stringify({ ROOT_FOLDER_ID: folderId, SECRET: secret }, null, 2)};\n`,
);

// Not via npx: inside a workspace, npx runs from another directory and clasp misses .clasp.json. Not via
// node_modules/.bin either: that's a shell script, which Windows can't run (it would need clasp.cmd and a shell).
// clasp's own entry file, run with this Node, works everywhere.
const claspJs = fileURLToPath(new URL('../../node_modules/@google/clasp/build/src/index.js', import.meta.url));
const clasp = (...args) => execFileSync(process.execPath, [claspJs, ...args], { cwd: dir, stdio: 'inherit' });
console.log('Uploading the script…');
clasp('push', '--force');
console.log('Updating the deployment (the URL stays the same)…');
clasp('redeploy', deploymentId, '--description', `media bridge ${new Date().toISOString().slice(0, 10)}`);

// Check the live deployment answers with the new code.
console.log('Checking the deployment…');
let res = await fetch(url, { method: 'POST', body: JSON.stringify({ secret, action: 'verify' }), redirect: 'manual' });
const location = res.headers.get('location');
if (location) res = await fetch(location);
const text = await res.text();
try {
  const body = JSON.parse(text);
  if (body.error) throw new Error(body.error);
  console.log(`Done: folder "${body.result.name}", script version ${body.result.version}.`);
} catch (err) {
  console.error(`The deployment didn't answer as expected: ${err.message ?? text.slice(0, 200)}`);
  process.exit(1);
}
