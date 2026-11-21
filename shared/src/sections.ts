// Single source of truth for every profile section.
// Drives sheet tab headers, server validation and the client forms.

/**
 * 'media': ids of files already stored with other entries (rows of the Media tab), comma separated, in the order
 * picked, e.g. the photos a post shows. The files stay where they are; deleting one drops it from here too.
 */
export type FieldType = 'text' | 'textarea' | 'date' | 'url' | 'email' | 'boolean' | 'select' | 'tags' | 'refs' | 'links' | 'media';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** LinkedIn character limit (shown as a live counter). */
  max?: number;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  /** For 'refs': key of the section whose entry ids this field stores (comma separated). */
  refSection?: string;
  /**
   * This text field names organizations, one or several separated by ";" (see splitOrganizations); saving registers
   * each in the Organizations tab with this type.
   */
  organization?: OrgType;
  /** This tags field lists skills; saving adds new ones to the Skills tab. */
  skill?: boolean;
  /**
   * For 'text': choices offered in a dropdown, along with the values already used in this field (in every section
   * whose field has the same key and list, e.g. a domain); any other value can still be typed.
   */
  suggestions?: readonly string[];
  /** For a field with suggestions: the key of the field this one narrows, e.g. the subdomains' domains. */
  parent?: string;
  /**
   * Domains (or, with `parent`, subdomains), several per entry: the form offers the choices on the Domains page (see
   * DOMAIN_LIST), saving adds a new one there, and their Thai names come from there. `suggestions` are only the
   * built-in ones the page starts with.
   */
  domainList?: boolean;
  /**
   * A place picked from the Locations page (see LOCATION_LIST); typing a new one adds it there on save, and its Thai
   * name comes from there. The details (building, floor, room) go in the entry's own locationDetail field.
   */
  locationList?: boolean;
  /**
   * For a translatable 'tags' field: each item gets its own Thai, kept as "English=Thai" pairs (see itemThai), e.g. a
   * domain's subdomains. Pairs rather than a list in the same order, so reordering in the sheet can't mismatch them.
   */
  thaiPerItem?: boolean;
  /** For 'text': the list page offers a filter by this field, with the values in use (organization fields always do). */
  filter?: boolean;
  /** Value for new entries; also how an empty cell is treated when filtering. */
  default?: string;
  /** Fields with the same group are shown together in the form, in a box headed by the group's name. */
  group?: string;
  /** For 'refs': offer to create a new entry of the linked section right from the form. */
  createInline?: boolean;
  /** For 'links': each link can also note the email signed up with on that site (an account's login). */
  accountEmail?: boolean;
  /** For 'email': the email signed up with on the site in the field with this key, e.g. an organization's website. */
  accountFor?: string;
  /**
   * For 'refs' with createInline: the new entry starts from this one. It is named after it (see seedTitle), takes
   * the `copy` fields (its key → this section's key), and is linked from the same posts. E.g. a certificate made
   * from an activity's form takes the activity's name, its organizer as issuer, and the activity's posts.
   */
  newFrom?: { copy?: Record<string, string> };
  /** For 'boolean': ticked, the field named here is hidden in the form and emptied ("No end date" → end date). */
  clears?: string;
  /**
   * For 'refs': the linked entry's form offers this link too, e.g. "Linked posts" on a project. It is still stored
   * only here (see linkedFromKey), so both forms show the same links.
   */
  linkFromTarget?: boolean;
  /**
   * For 'refs': a linked entry can be linked from one entry of this section only, e.g. a certificate from one
   * project and one volunteer role, but not from two projects. Linking it again is refused until it's unlinked.
   */
  exclusive?: boolean;
  /**
   * Also kept in Thai, in its own column (see translationKey), like a LinkedIn profile in another language.
   * Organization and skill names aren't: they show the Thai name given on the Organizations or Skills page.
   */
  translatable?: boolean;
  /**
   * For 'select': the entry's progress (see progressOf). Only what is set by hand (PROGRESS_SET_BY_HAND) is stored;
   * empty means it follows the dates.
   */
  progress?: boolean;
}

export interface SectionDef {
  key: string;
  /** Google Sheet tab name. */
  tab: string;
  label: string;
  /** One entry, in lower case, e.g. "certificate" (for "New certificate"). */
  itemLabel?: string;
  /** Singleton sections hold exactly one row (e.g. About). */
  singleton?: boolean;
  fields: FieldDef[];
  /** Field shown as the card title in lists. */
  titleField: string;
  /** Fields joined into the card subtitle. */
  subtitleFields?: string[];
  /** Initial sort option id (see frontend/src/listing.ts); defaults to the first date field, else title. */
  defaultSort?: string;
  /** Entries can have media attached. */
  media?: MediaConfig;
  /** "Save draft": entries can be stored unfinished and completed later (see DRAFT_COLUMN). */
  drafts?: boolean;
  /** Its list page can also show the entries on a month calendar, placed by their start and end dates. */
  calendar?: boolean;
  /**
   * One made from another entry's form ("+ New post" under an activity's Linked posts) starts with that entry's
   * title as its own, in English and Thai (see seedTitle), to change as needed.
   */
  titleFromLinked?: boolean;
}

