import { type ReactNode, type Ref, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Blend, ExternalLink, Eye, EyeOff, Globe, MapPin, Tag as TagIcon, type LucideIcon } from 'lucide-react';
import { CREDENTIALS_GROUP, DETAIL_FILES, DOMAIN_LIST, LOCATION_LIST, ORGANIZATIONS, SKILLS, domainSections, locationSections, entryFolderName, getSection, hasImageSlots, isCredentialFile, isDraft, logoOf, mediaBlock, mediaOf, organizationSections, orgKey, progressLabel, progressOf, referencingSections, LOCATION_TYPES, skillSections, splitLinks, splitList, splitOrganizations, untranslatedFields, type Entry, type MediaBlock, type FieldDef, type LocationType, type MediaItem, type Progress, type SectionDef } from '@profile/shared';
import { useEntriesBySection, useMedia } from '../api';
import { setMediaHidden, useMediaHidden } from '../hiddenMedia';
import { useLanguage, useLocalize } from '../language';
import { fieldText, filledFields, formatDate } from '../entryText';
import { filterValueOf } from '../listing';
import { CertificatePages, MediaStrip, type MediaSelection } from './Media';
import CopyButton from './CopyButton';
import { useFilterBy, useOpenPreview, usePreviewLink } from './preview';
import { LogoImage, OrgLogo } from './OrgLogo';

// An entry's summary (what list pages show) and its full card (what a preview shows).

/** An entry in another section that links to one of this section's entries. */
export interface Backlink {
  section: SectionDef;
  entry: Entry;
}

/** Map of target entry id -> entries (in other sections) that link to it. */
function collectBacklinks(backSections: ReturnType<typeof referencingSections>, related: Map<string, Entry[]>): Map<string, Backlink[]> {
  const out = new Map<string, Backlink[]>();
  for (const { section, fields } of backSections) {
    for (const entry of related.get(section.key) ?? []) {
      for (const id of new Set(fields.flatMap((f) => splitList(entry[f.key])))) {
        out.set(id, [...(out.get(id) ?? []), { section, entry }]);
      }
    }
  }
  return out;
}

/** Map of normalized name -> entries naming it, in a text field (organization) or a tags field (skills). */
function collectNameUsage(sources: ReturnType<typeof organizationSections>, related: Map<string, Entry[]>): Map<string, Backlink[]> {
  const out = new Map<string, Backlink[]>();
  for (const { section, fields } of sources) {
    for (const entry of related.get(section.key) ?? []) {
      const names = fields.flatMap((f) => (f.type === 'tags' ? splitList(entry[f.key]) : splitOrganizations(entry[f.key])));
      for (const key of new Set(names.map((n) => orgKey(n)).filter(Boolean))) {
        out.set(key, [...(out.get(key) ?? []), { section, entry }]);
      }
    }
  }
  return out;
}

/**
 * What a section's cards need besides the entries: media, the entries they link to, and the entries linking to
 * them. Those entries are in the language the profile is shown in.
 */
export function useCardData(section: SectionDef) {
  const localize = useLocalize();
  // Own media, and the certificate files of linked certificates/certifications.
  const { data: media = [] } = useMedia({ enabled: !!section.media || section.fields.some((f) => f.type === 'media') || section.fields.some((f) => f.type === 'refs' && getSection(f.refSection!)?.media?.credential) });
  // Sections this one links to (forward refs) and sections linking to it (backlinks).
  const refSections = [...new Set(section.fields.filter((f) => f.type === 'refs').map((f) => f.refSection!))];
  const backSections = referencingSections(section.key);
  // Organizations and skills are pointed at by name rather than id.
  const nameSources =
    section.key === ORGANIZATIONS
      ? organizationSections()
      : section.key === SKILLS
        ? skillSections()
        : section.key === DOMAIN_LIST
          ? domainSections().map(({ section: s, domain }) => ({ section: s, fields: [domain] }))
          : section.key === LOCATION_LIST
            ? locationSections().map(({ section: s, field }) => ({ section: s, fields: [field] }))
            : [];
  const stored = useEntriesBySection([...new Set([...refSections, ...backSections.map((b) => b.section.key), ...nameSources.map((o) => o.section.key)])]);
  // Matched by the stored (English) names and ids, shown in the profile's language.
  const backlinks = collectBacklinks(backSections, stored);
  const nameUsage = collectNameUsage(nameSources, stored);
  const related = new Map([...stored].map(([key, entries]) => [key, entries.map((e) => localize(getSection(key)!, e))]));
  const backlinksFor = (e: Entry) => [...(backlinks.get(e.id) ?? []), ...(nameUsage.get(orgKey(e.name)) ?? [])].map((b) => ({ ...b, entry: localize(b.section, b.entry) }));
  return { media, related, backlinksFor };
}

