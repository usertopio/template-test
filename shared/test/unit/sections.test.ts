import { describe, expect, it } from 'vitest';
import {
  DOMAIN_LIST,
  META_COLUMNS,
  ORGANIZATIONS,
  SECTIONS,
  SKILLS,
  getSection,
  linkedFromFields,
  localizeEntry,
  organizationSections,
  orgKey,
  referencingSections,
  sectionColumns,
  skillSections,
  splitList,
  translationColumns,
  untranslatedFields,
  type NameEntries,
} from '../../src';
import { PROGRESS, joinLinks, signUpEmails, localToday, progressLabel, progressOf, progressSetByHand, seedTitle, splitLinks } from '../../src';
import { hasImageSlots, joinOrganizations, splitOrganizations, suggestionSections, suggestionThai, domainOptions, domainSections, itemThai, joinItemThai } from '../../src';

describe('splitList', () => {
  it('trims, drops blanks and de-duplicates', () => {
    expect(splitList(' a, b ,, a ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for empty or missing values', () => {
    expect(splitList('')).toEqual([]);
    expect(splitList(undefined)).toEqual([]);
  });
});

describe('orgKey', () => {
  it('ignores case and extra spacing', () => {
    expect(orgKey('  Acme   Inc ')).toBe('acme inc');
    expect(orgKey('ACME inc')).toBe(orgKey('acme  INC'));
  });
});

describe('section config', () => {
  it('has unique section keys and tab names', () => {
    expect(new Set(SECTIONS.map((s) => s.key)).size).toBe(SECTIONS.length);
    expect(new Set(SECTIONS.map((s) => s.tab)).size).toBe(SECTIONS.length);
  });

  it('gives every section a title field that exists and unique field keys', () => {
    for (const s of SECTIONS) {
      const keys = s.fields.map((f) => f.key);
      expect(keys, s.key).toContain(s.titleField);
      expect(new Set(keys).size, s.key).toBe(keys.length);
      for (const k of s.subtitleFields ?? []) expect(keys, `${s.key}.${k}`).toContain(k);
    }
  });

  it('points every refs field at an existing section', () => {
    for (const s of SECTIONS) for (const f of s.fields.filter((f) => f.type === 'refs')) expect(getSection(f.refSection!), f.key).toBeDefined();
  });

  it('puts the meta columns first in the sheet header', () => {
    const about = getSection('about')!;
    expect(sectionColumns(about)).toEqual([...META_COLUMNS, ...about.fields.map((f) => f.key), 'name_th', 'headline_th', 'location_th', 'summary_th']);
  });

  it('translates every text field except organization, skill, domain and place names, which come from their own pages', () => {
    for (const s of SECTIONS) {
      for (const f of s.fields) {
        const text = ['text', 'textarea', 'tags'].includes(f.type) && !f.organization && !f.skill && !f.domainList && !f.locationList && f.key !== 'credentialId';
        expect(!!f.translatable, `${s.key}.${f.key}`).toBe(text);
      }
    }
    expect(translationColumns(getSection(ORGANIZATIONS)!)).toContain('name_th');
    expect(translationColumns(getSection(SKILLS)!)).toContain('name_th');
  });

  it('groups the fields of every long form, each group in one run', () => {
    const groups = (key: string) => [...new Set(getSection(key)!.fields.map((f) => f.group))];
    expect(groups('activities')).toEqual(['Activity', 'Application', 'Where & when', 'Details', 'Links', 'Certifications & certificates', 'Linked to']);
    expect(groups('experience')).toEqual(['Role', 'Where & when', 'Details', 'Links', 'Certifications & certificates']);
    expect(groups('posts')).toEqual(['Post', 'Publishing', 'Notes', 'Media from other entries', 'Linked to']);
    for (const s of SECTIONS.filter((s) => s.fields.length > 3)) {
      expect(s.fields.every((f) => f.group), s.key).toBe(true);
      // A group's fields sit together, so the form shows them in field order.
      const runs = s.fields.map((f) => f.group).filter((g, i, all) => g !== all[i - 1]);
      expect(new Set(runs).size, s.key).toBe(runs.length);
    }
  });

  it('links projects and certifications to organizations', () => {
    const org = new Map(organizationSections().map(({ section, fields }) => [section.key, fields.map((f) => f.key)]));
    expect(org.get('projects')).toEqual(['organization']);
    expect(org.get('certifications')).toEqual(['issuer']);
    expect(org.has(ORGANIZATIONS)).toBe(false);
  });

  it('links experience and project skills to the Skills page', () => {
    expect(skillSections().map((s) => s.section.key)).toEqual(['experience', 'projects', 'activities']);
    expect(getSection(SKILLS)).toBeDefined();
  });

  it('finds the sections that link to certifications', () => {
    expect(referencingSections('certifications').map((r) => r.section.key)).toEqual(['experience', 'education', 'projects', 'volunteer', 'activities', 'posts']);
  });

  it('lets posts link to projects, experience, education, volunteer, activities and certifications', () => {
    const links = Object.entries({ projects: 'projectIds', experience: 'experienceIds', education: 'educationIds', volunteer: 'volunteerIds', activities: 'activityIds', certifications: 'certificationIds', certificates: 'certificateIds' });
    for (const [target, key] of links) {
      expect(referencingSections(target).find((r) => r.section.key === 'posts')?.fields.map((f) => f.key)).toEqual([key]);
    }
  });

  it('lets activities link to projects, experience, education and volunteer, from either form', () => {
    for (const [target, key] of Object.entries({ projects: 'projectIds', experience: 'experienceIds', education: 'educationIds', volunteer: 'volunteerIds' })) {
      expect(linkedFromFields(target).map(({ section, field }) => [section.key, field.key])).toEqual([
        ['activities', key],
        ['posts', key],
      ]);
    }
  });

  it('lets entries link to certificates and create them from the form', () => {
    expect(referencingSections('certificates').map((r) => r.section.key)).toEqual(['experience', 'education', 'projects', 'volunteer', 'activities', 'posts']);
    const projectLinks = getSection('projects')!.fields.filter((f) => f.type === 'refs');
    expect(projectLinks.map((f) => [f.key, f.createInline])).toEqual([
      ['certificationIds', true],
      ['certificateIds', true],
    ]);
  });

  it('turns media on for the sections with certificates, About (its photos), Organizations (their logos) and posts', () => {
    expect(SECTIONS.filter((s) => s.media).map((s) => [s.key, s.media!.prefix])).toEqual([
      ['about', 'About'],
      ['experience', 'Experience'],
      ['education', 'Education'],
      ['certifications', 'Certification'],
      ['certificates', 'Certificate'],
      ['projects', 'Project'],
      ['volunteer', 'Volunteer'],
      ['activities', 'Activity'],
      ['organizations', 'Organization'],
      ['posts', 'Post'],
    ]);
    // Posts have plain media: no detail files, no shortcuts, a folder named after the title alone.
    expect(SECTIONS.filter((s) => s.media?.plain).map((s) => s.key)).toEqual(['posts']);
    expect(SECTIONS.filter((s) => hasImageSlots(s)).map((s) => s.key)).toEqual(['about', 'organizations']);
  });

  it('gives organizations titled links beside the website, in Links & notes', () => {
    const field = getSection('organizations')!.fields.find((f) => f.key === 'links')!;
    expect([field.type, field.label, field.group]).toEqual(['links', 'Other links', 'Links & notes']);
  });

  it('gives activities a category with suggestions and an organizer', () => {
    const activities = getSection('activities')!;
    const category = activities.fields.find((f) => f.key === 'category')!;
    expect(category.type).toBe('text');
    expect(category.suggestions).toEqual(expect.arrayContaining(['Seminar', 'Training']));
    expect(activities.fields.find((f) => f.key === 'organizer')?.organization).toBe('Other');
  });
});

describe('profile in Thai', () => {
  const experience = getSection('experience')!;
  const entry = { title: 'Editor', title_th: 'บรรณาธิการ', description: 'Cut films', description_th: '  ', company: 'Studio X' };

  it('shows the Thai text where there is some, else the English', () => {
    expect(localizeEntry(experience, entry, 'th')).toMatchObject({ title: 'บรรณาธิการ', description: 'Cut films', company: 'Studio X' });
    expect(localizeEntry(experience, entry, 'en')).toBe(entry);
  });

  it('names organizations and skills by their Thai names', () => {
    const projects = getSection('projects')!;
    const names: NameEntries = { organizations: [{ name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }], skills: [{ name: 'Editing', name_th: 'ตัดต่อ' }, { name: 'Sound' }] };
    expect(localizeEntry(projects, { name: 'Film', organization: ' studio x', skills: 'Editing, Sound, React' }, 'th', names)).toMatchObject({
      organization: 'สตูดิโอเอ็กซ์',
      skills: 'ตัดต่อ, Sound, React',
    });
  });

  it('lists the fields still to translate', () => {
    expect(untranslatedFields(experience, entry, 'th').map((f) => f.key)).toEqual(['description']);
    expect(untranslatedFields(experience, entry, 'en')).toEqual([]);
  });
});

describe('suggested values in Thai', () => {
  const domain = getSection('activities')!.fields.find((f) => f.key === 'domain')!;
  const category = getSection('activities')!.fields.find((f) => f.key === 'category')!;

  it('share the domain list between projects and activities, and keep categories to activities', () => {
    expect(suggestionSections(domain).map((s) => s.section.key)).toEqual(['projects', 'activities']);
    expect(suggestionSections(category).map((s) => s.section.key)).toEqual(['activities']);
  });

  it('offer the domains on the Domains page, and the subdomains under the domains picked, with their Thai', () => {
    const [{ domain, subdomain }] = domainSections();
    expect(domainSections().map((d) => d.section.key)).toEqual(['projects', 'activities']);
    const page: Record<string, string>[] = [
      { name: 'Engineering', name_th: 'วิศวกรรม', subdomains: 'DevOps, Cloud', subdomains_th: 'Cloud=คลาวด์' },
      { name: 'Film', subdomains: 'Editing' },
      { name: 'Biology', subdomains: 'Plant' },
    ];
    const names = (o: { name: string }[]) => o.map((x) => x.name);
    expect(domainOptions(domain, '', page)).toEqual([
      { name: 'Engineering', name_th: 'วิศวกรรม' },
      { name: 'Film', name_th: '' },
      { name: 'Biology', name_th: '' },
    ]);
    expect(domainOptions(subdomain!, 'engineering ', page)).toEqual([
      { name: 'DevOps', name_th: '' },
      { name: 'Cloud', name_th: 'คลาวด์' },
    ]);
    expect(names(domainOptions(subdomain!, 'Engineering, Biology', page))).toEqual(['DevOps', 'Cloud', 'Plant']);
    expect(domainOptions(subdomain!, 'Cooking', page)).toEqual([]);
    expect(names(domainOptions(subdomain!, '', page))).toEqual(['DevOps', 'Cloud', 'Editing', 'Plant']);
  });

  it('keep the Thai of each subdomain as pairs, whatever their order', () => {
    expect([...itemThai('DevOps=เดฟออปส์, cloud = คลาวด์, broken, =x')]).toEqual([
      ['devops', 'เดฟออปส์'],
      ['cloud', 'คลาวด์'],
    ]);
    expect(joinItemThai(['Cloud', 'DevOps', 'Mobile'], itemThai('DevOps=เดฟออปส์, Cloud=คลาวด์'))).toBe('Cloud=คลาวด์, DevOps=เดฟออปส์');
  });

  it("shows several domains and subdomains by their Thai names from the Domains page", () => {
    const projects = getSection('projects')!;
    const domains: Record<string, string>[] = [{ name: 'Engineering', name_th: 'วิศวกรรม', subdomains: 'DevOps, Cloud', subdomains_th: 'DevOps=เดฟออปส์' }, { name: 'Film' }];
    const shown = localizeEntry(projects, { name: 'Site', domain: 'Engineering, Film', subdomain: 'DevOps, Cloud' }, 'th', { domains });
    expect(shown).toMatchObject({ domain: 'วิศวกรรม, Film', subdomain: 'เดฟออปส์, Cloud' });
    const page = getSection(DOMAIN_LIST)!;
    expect(localizeEntry(page, domains[0], 'th')).toMatchObject({ name: 'วิศวกรรม', subdomains: 'เดฟออปส์, Cloud' });
  });

  it('pair each English value with the Thai used most often with it', () => {
    const thai = suggestionThai(domain, [
      { domain: 'Engineering', domain_th: 'วิศวกรรม' },
      { domain: 'engineering ', domain_th: 'วิศวกรรม' },
      { domain: 'Engineering', domain_th: 'วิศวะ' },
      { domain: 'Film', domain_th: '' },
    ]);
    expect([...thai]).toEqual([['engineering', 'วิศวกรรม']]);
  });
});

describe('several organizations', () => {
  it('split on ";", tidied and each once, so names with commas stay whole', () => {
    expect(splitOrganizations(' Acme, Inc. ;Studio  X;; acme, inc.')).toEqual(['Acme, Inc.', 'Studio X']);
    expect(joinOrganizations(['Acme, Inc.', 'Studio X'])).toBe('Acme, Inc.; Studio X');
  });

  it('each show their own Thai name', () => {
    const projects = getSection('projects')!;
    const shown = localizeEntry(projects, { name: 'Film', organization: 'Studio X; Acme' }, 'th', { organizations: [{ name: 'Studio X', name_th: 'สตูดิโอเอ็กซ์' }] });
    expect(shown.organization).toBe('สตูดิโอเอ็กซ์; Acme');
  });
});

describe('progressOf', () => {
  const today = '2026-06-15';
  it('follows the dates: not started, in progress through the end date, then completed', () => {
    expect(progressOf({ startDate: '2026-06-16', endDate: '2026-06-20' }, today)).toBe('Not Started');
    expect(progressOf({ startDate: '2026-06-10', endDate: '2026-06-15' }, today)).toBe('In Progress');
    expect(progressOf({ startDate: '2026-06-10', endDate: '2026-06-14' }, today)).toBe('Completed');
    // Started, with no end date given yet: still running.
    expect(progressOf({ startDate: '2026-01-01' }, today)).toBe('In Progress');
  });

  it('is interested through the application deadline, then awaits the results until they are announced', () => {
    const dates = { startDate: '2026-08-01', endDate: '2026-08-02' };
    expect(progressOf({ ...dates, applicationDeadline: '2026-06-15', resultsDate: '2026-07-01' }, today)).toBe('Interested');
    expect(progressOf({ ...dates, applicationDeadline: '2026-06-14', resultsDate: '2026-07-01' }, today)).toBe('Awaiting Results');
    expect(progressOf({ ...dates, applicationDeadline: '2026-06-01', resultsDate: '2026-06-15' }, today)).toBe('Not Started');
    // Before the activity's own dates are known.
    expect(progressOf({ applicationDeadline: '2026-06-30' }, today)).toBe('Interested');
    expect(progressOf({ applicationDeadline: '2026-06-01' }, today)).toBe('');
  });

  it('keeps a one-off (no end date) in progress on its day only', () => {
    expect(progressOf({ startDate: '2026-06-15', noEndDate: 'true', endDate: '2026-12-31' }, today)).toBe('In Progress');
    expect(progressOf({ startDate: '2026-06-14', noEndDate: 'true' }, today)).toBe('Completed');
  });

  it('compares a month alone with this month', () => {
    expect(progressOf({ startDate: '2026-06', endDate: '2026-06' }, today)).toBe('In Progress');
    expect(progressOf({ startDate: '2026-05', endDate: '2026-05' }, today)).toBe('Completed');
    expect(progressOf({ startDate: '2026-07' }, today)).toBe('Not Started');
  });

  it('puts what is set by hand before the dates, and ignores other hand-typed values', () => {
    expect(progressOf({ startDate: '2026-07-01', progress: 'Cancelled by Organizer' }, today)).toBe('Cancelled by Organizer');
    expect(progressOf({ progress: ' Rejected ' }, today)).toBe('Rejected');
    // Applied before the deadline: awaiting the results, which the dates alone would call interested.
    expect(progressOf({ applicationDeadline: '2026-06-30', progress: 'Awaiting Results' }, today)).toBe('Awaiting Results');
    expect(progressOf({ startDate: '2026-07-01', progress: 'Completed' }, today)).toBe('Not Started');
    expect(progressOf({}, today)).toBe('');
  });

  it('reads an old "Cancelled" as cancelled by the organizer', () => {
    expect(progressOf({ startDate: '2026-07-01', progress: 'Cancelled' }, today)).toBe('Cancelled by Organizer');
    expect(progressSetByHand('Cancelled')).toBe('Cancelled by Organizer');
    expect(progressSetByHand('Completed')).toBe('');
  });

  it('has a Thai name for each progress', () => {
    expect(PROGRESS.map((p) => progressLabel(p, 'th'))).toEqual([
      'สนใจเข้าร่วม',
      'รอประกาศผลการคัดเลือก',
      'ยังไม่เริ่มกิจกรรม',
      'กำลังดำเนินกิจกรรม',
      'สิ้นสุดกิจกรรมแล้ว',
      'ยกเลิกโดยผู้จัดกิจกรรม',
      'ยกเลิกโดยผู้สมัคร',
      'ไม่ผ่านการคัดเลือก',
    ]);
    expect(progressLabel('Completed')).toBe('Completed');
  });

  it("takes today's date in local time", () => {
    expect(localToday(new Date(2026, 0, 5, 1, 30))).toBe('2026-01-05');
  });

  it('stores only what the dates cannot tell', () => {
    expect(getSection('activities')!.fields.find((f) => f.progress)?.options).toEqual(['Interested', 'Awaiting Results', 'Cancelled by Organizer', 'Cancelled by Applicant', 'Rejected']);
  });
});

describe('splitLinks and joinLinks', () => {
  it('reads "Title | URL" lines, the address after the last "|", or a line with just the address', () => {
    expect(splitLinks('Talk | part 2 | https://a.test/2\nhttps://b.test\r\n\nDraft |')).toEqual([
      { title: 'Talk | part 2', url: 'https://a.test/2' },
      { title: '', url: 'https://b.test' },
      { title: 'Draft', url: '' },
    ]);
    expect(splitLinks('')).toEqual([]);
  });

  it('writes them back the same way, leaving out empty rows', () => {
    const cell = joinLinks([{ title: ' Talk ', url: 'https://a.test ' }, { title: '', url: '' }, { title: '', url: 'https://b.test' }]);
    expect(cell).toBe('Talk | https://a.test\nhttps://b.test');
    expect(joinLinks(splitLinks(cell))).toBe(cell);
  });

  it('keeps the email signed up with after the address, and tells an "@" in an address apart from one', () => {
    const cell = 'Chula MOOC | https://a.test/3 | me@example.com\nBlog | https://medium.com/@me\nA | b | https://medium.com/@me';
    expect(splitLinks(cell)).toEqual([
      { title: 'Chula MOOC', url: 'https://a.test/3', email: 'me@example.com' },
      { title: 'Blog', url: 'https://medium.com/@me' },
      { title: 'A | b', url: 'https://medium.com/@me' },
    ]);
    expect(joinLinks(splitLinks(cell))).toBe(cell);
    expect(joinLinks([{ title: '', url: 'https://a.test', email: ' me@example.com ' }])).toBe('| https://a.test | me@example.com');
    expect(splitLinks('| https://a.test | me@example.com')).toEqual([{ title: '', url: 'https://a.test', email: 'me@example.com' }]);
  });

  it("counts an organization's sites and the sign-up emails noted for them", () => {
    const orgs = getSection('organizations')!;
    expect(signUpEmails(orgs, { website: 'https://a.test', websiteEmail: 'me@example.com', links: 'A | https://b.test\nB | https://c.test | me@example.com' })).toEqual({ sites: 3, emails: 2 });
    // An account email without its website doesn't count as a site.
    expect(signUpEmails(orgs, { websiteEmail: 'me@example.com' })).toEqual({ sites: 0, emails: 0 });
    expect(signUpEmails(getSection('projects')!, { links: 'A | https://b.test' })).toEqual({ sites: 0, emails: 0 });
  });

  it('gives organizations a sign-up email for their website and each of their other links', () => {
    const fields = getSection('organizations')!.fields;
    expect(fields.find((f) => f.key === 'websiteEmail')).toMatchObject({ type: 'email', label: 'Website sign-up email' });
    expect(fields.find((f) => f.key === 'links')!.accountEmail).toBe(true);
    expect(getSection('projects')!.fields.find((f) => f.key === 'links')!.accountEmail).toBeUndefined();
  });

  it('gives Experience, Education, Projects, Volunteer, Activities, Certifications, Certificates and Organizations a links field', () => {
    expect(SECTIONS.filter((s) => s.fields.some((f) => f.type === 'links')).map((s) => s.key)).toEqual([
      'experience',
      'education',
      'certifications',
      'certificates',
      'projects',
      'volunteer',
      'activities',
      'organizations',
    ]);
  });
});

describe('seedTitle', () => {
  const posts = getSection('posts')!;
  it("names a new post after the entry, with its Thai title and the post's defaults", () => {
    expect(seedTitle(posts, getSection('activities')!, { name: ' AWS Summit ', name_th: 'งาน AWS' })).toEqual({ status: 'draft', title: 'AWS Summit', title_th: 'งาน AWS' });
    // No Thai title: the post's Thai stays empty, meaning "same as English".
    expect(seedTitle(posts, getSection('activities')!, { name: 'AWS Summit' })).toEqual({ status: 'draft', title: 'AWS Summit' });
  });

  it("takes a school's Thai name from its organization", () => {
    const names = { organizations: [{ name: 'KMUTT', name_th: 'มจธ.' }] };
    expect(seedTitle(posts, getSection('education')!, { school: 'KMUTT' }, names)).toMatchObject({ title: 'KMUTT', title_th: 'มจธ.' });
  });

  it('gives nothing while the entry has no title', () => {
    expect(seedTitle(posts, getSection('activities')!, { name: '  ' })).toBeUndefined();
  });

  it('is set for posts only', () => {
    expect(SECTIONS.filter((s) => s.titleFromLinked).map((s) => s.key)).toEqual(['posts']);
  });
});
