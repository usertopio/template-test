import type { Entry, SectionDef } from '@profile/shared';
import { useSaveEntry, useUploadMedia, type EntryInput } from './api';
import type { PendingMedia } from './components/MediaField';

/**
 * Save an entry, then upload the files added to it while it was new (they need its id).
 * `onSaved` runs as soon as the entry exists, e.g. to close its dialog while files upload.
 * Resolves with a message if a file failed; the entry is saved either way.
 */
export function useSaveWithMedia(section: SectionDef) {
  const save = useSaveEntry(section.key);
  const upload = useUploadMedia();

  async function run(
    id: string | undefined,
    values: EntryInput,
    pending: PendingMedia[],
    { onSaved, draft = false }: { onSaved?: (entry: Entry) => void; draft?: boolean } = {},
  ): Promise<string> {
    const entry = await save.mutateAsync({ id, data: values, draft });
    onSaved?.(entry);
    let problem = '';
    for (const m of pending) {
      try {
        await upload.mutateAsync({ section: section.key, entryId: entry.id, title: m.title, description: m.description, description_th: m.description_th, file: m.file, role: m.role });
      } catch (err) {
        problem = `Saved, but "${m.title}" couldn't be uploaded: ${(err as Error).message}. Edit the ${section.itemLabel ?? 'entry'} to add it again.`;
      }
    }
    return problem;
  }

  return { run, uploading: upload.isPending };
}