/** How an entry's media files are named and filed in Drive. */
export interface MediaConfig {
  /** Starts the stored file names, e.g. "Project" → Project_Poster_Owner.png. */
  prefix: string;
  /** Top Drive folder for this section; defaults to the tab name. */
  folder?: string;
  /**
   * The entry is a credential (certificate or certification): its own file (e.g. the scanned certificate) is
   * kept apart from other media, which go in a Media subfolder. Only the credential file is linked elsewhere.
   */
  credential?: { label: string };
  /**
   * The About page: a profile photo and a background (banner) image, one of each, like LinkedIn (see
   * PROFILE_IMAGES). They're shown in the page header, not as a media list, and a new one replaces the old.
   */
  profile?: boolean;
  /**
   * Organizations: one image, the organization's logo, shown before its name wherever it's named. A new one
   * replaces the old.
   */
  logo?: boolean;
  /**
   * Plain media only (photos, videos, PDFs), with none of what other entries have: no Detail files block, no
   * shortcuts to linked certificates in its folder, and the folder named after the title alone. For posts, whose
   * links are about what they announce and whose status (the usual folder suffix) keeps changing.
   */
  plain?: boolean;
}

/** Every stored row is a flat string map; these meta columns are always present. */
export type Entry = Record<string, string> & { id: string; createdAt: string; updatedAt: string };
export const META_COLUMNS = ['id', 'createdAt', 'updatedAt'] as const;
/** 'true' while an entry is a draft: saved unfinished, not yet counted (organizations, skills, Drive links). */
export const DRAFT_COLUMN = 'draft';

export const isDraft = (entry: Record<string, string> | undefined) => entry?.[DRAFT_COLUMN] === 'true';

