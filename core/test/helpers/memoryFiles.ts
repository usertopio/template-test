import { randomUUID } from 'node:crypto';
import type { FileStore } from '../../src/files';

interface Node {
  id: string;
  name: string;
  parent: string;
  folder: boolean;
  trashed: boolean;
  data?: Uint8Array;
  description?: string;
  /** For shortcuts: the file it points at. */
  shortcutTo?: string;
}

/** In-memory stand-in for the Drive folder, so tests never touch Google Drive. */
export class MemoryFileStore implements FileStore {
  readonly rootId = 'root';
  nodes = new Map<string, Node>();

  async folder(path: string[]) {
    let parent = this.rootId;
    for (const name of path) {
      const found = this.live().find((n) => n.folder && n.parent === parent && n.name === name);
      parent = found?.id ?? this.add({ name, parent, folder: true });
    }
    return parent;
  }

  async renameFolder(folderId: string, name: string) {
    this.get(folderId).name = name;
  }

  async trashFolderIfEmpty(folderId: string) {
    if (folderId !== this.rootId && !this.live().some((n) => n.parent === folderId)) this.get(folderId).trashed = true;
  }

  async upload({ folderId, name, data, description }: { folderId: string; name: string; mimeType: string; data: Uint8Array; description?: string }) {
    return this.add({ name, parent: folderId, folder: false, data, description });
  }

  async update(fileId: string, { name, folderId, description }: { name?: string; folderId?: string; description?: string }) {
    const node = this.get(fileId);
    if (name) node.name = name;
    if (folderId) node.parent = folderId;
    if (description !== undefined) node.description = description;
  }

  async createShortcut({ targetId, folderId, name }: { targetId: string; folderId: string; name: string }) {
    this.get(targetId);
    return this.add({ name, parent: folderId, folder: false, shortcutTo: targetId });
  }

  /** Drive description of the (live) file at `path`. */
  descriptionOf(path: string): string | undefined {
    return this.live().find((n) => this.pathOf(n) === path)?.description;
  }

  async trash(fileId: string) {
    const node = this.nodes.get(fileId);
    if (node) node.trashed = true;
  }

  async download(fileId: string) {
    return this.get(fileId).data!;
  }

  /**
   * Paths of files that aren't trashed, e.g. "Projects/Film/Project_Poster_Tammasorn.png".
   * Shortcuts end with " → <target path>".
   */
  paths(): string[] {
    return this.live()
      .filter((n) => !n.folder)
      .map((n) => (n.shortcutTo ? `${this.pathOf(n)} → ${this.pathOf(this.get(n.shortcutTo))}` : this.pathOf(n)))
      .sort();
  }

  private pathOf(n: Node): string {
    return n.parent === this.rootId ? n.name : `${this.pathOf(this.get(n.parent))}/${n.name}`;
  }

  /** Names of folders that aren't trashed. */
  folders(): string[] {
    return this.live()
      .filter((n) => n.folder)
      .map((n) => n.name)
      .sort();
  }

  private live() {
    return [...this.nodes.values()].filter((n) => !n.trashed);
  }

  private add(node: Omit<Node, 'id' | 'trashed'>) {
    const id = randomUUID();
    this.nodes.set(id, { ...node, id, trashed: false });
    return id;
  }

  private get(id: string) {
    const node = this.nodes.get(id);
    if (!node) throw Object.assign(new Error(`File ${id} not found`), { status: 404 });
    return node;
  }
}
