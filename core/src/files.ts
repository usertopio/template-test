/** Where media files are kept (a Drive folder). Tests use an in-memory store. */
export interface FileStore {
  /** Id of the folder at `path` below the root folder, creating missing folders. */
  folder(path: string[]): Promise<string>;
  renameFolder(folderId: string, name: string): Promise<void>;
  /** Move a folder to the trash if nothing is left in it. */
  trashFolderIfEmpty(folderId: string): Promise<void>;
  /** Store a file and return its id. */
  upload(file: { folderId: string; name: string; mimeType: string; data: Uint8Array; description?: string }): Promise<string>;
  /** Rename a file or shortcut, move it to another folder and/or change its description. */
  update(fileId: string, changes: { name?: string; folderId?: string; description?: string }): Promise<void>;
  /** Put a shortcut to `targetId` in a folder and return the shortcut's id. Trash it with `trash`. */
  createShortcut(shortcut: { targetId: string; folderId: string; name: string }): Promise<string>;
  /** Move a file to the trash (recoverable for 30 days in Drive). Missing files are ignored. */
  trash(fileId: string): Promise<void>;
  download(fileId: string): Promise<Uint8Array>;
}

export type FileStoreProvider = () => Promise<FileStore>;