export const ORGANIZATIONS = 'organizations';
export const SKILLS = 'skills';
export const ORG_TYPES = ['Company', 'School', 'Certification issuer', 'Nonprofit', 'Other'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const POST_STATUSES = ['draft', 'scheduled', 'posted'] as const;
/**
 * The Domains page: the domains offered for projects and activities, each with its subdomains. It starts with
 * DOMAINS and SUBDOMAINS (and those already used); after that it's edited there, or grows as new ones are typed.
 */
export const DOMAIN_LIST = 'domains';
/**
 * The Locations page: the places entries are at (cities, venues), each listing the entries there. The entries name
 * one, and keep their details (building, floor, room) in a text field of their own.
 */
export const LOCATION_LIST = 'locations';
/** Area of life a project or activity belongs to, as the Domains page starts out. */
export const DOMAINS = ['Engineering', 'Film', 'Biology', 'Travelling', 'Nature'] as const;
/** Subdomains under each domain, as the Domains page starts out. */
export const SUBDOMAINS: Readonly<Record<string, readonly string[]>> = {
  Engineering: ['Web Development', 'DevOps', 'AI & Data', 'Cloud', 'Mobile', 'Embedded & IoT', 'Security'],
  Film: ['Directing', 'Cinematography', 'Editing', 'Screenwriting', 'Sound'],
  Biology: ['Plant', 'Exotic pet', 'Wildlife', 'Marine life'],
};
/**
 * An activity's progress, in the order it goes through them. The first five follow from its dates (see progressOf);
 * Interested and Awaiting Results can also be set by hand, since the dates can't tell whether you applied yet.
 */
export const PROGRESS = [
  'Interested',
  'Awaiting Results',
  'Not Started',
  'In Progress',
  'Completed',
  'Cancelled by Organizer',
  'Cancelled by Applicant',
  'Rejected',
] as const;
export type Progress = (typeof PROGRESS)[number];
const PROGRESS_SET_BY_HAND = ['Interested', 'Awaiting Results', 'Cancelled by Organizer', 'Cancelled by Applicant', 'Rejected'] as const;
/** Stored before there were two kinds of cancellation; read as the organizer's. */
const LEGACY_PROGRESS: Record<string, Progress> = { Cancelled: 'Cancelled by Organizer' };

/** A progress as the profile shows it in Thai. A fixed choice, so its Thai is fixed here rather than typed per entry. */
export const PROGRESS_THAI: Record<Progress, string> = {
  Interested: 'สนใจเข้าร่วม',
  'Awaiting Results': 'รอประกาศผลการคัดเลือก',
  'Not Started': 'ยังไม่เริ่มกิจกรรม',
  'In Progress': 'กำลังดำเนินกิจกรรม',
  Completed: 'สิ้นสุดกิจกรรมแล้ว',
  'Cancelled by Organizer': 'ยกเลิกโดยผู้จัดกิจกรรม',
  'Cancelled by Applicant': 'ยกเลิกโดยผู้สมัคร',
  Rejected: 'ไม่ผ่านการคัดเลือก',
};

export const progressLabel = (progress: Progress, lang: Language = 'en') => (lang === 'th' ? PROGRESS_THAI[progress] : progress);

/** Today as 'YYYY-MM-DD' in the local time zone (toISOString's UTC date is still yesterday in Bangkok before 7 am). */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * A stored progress as one of the form's choices: '' (by date) for anything else typed into the sheet. An old
 * "Cancelled" becomes its new name, so the form doesn't send back a choice that no longer exists.
 */
export function progressSetByHand(stored: string | undefined): Progress | '' {
  const value = stored?.trim() ?? '';
  return PROGRESS_SET_BY_HAND.find((p) => p === value) ?? LEGACY_PROGRESS[value] ?? '';
}

/**
 * Where an entry with a progress field stands: what was set by hand, otherwise from its dates compared with `today`:
 * Interested through the application deadline, Awaiting Results until the results are announced, Not Started before
 * it starts, In Progress from the start through the end date (or while it has none), then Completed. One with no end
 * date (a one-off) is in progress on its day only. '' with none of those dates. Dates may be a month alone
 * ('YYYY-MM'), compared with today's month.
 */
export function progressOf(entry: Record<string, string>, today = localToday()): Progress | '' {
  const set = progressSetByHand(entry.progress);
  if (set) return set;
  const now = (d: string) => today.slice(0, d.length);
  const deadline = entry.applicationDeadline?.trim();
  if (deadline && deadline >= now(deadline)) return 'Interested';
  const results = entry.resultsDate?.trim();
  if (results && results > now(results)) return 'Awaiting Results';
  const start = entry.startDate?.trim();
  if (!start) return '';
  if (start > now(start)) return 'Not Started';
  const end = entry.noEndDate === 'true' ? start : entry.endDate?.trim();
  return end && end < now(end) ? 'Completed' : 'In Progress';
}

export const ACTIVITY_CATEGORIES =['Seminar', 'Training', 'Workshop', 'Conference', 'Webinar', 'Competition', 'Meetup'] as const;
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Self-employed', 'Freelance', 'Contract', 'Internship', 'Apprenticeship', 'Seasonal'] as const;

// Links an entry to any number of certifications and certificates (LinkedIn's "associated with").
// A certification is earned by an exam or assessment; a certificate shows completion, e.g. of a course.
// They sit in their own box in the form, apart from the entry's media. A certification can back several
// entries (the same exam, several jobs); a certificate is for one thing, so at most one entry per section links it.
export const CREDENTIALS_GROUP = 'Certifications & certificates';
const linkedCredentials: FieldDef[] = [
  { key: 'certificationIds', label: 'Linked certifications', type: 'refs', refSection: 'certifications', createInline: true, group: CREDENTIALS_GROUP },
  { key: 'certificateIds', label: 'Linked certificates', type: 'refs', refSection: 'certificates', createInline: true, exclusive: true, group: CREDENTIALS_GROUP },
];

/**
 * Links a post or an activity to entries of other sections. Stored on the post or activity only; the linked
 * entry's form offers it too ("Linked posts", "Linked activities").
 */
const linkTo = (key: string, refSection: string, label: string): FieldDef => ({ key, label, type: 'refs', refSection, group: 'Linked to', linkFromTarget: true });

/** Groups projects and activities, e.g. Engineering or Travelling (see DOMAINS). */
// Several of each, comma separated like skills. The keys stay singular: they held one value each before.
const domain: FieldDef = { key: 'domain', label: 'Domain', type: 'tags', suggestions: DOMAINS, domainList: true, placeholder: 'Pick or type, then Enter; add several if needed' };
/** Narrows the domains, e.g. Engineering → DevOps (see SUBDOMAINS). */
const subdomain: FieldDef = {
  key: 'subdomain',
  label: 'Subdomain',
  type: 'tags',
  suggestions: [...new Set(Object.values(SUBDOMAINS).flat())],
  parent: 'domain',
  domainList: true,
  placeholder: 'Pick or type, then Enter; add several if needed',
};

/** Skills used in an entry; each one is also listed on the Skills page. */
/** Where it was: a place on the Locations page, then this entry's own details there. */
const location: FieldDef[] = [
  { key: 'location', label: 'Location', type: 'text', locationList: true, filter: true, placeholder: 'Select or type a new place' },
  { key: 'locationDetail', label: 'Location detail', type: 'text', placeholder: 'Building, floor, room…', translatable: true },
];

/**
 * Held online (a remote job), whether or not it also names a place. Shown as an "Online" pill by the title rather
 * than as a row.
 */
const online: FieldDef = { key: 'online', label: 'Online', type: 'boolean' };

/** How an activity was attended. Like `online`, shown as a pill by the title rather than as a row. */
export const LOCATION_TYPES = ['Onsite', 'Online', 'Hybrid'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];
const locationType: FieldDef = { key: 'locationType', label: 'Location type', type: 'select', options: LOCATION_TYPES, placeholder: 'Onsite, online or hybrid' };

/** `fields`, shown together in the form under the heading `group`. */
const grouped = (group: string, ...fields: (FieldDef | FieldDef[])[]): FieldDef[] => fields.flat().map((f) => ({ ...f, group }));

const skillTags: FieldDef = { key: 'skills', label: 'Skills', type: 'tags', skill: true };

/** Any number of web links about the entry (an article, a recording, a gallery), each with a title (see splitLinks). */
const links: FieldDef = { key: 'links', label: 'Links', type: 'links', group: 'Links' };

const dateRange: FieldDef[] = [
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
];
/** Ticked: it has a start date only (a one-off event), not an end still to come. Hides the end date in the form. */
const noEndDate: FieldDef = { key: 'noEndDate', label: 'No end date', type: 'boolean', clears: 'endDate' };

/** When a certification or certificate was issued and until when it's valid; ticked "No expiration date" hides the latter. */
const credentialDates: FieldDef[] = [
  { key: 'issueDate', label: 'Issue date', type: 'date' },
  { key: 'expiryDate', label: 'Expiration date', type: 'date' },
  { key: 'noExpiryDate', label: 'No expiration date', type: 'boolean', clears: 'expiryDate' },
];

export const SECTIONS: SectionDef[] = [
  {
    key: 'about',
    tab: 'About',
    label: 'About me',
    singleton: true,
    titleField: 'name',
    media: { prefix: 'About', profile: true },
    fields: [
      ...grouped(
        'Profile',
        { key: 'name', label: 'Name', type: 'text', required: true, translatable: true },
        { key: 'headline', label: 'Headline', type: 'text', max: 220, translatable: true },
        // Free text ("Bangkok, Thailand"), like LinkedIn's: where you are, not a place entries were at.
        { key: 'location', label: 'Location', type: 'text', translatable: true },
      ),
      ...grouped('Contact', { key: 'email', label: 'Email', type: 'email' }, { key: 'website', label: 'Website', type: 'url' }),
      ...grouped('About', { key: 'summary', label: 'About / Summary', type: 'textarea', max: 2600, translatable: true }),
    ],
  },
  {
    key: 'experience',
    tab: 'Experience',
    label: 'Experience',
    itemLabel: 'experience',
    titleField: 'title',
    subtitleFields: ['company', 'employmentType', 'location'],
    media: { prefix: 'Experience' },
    drafts: true,
    fields: [
      ...grouped(
        'Role',
        { key: 'title', label: 'Title', type: 'text', required: true, max: 100, translatable: true },
        { key: 'company', label: 'Company', type: 'text', required: true, organization: 'Company' },
        { key: 'employmentType', label: 'Employment type', type: 'select', options: EMPLOYMENT_TYPES },
      ),
      ...grouped('Where & when', location, online, dateRange, { key: 'current', label: 'I currently work here', type: 'boolean' }),
      ...grouped('Details', { key: 'description', label: 'Description', type: 'textarea', max: 2000, translatable: true }, skillTags),
      links,
      ...linkedCredentials,
    ],
  },
  {
    key: 'education',
    tab: 'Education',
    label: 'Education',
    itemLabel: 'education',
    titleField: 'school',
    subtitleFields: ['degree', 'field'],
    media: { prefix: 'Education' },
    drafts: true,
    fields: [
      ...grouped(
        'School',
        { key: 'school', label: 'School', type: 'text', required: true, organization: 'School' },
        { key: 'degree', label: 'Degree', type: 'text', translatable: true, filter: true },
        { key: 'field', label: 'Field of study', type: 'text', translatable: true, filter: true },
      ),
      ...grouped('When', dateRange, noEndDate),
      ...grouped(
        'Details',
        { key: 'grade', label: 'Grade', type: 'text', translatable: true },
        { key: 'activities', label: 'Activities and societies', type: 'textarea', max: 500, translatable: true },
        { key: 'description', label: 'Description', type: 'textarea', max: 1000, translatable: true },
      ),
      links,
      ...linkedCredentials,
    ],
  },
  {
    key: SKILLS,
    tab: 'Skills',
    label: 'Skills',
    itemLabel: 'skill',
    titleField: 'name',
    subtitleFields: ['category'],
    fields: [
      { key: 'name', label: 'Skill', type: 'text', required: true, max: 80, translatable: true },
      { key: 'category', label: 'Category', type: 'text', placeholder: 'e.g. Engineering, Film, Leadership', translatable: true, filter: true },
      { key: 'endorsementNote', label: 'Notes', type: 'textarea', translatable: true },
    ],
  },
  {
    key: 'certifications',
    tab: 'Certifications',
    label: 'Certifications',
    itemLabel: 'certification',
    titleField: 'name',
    subtitleFields: ['issuer', 'issueDate'],
    media: { prefix: 'Certification', credential: { label: 'Certification file' } },
    drafts: true,
    fields: [
      ...grouped(
        'Credential',
        { key: 'name', label: 'Name', type: 'text', required: true, translatable: true },
        { key: 'issuer', label: 'Issuing organization', type: 'text', required: true, organization: 'Certification issuer' },
      ),
      ...grouped('When', credentialDates),
      ...grouped('Verification', { key: 'credentialId', label: 'Credential ID', type: 'text' }, { key: 'credentialUrl', label: 'Credential URL', type: 'url' }),
      links,
    ],
  },
  {
    key: 'certificates',
    tab: 'Certificates',
    label: 'Certificates',
    itemLabel: 'certificate',
    titleField: 'name',
    subtitleFields: ['issuer', 'issueDate'],
    media: { prefix: 'Certificate', credential: { label: 'Certificate file' } },
    drafts: true,
    fields: [
      ...grouped(
        'Credential',
        { key: 'name', label: 'Name', type: 'text', required: true, translatable: true },
        { key: 'issuer', label: 'Issued by', type: 'text', required: true, organization: 'Certification issuer' },
      ),
      ...grouped('When', credentialDates),
      ...grouped('Verification', { key: 'credentialId', label: 'Credential ID', type: 'text' }, { key: 'credentialUrl', label: 'Credential URL', type: 'url' }),
      links,
    ],
  },
  {
    key: 'projects',
    tab: 'Projects',
    label: 'Projects',
    itemLabel: 'project',
    titleField: 'name',
    subtitleFields: ['organization', 'role', 'startDate'],
    media: { prefix: 'Project' },
    drafts: true,
    fields: [
      ...grouped(
        'Project',
        { key: 'name', label: 'Project name', type: 'text', required: true, translatable: true },
        domain,
        subdomain,
        { key: 'organization', label: 'Organization', type: 'text', organization: 'Other' },
        { key: 'role', label: 'Role', type: 'text', translatable: true, filter: true },
      ),
      ...grouped('When', dateRange, noEndDate),
      ...grouped(
        'Details',
        { key: 'url', label: 'Project URL', type: 'url' },
        { key: 'description', label: 'Description', type: 'textarea', max: 2000, translatable: true },
        skillTags,
      ),
      links,
      ...linkedCredentials,
    ],
  },
  {
    key: 'volunteer',
    tab: 'Volunteer',
    label: 'Volunteer',
    itemLabel: 'volunteer role',
    titleField: 'role',
    subtitleFields: ['organization', 'cause'],
    media: { prefix: 'Volunteer' },
    drafts: true,
    fields: [
      ...grouped(
        'Role',
        { key: 'organization', label: 'Organization', type: 'text', required: true, organization: 'Nonprofit' },
        { key: 'role', label: 'Role', type: 'text', required: true, translatable: true },
        { key: 'cause', label: 'Cause', type: 'text', translatable: true, filter: true },
      ),
      ...grouped('When', dateRange, { key: 'current', label: 'I am currently volunteering here', type: 'boolean' }),
      ...grouped('Details', { key: 'description', label: 'Description', type: 'textarea', max: 2000, translatable: true }),
      links,
      ...linkedCredentials,
    ],
  },
  {
    key: 'activities',
    tab: 'Activities',
    label: 'Activities',
    itemLabel: 'activity',
    titleField: 'name',
    subtitleFields: ['category', 'organizer', 'location'],
    media: { prefix: 'Activity' },
    drafts: true,
    calendar: true,
    // Not by the application deadline, its first date: what an activity is placed by is when it happens.
    defaultSort: 'startDate',
    fields: [
      ...grouped(
        'Activity',
        { key: 'name', label: 'Name', type: 'text', required: true, translatable: true },
        domain,
        subdomain,
        { key: 'category', label: 'Category', type: 'text', suggestions: ACTIVITY_CATEGORIES, placeholder: 'Select or type a new one', translatable: true },
        { key: 'organizer', label: 'Organizer', type: 'text', organization: 'Other' },
      ),
      ...grouped(
        'Application',
        { key: 'applicationDeadline', label: 'Application deadline', type: 'date' },
        { key: 'resultsDate', label: 'Results announcement date', type: 'date' },
      ),
      ...grouped('Where & when', location, locationType, dateRange, noEndDate, {
        key: 'progress',
        label: 'Progress',
        type: 'select',
        options: PROGRESS_SET_BY_HAND,
        progress: true,
        placeholder: 'By date',
      }),
      ...grouped(
        'Details',
        { key: 'url', label: 'Activity URL', type: 'url' },
        { key: 'description', label: 'Description', type: 'textarea', max: 2000, translatable: true },
        skillTags,
      ),
      links,
      // A certificate is usually for the training or competition itself, so a new one is named after it.
      ...linkedCredentials.map((f) => ({ ...f, newFrom: { copy: { issuer: 'organizer' } } })),
      // What an activity was part of or led to, e.g. a workshop during a degree or for a project.
      linkTo('projectIds', 'projects', 'Projects'),
      linkTo('experienceIds', 'experience', 'Experience'),
      linkTo('educationIds', 'education', 'Education'),
      linkTo('volunteerIds', 'volunteer', 'Volunteer'),
    ],
  },
  {
    key: ORGANIZATIONS,
    tab: 'Organizations',
    label: 'Organizations',
    itemLabel: 'organization',
    titleField: 'name',
    subtitleFields: ['type', 'industry', 'location'],
    media: { prefix: 'Organization', logo: true },
    fields: [
      ...grouped(
        'Organization',
        { key: 'name', label: 'Name', type: 'text', required: true, translatable: true },
        { key: 'type', label: 'Type', type: 'select', options: ORG_TYPES },
        { key: 'industry', label: 'Industry', type: 'text', translatable: true, filter: true },
      ),
      ...grouped('Where', location),
      ...grouped(
        'Links & notes',
        { key: 'website', label: 'Website', type: 'url' },
        // The account there, e.g. a course platform signed up for; each of the other links can have one too.
        { key: 'websiteEmail', label: 'Website sign-up email', type: 'email', accountFor: 'website' },
        { key: 'linkedinUrl', label: 'LinkedIn page', type: 'url' },
        // More of its sites, each with a title: course platforms, stores, a seminar list.
        { ...links, label: 'Other links', accountEmail: true },
        { key: 'notes', label: 'Notes', type: 'textarea', translatable: true },
      ),
    ],
  },
  {
    key: LOCATION_LIST,
    tab: 'Locations',
    label: 'Locations',
    itemLabel: 'location',
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Place', type: 'text', required: true, translatable: true, placeholder: 'e.g. Bangkok, or a venue' },
    ],
  },
  {
    key: DOMAIN_LIST,
    tab: 'Domains',
    label: 'Domains',
    itemLabel: 'domain',
    titleField: 'name',
    subtitleFields: ['subdomains'],
    fields: [
      { key: 'name', label: 'Domain', type: 'text', required: true, translatable: true },
      { key: 'subdomains', label: 'Subdomains', type: 'tags', placeholder: 'Type one, then Enter', translatable: true, thaiPerItem: true },
    ],
  },
  {
    key: 'posts',
    tab: 'Posts',
    label: 'Posts',
    itemLabel: 'post',
    titleField: 'title',
    subtitleFields: ['status', 'scheduledDate', 'postedDate'],
    defaultSort: 'createdAt',
    titleFromLinked: true,
    // Its own photos and videos, uploaded here; files of other entries are picked in mediaIds instead.
    media: { prefix: 'Post', plain: true },
    fields: [
      ...grouped(
        'Post',
        { key: 'title', label: 'Title (internal)', type: 'text', required: true, translatable: true },
        { key: 'content', label: 'Content', type: 'textarea', max: 3000, translatable: true },
        { key: 'hashtags', label: 'Hashtags', type: 'tags', placeholder: '#film, #engineering', translatable: true },
      ),
      ...grouped(
        'Publishing',
        { key: 'status', label: 'Status', type: 'select', options: POST_STATUSES, default: 'draft' },
        { key: 'scheduledDate', label: 'Scheduled date', type: 'date' },
        { key: 'postedDate', label: 'Posted date', type: 'date' },
        { key: 'postUrl', label: 'Post URL', type: 'url' },
      ),
      ...grouped('Notes', { key: 'notes', label: 'Notes', type: 'textarea', translatable: true }),
      // Photos and files to post with it, picked from the entries it's linked to (or any other); see FieldType.
      { key: 'mediaIds', label: 'Media from other entries', type: 'media', group: 'Media from other entries' },
      linkTo('projectIds', 'projects', 'Projects'),
      linkTo('experienceIds', 'experience', 'Experience'),
      linkTo('educationIds', 'education', 'Education'),
      linkTo('volunteerIds', 'volunteer', 'Volunteer'),
      linkTo('activityIds', 'activities', 'Activities'),
      linkTo('certificationIds', 'certifications', 'Certifications'),
      linkTo('certificateIds', 'certificates', 'Certificates'),
    ],
  },
];

