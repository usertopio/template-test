// Media storage bridge for The Parzival Film Profile.
// Runs in your Google account and saves uploaded media into one Drive folder.
// Deploy as a web app (Execute as: Me, Who has access: Anyone). Steps: README, "Media storage".
// Every request must carry the secret, and only files inside the media folder can be touched.
// Version 3: a Drive token for large uploads and streaming (version 2: descriptions and shortcuts).
//
// The folder id and secret come from config.gs (CONFIG), which `npm run media-script:deploy`
// writes from backend/.env. Deploying by hand: copy config.example.gs to a config.gs file.

const VERSION = 3;

// Read CONFIG only inside functions: Apps Script may load config.gs after this file.
function rootId() {
  return CONFIG.ROOT_FOLDER_ID;
}

function doPost(e) {
  let body;
  try {
    const req = JSON.parse(e.postData.contents);
    if (!CONFIG.SECRET || req.secret !== CONFIG.SECRET) throw withStatus('MEDIA_SCRIPT_SECRET does not match the script', 401);
    const action = ACTIONS[req.action];
    if (!action) throw withStatus('Unknown action: ' + req.action, 400);
    const result = action(req);
    body = { result: result === undefined ? null : result };
  } catch (err) {
    body = { error: String((err && err.message) || err), status: (err && err.status) || 500 };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function withStatus(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function root() {
  return DriveApp.getFolderById(rootId());
}

/** Returns the item if it is inside the root folder (at any depth), otherwise throws. */
function inside(item) {
  const seen = {};
  let level = [item];
  while (level.length) {
    const next = [];
    for (const it of level) {
      const parents = it.getParents();
      while (parents.hasNext()) {
        const parent = parents.next();
        const id = parent.getId();
        if (id === rootId()) return item;
        if (!seen[id]) {
          seen[id] = true;
          next.push(parent);
        }
      }
    }
    level = next;
  }
  throw withStatus('Not inside the media folder', 403);
}

function file(id) {
  try {
    return inside(DriveApp.getFileById(id));
  } catch (err) {
    throw err.status ? err : withStatus('File not found', 404);
  }
}

function folder(id) {
  if (id === rootId()) return root();
  try {
    return inside(DriveApp.getFolderById(id));
  } catch (err) {
    throw err.status ? err : withStatus('Folder not found', 404);
  }
}

function hasLive(iterator) {
  while (iterator.hasNext()) if (!iterator.next().isTrashed()) return true;
  return false;
}

const ACTIONS = {
  verify() {
    const f = root();
    if (f.isTrashed()) throw withStatus('The media folder is in the trash', 400);
    return { name: f.getName(), version: VERSION };
  },

  /** Id of the folder at `path` below the root, creating missing folders. */
  folder({ path }) {
    let parent = root();
    for (const name of path) {
      const matches = parent.getFoldersByName(name);
      let found = null;
      while (!found && matches.hasNext()) {
        const f = matches.next();
        if (!f.isTrashed()) found = f;
      }
      parent = found || parent.createFolder(name);
    }
    return parent.getId();
  },

  renameFolder({ id, name }) {
    if (id === rootId()) throw withStatus('The media folder itself is not renamed', 400);
    folder(id).setName(name);
  },

  trashFolderIfEmpty({ id }) {
    if (id === rootId()) return;
    let f;
    try {
      f = folder(id);
    } catch (err) {
      if (err.status === 404) return;
      throw err;
    }
    if (!hasLive(f.getFiles()) && !hasLive(f.getFolders())) f.setTrashed(true);
  },

  /** `data` is base64. Returns the new file's id. */
  upload({ folderId, name, mimeType, data, description }) {
    const f = folder(folderId).createFile(Utilities.newBlob(Utilities.base64Decode(data), mimeType, name));
    if (description) f.setDescription(description);
    return f.getId();
  },

  update({ id, name, folderId, description }) {
    const f = file(id);
    if (name) f.setName(name);
    if (folderId) f.moveTo(folder(folderId));
    if (description !== undefined && description !== null) f.setDescription(description);
  },

  /** A shortcut to a file (inside the media folder) placed in another folder. Returns the shortcut's id. */
  createShortcut({ targetId, folderId, name }) {
    file(targetId);
    const shortcut = folder(folderId).createShortcut(targetId);
    if (name) shortcut.setName(name);
    return shortcut.getId();
  },

  trash({ id }) {
    try {
      file(id).setTrashed(true);
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  },

  /**
   * A short-lived access token (about an hour) with this script's Drive access, so the server can send large
   * files to Drive in pieces and stream them back. DriveApp use above is what grants the Drive scope.
   */
  token() {
    return { token: ScriptApp.getOAuthToken() };
  },

  download({ id }) {
    const blob = file(id).getBlob();
    return { data: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType() };
  },
};
