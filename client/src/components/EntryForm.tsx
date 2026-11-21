import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ORGANIZATIONS, type FieldDef, type SectionDef } from '@profile/shared';
import { ApiError, useEntries, type EntryInput } from '../api';
import RefsInput from './RefsInput';

interface Props {
  section: SectionDef;
  initial?: EntryInput | null;
  submitLabel?: string;
  onSubmit: (data: EntryInput) => Promise<unknown>;
  onCancel?: () => void;
  /** Reports whether the values differ from `initial` (used to confirm discarding). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Shown above the buttons, e.g. a discard confirmation. */
  notice?: ReactNode;
  /** 'modal' = scrollable body with a pinned footer. */
  variant?: 'page' | 'modal';
}

const inputClass =
  'w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-base shadow-sm sm:text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function emptyValues(section: SectionDef, initial?: EntryInput | null): EntryInput {
  return Object.fromEntries(section.fields.map((f) => [f.key, initial?.[f.key] ?? '']));
}

/** Renders a form for any section from its field config. */
export default function EntryForm({ section, initial, submitLabel = 'Save', onSubmit, onCancel, onDirtyChange, notice, variant = 'page' }: Props) {
  const [initialValues] = useState(() => emptyValues(section, initial));
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const dirty = section.fields.some((f) => values[f.key] !== initialValues[f.key]);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  const modal = variant === 'modal';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={modal ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'}>
      <div className={`grid content-start gap-4 sm:grid-cols-2 ${modal ? 'flex-1 overflow-y-auto overscroll-contain px-5 py-4' : ''}`}>
        {section.fields.map((field) => (
          <div key={field.key} className={field.type === 'textarea' || field.type === 'refs' ? 'sm:col-span-2' : ''}>
            <FieldInput field={field} value={values[field.key]} onChange={(v) => set(field.key, v)} />
            {errors[field.key] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field.key]}</p>}
          </div>
        ))}
      </div>
      {section.fields.some((f) => f.organization) && <OrganizationOptions />}
      <div className={`space-y-3 ${modal ? 'border-t border-slate-200 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800' : ''}`}>
        {notice}
        {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
        <div className="flex gap-2 *:flex-1 sm:*:flex-none">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : submitLabel}
          </button>
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

function FieldInput({ field, value, onChange }: { field: FieldDef; value: string; onChange: (v: string) => void }) {
  const id = `field-${field.key}`;

  if (field.type === 'boolean') {
    return (
      <label htmlFor={id} className="flex items-center gap-2 pt-6 text-sm">
        <input id={id} type="checkbox" checked={value === 'true'} onChange={(e) => onChange(String(e.target.checked))} />
        {field.label}
      </label>
    );
  }

  if (field.type === 'refs') return <RefsInput id={id} field={field} value={value} onChange={onChange} />;

  const over = field.max !== undefined && value.length > field.max;
  let control;
  switch (field.type) {
    case 'textarea':
      control = (
        <textarea id={id} rows={field.max && field.max >= 2000 ? 8 : 4} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
      );
      break;
    case 'select':
      control = (
        <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    default: {
      const type = field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : 'text';
      control = <input id={id} type={type} className={inputClass} list={field.organization ? ORG_LIST_ID : undefined} autoComplete={field.organization ? 'off' : undefined} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
    }
  }

  return (
    <>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
        {field.max && (
          <span className={`text-xs ${over ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
            {value.length}/{field.max}
          </span>
        )}
      </div>
      {control}
    </>
  );
}

const ORG_LIST_ID = 'organization-options';

/** Autocomplete suggestions for organization fields, from the Organizations tab. */
function OrganizationOptions() {
  const { data = [] } = useEntries(ORGANIZATIONS);
  return (
    <datalist id={ORG_LIST_ID}>
      {data.map((o) => (
        <option key={o.id} value={o.name} />
      ))}
    </datalist>
  );
}