export function getSection(key: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.key === key);
}

/** Split a comma-separated cell (tags, ids) into trimmed, de-duplicated items. */
export function splitList(value = ''): string[] {
  return [...new Set(value.split(',').map((t) => t.trim()).filter(Boolean))];
}

/** One of an entry's links (a 'links' field): what it is, and where. */
export interface LinkItem {
  title: string;
  url: string;
  /** The email signed up with on that site (see FieldDef.accountEmail); '' or missing for none. */
  email?: string;
}

// A sign-up email after the address: no spaces, "/" or "|", so an address with "@" in it (medium.com/@me) isn't one.
const LINK_WITH_EMAIL = /^(.*?)\s*\|\s*(\S*)\s*\|\s*([^\s@/|]+@[^\s@/|]+)$/;

/**
 * A 'links' cell as its links: one per line, "Title | https://…", or the address alone, optionally followed by
 * "| the email signed up with". Kept as plain lines rather than JSON so the cell stays easy to read and edit in the
 * sheet. The address is what follows the last "|" (it has no spaces), so a title may have one too. A line with a
 * title and no address yet keeps its title.
 */
export function splitLinks(value = ''): LinkItem[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const e = LINK_WITH_EMAIL.exec(line);
      if (e) return { title: e[1].trim(), url: e[2], email: e[3] };
      const m = /^(.*?)\s*\|\s*(\S*)$/.exec(line);
      return m ? { title: m[1].trim(), url: m[2] } : { title: '', url: line };
    });
}

