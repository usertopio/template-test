// Single source of truth for every profile section.
// Drives sheet tab headers, server validation and the client forms.

export type FieldType = 'text' | 'textarea' | 'date' | 'url' | 'email' | 'boolean' | 'select' | 'tags' | 'refs';

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
  /** This text field names an organization; saving registers it in the Organizations tab with this type. */
  organization?: OrgType;
}

export interface SectionDef {
  key: string;
  /** Google Sheet tab name. */
  tab: string;
  label: string;
  /** Singleton sections hold exactly one row (e.g. About). */
  singleton?: boolean;
  fields: FieldDef[];
  /** Field shown as the card title in lists. */
  titleField: string;
  /** Fields joined into the card subtitle. */
  subtitleFields?: string[];
}

/** Every stored row is a flat string map; these meta columns are always present. */
export type Entry = Record<string, string> & { id: string; createdAt: string; updatedAt: string };
export const META_COLUMNS = ['id', 'createdAt', 'updatedAt'] as const;

export const ORGANIZATIONS = 'organizations';
export const ORG_TYPES = ['Company', 'School', 'Certification issuer', 'Nonprofit', 'Other'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const POST_STATUSES = ['draft', 'scheduled', 'posted'] as const;
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Self-employed', 'Freelance', 'Contract', 'Internship', 'Apprenticeship', 'Seasonal'] as const;

/** Links an entry to any number of certifications (LinkedIn's "associated with"). */
const linkedCertifications: FieldDef = { key: 'certificationIds', label: 'Linked certifications', type: 'refs', refSection: 'certifications' };

const dateRange: FieldDef[] = [
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
];

export const SECTIONS: SectionDef[] = [
  {
    key: 'about',
    tab: 'About',
    label: 'About me',
    singleton: true,
    titleField: 'name',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'headline', label: 'Headline', type: 'text', max: 220 },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'summary', label: 'About / Summary', type: 'textarea', max: 2600 },
    ],
  },
  {
    key: 'experience',
    tab: 'Experience',
    label: 'Experience',
    titleField: 'title',
    subtitleFields: ['company', 'employmentType', 'location'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, max: 100 },
      { key: 'company', label: 'Company', type: 'text', required: true, organization: 'Company' },
      { key: 'employmentType', label: 'Employment type', type: 'select', options: EMPLOYMENT_TYPES },
      { key: 'location', label: 'Location', type: 'text' },
      ...dateRange,
      { key: 'current', label: 'I currently work here', type: 'boolean' },
      { key: 'description', label: 'Description', type: 'textarea', max: 2000 },
      { key: 'skills', label: 'Skills', type: 'tags', placeholder: 'Comma separated' },
      linkedCertifications,
    ],
  },
  {
    key: 'education',
    tab: 'Education',
    label: 'Education',
    titleField: 'school',
    subtitleFields: ['degree', 'field'],
    fields: [
      { key: 'school', label: 'School', type: 'text', required: true, organization: 'School' },
      { key: 'degree', label: 'Degree', type: 'text' },
      { key: 'field', label: 'Field of study', type: 'text' },
      ...dateRange,
      { key: 'grade', label: 'Grade', type: 'text' },
      { key: 'activities', label: 'Activities and societies', type: 'textarea', max: 500 },
      { key: 'description', label: 'Description', type: 'textarea', max: 1000 },
      linkedCertifications,
    ],
  },
  {
    key: 'skills',
    tab: 'Skills',
    label: 'Skills',
    titleField: 'name',
    subtitleFields: ['category'],
    fields: [
      { key: 'name', label: 'Skill', type: 'text', required: true, max: 80 },
      { key: 'category', label: 'Category', type: 'text', placeholder: 'e.g. Engineering, Film, Leadership' },
      { key: 'endorsementNote', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'certifications',
    tab: 'Certifications',
    label: 'Certifications',
    titleField: 'name',
    subtitleFields: ['issuer', 'issueDate'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'issuer', label: 'Issuing organization', type: 'text', required: true, organization: 'Certification issuer' },
      { key: 'issueDate', label: 'Issue date', type: 'date' },
      { key: 'expiryDate', label: 'Expiration date', type: 'date' },
      { key: 'credentialId', label: 'Credential ID', type: 'text' },
      { key: 'credentialUrl', label: 'Credential URL', type: 'url' },
    ],
  },
  {
    key: 'projects',
    tab: 'Projects',
    label: 'Projects',
    titleField: 'name',
    subtitleFields: ['role', 'startDate'],
    fields: [
      { key: 'name', label: 'Project name', type: 'text', required: true },
      { key: 'role', label: 'Role', type: 'text' },
      ...dateRange,
      { key: 'url', label: 'Project URL', type: 'url' },
      { key: 'description', label: 'Description', type: 'textarea', max: 2000 },
      { key: 'skills', label: 'Skills', type: 'tags', placeholder: 'Comma separated' },
      linkedCertifications,
    ],
  },
  {
    key: 'volunteer',
    tab: 'Volunteer',
    label: 'Volunteer',
    titleField: 'role',
    subtitleFields: ['organization', 'cause'],
    fields: [
      { key: 'organization', label: 'Organization', type: 'text', required: true, organization: 'Nonprofit' },
      { key: 'role', label: 'Role', type: 'text', required: true },
      { key: 'cause', label: 'Cause', type: 'text' },
      ...dateRange,
      { key: 'current', label: 'I am currently volunteering here', type: 'boolean' },
      { key: 'description', label: 'Description', type: 'textarea', max: 2000 },
      linkedCertifications,
    ],
  },
  {
    key: ORGANIZATIONS,
    tab: 'Organizations',
    label: 'Organizations',
    titleField: 'name',
    subtitleFields: ['type', 'industry', 'location'],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ORG_TYPES },
      { key: 'industry', label: 'Industry', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'website', label: 'Website', type: 'url' },
      { key: 'linkedinUrl', label: 'LinkedIn page', type: 'url' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'posts',
    tab: 'Posts',
    label: 'Posts',
    titleField: 'title',
    subtitleFields: ['status', 'scheduledDate', 'postedDate'],
    fields: [
      { key: 'title', label: 'Title (internal)', type: 'text', required: true },
      { key: 'content', label: 'Content', type: 'textarea', max: 3000 },
      { key: 'hashtags', label: 'Hashtags', type: 'tags', placeholder: '#film, #engineering' },
      { key: 'status', label: 'Status', type: 'select', options: POST_STATUSES },
      { key: 'scheduledDate', label: 'Scheduled date', type: 'date' },
      { key: 'postedDate', label: 'Posted date', type: 'date' },
      { key: 'postUrl', label: 'Post URL', type: 'url' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
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

/** Sections with fields that name an organization, with those fields. */
export function organizationSections(): { section: SectionDef; fields: FieldDef[] }[] {
  return SECTIONS.map((section) => ({ section, fields: section.fields.filter((f) => f.organization) })).filter((r) => r.fields.length > 0);
}

/** Header row for a section's sheet tab. */
export function sectionColumns(section: SectionDef): string[] {
  return [...META_COLUMNS, ...section.fields.map((f) => f.key)];
}