const chipClass = 'rounded-full px-2 py-0.5 text-xs';
/** A plain pill (a domain, a skill), the same everywhere on cards. */
const pillClass = `${chipClass} bg-white text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700`;
// A pill that can be clicked darkens on hover; an underline under a rounded tag reads as broken.
const pillHover = 'transition-colors hover:bg-slate-100 hover:ring-slate-300 dark:hover:bg-slate-700 dark:hover:ring-slate-600';
const linkChipClass = `${chipClass} bg-blue-50 text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/30`;

interface FilterValueProps {
  section: SectionDef;
  field: FieldDef;
  /** As stored (English), which is what filters match, though the card may show it in Thai. */
  value: string;
  /** Inside the short card, which is all one button. */
  nested?: boolean;
  title?: string;
  className?: string;
  /** What shows it can be clicked: a pill passes a darker background; plain text gets a link's colour and underline. */
  hoverClass?: string;
  children: ReactNode;
}

/**
 * A value on a card (a subdomain, a place, a skill) that shows the list filtered to it when clicked, where its field
 * has a filter (see filterValueOf); plain text otherwise. In the popup it's a button. Inside the short card it can't
 * be a button of its own, so it takes the mouse only: the keyboard opens the popup, where it is one.
 */
function FilterValue({
  section,
  field,
  value,
  nested,
  title,
  className = '',
  hoverClass = 'hover:text-blue-700 hover:underline dark:hover:text-blue-300',
  children,
}: FilterValueProps) {
  const filterBy = useFilterBy();
  const filter = filterValueOf(field, value);
  if (!filter) {
    return (
      <span title={title} className={className}>
        {children}
      </span>
    );
  }
  const apply = (e: SyntheticEvent) => {
    // Not the short card's own click, which would open the popup.
    e.stopPropagation();
    filterBy(section.key, field.key, filter);
  };
  const Tag = nested ? 'span' : 'button';
  return (
    <Tag
      {...(nested ? {} : { type: 'button' as const })}
      onClick={apply}
      title={title ? `${title}: show only these` : `Show only the ones with this ${field.label.toLowerCase()}`}
      className={`${className} cursor-pointer text-left ${hoverClass}`}
    >
      {children}
    </Tag>
  );
}

/** A category (an activity's Seminar, a skill's Engineering): a tinted tag, so it stands apart from the domain pills. */
function CategoryTag({ section, field, value, nested, children }: Omit<FilterValueProps, 'className' | 'title' | 'hoverClass'>) {
  return (
    <FilterValue
      section={section}
      field={field}
      value={value}
      nested={nested}
      title={field.label}
      hoverClass="transition-colors hover:bg-indigo-100 hover:ring-indigo-300 dark:hover:bg-indigo-500/30 dark:hover:ring-indigo-500/50"
      className={`${chipClass} inline-flex items-center gap-1 bg-indigo-50 font-medium text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30`}
    >
      <TagIcon size={12} aria-hidden className="shrink-0" />
      {children}
    </FilterValue>
  );
}

/** A list field's items as stored, in step with `shown` (the same items, maybe in Thai). */
const storedItems = (stored: string | undefined, shown: string[]) => {
  const items = splitList(stored);
  return shown.map((t, i) => items[i] ?? t);
};

const LOCATION_TYPE_ICONS: Record<LocationType, LucideIcon> = { Onsite: MapPin, Online: Globe, Hybrid: Blend };