/**
 * An entry's sites that can have a sign-up email (a website with its account field, each link of an accountEmail
 * field), and how many of them have one noted. Sections without such fields have none.
 */
export function signUpEmails(section: SectionDef, entry: Record<string, string>): { sites: number; emails: number } {
  let sites = 0;
  let emails = 0;
  for (const f of section.fields) {
    if (f.accountFor && entry[f.accountFor]?.trim()) {
      sites++;
      if (entry[f.key]?.trim()) emails++;
    }
    if (f.accountEmail) {
      for (const link of splitLinks(entry[f.key])) {
        sites++;
        if (link.email) emails++;
      }
    }
  }
  return { sites, emails };
}

/** Links as a 'links' cell (see splitLinks); empty ones are left out. */
export const joinLinks = (links: LinkItem[]) =>
  links
    .map((l) => ({ title: l.title.trim().replace(/\s+/g, ' '), url: l.url.trim(), email: l.email?.trim() ?? '' }))
    .filter((l) => l.title || l.url || l.email)
    .map((l) => (l.email ? `${l.title} | ${l.url} | ${l.email}`.trim() : l.title ? `${l.title} | ${l.url}` : l.url))
    .join('\n');

/**
 * Entries of `section` (other than `selfId`) already linking to `id` of section `target` through an exclusive
 * field (see FieldDef.exclusive), which stops `section` linking it again. `entries`: all of `section`'s entries.
 */
