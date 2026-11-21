import { Router, type Request } from 'express';
import type { Api } from '@profile/core';

/** `?draft=1` saves an unfinished entry (sections with drafts only). */
const draftOption = (req: Request) => ({ draft: req.query.draft === '1' });

/** Sections, the About row and the export over HTTP. The work happens in @profile/core. */
export function sectionsRouter(api: Api): Router {
  const router = Router();

  router.get('/export', async (_req, res) => {
    res.json(await api.exportAll());
  });

  router.get('/single/:section', async (req, res) => {
    res.json(await api.getSingle(req.params.section));
  });

  router.put('/single/:section', async (req, res) => {
    res.json(await api.saveSingle(req.params.section, req.body));
  });

  router.get('/sections/:section', async (req, res) => {
    res.json(await api.listEntries(req.params.section));
  });

  router.post('/sections/:section', async (req, res) => {
    res.status(201).json(await api.createEntry(req.params.section, req.body, draftOption(req)));
  });

  router.get('/sections/:section/:id', async (req, res) => {
    res.json(await api.getEntry(req.params.section, req.params.id));
  });

  router.put('/sections/:section/:id', async (req, res) => {
    res.json(await api.updateEntry(req.params.section, req.params.id, req.body, draftOption(req)));
  });

  // Unlink one entry from another, e.g. DELETE /sections/projects/<id>/links/certificates/<certificate id>.
  router.delete('/sections/:section/:id/links/:target/:targetId', async (req, res) => {
    const { section, id, target, targetId } = req.params;
    res.json(await api.unlinkEntry(section, id, target, targetId));
  });

  router.delete('/sections/:section/:id', async (req, res) => {
    await api.deleteEntry(req.params.section, req.params.id);
    res.status(204).end();
  });

  return router;
}
