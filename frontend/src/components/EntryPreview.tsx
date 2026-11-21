import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { getSection, isCredentialFile, mediaOf, orgKey, type Entry, type Language, type SectionDef } from '@profile/shared';
import { useEntries } from '../api';
import { ShownIn, useLanguage, useLocalize } from '../language';
import { LanguageSwitch } from './LanguageSwitch';
import { CardMedia, EntryCard, useCardData } from './EntryCard';
import EntryDialog from './EntryDialog';
import { CertificatePages } from './Media';
import Modal from './Modal';
import { ClosePreviewContext, PreviewContext, pageOf, type PreviewTarget } from './preview';

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Lets links on cards (an organization's name, linked and linking entries) open a preview in a dialog. Links inside
 * a preview open the next one on top; Back returns to the previous one. A list card opens its own entry here too:
 * entries of `page` (the list's section) are edited by the page. Entries of other sections (an activity's linked
 * post) are edited here, in a form on top of the preview, so there's no need to go to their page; closing it
 * returns to the preview.
 */
export function PreviewProvider({ children, page, onEdit }: { children: ReactNode; page?: string; onEdit?: (entry: Entry) => void }) {
  const [stack, setStack] = useState<PreviewTarget[]>([]);
  // The popup's own EN | ไทย: it opens in the profile's language, and a switch there changes just the popup
  // (kept while going from one preview to the next).
  const profileLang = useLanguage();
  const [lang, setLang] = useState<Language | null>(null);
  const current = stack.at(-1);
  const section = current && getSection(current.section);
  const close = () => (setStack([]), setLang(null));
  // Another section's entry being edited; its section stays after closing, so the dialog can close in place.
  const [editing, setEditing] = useState<{ section: SectionDef; entry: Entry | null } | null>(null);

  return (
    <PreviewContext value={(target) => setStack((s) => [...s, target])}>
      <ClosePreviewContext value={close}>
        {children}
        <Modal open={!!section} title={section ? capitalize(section.itemLabel ?? section.label) : ''} onRequestClose={close}>
          {current && (
            <ShownIn value={lang ?? profileLang}>
              <EntryPreview
                // A fresh preview (scrolled to the top) for each step.
                key={stack.length}
                target={current}
                onBack={stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined}
                onLeave={close}
                onEdit={current.section === page && onEdit ? (entry) => (close(), onEdit(entry)) : (entry) => setEditing({ section: section!, entry })}
                own={current.section === page}
                lang={lang ?? profileLang}
                onLangChange={setLang}
              />
            </ShownIn>
          )}
        </Modal>
        {editing && <EntryDialog key={editing.section.key} section={editing.section} editing={editing.entry} onClose={() => setEditing((e) => e && { ...e, entry: null })} />}
      </ClosePreviewContext>
    </PreviewContext>
  );
}

interface PreviewProps {
  target: PreviewTarget;
  onBack?: () => void;
  onLeave: () => void;
  onEdit?: (entry: Entry) => void;
  /** An entry of the page's own section, which has no page to go to. */
  own: boolean;
  lang: Language;
  onLangChange: (lang: Language) => void;
}

function EntryPreview({ target, onBack, onLeave, onEdit, own, lang, onLangChange }: PreviewProps) {
  const section = getSection(target.section)!;
  const { data, isLoading, error } = useEntries(section.key);
  const { media, related, backlinksFor } = useCardData(section);
  const localize = useLocalize();
  const entry = data?.find((e) => ('name' in target ? orgKey(e.name) === orgKey(target.name) : e.id === target.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 break-words">
        <div className="flex items-center justify-between gap-2">
          {onBack ? (
            <button type="button" onClick={onBack} className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              <ArrowLeft size={14} aria-hidden />
              Back
            </button>
          ) : (
            <span />
          )}
          <LanguageSwitch value={lang} onChange={onLangChange} label="Show this in" />
        </div>
        {entry ? (
          <>
            <EntryCard section={section} entry={entry} related={related} backlinks={backlinksFor(entry)} media={media} />
            {/* A certification or certificate shows itself, not just its files' thumbnails. */}
            {section.media?.credential && (
              <CertificatePages files={mediaOf(media, entry.id).filter((m) => isCredentialFile(section, m))} name={localize(section, entry)[section.titleField] || '(untitled)'} />
            )}
            <CardMedia boxed section={section} entry={entry} media={media} />
          </>
        ) : isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {'name' in target ? `There's no organization named “${target.name}” yet.` : `This ${section.itemLabel ?? 'entry'} no longer exists.`}
          </p>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800">
        {onEdit && entry && (
          <button type="button" onClick={() => onEdit(entry)} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            <Pencil size={14} aria-hidden />
            Edit
          </button>
        )}
        {!own && (
          <Link to={pageOf(target)} onClick={onLeave} className="text-sm text-blue-700 hover:underline dark:text-blue-400">
            Open in {section.label} →
          </Link>
        )}
      </footer>
    </div>
  );
}