export function exclusiveHolders(section: SectionDef, target: string, id: string, entries: Entry[], selfId?: string): Entry[] {
  const fields = section.fields.filter((f) => f.type === 'refs' && f.refSection === target && f.exclusive);
  if (!fields.length) return [];
  return entries.filter((e) => e.id !== selfId && fields.some((f) => splitList(e[f.key]).includes(id)));
}

/**
 * Links stored in another section that `target`'s form can set too (FieldDef.linkFromTarget), e.g. a project's
 * "Linked posts": one field per section.
 */
export function linkedFromFields(target: string): { section: SectionDef; field: FieldDef }[] {
  return SECTIONS.flatMap((section) => {
    const field = section.fields.find((f) => f.type === 'refs' && f.refSection === target && f.linkFromTarget);
    return field ? [{ section, field }] : [];
  });
}

/** Key in an entry's save body for the ids of `from` entries that should link to it, e.g. "linkedFrom:posts". */
export const linkedFromKey = (from: string) => `linkedFrom:${from}`;

/** Sections containing a 'refs' field that points at `target`, with those fields. */
export function referencingSections(target: string): { section: SectionDef; fields: FieldDef[] }[] {
  return SECTIONS.map((section) => ({ section, fields: section.fields.filter((f) => f.type === 'refs' && f.refSection === target) })).filter(
    (r) => r.fields.length > 0,
  );
}

