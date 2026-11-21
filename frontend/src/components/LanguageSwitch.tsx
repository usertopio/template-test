import { LANGUAGES, LANGUAGE_NAMES, type Language } from '@profile/shared';
import { setLanguage, useLanguage } from '../language';

const SHORT: Record<Language, string> = { en: 'EN', th: 'ไทย' };

interface Props {
  value: Language;
  onChange: (lang: Language) => void;
  /** What the choice is about, for screen readers, e.g. "Profile language". */
  label: string;
  /** 'full' spells out the language ("English"); 'short' is for tight spots ("EN"). */
  names?: 'full' | 'short';
}

/** English | ไทย, as two toggle buttons. */
export function LanguageSwitch({ value, onChange, label, names = 'short' }: Props) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-slate-300 p-0.5 text-xs dark:border-slate-700">
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={value === lang}
          title={LANGUAGE_NAMES[lang]}
          onClick={() => onChange(lang)}
          className={`rounded px-2 py-1 ${value === lang ? 'bg-blue-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
        >
          {names === 'full' ? LANGUAGE_NAMES[lang] : SHORT[lang]}
        </button>
      ))}
    </div>
  );
}

/** "ไทย" beside a field's label: blue while its Thai version is edited, grey on the English side ("also has a Thai version"). */
export function ThaiMark({ editing }: { editing: Language }) {
  return (
    <span
      lang="th"
      title={editing === 'th' ? 'Thai version' : 'Also has a Thai version'}
      className={`ml-1.5 rounded px-1 py-px text-[10px] font-normal ${editing === 'th' ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}
    >
      ไทย
    </span>
  );
}

/** The language the whole profile is shown in, like LinkedIn's "View profile in". */
export default function LanguageToggle() {
  const lang = useLanguage();
  return <LanguageSwitch value={lang} onChange={setLanguage} label="Profile language" />;
}
