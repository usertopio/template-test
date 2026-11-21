import { useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { LOCATION_LIST, ORGANIZATIONS, getSection, joinOrganizations, orgKey, splitList, splitOrganizations, suggestionSections, suggestionThai, translationKey, type FieldDef, type Language } from '@profile/shared';
import { useEntries, useEntriesBySection } from '../api';
import { uniqueTags } from '../listing';

interface Choice {
  key: string;
  label: ReactNode;
  pick: () => void;
}

export const inputClass =
  'w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-base shadow-sm sm:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

/** Open state and arrow/Enter/Esc handling for a list of choices under an input. */
function useChoices(choices: Choice[]) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const index = Math.min(active, choices.length - 1);
  const shown = open && choices.length > 0;

  /** Returns true when the key was handled. */
  function onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown) setOpen(true);
      else setActive((index + (e.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length);
      return true;
    }
    if (e.key === 'Enter' && shown && choices[index]) {
      e.preventDefault(); // pick instead of submitting the form
      choices[index].pick();
      return true;
    }
    if (e.key === 'Escape' && shown) {
      e.preventDefault(); // close the list, not the surrounding modal
      e.stopPropagation();
      setOpen(false);
      return true;
    }
    return false;
  }

  return { shown, index, setActive, setOpen, onKeyDown };
}

