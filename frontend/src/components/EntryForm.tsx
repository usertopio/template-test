import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from 'react';
import { DETAIL_FILES, DOMAIN_LIST, LANGUAGE_NAMES, ORGANIZATION_THAI, ORGANIZATIONS, SKILLS, domainOptions, getSection, itemThai, joinItemThai, hasImageSlots, linkedFromFields, linkedFromKey, organizationThaiKey, orgKey, progressSetByHand, seedTitle, splitList, splitOrganizations, translationColumns, translationKey, type FieldDef, type Language, type SectionDef } from '@profile/shared';
import { ApiError, useEntries, useEntriesBySection, type EntryInput } from '../api';
import { clearBackup, readBackup, writeBackup } from '../formBackup';
import { useLanguage } from '../language';
import { LocationInput, SuggestionInput, TagsInput, inputClass, useSuggestionThai } from './ComboInputs';
import CopyButton from './CopyButton';
import { LanguageSwitch, ThaiMark } from './LanguageSwitch';
import MediaField, { type PendingMedia } from './MediaField';
import { LogoField } from './OrgLogo';
import LinksInput from './LinksInput';
import MediaPicker from './MediaPicker';
import RefsInput from './RefsInput';

interface Props {
  section: SectionDef;
  initial?: EntryInput | null;
  submitLabel?: string;
  /** `media`: files added to a new entry, to upload once it exists. */
  onSubmit: (data: EntryInput, media: PendingMedia[]) => Promise<unknown>;
  /** Shows "Save draft": store the entry unfinished (required fields may be empty). */
  onSaveDraft?: (data: EntryInput, media: PendingMedia[]) => Promise<unknown>;
  /** The draft button's label, e.g. "Move to drafts" for an entry that's saved (published) now. */
  draftLabel?: string;
  onCancel?: () => void;
  /**
   * An entry that exists: save it like this a moment after each change (and when the form closes), so Save is only
   * needed to close. A failed save shows like a failed Save, without moving the focus.
   */
  autoSave?: (data: EntryInput) => Promise<unknown>;
  /** A new entry: keep what's typed in this browser under this key until it's saved, and bring it back next time. */
  backupKey?: string;
  /** Reports whether closing now would lose something (used to confirm discarding). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Shown above the buttons, e.g. a discard confirmation. */
  notice?: ReactNode;
  /** 'modal' = scrollable body with a pinned footer. */
  variant?: 'page' | 'modal';
}

/** Pause after the last change before an auto-save. */
export const AUTOSAVE_MS = 1500;

/**
 * Fields whose half-typed value would do harm if saved: an organization name registers the organization, and an
 * organization's or skill's own name renames it in every entry. Auto-save waits until the focus leaves them.
 */
const holdsAutoSave = (section: SectionDef, field: FieldDef) => !!field.organization || ((section.key === ORGANIZATIONS || section.key === SKILLS) && field.key === 'name');

/** Every value the form edits: the fields, then their Thai versions. */
const formKeys = (section: SectionDef) => [...section.fields.map((f) => f.key), ...translationColumns(section)];

function emptyValues(section: SectionDef, initial?: EntryInput | null): EntryInput {
  const defaults = Object.fromEntries(section.fields.map((f) => [f.key, f.default ?? '']));
  const progress = section.fields.find((f) => f.progress)?.key;
  return Object.fromEntries(
    formKeys(section).map((key) => [key, key === progress && initial ? progressSetByHand(initial[key]) : (initial?.[key] ?? (initial ? '' : (defaults[key] ?? '')))]),
  );
}

/** The links stored on other entries among `values` (see linkedFromKey), e.g. a certificate's "linkedFrom:posts". */
const pickLinkedFrom = (section: SectionDef, values?: EntryInput | null): Record<string, string> =>
  Object.fromEntries(Object.entries(values ?? {}).filter(([k]) => linkedFromFields(section.key).some((l) => linkedFromKey(l.section.key) === k)));

/** The field as edited in `lang`: a translated field's Thai version has its own column and is never required. */
// Its suggestions are the Thai ones already used (the built-in ones are English).
const inLanguage = (field: FieldDef, lang: Language): FieldDef =>
  lang === 'en' || !field.translatable
    ? field
    : { ...field, key: translationKey(field.key, lang), required: false, ...(field.suggestions && { suggestions: [], placeholder: undefined }) };

