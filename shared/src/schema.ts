import { z } from 'zod';
import { MEDIA_DESCRIPTION_MAX, MEDIA_TITLE_MAX } from './media';
import { LANGUAGES, joinLinks, joinOrganizations, splitLinks, splitList, splitOrganizations, translationKey, type FieldDef, type SectionDef } from './sections';

/** Add "https://" to a bare address like "www.example.com/x", as people often type them. */
export function withScheme(value: string): string {
  return value && !/^[a-z][a-z\d+.-]*:/i.test(value) && /^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(value) ? `https://${value}` : value;
}

/**
 * A web address: "http(s)://host…". Only http and https, so a link can't carry a script
 * (e.g. "javascript://%0Aalert(1)"). A pattern rather than URL.canParse, which Apps Script lacks.
 */
export function isUrl(value: string): boolean {
  return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(value);
}

function fieldSchema(field: FieldDef, draft: boolean): z.ZodType<string> {
  let s = z.string().trim();
  if (field.max) s = s.max(field.max, `Max ${field.max} characters`);
  const required = field.required && !draft;
  if (required) s = s.min(1, `${field.label} is required`);

  let schema: z.ZodType<string> = s;
  switch (field.type) {
    case 'url':
      schema = s.transform(withScheme).refine((v) => v === '' || isUrl(v), 'Must be a valid URL, e.g. https://example.com');
      break;
    case 'email':
      schema = s.refine((v) => v === '' || z.email().safeParse(v).success, 'Must be a valid email');
      break;
    case 'date':
      schema = s.refine((v) => v === '' || /^\d{4}-\d{2}(-\d{2})?$/.test(v), 'Use YYYY-MM or YYYY-MM-DD');
      break;
    case 'boolean':
      schema = s.refine((v) => v === '' || v === 'true' || v === 'false', 'Must be true or false');
      break;
    case 'select':
      schema = s.refine((v) => v === '' || field.options!.includes(v), `Must be one of: ${field.options!.join(', ')}`);
      break;
    case 'refs':
    case 'media':
      schema = s.transform((v) => splitList(v).join(','));
      break;
    case 'links':
      // Each address checked like a URL field's (a bare "www…" gets https://), and the cell stored tidied.
      schema = s
        .transform((v) => joinLinks(splitLinks(v).map((l) => ({ ...l, url: withScheme(l.url) }))))
        .superRefine((v, ctx) => {
          const bad = splitLinks(v).find((l) => !isUrl(l.url));
          if (bad) ctx.addIssue({ code: 'custom', message: bad.url ? `Not a valid URL: ${bad.url}` : `“${bad.title}” needs a URL, e.g. https://example.com` });
          const badEmail = splitLinks(v).find((l) => l.email && !z.email().safeParse(l.email).success);
          if (badEmail) ctx.addIssue({ code: 'custom', message: `Not a valid email: ${badEmail.email}` });
        });
      break;
  }
  // Several organizations: stored tidied, each once ("Studio X; Acme").
  if (field.organization) schema = schema.transform((v) => joinOrganizations(splitOrganizations(v)));
  return required ? schema : schema.default('');
}

/**
 * Validation schema for a section's editable fields (meta columns are stripped).
 * A draft may leave required fields empty; everything that is filled in must still be valid.
 * Thai versions follow their field's rules but are never required: an empty one shows the English.
 */
export function sectionSchema(section: SectionDef, { draft = false } = {}) {
  const translations = LANGUAGES.filter((l) => l !== 'en').flatMap((lang) =>
    section.fields.filter((f) => f.translatable).map((f): [string, z.ZodType<string>] => [translationKey(f.key, lang), fieldSchema({ ...f, required: false }, draft)]),
  );
  return z.object(Object.fromEntries([...section.fields.map((f): [string, z.ZodType<string>] => [f.key, fieldSchema(f, draft)]), ...translations]));
}

/** Flatten zod issues into `{ fieldKey: message }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    out[key] ??= issue.message;
  }
  return out;
}

/** Title and description (in English, and optionally Thai) as entered by the user. */
export const mediaSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(MEDIA_TITLE_MAX, `Max ${MEDIA_TITLE_MAX} characters`),
  description: z.string().trim().max(MEDIA_DESCRIPTION_MAX, `Max ${MEDIA_DESCRIPTION_MAX} characters`).default(''),
  description_th: z.string().trim().max(MEDIA_DESCRIPTION_MAX, `Max ${MEDIA_DESCRIPTION_MAX} characters`).default(''),
});