function ChoiceList({ id, choices, index, onHover }: { id: string; choices: Choice[]; index: number; onHover: (i: number) => void }) {
  return (
    <ul
      id={id}
      role="listbox"
      className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      {choices.map((c, i) => (
        <li
          key={c.key}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === index}
          // mousedown keeps focus in the input
          onMouseDown={(e) => e.preventDefault()}
          onClick={c.pick}
          onMouseMove={() => onHover(i)}
          className={`cursor-pointer rounded px-2 py-2.5 text-sm sm:py-1.5 ${i === index ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
        >
          {c.label}
        </li>
      ))}
    </ul>
  );
}

const leftContainer = (e: FocusEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null);

/**
 * Pick one of `names` or type a new value. `noun` names what is picked, e.g. "organization"
 * for "Add “X” as a new organization".
 */
function ComboInput({
  id,
  names: unsorted,
  noun,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  names: string[];
  noun: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Show every name until the user types, so the list works as a plain dropdown too.
  const [filtering, setFiltering] = useState(false);

  const names = [...new Map(unsorted.filter(Boolean).map((n) => [orgKey(n), n])).values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  const q = orgKey(value);
  const matches = filtering && q ? names.filter((n) => orgKey(n).includes(q)) : names;
  const exists = names.some((n) => orgKey(n) === q);

  const choices: Choice[] = matches.map((name) => ({
    key: name,
    label: (
      <span className="flex justify-between gap-2">
        {name}
        {orgKey(name) === q && <span className="text-blue-600 dark:text-blue-400">✓</span>}
      </span>
    ),
    pick: () => {
      onChange(name);
      list.setOpen(false);
    },
  }));
  if (q && !exists) {
    choices.push({
      key: '__new',
      label: (
        <span>
          Add <strong>“{value.trim()}”</strong> <span className="text-slate-500 dark:text-slate-400">as a new {noun}</span>
        </span>
      ),
      pick: () => {
        onChange(value.trim().replace(/\s+/g, ' '));
        list.setOpen(false);
      },
    });
  }
  const list = useChoices(choices);

  function openAll() {
    setFiltering(false);
    list.setActive(Math.max(0, matches.indexOf(names.find((n) => orgKey(n) === q) ?? '')));
    list.setOpen(true);
  }

  return (
    <div className="relative" onBlur={(e) => leftContainer(e) && list.setOpen(false)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={list.shown}
        aria-controls={`${id}-list`}
        aria-activedescendant={list.shown ? `${id}-list-${list.index}` : undefined}
        autoComplete="off"
        className={`${inputClass} pr-9`}
        placeholder={placeholder ?? 'Select or type a new one'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFiltering(true);
          list.setActive(0);
          list.setOpen(true);
        }}
        onFocus={openAll}
        onClick={() => !list.shown && openAll()}
        onKeyDown={list.onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show choices"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          inputRef.current?.focus();
          if (list.shown) list.setOpen(false);
          else openAll();
        }}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        ▾
      </button>
      {list.shown && <ChoiceList id={`${id}-list`} choices={choices} index={list.index} onHover={list.setActive} />}
    </div>
  );
}

/** A name as shown in `lang`: the Thai name given on its page (Organizations, Skills), else the English. */
const nameIn = (entry: Record<string, string>, lang: Language) => entry[translationKey('name', lang)]?.trim() || entry.name;

/**
 * Pick one of a field's suggestions or a value already used in it, or type a new one (offered from then on).
 * Values used in every section sharing the list count (a domain typed on a project is offered on activities too).
 * The field's Thai version (`english` given) offers only the Thai used with that English value, so วิศวกรรม is
 * offered for Engineering and not for Film.
 */
export function SuggestionInput({
  section,
  field,
  english,
  ...props
}: {
  id: string;
  section: string;
  field: FieldDef;
  english?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // A Thai version has its English field's list.
  const base = getSection(section)?.fields.find((f) => f.key !== field.key && translationKey(f.key, 'th') === field.key);
  const sharing = suggestionSections(base ?? field).map((s) => s.section.key);
  const bySection = useEntriesBySection([...new Set([section, ...sharing])]);
  const entries = [...bySection.values()].flat();
  const names = base
    ? entries.filter((e) => !english?.trim() || orgKey(e[base.key]) === orgKey(english)).map((e) => e[field.key]?.trim())
    : [...(field.suggestions ?? []), ...entries.map((e) => e[field.key]?.trim())];
  return <ComboInput {...props} noun={field.label.toLowerCase()} names={names} placeholder={field.placeholder} />;
}

/** Pick a place on the Locations page, or type a new one (added there when the entry is saved). */
export function LocationInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { data = [] } = useEntries(LOCATION_LIST);
  return <ComboInput id={id} noun="place" names={data.map((l) => l.name?.trim())} value={value} onChange={onChange} placeholder={placeholder} />;
}

/** For each translated field with suggestions, the Thai given with each English value (see suggestionThai). */
export function useSuggestionThai(section: { key: string; fields: FieldDef[] }): Map<string, Map<string, string>> {
  const fields = section.fields.filter((f) => f.suggestions?.length && f.translatable);
  const bySection = useEntriesBySection([...new Set(fields.flatMap((f) => suggestionSections(f).map((s) => s.section.key)))]);
  return new Map(
    fields.map((f) => [f.key, suggestionThai(f, suggestionSections(f).flatMap((s) => bySection.get(s.section.key) ?? []))]),
  );
}

/** Tag matching ignores case and a leading '#', so "film" finds "#film". */
const hashtagKey = (t: string) => t.trim().replace(/^#+/, '').toLowerCase();

/**
 * Chips for a comma-separated tags field, suggesting tags already used in this field of the section,
 * plus the names in `lookupSection` (e.g. the Skills page) when given. With `organizations`, the chips are
 * organizations separated by ";" (see splitOrganizations), matched ignoring case and spacing. `options` instead
 * offers just those names (with their Thai), e.g. the domains on the Domains page.
 */
export function TagsInput({
  id,
  section,
  field,
  value,
  onChange,
  placeholder,
  lookupSection,
  lang = 'en',
  organizations = false,
  options,
}: {
  id: string;
  section: string;
  field: string;
  lookupSection?: string;
  options?: { name: string; name_th: string }[];
  organizations?: boolean;
  /** With `lookupSection`: its names show in this language (picked ones are still stored in English). */
  lang?: Language;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { data: own = [] } = useEntries(section);
  const { data: looked = [] } = useEntries(lookupSection ?? section);
  // Given options stand in for the names looked up, and nothing else is offered.
  const data = options ? [] : own;
  const lookup: Record<string, string>[] = options ?? looked;
  const looksUp = !!options || !!lookupSection;
  const [text, setText] = useState('');
  const split = organizations ? splitOrganizations : splitList;
  const join = organizations ? joinOrganizations : (items: string[]) => items.join(', ');
  const separator = organizations ? ';' : ',';
  const tagKey = organizations ? orgKey : hashtagKey;
  const tags = split(value);
  const taken = new Set(tags.map(tagKey));
  // A tag as shown, and a typed name (English or Thai) as stored.
  const named = (t: string) => (looksUp && lookup.find((e) => tagKey(e.name) === tagKey(t))) || undefined;
  const shown = (t: string) => {
    const entry = named(t);
    return entry ? nameIn(entry, lang) : t;
  };
  const stored = (t: string) => (looksUp && lookup.find((e) => tagKey(nameIn(e, lang)) === tagKey(t))?.name) || t;

  function add(...items: string[]) {
    const next = [...tags];
    for (const item of items.map((t) => stored(t.trim())).filter(Boolean)) {
      if (next.some((t) => tagKey(t) === tagKey(item))) continue;
      next.push(item);
    }
    onChange(join(next));
    setText('');
  }
  const remove = (tag: string) => onChange(join(tags.filter((t) => t !== tag)));

  const q = tagKey(text);
  const known = uniqueTags([...data.flatMap((e) => split(e[field])), ...(looksUp ? lookup.map((e) => e.name.trim()).filter(Boolean) : [])]);
  const suggestions = known.filter((t) => !taken.has(tagKey(t)) && (!q || tagKey(t).includes(q) || tagKey(shown(t)).includes(q)));
  const choices: Choice[] = suggestions.map((t) => ({ key: t, label: shown(t), pick: () => add(t) }));
  if (q && !taken.has(tagKey(stored(text))) && !suggestions.some((t) => tagKey(t) === q || tagKey(shown(t)) === q)) {
    choices.push({
      key: '__new',
      label: (
        <span>
          Add <strong>“{text.trim()}”</strong>
          {organizations && <span className="text-slate-500 dark:text-slate-400"> as a new organization</span>}
        </span>
      ),
      pick: () => add(text),
    });
  }
  const list = useChoices(choices);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (list.onKeyDown(e)) return;
    if (e.key === 'Enter' && text.trim()) {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && tags.length) {
      remove(tags[tags.length - 1]);
    }
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!leftContainer(e)) return;
        list.setOpen(false);
        if (text.trim()) add(text); // don't lose a half-typed tag
      }}
    >
      <div className="flex w-full flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-slate-700 dark:bg-slate-900">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-1 pl-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {shown(t)}
            <button
              type="button"
              aria-label={`Remove ${shown(t)}`}
              onClick={() => remove(t)}
              className="rounded-full px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={list.shown}
          aria-controls={`${id}-list`}
          aria-activedescendant={list.shown ? `${id}-list-${list.index}` : undefined}
          autoComplete="off"
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-base focus:outline-none sm:text-sm dark:text-slate-100"
          placeholder={tags.length ? '' : (placeholder ?? 'Select or type, then Enter')}
          value={text}
          onChange={(e) => {
            const parts = e.target.value.split(separator);
            // A separator (typed or pasted) finishes the tags before it.
            if (parts.length > 1) {
              add(...parts.slice(0, -1));
              setText(parts[parts.length - 1]);
            } else setText(e.target.value);
            list.setActive(0);
            list.setOpen(true);
          }}
          onFocus={() => list.setOpen(true)}
          onClick={() => list.setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {list.shown && <ChoiceList id={`${id}-list`} choices={choices} index={list.index} onHover={list.setActive} />}
    </div>
  );
}
