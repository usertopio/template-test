import { useState } from 'react';
import { isDraft, type Entry, type SectionDef } from '@profile/shared';
import type { EntryInput } from '../api';
import { useSaveWithMedia } from '../saveWithMedia';
import EntryForm from './EntryForm';
import Modal from './Modal';

interface Props {
  section: SectionDef;
  /** null = closed, 'new' = adding, otherwise the entry being edited. */
  editing: Entry | 'new' | null;
  /**
   * What a new entry starts with, e.g. the day clicked on the calendar. It then leaves alone what this browser kept
   * of the last new one (+ Add brings that back), and closing it untouched asks nothing.
   */
  newValues?: EntryInput;
  onClose: () => void;
}

/**
 * An entry's form in a dialog: a list page adding or editing its own entries, or a preview editing the entry it
 * shows (e.g. an activity's linked post) without going to that entry's page. Asks before discarding changes.
 */
export default function EntryDialog({ section, editing, newValues, onClose }: Props) {
  const saveWithMedia = useSaveWithMedia(section);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mediaError, setMediaError] = useState('');
  // Each opening starts clean: what the last form left unsaved doesn't carry over.
  const newKey = newValues ? `new:${JSON.stringify(newValues)}` : 'new';
  const openFor = editing === null ? null : editing === 'new' ? newKey : editing.id;
  const [shownFor, setShownFor] = useState(openFor);
  if (openFor !== shownFor) {
    setShownFor(openFor);
    setDirty(false);
    setConfirmDiscard(false);
  }
  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());
  const item = section.itemLabel ?? section.label.toLowerCase();

  return (
    <>
      <Modal open={editing !== null} title={editing === 'new' ? `New ${item}` : `Edit ${item}`} back={editing === 'new'} onRequestClose={requestClose}>
        {editing && (
          <EntryForm
            key={openFor!}
            variant="modal"
            section={section}
            initial={editing === 'new' ? (newValues ? { ...defaultsOf(section), ...newValues } : null) : editing}
            // An existing entry saves itself as it's edited (a draft stays a draft); a new one is kept in this browser.
            autoSave={editing === 'new' ? undefined : (values) => saveWithMedia.run(editing.id, values, [], { draft: isDraft(editing) })}
            backupKey={editing === 'new' && !newValues ? section.key : undefined}
            onDirtyChange={setDirty}
            onCancel={requestClose}
            onSubmit={async (values, pendingMedia) => {
              // Close as soon as the entry is saved; files added while it was new upload afterwards.
              setMediaError(await saveWithMedia.run(editing === 'new' ? undefined : editing.id, values, pendingMedia, { onSaved: onClose }));
            }}
            // New entries and drafts can be saved unfinished, and a saved entry can go back to being a draft.
            draftLabel={editing !== 'new' && !isDraft(editing) ? 'Move to drafts' : undefined}
            onSaveDraft={
              section.drafts
                ? async (values, pendingMedia) => {
                    setMediaError(await saveWithMedia.run(editing === 'new' ? undefined : editing.id, values, pendingMedia, { onSaved: onClose, draft: true }));
                  }
                : undefined
            }
            notice={
              confirmDiscard && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Discard unsaved changes?
                  <span className="flex gap-2">
                    <button type="button" onClick={onClose} className="rounded bg-amber-600 px-3 py-2 md:px-2 md:py-1 text-white hover:bg-amber-700">
                      Discard
                    </button>
                    <button type="button" onClick={() => setConfirmDiscard(false)} className="rounded px-3 py-2 md:px-2 md:py-1 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                      Keep editing
                    </button>
                  </span>
                </div>
              )
            }
          />
        )}
      </Modal>
      {saveWithMedia.uploading && <p className="text-sm text-slate-500 dark:text-slate-400">Uploading media…</p>}
      {mediaError && (
        <p className="flex items-start justify-between gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {mediaError}
          <button onClick={() => setMediaError('')} aria-label="Dismiss" className="px-1">
            ×
          </button>
        </p>
      )}
    </>
  );
}

/** A section's field defaults (e.g. a post's status), which a form given starting values otherwise leaves empty. */
const defaultsOf = (section: SectionDef): EntryInput => Object.fromEntries(section.fields.flatMap((f) => (f.default ? [[f.key, f.default]] : [])));
