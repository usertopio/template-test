import { describe, expect, it } from 'vitest';
import { getSection, type Entry } from '@profile/shared';
import { entryText, fieldText, formatDate } from '../../src/entryText';

const projects = getSection('projects')!;
const experience = getSection('experience')!;
const entry = (data: Record<string, string>) => ({ id: 'e1', createdAt: '', updatedAt: '', ...data }) as Entry;
const related = new Map([['certificates', [{ id: 'c1', name: 'Data Analytics', createdAt: '', updatedAt: '' } as Entry]]]);

describe('entryText', () => {
  it('lists filled fields with labels in form order, long text on its own lines, links by name', () => {
    const e = entry({ name: 'Film', role: 'Editor', description: 'Cut the trailer.\nColour graded.', skills: 'Editing, Sound', certificateIds: 'c1,ghost', url: '' });
    expect(entryText(projects, e, related)).toBe(
      ['Project name: Film', 'Role: Editor', 'Description:\nCut the trailer.\nColour graded.', 'Skills: Editing, Sound', 'Linked certificates: Data Analytics'].join('\n'),
    );
  });

  it('writes ticked boxes as Yes and leaves unticked ones out', () => {
    expect(entryText(experience, entry({ title: 'Engineer', company: 'Depa', current: 'true' }), new Map())).toBe('Title: Engineer\nCompany: Depa\nI currently work here: Yes');
    expect(entryText(experience, entry({ title: 'Engineer', current: 'false' }), new Map())).toBe('Title: Engineer');
  });

  it('lists links one per line, each with its title', () => {
    const e = entry({ name: 'Film', links: 'Trailer | https://a.test\nhttps://b.test' });
    expect(entryText(projects, e, new Map())).toBe('Project name: Film\nLinks:\nTrailer: https://a.test\nhttps://b.test');
  });

  it('adds the email signed up with to a link that has one', () => {
    const org = entry({ name: 'Chula', websiteEmail: 'me@example.com', links: 'Chula MOOC | https://a.test/3 | me@example.com' });
    expect(entryText(getSection('organizations')!, org, new Map())).toBe(
      'Name: Chula\nWebsite sign-up email: me@example.com\nOther links:\nChula MOOC: https://a.test/3 (signed up with me@example.com)',
    );
  });

  it('gives a single field as plain text', () => {
    expect(fieldText(projects.fields.find((f) => f.key === 'skills')!, entry({ skills: 'A,  B,A' }), new Map())).toBe('A, B');
  });
});

describe('formatDate', () => {
  it('shows a day as dd/mm/yy and a month as mm/yy, and leaves anything else as it is', () => {
    expect(formatDate('2025-08-21')).toBe('21/08/25');
    expect(formatDate('2024-03')).toBe('03/24');
    expect(formatDate('Spring 2024')).toBe('Spring 2024');
    expect(fieldText({ key: 'issueDate', label: 'Issue date', type: 'date' }, entry({ issueDate: '2026-01-05' }), new Map())).toBe('05/01/26');
  });
});
