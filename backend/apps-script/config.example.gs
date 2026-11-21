// Values for media-bridge.gs. `npm run media-script:deploy` writes config.gs from backend/.env,
// so you only need this when deploying by hand: add a script file named "config" with these lines.
const CONFIG = {
  // The media folder: the part after /folders/ in its URL.
  ROOT_FOLDER_ID: 'PASTE_FOLDER_ID_HERE',
  // The same value as MEDIA_SCRIPT_SECRET in backend/.env.
  SECRET: 'PASTE_SECRET_HERE',
};
