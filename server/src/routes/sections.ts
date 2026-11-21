import { Router, type Request } from 'express';
import { ORGANIZATIONS, SECTIONS, fieldErrors, getSection, referencingSections, sectionSchema, splitList, type SectionDef } from '@profile/shared';
import type { SheetRepository } from '../sheets/repo';
import { HttpError } from '../errors';
import { assertUniqueOrganization, registerOrganizations, renameOrganization } from '../organizations';

export { HttpError };

export type RepoProvider = () => Promise<Map<string, SheetRepository>>;


function parseBody(section: SectionDef, body: unknown): Record<string, string> {
  const result = sectionSchema(section).safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, 'Validation failed', fieldErrors(result.error));
  return result.data as Record<string, string>;
}

export function sectionsRouter(getRepos: RepoProvider): Router {
  const router = Router();

  async function resolve(req: Request<{ section: string }>, { singleton }: { singleton: boolean }) {
    const section = getSection(req.params.section);
    if (!section || !!section.singleton !== singleton) throw new HttpError(404, `Unknown section "${req.params.section}"`);
    const repo = (await getRepos()).get(section.key)!;
    return { section, repo };
  }

  /** Validate a body, then drop link ids that don't point at an existing entry (e.g. rows deleted in the sheet). */
  async function parseWithRefs(section: SectionDef, body: unknown): Promise<Record<string, string>> {
    const data = parseBody(section, body);
    const repos = await getRepos();
    for (const field of section.fields) {
      if (field.type !== 'refs' || !data[field.key]) continue;
      const existing = new Set((await repos.get(field.refSection!)!.list()).map((e) => e.id));
      data[field.key] = splitList(data[field.key]).filter((id) => existing.has(id)).join(',');
    }
    return data;
  }

  /** Remove a deleted entry's id from every refs field that points at its section. */
  async function unlinkEverywhere(sectionKey: string, id: string) {
    const repos = await getRepos();
    for (const { section, fields } of referencingSections(sectionKey)) {
      const repo = repos.get(section.key)!;
      for (const entry of await repo.list()) {
        const changes: Record<string, string> = {};
        for (const f of fields) {
          const ids = splitList(entry[f.key]);
          if (ids.includes(id)) changes[f.key] = ids.filter((x) => x !== id).join(',');
        }
        if (Object.keys(changes).length) await repo.update(entry.id, changes);
      }
    }
  }

  // Dump everything, e.g. for backups or migrating off Sheets.
  router.get('/export', async (_req, res) => {
    const repos = await getRepos();
    const entries = await Promise.all(SECTIONS.map(async (s) => [s.key, await repos.get(s.key)!.list()] as const));
    res.json({ exportedAt: new Date().toISOString(), sections: Object.fromEntries(entries) });
  });

  // Singleton sections (About): one row, read and upserted as a whole.
  router.get('/single/:section', async (req, res) => {
    const { repo } = await resolve(req, { singleton: true });
    const [entry] = await repo.list();
    res.json(entry ?? null);
  });

  router.put('/single/:section', async (req, res) => {
    const { section, repo } = await resolve(req, { singleton: true });
    const data = await parseWithRefs(section, req.body);
    const [existing] = await repo.list();
    res.json(existing ? await repo.update(existing.id, data) : await repo.create(data));
  });

  // List sections.
  router.get('/sections/:section', async (req, res) => {
    const { repo } = await resolve(req, { singleton: false });
    res.json(await repo.list());
  });

  router.post('/sections/:section', async (req, res) => {
    const { section, repo } = await resolve(req, { singleton: false });
    const data = await parseWithRefs(section, req.body);
    const repos = await getRepos();
    if (section.key === ORGANIZATIONS) await assertUniqueOrganization(repos, data.name);
    const entry = await repo.create(data);
    await registerOrganizations(repos, section, entry);
    res.status(201).json(entry);
  });

  router.get('/sections/:section/:id', async (req, res) => {
    const { repo } = await resolve(req, { singleton: false });
    res.json(await repo.get(req.params.id));
  });

  router.put('/sections/:section/:id', async (req, res) => {
    const { section, repo } = await resolve(req, { singleton: false });
    const data = await parseWithRefs(section, req.body);
    const repos = await getRepos();
    const before = await repo.get(req.params.id);
    if (section.key === ORGANIZATIONS) await assertUniqueOrganization(repos, data.name, before.id);
    const entry = await repo.update(before.id, data);
    if (section.key === ORGANIZATIONS) await renameOrganization(repos, before, entry);
    await registerOrganizations(repos, section, entry);
    res.json(entry);
  });

  router.delete('/sections/:section/:id', async (req, res) => {
    const { section, repo } = await resolve(req, { singleton: false });
    await repo.remove(req.params.id);
    await unlinkEverywhere(section.key, req.params.id);
    res.status(204).end();
  });

  return router;
}
