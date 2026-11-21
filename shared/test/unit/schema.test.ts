import { describe, expect, it } from 'vitest';
import { fieldErrors, getSection, isUrl, sectionSchema } from '../../src';

const parse = (section: string, data: Record<string, unknown>) => sectionSchema(getSection(section)!).safeParse(data);
const errorsOf = (section: string, data: Record<string, unknown>) => {
  const result = parse(section, data);
  if (result.success) throw new Error('expected validation to fail');
  return fieldErrors(result.error);
};

describe('sectionSchema', () => {
  it('accepts a valid entry, trims values and fills missing optional fields with ""', () => {
    const result = parse('projects', { name: '  Short film  ', url: 'https://example.com' });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ name: 'Short film', url: 'https://example.com', role: '', organization: '' });
  });

  it('requires required fields', () => {
    expect(errorsOf('projects', { name: '   ' })).toEqual({ name: 'Project name is required' });
    // A missing key (API callers only; the form always sends every field) is rejected too, with zod's default message.
    expect(Object.keys(errorsOf('projects', {}))).toEqual(['name']);
  });

  it('keeps Thai versions, which follow their field\'s limits but are never required', () => {
    expect(parse('experience', { title: 'Editor', company: 'C', title_th: ' บรรณาธิการ ' }).data).toMatchObject({ title_th: 'บรรณาธิการ', description_th: '' });
    expect(errorsOf('about', { name: 'Me', headline_th: 'ก'.repeat(221) })).toEqual({ headline_th: 'Max 220 characters' });
    expect(errorsOf('about', { name: '', name_th: 'ฉัน' })).toEqual({ name: 'Name is required' });
  });

  it('enforces LinkedIn character limits', () => {
    expect(errorsOf('about', { name: 'Me', headline: 'x'.repeat(221) })).toEqual({ headline: 'Max 220 characters' });
  });

  it('validates urls, emails and dates but allows them empty', () => {
    expect(errorsOf('about', { name: 'Me', email: 'nope', website: 'not a url' })).toEqual({
      email: 'Must be a valid email',
      website: 'Must be a valid URL, e.g. https://example.com',
    });
    expect(errorsOf('projects', { name: 'P', startDate: '03/2024' })).toEqual({ startDate: 'Use YYYY-MM or YYYY-MM-DD' });
    expect(parse('projects', { name: 'P', startDate: '2024-03', endDate: '2024-03-15', url: '' }).success).toBe(true);
  });

  it('only allows the listed options for selects and true/false for booleans', () => {
    expect(errorsOf('posts', { title: 'T', status: 'published' }).status).toMatch(/^Must be one of: draft, scheduled, posted/);
    expect(errorsOf('experience', { title: 'T', company: 'C', current: 'yes' })).toEqual({ current: 'Must be true or false' });
  });

  it('normalizes refs to a de-duplicated comma list', () => {
    expect(parse('projects', { name: 'P', certificationIds: ' a , b,a ,' }).data?.certificationIds).toBe('a,b');
  });

  it('ignores unknown keys such as meta columns', () => {
    const result = parse('skills', { name: 'React', id: 'x', createdAt: 'y' });
    expect(result.data).not.toHaveProperty('id');
  });
});

describe('url fields', () => {
  it('adds https:// to bare addresses and leaves full URLs alone', () => {
    const url = (v: string) => parse('projects', { name: 'P', url: v }).data?.url;
    expect(url('www.linkedin.com/in/me')).toBe('https://www.linkedin.com/in/me');
    expect(url('example.com')).toBe('https://example.com');
    expect(url('http://example.com')).toBe('http://example.com');
    expect(url('')).toBe('');
    expect(parse('projects', { name: 'P', url: 'not a url' }).success).toBe(false);
  });
});

describe('isUrl', () => {
  it('accepts absolute URLs and rejects the rest', () => {
    for (const ok of ['https://example.com', 'http://localhost:3000/a?b=1#c', 'https://www.linkedin.com/in/me/', 'HTTPS://EXAMPLE.COM']) expect(isUrl(ok)).toBe(true);
    const bad = ['', 'nope', 'example.com', 'https://', 'https:// spaced.com', 'mailto:me@example.com', 'ftp://files.example.org'];
    // Script links, including the "//" trick that looks like an address.
    bad.push('javascript:alert(1)', 'javascript://%0Aalert(document.domain)', 'JavaScript://x%0Aalert(1)', 'data://text/html,<script>');
    for (const b of bad) expect(isUrl(b)).toBe(false);
  });
});

describe('links fields', () => {
  const links = (v: string) => parse('activities', { name: 'A', links: v });
  it('stores a link per line, "Title | URL", tidied, with https:// added to bare addresses', () => {
    expect(links('  Recording |  www.youtube.com/watch?v=1 \n\nhttps://example.com/slides\r\nPress  kit|https://a.test').data?.links).toBe(
      'Recording | https://www.youtube.com/watch?v=1\nhttps://example.com/slides\nPress kit | https://a.test',
    );
    expect(links('').data?.links).toBe('');
  });

  it('refuses an address that is not a web link, or a title without one', () => {
    expect(errorsOf('activities', { name: 'A', links: 'Slides | javascript:alert(1)' }).links).toBe('Not a valid URL: javascript:alert(1)');
    expect(errorsOf('activities', { name: 'A', links: 'Slides |' }).links).toMatch(/“Slides” needs a URL/);
    // A sign-up email after the address must be one.
    expect(errorsOf('organizations', { name: 'Chula', links: 'MOOC | https://a.test | me@nowhere' }).links).toBe('Not a valid email: me@nowhere');
    expect(parse('organizations', { name: 'Chula', links: 'MOOC | a.test | me@example.com' }).data?.links).toBe('MOOC | https://a.test | me@example.com');
  });
});