/** Linked certifications and certificates show as badges (with their credential link) rather than plain links. */
const CREDENTIAL_ICONS: Record<string, string> = { certifications: '🏅', certificates: '📜' };

/**
 * The dates as labelled lines, start and end apart ("18-08-26 – 19-08-26" ran together): just "Date" for one with
 * no end date, "End date: Present" while current, no end line while it's still open. None without a start date.
 */
function dateLines(entry: Entry): { key: string; label: string; text: string }[] {
  if (!entry.startDate) return [];
  const start = formatDate(entry.startDate);
  if (entry.noEndDate === 'true') return [{ key: 'startDate', label: 'Date', text: start }];
  const end = entry.current === 'true' ? 'Present' : entry.endDate ? formatDate(entry.endDate) : '';
  return [{ key: 'startDate', label: 'Start date', text: start }, ...(end ? [{ key: 'endDate', label: 'End date', text: end }] : [])];
}

// Draft is amber, so waiting is orange.
const PROGRESS_CLASS: Record<Progress, string> = {
  Interested: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
  'Awaiting Results': 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  'Not Started': 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  'In Progress': 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  Completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  'Cancelled by Organizer': 'bg-slate-200 text-slate-600 line-through dark:bg-slate-700/60 dark:text-slate-400',
  'Cancelled by Applicant': 'bg-slate-200 text-slate-600 line-through dark:bg-slate-700/60 dark:text-slate-400',
  Rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
};
const PROGRESS_HOVER: Record<Progress, string> = {
  Interested: 'hover:bg-cyan-200 dark:hover:bg-cyan-500/30',
  'Awaiting Results': 'hover:bg-orange-200 dark:hover:bg-orange-500/30',
  'Not Started': 'hover:bg-sky-200 dark:hover:bg-sky-500/30',
  'In Progress': 'hover:bg-violet-200 dark:hover:bg-violet-500/30',
  Completed: 'hover:bg-emerald-200 dark:hover:bg-emerald-500/30',
  'Cancelled by Organizer': 'hover:bg-slate-300 dark:hover:bg-slate-700',
  'Cancelled by Applicant': 'hover:bg-slate-300 dark:hover:bg-slate-700',
  Rejected: 'hover:bg-rose-200 dark:hover:bg-rose-500/30',
};

function IconPill({ icon: Icon, label, filter }: { icon: LucideIcon; label: string; filter: Omit<FilterValueProps, 'children' | 'className' | 'hoverClass'> }) {
  return (
    <FilterValue {...filter} hoverClass={pillHover} className={`${pillClass} inline-flex items-center gap-1 font-normal`}>
      <Icon size={12} aria-hidden />
      {label}
    </FilterValue>
  );
}

/** The badges after a title: an activity's progress, Draft, and what isn't translated yet when shown in Thai. */
function TitleBadges({ section, stored, nested }: { section: SectionDef; stored: Entry; nested?: boolean }) {
  const lang = useLanguage();
  const untranslated = untranslatedFields(section, stored, lang);
  const field = (key: string) => section.fields.find((f) => f.key === key);
  const progressField = section.fields.find((f) => f.progress);
  const progress = progressField ? progressOf(stored) : '';
  const online = field('online');
  const locationTypeField = field('locationType');
  // Only a choice from the list: a typo typed into the sheet by hand has no icon.
  const locationType = locationTypeField ? LOCATION_TYPES.find((t) => t === stored.locationType?.trim()) : undefined;
  return (
    <>
      {progressField && progress && (
        <FilterValue section={section} field={progressField} value={progress} nested={nested} title="Progress" hoverClass={`transition-colors ${PROGRESS_HOVER[progress]}`} className={`${chipClass} font-normal ${PROGRESS_CLASS[progress]}`}>
          {progressLabel(progress, lang)}
        </FilterValue>
      )}
      {online && stored.online === 'true' && <IconPill icon={Globe} label="Online" filter={{ section, field: online, value: 'true', nested }} />}
      {locationTypeField && locationType && (
        <IconPill icon={LOCATION_TYPE_ICONS[locationType]} label={locationType} filter={{ section, field: locationTypeField, value: locationType, nested, title: 'Location type' }} />
      )}
      {isDraft(stored) && <span className={`${chipClass} bg-amber-100 font-normal text-amber-900 dark:bg-amber-500/15 dark:text-amber-200`}>Draft</span>}
      {untranslated.length > 0 && (
        <span title={`Shown in English until translated: ${untranslated.map((f) => f.label).join(', ')}`} className={`${chipClass} bg-slate-100 font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-400`}>
          No Thai yet: {untranslated.length === 1 ? untranslated[0].label.toLowerCase() : `${untranslated.length} fields`}
        </span>
      )}
    </>
  );
}