/** Normalized organization name for matching (case and spacing insensitive). */
export function orgKey(name = ''): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Key in an entry's save body for the Thai name of an organization it names, given in the entry's form
 * (e.g. "organizationThai:Studio X"). It is stored on the organization, not the entry.
 */
export const ORGANIZATION_THAI = 'organizationThai:';
export const organizationThaiKey = (name: string) => `${ORGANIZATION_THAI}${name}`;

/**
 * The organizations an organization field names: "Studio X; Acme" → ["Studio X", "Acme"], spaces tidied and each
 * once (matched like orgKey). ";" rather than "," because names like "Acme, Inc." have commas.
 */
export function splitOrganizations(value = ''): string[] {
  const byKey = new Map<string, string>();
  for (const name of value.split(';').map((n) => n.trim().replace(/\s+/g, ' '))) if (name && !byKey.has(orgKey(name))) byKey.set(orgKey(name), name);
  return [...byKey.values()];
}
export const joinOrganizations = (names: string[]) => names.join('; ');

/**
 * Sections whose field of the same key offers the same suggestions as `field` (a domain on projects and
 * activities; an activity's category), with that field. Values typed in one are offered in all of them.
 */
export function suggestionSections(field: FieldDef): { section: SectionDef; field: FieldDef }[] {
  if (!field.suggestions?.length) return [];
  return SECTIONS.flatMap((section) => {
    const own = section.fields.find((f) => f.key === field.key && f.suggestions === field.suggestions);
    return own ? [{ section, field: own }] : [];
  });
}

/**
 * The Thai given with each English value of a suggested field (e.g. Engineering → วิศวกรรม), keyed by orgKey of
 * the English. When entries disagree, the Thai used most often wins.
 */
export function suggestionThai(field: FieldDef, entries: Record<string, string>[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const en = orgKey(e[field.key]);
    const th = e[translationKey(field.key, 'th')]?.trim();
    if (!en || !th) continue;
    const forEn = counts.get(en) ?? new Map<string, number>();
    forEn.set(th, (forEn.get(th) ?? 0) + 1);
    counts.set(en, forEn);
  }
  return new Map([...counts].map(([en, ths]) => [en, [...ths].sort((a, b) => b[1] - a[1])[0][0]]));
}

/** A thaiPerItem cell, "DevOps=เดฟออปส์, Cloud=คลาวด์", as orgKey(English) -> Thai. */
export function itemThai(value = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of splitList(value)) {
    const at = pair.indexOf('=');
    const [en, th] = at < 0 ? ['', ''] : [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
    if (en && th) out.set(orgKey(en), th);
  }
  return out;
}
/** The thaiPerItem cell for `items`, from their Thai in `thai` (keyed like itemThai); items without Thai are left out. */
export const joinItemThai = (items: string[], thai: Map<string, string>) =>
  items.flatMap((item) => (thai.get(orgKey(item))?.trim() ? [`${item}=${thai.get(orgKey(item))!.trim()}`] : [])).join(', ');

/**
 * What the Domains page (`domains`: its rows) offers a domain field, as names with their Thai: every domain; or for
 * a subdomain field, the subdomains under the domains `parentValue` lists (comma separated), all while it's empty.
 */
export function domainOptions(field: FieldDef, parentValue: string, domains: Record<string, string>[]): { name: string; name_th: string }[] {
  if (!field.parent) return domains.flatMap((d) => (d.name?.trim() ? [{ name: d.name.trim(), name_th: d.name_th?.trim() ?? '' }] : []));
  const under = new Set(splitList(parentValue).map(orgKey));
  return domains
    .filter((d) => !under.size || under.has(orgKey(d.name)))
    .flatMap((d) => {
      const thai = itemThai(d.subdomains_th);
      return splitList(d.subdomains).map((name) => ({ name, name_th: thai.get(orgKey(name)) ?? '' }));
    });
}

/** Sections with a location field (experience, activities, organizations), with it. */
export function locationSections(): { section: SectionDef; field: FieldDef }[] {
  return SECTIONS.flatMap((section) => {
    const field = section.fields.find((f) => f.locationList);
    return field ? [{ section, field }] : [];
  });
}

