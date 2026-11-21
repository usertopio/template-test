import { z } from 'zod';
import { splitList, type FieldDef, type SectionDef } from './sections';

function fieldSchema(field: FieldDef): z.ZodType<string> {
  let s = z.string().trim();
  if (field.max) s = s.max(field.max, `Max ${field.max} characters`);
  if (field.required) s = s.min(1, `${field.label} is required`);

  let schema: z.ZodType<string> = s;
  switch (field.type) {
    case 'url':
      schema = s.refine((v) => v === '' || URL.canParse(v), 'Must be a valid URL');
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
      schema = s.transform((v) => splitList(v).join(','));
      break;
  }
  return field.required ? schema : schema.default('');
}

/** Validation schema for a section's editable fields (meta columns are stripped). */
export function sectionSchema(section: SectionDef) {
  return z.object(Object.fromEntries(section.fields.map((f) => [f.key, fieldSchema(f)])));
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