/** Fields a summary starts with, where a section has them, before its subtitle fields. */
const SUMMARY_LEAD = ['category', 'domain', 'subdomain'];

/**
 * What a list shows for an entry: its title, subtitle and dates, in the language the profile is shown in. The
 * whole summary is one button that opens the full card in a preview, so it holds no links of its own.
 */
export function EntrySummary({ section, entry: stored, media, usedBy }: { section: SectionDef; entry: Entry; media: MediaItem[]; usedBy?: Backlink[] }) {
  const openPreview = useOpenPreview();
  const lang = useLanguage();
  const entry = useLocalize()(section, stored);
  // The category pill leads, then the domains (not subtitle fields, since the first one names the Drive folder).
  const summaryKeys = [...new Set([...SUMMARY_LEAD.filter((k) => section.fields.some((f) => f.key === k)), ...(section.subtitleFields ?? [])])];
  const dates = dateLines(entry);
  // With date lines, a start date among the subtitle fields (Projects) would only repeat it.
  const subtitleFields = summaryKeys.filter((k) => !(dates.length && DATE_PARTS.has(k))).flatMap((k) => (entry[k] ? [section.fields.find((f) => f.key === k)!] : []));
  // An organization's logo goes before its name rather than counting as a file.
  const files = section.media && !hasImageSlots(section) ? mediaOf(media, stored.id).length : 0;
  const logo = section.media?.logo ? logoOf(media, stored.id) : undefined;
  return (
    <button
      type="button"
      lang={lang}
      onClick={() => openPreview?.({ section: section.key, id: stored.id })}
      title="Show the full details"
      className="-m-1 block w-[calc(100%+0.5rem)] rounded-md p-1 pr-9 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800/60"
    >
      <span className="flex flex-wrap items-center gap-2 font-medium">
        {logo && <LogoImage source={{ item: logo }} alt="" className="h-6 w-6" />}
        <span>{entry[section.titleField] || '(untitled)'}</span>
        <TitleBadges section={section} stored={stored} nested />
      </span>
      {(subtitleFields.length > 0 || dates.length > 0) && (
        // Each field on a line of its own (Domain, Category, Organizer…, then the dates), so they don't run together.
        <span className="mt-0.5 flex flex-col items-start gap-1 text-sm text-slate-700 dark:text-slate-300">
          {subtitleFields.map((f) =>
            f.organization && section.key !== ORGANIZATIONS ? (
              // Each organization a chip of its own with its logo, in the order named, so several read apart.
              <span key={f.key} className="flex flex-wrap items-center gap-1">
                <span className="text-slate-500 dark:text-slate-400">{f.label}:</span>
                {splitOrganizations(stored[f.key]).map((name, i) => (
                  <FilterValue
                    key={name}
                    section={section}
                    field={f}
                    value={name}
                    nested
                    hoverClass="transition-colors hover:border-blue-200 hover:bg-blue-100 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/25"
                    className="inline-flex items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-1.5 py-px text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200"
                  >
                    <OrgLogo name={name} className="h-4 w-4" />
                    {splitOrganizations(entry[f.key])[i] ?? name}
                  </FilterValue>
                ))}
              </span>
            ) : f.key === 'category' ? (
              // A category reads at a glance as a tag, unlabelled.
              <CategoryTag key={f.key} section={section} field={f} value={stored[f.key]} nested>
                {entry[f.key]}
              </CategoryTag>
            ) : f.type === 'tags' ? (
              // A list (a domain's subdomains) as pills, like the popup's, rather than a comma-separated line.
              <span key={f.key} className="flex flex-wrap items-center gap-1">
                <span className="text-slate-500 dark:text-slate-400">{f.label}:</span>
                {storedItems(stored[f.key], splitList(entry[f.key])).map((value, i) => (
                  <FilterValue key={value} section={section} field={f} value={value} nested hoverClass={pillHover} className={pillClass}>
                    {splitList(entry[f.key])[i]}
                  </FilterValue>
                ))}
              </span>
            ) : (
              <span key={f.key}>
                <span className="pr-1 text-slate-500 dark:text-slate-400">{f.label}:</span>
                {f.type === 'date' ? (
                  formatDate(entry[f.key])
                ) : (
                  <FilterValue section={section} field={f} value={stored[f.key]} nested>
                    {entry[f.key]}
                  </FilterValue>
                )}
                {/* The place, then where in it. */}
                {f.locationList && entry.locationDetail?.trim() && <span className="text-slate-500 dark:text-slate-400"> · {entry.locationDetail}</span>}
              </span>
            ),
          )}
          {dates.map((d) => (
            <span key={d.key}>
              <span className="pr-1 text-slate-500 dark:text-slate-400">{d.label}:</span>
              {d.text}
            </span>
          ))}
        </span>
      )}
      {files > 0 && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{files === 1 ? '1 file' : `${files} files`}</span>}
      {usedBy && (
        // A place lists what was there (the popup links each).
        <span className="mt-1 flex flex-wrap items-center gap-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">{usedBy.length ? 'Used by:' : 'Not used yet'}</span>
          {usedBy.map(({ section: s, entry: e }) => (
            <span key={`${s.key}-${e.id}`} className={`${chipClass} bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300`}>
              {s.itemLabel ? s.itemLabel[0].toUpperCase() + s.itemLabel.slice(1) : s.label}: {e[s.titleField] || '(untitled)'}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

interface CardProps {
  section: SectionDef;
  entry: Entry;
  related: Map<string, Entry[]>;
  backlinks: Backlink[];
  media: MediaItem[];
}

/** A part of the full card (its details, description, skills, links…) in a soft box of its own, so each is easy to find. */
export function CardBox({ title, ref, children }: { title?: string; ref?: Ref<HTMLElement>; children: ReactNode }) {
  return (
    <section ref={ref} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
      {title && <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</h4>}
      {children}
    </section>
  );
}

/**
 * Brings the posts linking an entry into view as its popup opens: they sit at the bottom, below a description that
 * can fill the screen. A ref callback that never changes, so it runs once, when the box first shows.
 */
const scrollIntoView = (el: HTMLElement | null) => el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });

/** The date fields, shown together as one "Dates" row where the start date is. */
const DATE_PARTS = new Set(['startDate', 'endDate', 'current', 'noEndDate']);

/**
 * An entry in full, in the language the profile is shown in: every short field as a row, in form order, then its
 * long text, tags and links, each in its own box. Linked entries and organizations open a preview.
 */
export function EntryCard({ section, entry: stored, related, backlinks, media }: CardProps) {
  const previewLink = usePreviewLink();
  const lang = useLanguage();
  const entry = useLocalize()(section, stored);
  const dates = dateLines(entry);
  const filled = filledFields(section, entry).filter((f) => f.key !== section.titleField);
  // Short fields as rows, domains too (as pills, where the form has them); the date lines take the start date's place.
  // The progress, "Online" and the location type are badges by the title instead; the category is a tag.
  const rows = filled.filter((f) => !f.progress && f.key !== 'online' && f.key !== 'locationType' && (f.domainList || !['textarea', 'tags', 'refs', 'links', 'media'].includes(f.type)) && (!DATE_PARTS.has(f.key) || (f.key === 'startDate' && dates.length)));
  // Top-aligned, so a long value (a venue's full address) keeps its label and copy icon on its first line.
  // A value with a filter (a place, an employment type) shows the list filtered to it when clicked.
  const textRow = (key: string, label: string, text: string, field?: FieldDef) => (
    <div key={key} className="group/copy flex items-start gap-2">
      <dt className="w-24 shrink-0 text-xs leading-5 sm:w-32 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">
        {field ? (
          <FilterValue section={section} field={field} value={stored[field.key] ?? ''}>
            {text}
          </FilterValue>
        ) : (
          text
        )}
      </dd>
      <CopyButton reveal text={text} label={label.toLowerCase()} size={12} />
    </div>
  );
  const bodies = filled.filter((f) => f.type === 'textarea');
  const tagFields = filled.filter((f) => f.type === 'tags' && !f.domainList && splitList(entry[f.key]).length);
  const linkFields = filled.filter((f) => f.type === 'links' && splitLinks(entry[f.key]).length);
  // Linked entries that still exist (stale ids from hand-edited sheets are ignored).
  const links = section.fields
    .filter((f) => f.type === 'refs')
    .flatMap((f) => {
      const target = getSection(f.refSection!)!;
      const byId = new Map((related.get(target.key) ?? []).map((e) => [e.id, e]));
      return splitList(entry[f.key]).flatMap((id) => (byId.has(id) ? [{ target, linked: byId.get(id)! }] : []));
    });
  const plainLinks = links.filter((l) => !CREDENTIAL_ICONS[l.target.key]);
  const title = entry[section.titleField] || '';
  const logo = section.media?.logo ? logoOf(media, stored.id) : undefined;

  return (
    <div lang={lang} className="space-y-3">
      <h3 className="flex flex-wrap items-center gap-2 font-medium">
        {logo && <LogoImage source={{ item: logo }} alt="" className="h-8 w-8" />}
        <span className="group/copy inline-flex items-center gap-0.5">
          {title || '(untitled)'}
          {title && <CopyButton reveal text={title} label={section.fields.find((f) => f.key === section.titleField)?.label.toLowerCase() ?? 'title'} />}
        </span>
        <TitleBadges section={section} stored={stored} />
      </h3>
      {rows.length > 0 && (
        <CardBox>
          <dl className="space-y-1.5 text-sm">
            {rows.map((f) => {
              if (f.key === 'startDate') return dates.map((d) => textRow(d.key, d.label, d.text));
              if (f.domainList || f.key === 'category') {
                return (
                  <div key={f.key} className="group/copy flex items-start gap-2">
                    <dt className="w-24 shrink-0 text-xs leading-5 sm:w-32 text-slate-500 dark:text-slate-400">{f.label}</dt>
                    <dd className="flex min-w-0 flex-1 flex-wrap gap-1">
                      {f.domainList ? (
                        storedItems(stored[f.key], splitList(entry[f.key])).map((value, i) => (
                          <FilterValue key={value} section={section} field={f} value={value} hoverClass={pillHover} className={pillClass}>
                            {splitList(entry[f.key])[i]}
                          </FilterValue>
                        ))
                      ) : (
                        <CategoryTag section={section} field={f} value={stored[f.key]}>
                          {entry[f.key]}
                        </CategoryTag>
                      )}
                    </dd>
                    <CopyButton reveal text={fieldText(f, entry, related)} label={f.label.toLowerCase()} size={12} />
                  </div>
                );
              }
              if (!f.organization || section.key === ORGANIZATIONS) return textRow(f.key, f.label, fieldText(f, entry, related), f.type === 'date' ? undefined : f);
              return (
                <div key={f.key} className="group/copy flex items-start gap-2">
                  <dt className="w-24 shrink-0 text-xs leading-5 sm:w-32 text-slate-500 dark:text-slate-400">{f.label}</dt>
                  <dd className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">
                    {/* Each organization on its own line, in a light box of its own so several are easy to tell apart,
                        in the order named, opening a preview of it. The boxes all take the column's width, and each
                        copies just its own name. */}
                    <ul className="flex flex-col gap-1">
                      {splitOrganizations(stored[f.key]).map((name, i) => {
                        const shown = splitOrganizations(entry[f.key])[i] ?? name;
                        return (
                          <li key={name} className="flex items-start gap-1.5 rounded-md border border-blue-100 bg-blue-50 py-0.5 pr-0.5 pl-1.5 dark:border-blue-500/20 dark:bg-blue-500/10">
                            <OrgLogo name={name} placeholder />
                            <Link {...previewLink({ section: ORGANIZATIONS, name })} className="min-w-0 flex-1 text-blue-700 hover:underline dark:text-blue-300">
                              {shown}
                            </Link>
                            <CopyButton reveal text={shown} label={shown} size={12} />
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                  {/* Organizations copy one by one; the empty column keeps their boxes in line with the other rows. */}
                  <span aria-hidden className="w-5 shrink-0" />
                </div>
              );
            })}
          </dl>
        </CardBox>
      )}
      {bodies.map((f) => (
        // The whole text, however long: nothing to unfold.
        <CardBox key={f.key} title={f.label}>
          <div className="group/copy flex items-start gap-1">
            <p className="min-w-0 flex-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{entry[f.key]}</p>
            <CopyButton reveal text={entry[f.key]} label={f.label.toLowerCase()} />
          </div>
        </CardBox>
      ))}
      {tagFields.map((f) => (
        <CardBox key={f.key} title={f.label}>
          <div className="group/copy flex flex-wrap items-center gap-1">
            {storedItems(stored[f.key], splitList(entry[f.key])).map((value, i) => (
              <FilterValue key={value} section={section} field={f} value={value} hoverClass={pillHover} className={pillClass}>
                {splitList(entry[f.key])[i]}
              </FilterValue>
            ))}
            <CopyButton reveal text={fieldText(f, entry, related)} label={f.label.toLowerCase()} size={12} />
          </div>
        </CardBox>
      ))}
      {linkFields.map((f) => (
        <CardBox key={f.key} title={f.label}>
          {/* Each by its title (or the address, without one), opening in a new tab, with its site to show where it goes. */}
          <ul className="space-y-1.5 text-sm">
            {splitLinks(entry[f.key]).map((l, i) => (
              <li key={`${i}-${l.url}`} className="group/copy flex items-start gap-1.5">
                <ExternalLink size={14} aria-hidden className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" />
                <span className="min-w-0 flex-1">
                  <a href={l.url} target="_blank" rel="noreferrer" className="break-all text-blue-700 hover:underline dark:text-blue-300">
                    {l.title || l.url}
                  </a>
                  {l.title && hostOf(l.url) && <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">{hostOf(l.url)}</span>}
                  {l.email && (
                    // The account there, to find which email to log in with; copied on its own.
                    <span className="group/copy flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      Signed up with <span className="break-all text-slate-700 dark:text-slate-300">{l.email}</span>
                      <CopyButton reveal text={l.email} label="sign-up email" size={12} />
                    </span>
                  )}
                </span>
                <CopyButton reveal text={l.url} label={l.title || 'link'} size={12} />
              </li>
            ))}
          </ul>
        </CardBox>
      ))}
      {plainLinks.length > 0 && (
        <CardBox title="Linked entries">
          <div className="flex flex-wrap items-center gap-1">
            {plainLinks.map(({ target, linked }) => (
              <Link key={linked.id} {...previewLink({ section: target.key, id: linked.id })} className={linkChipClass}>
                {target.label}: {linked[target.titleField] || '(untitled)'}
              </Link>
            ))}
          </div>
        </CardBox>
      )}
      {filled
        .filter((f) => f.type === 'media')
        .map((f) => (
          // Files picked from other entries (a post's photos): open and download them here, but not delete, since
          // they belong to those entries. Ones deleted since are skipped.
          <CardBox key={f.key} title={f.label}>
            <MediaStrip items={splitList(stored[f.key]).flatMap((id) => media.filter((m) => m.id === id))} zipName={title || f.label} canDelete={false} />
          </CardBox>
        ))}
      <CredentialRow links={links.filter((l) => CREDENTIAL_ICONS[l.target.key])} media={media} />
      {backlinks.length > 0 && (
        <CardBox ref={backlinks.some((b) => b.section.key === 'posts') ? scrollIntoView : undefined} title="Linked to">
          <div className="flex flex-wrap items-center gap-1">
            {backlinks.map(({ section: s, entry: e }) => (
              <Link key={`${s.key}-${e.id}`} {...previewLink({ section: s.key, id: e.id })} className={linkChipClass}>
                {s.label}: {e[s.titleField] || '(untitled)'}
              </Link>
            ))}
          </div>
        </CardBox>
      )}
    </div>
  );
}

/** A link's site, e.g. "youtube.com", shown after its title. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Linked certifications and certificates, in their own box apart from the entry's media: each one as it looks (its
 * pages large, see CertificatePages), with its name and credential link under it.
 */
function CredentialRow({ links, media }: { links: { target: SectionDef; linked: Entry }[]; media: MediaItem[] }) {
  const previewLink = usePreviewLink();
  if (!links.length) return null;
  return (
    <CardBox title={CREDENTIALS_GROUP}>
      <div className={`grid gap-3 ${links.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {links.map(({ target, linked }) => {
          const name = linked[target.titleField] || '(untitled)';
          return (
            <div key={linked.id} className="min-w-0 space-y-2">
              <CertificatePages files={mediaOf(media, linked.id).filter((m) => isCredentialFile(target, m))} name={name} />
              <div className="flex max-w-full items-center gap-2 rounded-md border border-amber-200 bg-amber-50 py-1 pr-3 pl-1 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center text-lg">
                  {CREDENTIAL_ICONS[target.key]}
                </span>
                <span className="min-w-0">
                  <Link {...previewLink({ section: target.key, id: linked.id })} className="block truncate hover:underline">
                    {name}
                  </Link>
                  <span className="text-xs opacity-70">{target.itemLabel ? target.itemLabel[0].toUpperCase() + target.itemLabel.slice(1) : target.label}</span>
                  {linked.credentialUrl && (
                    <a href={linked.credentialUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs underline">
                      Credential ↗
                    </a>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </CardBox>
  );
}

/**
 * An entry's own media, with titles and descriptions; a credential's certificate file is shown apart from its other
 * media. "Hide media" folds them all away (remembered per entry in this browser), leaving "Show media (n)". `boxed`
 * puts them in a box like the full card's other parts.
 */
export function CardMedia({ section, entry, media, selection, boxed = false }: { section: SectionDef; entry: Entry; media: MediaItem[]; selection?: MediaSelection; boxed?: boolean }) {
  const hidden = useMediaHidden(entry.id);
  const own = mediaOf(media, entry.id);
  // About's photos and an organization's logo show in their own places, not as a list of files.
  if (!section.media || hasImageSlots(section) || !own.length) return null;
  const zipName = entryFolderName(section, entry);
  const { credential } = section.media;
  const block = (b: MediaBlock) => own.filter((m) => mediaBlock(section, m) === b);
  // Several blocks (a credential's own file, detail files, media) each get a strip with its label; plain media, one strip.
  const labelled = !!credential || block('detail').length > 0;
  const content = (
    <>
      <button
        type="button"
        onClick={() => setMediaHidden(entry.id, !hidden)}
        aria-expanded={!hidden}
        className={`-ml-2 ${boxed ? '' : 'mt-3'} inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800`}
      >
        {hidden ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
        {hidden ? `Show media (${own.length})` : 'Hide media'}
      </button>
      {hidden ? null : labelled ? (
        <>
          {credential && <MediaStrip label={credential.label} items={block('credential')} zipName={`${zipName} - ${credential.label}`} selection={selection} />}
          <MediaStrip label={DETAIL_FILES} items={block('detail')} zipName={`${zipName} - ${DETAIL_FILES}`} selection={selection} />
          <MediaStrip label="Media" items={block('media')} zipName={`${zipName} - Media`} selection={selection} />
        </>
      ) : (
        <MediaStrip items={own} zipName={zipName} selection={selection} />
      )}
    </>
  );
  // Labelled strips (Certificate file, Detail files, Media) need no box title; plain media is just "Media".
  return boxed ? <CardBox title={labelled ? undefined : 'Media'}>{content}</CardBox> : content;
}