/** Sections with a domain field (projects, activities), with it and their subdomain field if any. */
export function domainSections(): { section: SectionDef; domain: FieldDef; subdomain?: FieldDef }[] {
  return SECTIONS.flatMap((section) => {
    const domain = section.fields.find((f) => f.domainList && !f.parent);
    return domain ? [{ section, domain, subdomain: section.fields.find((f) => f.domainList && f.parent === domain.key) }] : [];
  });
}

/** Sections with fields that name an organization, with those fields. */
export function organizationSections(): { section: SectionDef; fields: FieldDef[] }[] {
  return SECTIONS.map((section) => ({ section, fields: section.fields.filter((f) => f.organization) })).filter((r) => r.fields.length > 0);
}

/** Sections with tags fields that list skills, with those fields. */
export function skillSections(): { section: SectionDef; fields: FieldDef[] }[] {
  return SECTIONS.map((section) => ({ section, fields: section.fields.filter((f) => f.skill) })).filter((r) => r.fields.length > 0);
}

/** Header row for a section's sheet tab: the Thai columns come after the fields. */
export function sectionColumns(section: SectionDef): string[] {
  return [...META_COLUMNS, ...(section.drafts ? [DRAFT_COLUMN] : []), ...section.fields.map((f) => f.key), ...translationColumns(section)];
}

// A profile is kept in English plus a Thai version of its text, like LinkedIn's "profile in another language".
// Dates, links, emails, ids and choices have no language.
export const LANGUAGES = ['en', 'th'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', th: 'ไทย' };

/** The column holding a field's text in `lang`: the field's own for English, e.g. "headline_th" for Thai. */
export const translationKey = (key: string, lang: Language) => (lang === 'en' ? key : `${key}_${lang}`);

/** The Thai (non-English) columns of a section. */
export function translationColumns(section: SectionDef): string[] {
  return LANGUAGES.filter((l) => l !== 'en').flatMap((lang) => section.fields.filter((f) => f.translatable).map((f) => translationKey(f.key, lang)));
}

/** The Organizations and Skills entries, which hold the Thai names of the organizations and skills entries name. */
export interface NameEntries {
  organizations?: Record<string, string>[];
  skills?: Record<string, string>[];
  domains?: Record<string, string>[];
  locations?: Record<string, string>[];
}

/**
 * An entry as shown in `lang`: each translated field has its Thai text in place of the English, where it has
 * one, and organizations and skills have their Thai names from `names`.
 */
export function localizeEntry<T extends Record<string, string>>(section: SectionDef, entry: T, lang: Language, names: NameEntries = {}): T {
  if (lang === 'en') return entry;
  const nameIn = (list: Record<string, string>[] | undefined, name: string) =>
    list?.find((e) => orgKey(e.name) === orgKey(name))?.[translationKey('name', lang)]?.trim() || name;
  const out: Record<string, string> = { ...entry };
  for (const f of section.fields) {
    if (f.organization && entry[f.key]?.trim()) out[f.key] = joinOrganizations(splitOrganizations(entry[f.key]).map((n) => nameIn(names.organizations, n)));
    else if (f.skill && entry[f.key]) out[f.key] = splitList(entry[f.key]).map((t) => nameIn(names.skills, t)).join(', ');
    else if (f.locationList && entry[f.key]?.trim()) out[f.key] = nameIn(names.locations, entry[f.key]);
    else if (f.domainList && entry[f.key]) {
      const thai = new Map(domainOptions(f, '', names.domains ?? []).map((o) => [orgKey(o.name), o.name_th]));
      out[f.key] = splitList(entry[f.key]).map((n) => thai.get(orgKey(n)) || n).join(', ');
    } else if (f.thaiPerItem && entry[f.key]) {
      const thai = itemThai(entry[translationKey(f.key, lang)]);
      out[f.key] = splitList(entry[f.key]).map((n) => thai.get(orgKey(n)) || n).join(', ');
    } else {
      const text = f.translatable ? entry[translationKey(f.key, lang)] : '';
      if (text?.trim()) out[f.key] = text;
    }
  }
  return out as T;
}

/**
 * The first values of a new `target` entry named after `source` (see SectionDef.titleFromLinked and
 * FieldDef.newFrom): its title, and the
 * Thai one where it differs (an organization's Thai name, for a school), with the target's defaults. `names`: as for
 * localizeEntry. Nothing when `source` has no title yet.
 */
export function seedTitle(target: SectionDef, source: SectionDef, values: Record<string, string>, names: NameEntries = {}): Record<string, string> | undefined {
  const en = values[source.titleField]?.trim();
  if (!en) return undefined;
  const th = localizeEntry(source, values, 'th', names)[source.titleField]?.trim();
  const titleField = target.fields.find((f) => f.key === target.titleField);
  return {
    ...Object.fromEntries(target.fields.flatMap((f) => (f.default ? [[f.key, f.default]] : []))),
    [target.titleField]: en,
    ...(titleField?.translatable && th && th !== en ? { [translationKey(target.titleField, 'th')]: th } : {}),
  };
}

/** Translated fields with English text but no `lang` version yet. */
export function untranslatedFields(section: SectionDef, entry: Record<string, string>, lang: Language): FieldDef[] {
  if (lang === 'en') return [];
  return section.fields.filter((f) => f.translatable && entry[f.key]?.trim() && !entry[translationKey(f.key, lang)]?.trim());
}