/** The form tab that shows `key`: a Thai column is on the Thai tab, a translated field's English on the English one. */
function tabOf(section: SectionDef, key: string): Language | undefined {
  if (translationColumns(section).includes(key)) return 'th';
  return section.fields.find((f) => f.key === key)?.translatable ? 'en' : undefined;
}

/** A group name as part of an element id (ids can't have spaces). */
const groupId = (group: string) => group.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Fields in order, with fields sharing a `group` gathered where the first of them appears. */
function layout(fields: FieldDef[]): (FieldDef | { group: string; fields: FieldDef[] })[] {
  const out: (FieldDef | { group: string; fields: FieldDef[] })[] = [];
  for (const field of fields) {
    if (!field.group) out.push(field);
    else {
      const existing = out.find((x) => 'fields' in x && x.group === field.group) as { fields: FieldDef[] } | undefined;
      if (existing) existing.fields.push(field);
      else out.push({ group: field.group, fields: [field] });
    }
  }
  return out;
}

/** "Project URL: Must be a valid URL · …", so the problem is visible even when the field is scrolled away. */
function summarize(section: SectionDef, fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, message]) => {
      const field = section.fields.find((f) => f.key === key || translationKey(f.key, 'th') === key);
      return `${field?.label ?? key}${field && key !== field.key ? ` (${LANGUAGE_NAMES.th})` : ''}: ${message}`;
    })
    .join(' · ');
}

/** Fields that read as a pair and share a line: a start and end date, a domain and its subdomains. */
const pairKind = (f: FieldDef) => (f.type === 'date' ? 'date' : f.domainList ? 'domain' : null);

interface FieldPart {
  /** On one line together, even on a phone. */
  pair: FieldDef[];
  /** Checkboxes under the dates ("No end date"), in a row of their own. */
  checks: FieldDef[];
  rest: FieldDef[];
}

/**
 * A group's fields in parts, each set apart by a thin line: the pairs (see pairKind), and the fields between them.
 * Dates take the rest of the group with them (their checkboxes, a progress). Positions in a two-column grid would
 * otherwise put a start date beside "Online" and push its end date onto the next line.
 */
function fieldParts(fields: FieldDef[]): FieldPart[] {
  const parts: FieldPart[] = [];
  for (let i = 0; i < fields.length; ) {
    const kind = pairKind(fields[i]);
    let j = i;
    while (j < fields.length && pairKind(fields[j]) === kind) j++;
    if (kind === 'date') {
      const tail = fields.slice(j);
      parts.push({ pair: fields.slice(i, j), checks: tail.filter((f) => f.type === 'boolean'), rest: tail.filter((f) => f.type !== 'boolean') });
      break;
    }
    parts.push(kind ? { pair: fields.slice(i, j), checks: [], rest: [] } : { pair: [], checks: [], rest: fields.slice(i, j) });
    i = j;
  }
  return parts;
}

