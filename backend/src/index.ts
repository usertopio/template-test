import 'dotenv/config';
import { DOMAIN_LIST, LOCATION_LIST } from '@profile/shared';
import { ConfigError, backfillOrganizations, backfillSkills, describeError, migrateActivityOnline, migrateDomainThai, migrateLocationThai, seedDomains, seedLocations, syncAllMediaLinks, type FileStore, type Repos } from '@profile/core';
import { createApp } from './app';
import { AppsScriptStore, createScriptStore } from './media/appsScript';
import { DriveRest } from './media/resumable';
import { createSheetsContext } from './sheets/client';
import { bootstrapSheets } from './sheets/bootstrap';

// Connect lazily so the server still boots (and /api/health explains why) when .env is incomplete.
let reposPromise: Promise<Repos> | undefined;
function getRepos() {
  reposPromise ??= (async () => {
    let ctx;
    try {
      ctx = createSheetsContext();
    } catch (err) {
      throw new ConfigError((err as Error).message);
    }
    const { repos, created } = await bootstrapSheets(ctx);
    // Best effort: a failure here shouldn't block the app.
    await backfillOrganizations(repos).catch((err) => console.error('[sheets] organization backfill failed:', describeError(err)));
    await backfillSkills(repos).catch((err) => console.error('[sheets] skill backfill failed:', describeError(err)));
    // Only a new Domains tab: once it exists, what's deleted from it stays deleted.
    if (created.has(DOMAIN_LIST)) await seedDomains(repos).catch((err) => console.error('[sheets] domain seeding failed:', describeError(err)));
    await migrateDomainThai(repos).catch((err) => console.error('[sheets] moving domain Thai failed:', describeError(err)));
    if (created.has(LOCATION_LIST)) await seedLocations(repos).catch((err) => console.error('[sheets] location seeding failed:', describeError(err)));
    await migrateLocationThai(repos).catch((err) => console.error('[sheets] moving location Thai failed:', describeError(err)));
    await migrateActivityOnline(repos).catch((err) => console.error('[sheets] moving activity Online ticks to Location type failed:', describeError(err)));
    return repos;
  })().catch((err) => {
    reposPromise = undefined; // retry on next request
    throw err;
  });
  return reposPromise;
}

// Media storage (Drive via Apps Script) is optional and connected the same lazy way.
let filesPromise: Promise<FileStore> | undefined;
function getFiles() {
  filesPromise ??= (async () => {
    let store;
    try {
      store = createScriptStore();
    } catch (err) {
      throw new ConfigError((err as Error).message);
    }
    await store.verify();
    return store;
  })().catch((err) => {
    filesPromise = undefined;
    throw err;
  });
  return filesPromise;
}

// Large uploads and streaming talk to Drive directly, with a token from the media script.
let driveRest: DriveRest | undefined;
async function getResumable() {
  const store = (await getFiles()) as AppsScriptStore;
  return (driveRest ??= new DriveRest(() => store.token()));
}

const app = createApp(getRepos, getFiles, { background: true, getResumable });

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
  getRepos()
    .then(() => console.log('[sheets] connected and tabs ready'))
    .catch((err) => console.error(`[sheets] not ready: ${describeError(err)}`));
  getFiles()
    .then(() => {
      console.log('[media] Drive folder ready');
      // Bring Drive shortcuts in line with the current layout (e.g. after an update moved them), in the background.
      getRepos()
        .then((repos) => syncAllMediaLinks(repos, getFiles))
        .catch((err) => console.error(`[media] updating Drive shortcuts failed: ${describeError(err)}`));
    })
    .catch((err) => console.error(`[media] storage not ready: ${describeError(err)}`));
});