/** Renders a form for any section from its field config. */
export default function EntryForm({ section, initial, submitLabel = 'Save', onSubmit, onSaveDraft, draftLabel = 'Save draft', onCancel, autoSave, backupKey, onDirtyChange, notice, variant = 'page' }: Props) {
  // A new entry typed before and not saved comes back as it was left.
  const [restored, setRestored] = useState(() => (backupKey ? readBackup(backupKey) : null));
  const [initialValues] = useState(() => ({ ...emptyValues(section, initial), ...restored }));
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState<'save' | 'draft' | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>([]);
  // Unique per form: a nested form (e.g. "New certificate") has fields with the same keys.
  const idPrefix = useId();
  // Which version of the text is being edited; starts in the language the profile is shown in.
  const profileLanguage = useLanguage();
  const translated = section.fields.some((f) => f.translatable);
  const [lang, setLang] = useState<Language>(translated ? profileLanguage : 'en');

  // Thai already given with each English category, filled in when one is picked.
  const knownThai = useSuggestionThai(section);
  const domainRows = useEntriesBySection(section.fields.some((f) => f.domainList) ? [DOMAIN_LIST] : []).get(DOMAIN_LIST) ?? [];
  const set = (key: string, value: string) => {
    // A domain taken off: its subdomains go with it, unless another domain picked has them too (or they're new).
    for (const child of section.fields.filter((f) => f.parent === key)) {
      setValues((v) => {
        const kept = new Set(splitList(value).map(orgKey));
        const removed = splitList(v[key]).filter((d) => !kept.has(orgKey(d)));
        if (!removed.length) return v;
        const stillUnder = new Set(domainOptions(child, value, domainRows).map((o) => orgKey(o.name)));
        const gone = new Set(domainOptions(child, removed.join(','), domainRows).map((o) => orgKey(o.name)));
        return { ...v, [child.key]: splitList(v[child.key]).filter((sub) => stillUnder.has(orgKey(sub)) || !gone.has(orgKey(sub))).join(', ') };
      });
    }
    const known = knownThai.get(key);
    const clears = section.fields.find((f) => f.key === key)?.clears;
    // A different English value: its Thai, never the old value's (Film doesn't keep วิศวกรรม from Engineering).
    if (known) {
      const thKey = translationKey(key, 'th');
      const th = known.get(orgKey(value)) ?? '';
      setValues((v) => (orgKey(v[key]) === orgKey(value) ? { ...v, [key]: value } : { ...v, [key]: value, [thKey]: th }));
    } else if (clears && value === 'true') {
      // "No end date" ticked: an end date typed before no longer applies.
      setValues((v) => ({ ...v, [key]: value, [clears]: '' }));
    } else setValues((v) => ({ ...v, [key]: value }));
    // Thai names typed for organizations taken off again aren't sent.
    if (section.fields.some((f) => f.key === key && f.organization)) {
      const named = new Set(section.fields.filter((f) => f.organization).flatMap((f) => splitOrganizations(f.key === key ? value : values[f.key]).map(orgKey)));
      setOrganizationThai((o) => Object.fromEntries(Object.entries(o).filter(([k]) => named.has(orgKey(k.slice(ORGANIZATION_THAI.length))))));
    }
  };
  // Links stored on other entries (a project's "Linked posts"), by linkedFromKey; only those changed here are sent,
  // so links made elsewhere meanwhile aren't undone.
  // A new certificate made from an activity starts with the activity's posts (see FieldDef.newFrom).
  const [linkedFrom, setLinkedFrom] = useState<Record<string, string>>(() => pickLinkedFrom(section, { ...initial, ...restored }));
  // Thai names of the organizations named here, by organizationThaiKey, stored on the organizations; sent once typed.
  const [organizationThai, setOrganizationThai] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(restored ?? {}).filter(([k]) => k.startsWith(ORGANIZATION_THAI))),
  );
  const data = { ...values, ...linkedFrom, ...organizationThai };
  const dataKey = JSON.stringify(data);

  // "+ New certificate" on an activity: the sections linking both (posts), to give the new one the same links.
  const shared = (f: FieldDef) => linkedFromFields(f.refSection!).filter((l) => linkedFromFields(section.key).some((own) => own.section.key === l.section.key));
  const linkers = useEntriesBySection([...new Set(section.fields.filter((f) => f.newFrom).flatMap((f) => shared(f).map((l) => l.section.key)))]);
  /** What a new entry made with this field's "+ New" starts with (see FieldDef.newFrom). */
  const newValuesFor = (f: FieldDef): EntryInput => {
    const target = getSection(f.refSection!)!;
    const copied = Object.entries(f.newFrom?.copy ?? {}).flatMap(([to, from]) => (values[from]?.trim() ? [[to, values[from]]] : []));
    const links = shared(f).flatMap(({ section: from }) => {
      const key = linkedFromKey(from.key);
      // As ticked in this form, else as stored (posts name the activity in their own field).
      const field = linkedFromFields(section.key).find((l) => l.section.key === from.key)!.field;
      const stored = initial?.id ? (linkers.get(from.key) ?? []).filter((e) => splitList(e[field.key]).includes(initial.id!)).map((e) => e.id) : [];
      const ids = linkedFrom[key] ?? stored.join(',');
      return ids ? [[key, ids]] : [];
    });
    const defaults = target.fields.flatMap((f) => (f.default ? [[f.key, f.default]] : []));
    return { ...Object.fromEntries(defaults), ...seedTitle(target, section, values), ...Object.fromEntries([...copied, ...links]) };
  };

  // Auto-save (existing entries): what was last saved, what last failed (not retried until it changes), and whether
  // the focus is in a field that holds it back.
  const [savedKey, setSavedKey] = useState(() => JSON.stringify(initialValues));
  const [failedKey, setFailedKey] = useState('');
  const [autoState, setAutoState] = useState<'saving' | 'saved' | 'failed' | null>(null);
  const [holding, setHolding] = useState(false);
  // Manual saves bring the first problem into view; auto-saves don't take the focus from what's being typed.
  const [focusErrors, setFocusErrors] = useState(false);

  // A file waiting to upload can't be kept or auto-saved, so closing would lose it; so would an auto-save that failed.
  const dirty = autoSave
    ? pendingMedia.length > 0 || (dataKey !== savedKey && (dataKey === failedKey || autoState === 'failed'))
    : backupKey
      ? pendingMedia.length > 0
      : pendingMedia.length > 0 || Object.keys(linkedFrom).length > 0 || Object.keys(organizationThai).length > 0 || formKeys(section).some((key) => values[key] !== initialValues[key]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // A new entry: keep it in this browser as it's typed (nothing typed yet: nothing kept).
  useEffect(() => {
    if (!backupKey) return;
    if (dataKey === JSON.stringify({ ...emptyValues(section, initial), ...pickLinkedFrom(section, initial) })) clearBackup(backupKey);
    else writeBackup(backupKey, JSON.parse(dataKey));
  }, [backupKey, dataKey, section, initial]);

  async function runAutoSave(sent: EntryInput, key: string) {
    setAutoState('saving');
    try {
      await autoSave!(sent);
      setSavedKey(key);
      setAutoState('saved');
      setErrors({});
      setFormError('');
    } catch (err) {
      setFailedKey(key);
      setAutoState('failed');
      setFocusErrors(false);
      setErrors(err instanceof ApiError && err.fields ? err.fields : {});
      setFormError(`Not saved: ${err instanceof ApiError && err.fields ? summarize(section, err.fields) : (err as Error).message}`);
    }
  }

  // Save a moment after the last change, one save at a time.
  useEffect(() => {
    if (!autoSave || holding || saving || autoState === 'saving' || dataKey === savedKey || dataKey === failedKey) return;
    const timer = setTimeout(() => void runAutoSave(JSON.parse(dataKey), dataKey), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  });

  // Closing the form inside the pause still saves the last change.
  const unsaved = useRef<EntryInput | null>(null);
  useEffect(() => {
    unsaved.current = autoSave && dataKey !== savedKey && dataKey !== failedKey && autoState !== 'saving' ? JSON.parse(dataKey) : null;
  });
  useEffect(
    () => () => {
      if (unsaved.current) void autoSave?.(unsaved.current).catch(() => {});
    },
    // Only on closing: autoSave is the same function for the form's lifetime.
    [],
  );

  function onFocusChange(e: FocusEvent<HTMLFormElement>) {
    setHolding(e.type === 'focus' && !!(e.target as Element).closest('[data-hold-autosave]'));
  }

  function startOver() {
    if (backupKey) clearBackup(backupKey);
    setRestored(null);
    setValues(emptyValues(section, initial));
    setLinkedFrom({});
    setOrganizationThai({});
  }

  // Bring the first invalid field into view (switching language if needed).
  useEffect(() => {
    if (!focusErrors) return;
    const first = formKeys(section).find((key) => errors[key]);
    const tab = first && tabOf(section, first);
    if (tab && tab !== lang) return setLang(tab);
    const el = first && document.getElementById(`${idPrefix}-${first}`);
    if (!el) return;
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }, [errors, section, idPrefix, lang, focusErrors]);
  const modal = variant === 'modal';

  async function save(action: (data: EntryInput, media: PendingMedia[]) => Promise<unknown>, kind: 'save' | 'draft') {
    setSaving(kind);
    setErrors({});
    setFormError('');
    setFocusErrors(true);
    // No `finally`: the React Compiler can't optimize components that use it yet.
    try {
      await action(data, pendingMedia);
      // Saved: nothing left for an auto-save or the browser to keep.
      setSavedKey(dataKey);
      if (backupKey) clearBackup(backupKey);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(err.fields);
        setFormError(summarize(section, err.fields));
      } else {
        setFormError((err as Error).message);
      }
    }
    setSaving(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // a form in a nested dialog (e.g. "New certificate") mustn't submit the outer one
    void save(onSubmit, 'save');
  }

  return (
    <form onSubmit={handleSubmit} onFocus={onFocusChange} onBlur={onFocusChange} className={modal ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'}>
      <div className={`grid content-start gap-4 sm:grid-cols-2 ${modal ? 'flex-1 overflow-y-auto overscroll-contain px-5 py-4' : ''}`}>
        {restored && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900 sm:col-span-2 dark:bg-blue-500/10 dark:text-blue-100">
            Brought back what you typed last time.
            <button type="button" onClick={startOver} className="rounded px-2 py-1 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-500/20">
              Start over
            </button>
          </div>
        )}
        {translated && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-2">
            <LanguageSwitch value={lang} onChange={setLang} label="Language to edit" names="full" />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'en'
                ? 'Fields marked ไทย also have a Thai version.'
                : 'Thai text for the fields marked ไทย. An organization gets its Thai name here, shown wherever it appears; skills and domains get theirs on the Skills and Domains pages.'}
            </span>
          </div>
        )}
        {layout(section.fields).map((item) => {
          const field = (base: FieldDef, inline = false) => {
            if (section.fields.some((c) => c.clears === base.key && values[c.key] === 'true')) return null;
            const f = inLanguage(base, lang);
            // On the Thai side, a domain's subdomains each get their Thai.
            if (base.thaiPerItem && lang === 'th') {
              return (
                <div key={base.key} className="sm:col-span-2">
                  <ItemThaiInput id={`${idPrefix}-${f.key}`} field={base} items={splitList(values[base.key])} value={values[f.key]} onChange={(v) => set(f.key, v)} />
                </div>
              );
            }
            // On the Thai side an organization field takes each organization's Thai name (stored on the organization).
            if (base.organization && lang === 'th') {
              return (
                <div key={base.key} data-hold-autosave>
                  <OrganizationThaiInput
                    id={`${idPrefix}-${base.key}-th`}
                    field={base}
                    names={values[base.key]}
                    thai={organizationThai}
                    errors={errors}
                    onChange={(name, v) => {
                      const key = organizationThaiKey(name);
                      setOrganizationThai((o) => ({ ...o, [key]: v }));
                    }}
                  />
                </div>
              );
            }
            return (
              <div key={base.key} data-hold-autosave={holdsAutoSave(section, base) || undefined} className={f.type === 'textarea' || f.type === 'refs' || f.type === 'links' || f.type === 'media' ? 'sm:col-span-2' : ''}>
                <FieldInput
                  id={`${idPrefix}-${f.key}`}
                  section={section}
                  entryId={initial?.id}
                  field={f}
                  inline={inline}
                  // Organizations are marked too: their Thai name is given on the Thai side.
                  lang={base.translatable || base.organization ? lang : undefined}
                  tab={lang}
                  english={f.key !== base.key ? values[base.key] : undefined}
                  parentValue={base.parent && values[base.parent]}
                  newValues={f.newFrom ? newValuesFor(f) : undefined}
                  values={f.type === 'media' ? values : undefined}
                  value={values[f.key]}
                  onChange={(v) => set(f.key, v)}
                />
                {errors[f.key] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[f.key]}</p>}
              </div>
            );
          };
          if (!('fields' in item)) return field(item);
          // A box of links (certificates, a post's entries) says how many are picked.
          const linked = item.fields.filter((f) => f.type === 'refs').reduce((n, f) => n + splitList(values[f.key]).length, 0);
          return (
            <FieldBox key={item.group} id={`${idPrefix}-group-${groupId(item.group)}`} title={item.group} note={linked > 0 ? `${linked} linked` : undefined}>
              {fieldParts(item.fields).map(({ pair, checks, rest }, i) => (
                <div key={(pair[0] ?? rest[0]).key} className={`grid gap-4 sm:col-span-2 sm:grid-cols-2 ${i > 0 ? 'border-t border-slate-200 pt-4 dark:border-slate-700/70' : ''}`}>
                  {pair.length > 0 && (
                    // Dates fit side by side on a phone; a domain picker needs the room there.
                    <div className={`grid gap-3 sm:col-span-2 sm:grid-cols-2 sm:gap-4 ${pairKind(pair[0]) === 'date' ? 'grid-cols-2' : ''}`}>{pair.map((f) => field(f))}</div>
                  )}
                  {checks.length > 0 && <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">{checks.map((f) => field(f, true))}</div>}
                  {rest.map((f) => field(f))}
                </div>
              ))}
            </FieldBox>
          );
        })}
        {linkedFromFields(section.key).length > 0 && (
          <FieldBox id={`${idPrefix}-group-linked-from`} title={linkedFromFields(section.key).map((l, i) => (i ? l.section.label.toLowerCase() : l.section.label)).join(' & ')}>
            {linkedFromFields(section.key).map(({ section: from, field }) => {
              const key = linkedFromKey(from.key);
              return (
                <div key={key} className="sm:col-span-2">
                  <LinkedFromInput
                    id={`${idPrefix}-${from.key}-linked`}
                    section={section}
                    entryId={initial?.id}
                    from={from}
                    field={field}
                    values={values}
                    value={linkedFrom[key]}
                    onChange={(v) => setLinkedFrom((l) => ({ ...l, [key]: v }))}
                  />
                  {errors[key] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[key]}</p>}
                </div>
              );
            })}
          </FieldBox>
        )}
        {/* An organization has just its logo. */}
        {section.media?.logo && (
          <div className="sm:col-span-2">
            <LogoField section={section} entryId={initial?.id} pending={pendingMedia} onPendingChange={setPendingMedia} />
          </div>
        )}
        {/* The About page's images are in its header instead. */}
        {section.media && !hasImageSlots(section) && (
          // Each block on its own: a credential's own file (the certificate itself), the detail files (an agenda, a
          // brochure), then the other media (photos, videos).
          <FieldBox id={`${idPrefix}-group-files`} title="Files">
            {(section.media.credential ? (['credential', 'detail', 'media'] as const) : section.media.plain ? ([undefined] as const) : (['detail', undefined] as const)).map((role) => (
              <div key={role ?? 'media'} className="sm:col-span-2">
                <MediaField
                  section={section}
                  entryId={initial?.id}
                  role={role}
                  label={role === 'credential' ? section.media!.credential!.label : role === 'detail' ? DETAIL_FILES : 'Media'}
                  pending={pendingMedia.filter((p) => p.role === role)}
                  onPendingChange={(list) => setPendingMedia((all) => [...all.filter((p) => p.role !== role), ...list.map((p) => ({ ...p, role }))])}
                />
              </div>
            ))}
          </FieldBox>
        )}
      </div>
      <div className={`space-y-3 ${modal ? 'border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800' : ''}`}>
        {notice}
        {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        <div className="flex gap-2 *:flex-1 sm:*:flex-none">
          <button
            type="submit"
            disabled={!!saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving === 'save' ? 'Saving…' : submitLabel}
          </button>
          {onSaveDraft && (
            <button
              type="button"
              disabled={!!saving}
              onClick={() => save(onSaveDraft, 'draft')}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {saving === 'draft' ? 'Saving…' : draftLabel}
            </button>
          )}
          {(autoSave || backupKey) && (
            <p aria-live="polite" className="self-center text-xs text-slate-500 dark:text-slate-400">
              {!autoSave
                ? 'Kept in this browser until you save'
                : autoState === 'saving'
                  ? 'Saving…'
                  : dataKey === failedKey
                    ? '' // the problem shows above
                    : dataKey !== savedKey
                      ? holding
                        ? 'Saves when you leave this field'
                        : 'Saving in a moment…'
                      : autoState === 'saved'
                        ? 'Saved'
                        : 'Changes save automatically'}
            </p>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

interface FieldInputProps {
  id: string;
  section: SectionDef;
  entryId?: string;
  field: FieldDef;
  /** For a translated field: the language of this version of it. */
  lang?: Language;
  /** For a Thai version: the English text, to translate from. */
  english?: string;
  /** The language being edited: organizations and skills show their names in it. */
  tab?: Language;
  /** For a field with a parent (a subdomain): the parent's value (its domain). */
  parentValue?: string;
  /** A checkbox in a row of its own (under the dates), rather than beside a labelled input it lines up with. */
  inline?: boolean;
  /** For 'refs': what "+ New" fills in to start with (see FieldDef.newFrom). */
  newValues?: Record<string, string>;
  /** For 'media': the form's values, whose linked entries offer their files first. */
  values?: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}

function FieldInput({ id, section, entryId, field, lang, english, tab = 'en', parentValue, inline, newValues, values, value, onChange }: FieldInputProps) {

  if (field.type === 'boolean') {
    return (
      <label htmlFor={id} className={`flex items-center gap-2 text-sm ${inline ? '' : 'pt-6'}`}>
        <input id={id} type="checkbox" checked={value === 'true'} onChange={(e) => onChange(String(e.target.checked))} />
        {field.label}
      </label>
    );
  }

  if (field.type === 'media') return <MediaPicker id={id} section={section} values={values ?? {}} field={field} value={value} onChange={onChange} />;

  if (field.type === 'refs') return <RefsInput id={id} section={section} entryId={entryId} field={field} value={value} newValues={newValues} onChange={onChange} />;

  const over = field.max !== undefined && value.length > field.max;
  let control;
  switch (field.type) {
    case 'textarea':
      control = (
        <textarea id={id} lang={lang} rows={field.max && field.max >= 2000 ? 8 : 4} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case 'select':
      control = (
        <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.placeholder ?? '—'}</option>
          {field.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'links':
      control = <LinksInput id={id} value={value} onChange={onChange} withEmail={field.accountEmail} />;
      break;
    case 'tags':
      if (field.domainList) {
        control = <DomainInput id={id} section={section} field={field} lang={tab} parentValue={parentValue ?? ''} value={value} onChange={onChange} />;
        break;
      }
      control = (
        <TagsInput
          id={id}
          section={section.key}
          field={field.key}
          lookupSection={field.skill ? SKILLS : undefined}
          lang={tab}
          value={value}
          onChange={onChange}
          placeholder={english?.trim() || field.placeholder}
        />
      );
      break;
    default: {
      if (field.organization) {
        control = (
          <TagsInput id={id} section={section.key} field={field.key} lookupSection={ORGANIZATIONS} organizations value={value} onChange={onChange} placeholder={field.placeholder ?? 'Select or type, then Enter; add several if needed'} />
        );
        break;
      }
      if (field.locationList) {
        control = <LocationInput id={id} value={value} onChange={onChange} placeholder={field.placeholder} />;
        break;
      }
      if (field.suggestions) {
        control = <SuggestionInput id={id} section={section.key} field={field} english={english} value={value} onChange={onChange} />;
        break;
      }
      const type = field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : 'text';
      control = <input id={id} lang={lang} type={type} className={inputClass} placeholder={english?.trim() || field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
    }
  }

  return (
    <>
      <div className="mb-1 flex min-h-6 items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
          {lang && <ThaiMark editing={lang} />}
        </label>
        <span className="flex items-center gap-1">
          {field.max && (
            <span className={`text-xs ${over ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
              {value.length}/{field.max}
            </span>
          )}
          {value.trim() && <CopyButton text={value.trim()} label={field.label.toLowerCase()} />}
        </span>
      </div>
      {control}
      {/* Long English text stays in view while it's translated (short text is the input's placeholder). */}
      {field.type === 'textarea' && english?.trim() && (
        <details className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer">English</summary>
          <p className="mt-1 whitespace-pre-line">{english.trim()}</p>
        </details>
      )}
    </>
  );
}

/**
 * "Linked posts" on a project (and the like): the posts whose "Linked to" names this entry. Ticking one adds the
 * link to that post; `value` is unset until something is ticked here.
 */
function LinkedFromInput({ id, section, entryId, from, field, values, value, onChange }: { id: string; section: SectionDef; entryId?: string; from: SectionDef; field: FieldDef; values: EntryInput; value?: string; onChange: (v: string) => void }) {
  const { data = [] } = useEntries(from.key);
  // A new post starts named after this entry, its Thai title too (a school's from its organization's Thai name).
  const organizations = useEntriesBySection(from.titleFromLinked ? [ORGANIZATIONS] : []).get(ORGANIZATIONS);
  const newValues = from.titleFromLinked ? seedTitle(from, section, values, { organizations }) : undefined;
  const current = entryId ? data.filter((e) => splitList(e[field.key]).includes(entryId)).map((e) => e.id) : [];
  // "+ New post" saves the post at once; it links to this entry when the form is saved, like a new certificate.
  const picker: FieldDef = { key: linkedFromKey(from.key), label: `Linked ${from.label.toLowerCase()}`, type: 'refs', refSection: from.key, createInline: true };
  return <RefsInput id={id} section={section} entryId={entryId} field={picker} value={value ?? current.join(',')} newValues={newValues} onChange={onChange} />;
}

/**
 * Fields that belong together (a role, where & when, the links), in a lightly tinted box under a small heading, so
 * a long form reads in parts. Two columns inside on wider screens, like the form itself.
 */
function FieldBox({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2 sm:p-4 dark:border-slate-800 dark:bg-slate-800/30">
      <p id={id} className="mb-3 flex items-baseline justify-between gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {title}
        {note && <span className="font-normal tracking-normal normal-case">{note}</span>}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Domains or subdomains as chips, offering those on the Domains page: subdomains only under the domains picked. */
function DomainInput({ id, section, field, lang, parentValue, value, onChange }: { id: string; section: SectionDef; field: FieldDef; lang: Language; parentValue: string; value: string; onChange: (v: string) => void }) {
  const { data = [] } = useEntries(DOMAIN_LIST);
  const options = domainOptions(field, parentValue, data);
  return <TagsInput id={id} section={section.key} field={field.key} options={options} lang={lang} value={value} onChange={onChange} placeholder={field.placeholder} />;
}

/**
 * The Thai of each item of a thaiPerItem field (a domain's subdomains), one input per English item, kept as pairs
 * (see itemThai). An item taken off on the English side drops its Thai.
 */
function ItemThaiInput({ id, field, items, value, onChange }: { id: string; field: FieldDef; items: string[]; value: string; onChange: (v: string) => void }) {
  const thai = itemThai(value);
  return (
    <fieldset>
      <legend className="mb-1 flex min-h-6 items-center text-sm font-medium text-slate-700 dark:text-slate-300">
        {field.label}
        <ThaiMark editing="th" />
      </legend>
      {!items.length && <p className="text-xs text-slate-500 dark:text-slate-400">Add the {field.label.toLowerCase()} on the English side first.</p>}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={orgKey(item)} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={`${id}-${i}`} className="w-40 shrink-0 text-sm text-slate-600 dark:text-slate-400">
              {item}
            </label>
            <input
              id={`${id}-${i}`}
              lang="th"
              className={`${inputClass} min-w-0 flex-1`}
              placeholder={item}
              value={thai.get(orgKey(item)) ?? ''}
              onChange={(e) => onChange(joinItemThai(items, new Map([...thai, [orgKey(item), e.target.value]])))}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * An organization field on the form's Thai side: each organization's Thai name, shown wherever it appears. A name not
 * typed here (`thai` has no key for it) shows the Thai name it already has.
 */
function OrganizationThaiInput({
  id,
  field,
  names,
  thai,
  errors,
  onChange,
}: {
  id: string;
  field: FieldDef;
  names: string;
  thai: Record<string, string>;
  errors: Record<string, string>;
  onChange: (name: string, th: string) => void;
}) {
  const { data = [] } = useEntries(ORGANIZATIONS);
  const named = splitOrganizations(names);
  return (
    <fieldset>
      <legend className="mb-1 flex min-h-6 items-center text-sm font-medium text-slate-700 dark:text-slate-300">
        {field.label}
        <ThaiMark editing="th" />
      </legend>
      {!named.length && <p className="text-xs text-slate-500 dark:text-slate-400">Pick the {field.label.toLowerCase()} on the English side first.</p>}
      <div className="space-y-3">
        {named.map((name, i) => {
          const org = data.find((o) => orgKey(o.name) === orgKey(name));
          const key = organizationThaiKey(name);
          return (
            <div key={orgKey(name)}>
              {named.length > 1 && (
                <label htmlFor={`${id}-${i}`} className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {name}
                </label>
              )}
              <input
                id={`${id}-${i}`}
                lang="th"
                aria-label={named.length > 1 ? undefined : `${field.label} in Thai`}
                className={inputClass}
                placeholder={name}
                value={thai[key] ?? org?.[translationKey('name', 'th')] ?? ''}
                onChange={(e) => onChange(name, e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {org ? `The Thai name of “${org.name}”, shown wherever it appears.` : `A new organization: “${name}” is added with this Thai name when you save.`}
              </p>
              {errors[key] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[key]}</p>}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
