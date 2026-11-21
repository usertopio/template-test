import { beforeEach, describe, expect, it } from 'vitest';
import { SKILLS, getSection } from '@profile/shared';
import { assertUniqueSkill, backfillSkills, registerSkills, renameSkill } from '../../src/skills';
import { memoryRepos, names } from '../helpers/memoryRepos';

const projects = getSection('projects')!;
const posts = getSection('posts')!;

describe('skills', () => {
  let repos: ReturnType<typeof memoryRepos>;
  beforeEach(() => {
    repos = memoryRepos();
  });

  it('adds each new skill tagged on an entry to the Skills tab', async () => {
    await registerSkills(repos, projects, { name: 'Film', skills: 'Editing, Color  grading, Editing' });
    expect(await names(repos, SKILLS)).toEqual(['Editing', 'Color grading']);
  });

  it('skips skills that already exist, ignoring case and spacing', async () => {
    await repos.get(SKILLS)!.create({ name: 'React', category: 'Engineering' });
    await registerSkills(repos, projects, { name: 'App', skills: 'react , TypeScript' });
    expect(await names(repos, SKILLS)).toEqual(['React', 'TypeScript']);
  });

  it('ignores tags fields that are not skills (hashtags)', async () => {
    await registerSkills(repos, posts, { title: 'Post', hashtags: '#film, #engineering' });
    expect(await names(repos, SKILLS)).toEqual([]);
  });

  it('backfills skills from experience and projects', async () => {
    await repos.get('experience')!.create({ title: 'Editor', company: 'X', skills: 'Editing' });
    await repos.get('projects')!.create({ name: 'Film', skills: 'editing, Sound' });
    await backfillSkills(repos);
    expect(await names(repos, SKILLS)).toEqual(['Editing', 'Sound']);
  });

  it('rejects a duplicate skill name but allows keeping your own', async () => {
    const skill = await repos.get(SKILLS)!.create({ name: 'React' });
    await expect(assertUniqueSkill(repos, 'REACT')).rejects.toMatchObject({ status: 400, fields: { name: '"React" already exists' } });
    await expect(assertUniqueSkill(repos, 'React', skill.id)).resolves.toBeUndefined();
  });

  it('renames the skill in every entry tagged with it, keeping other tags', async () => {
    const project = await repos.get('projects')!.create({ name: 'App', skills: 'react, TypeScript' });
    const exp = await repos.get('experience')!.create({ title: 'Dev', company: 'X', skills: 'Go' });
    const before = await repos.get(SKILLS)!.create({ name: 'React' });
    await renameSkill(repos, before, { ...before, name: 'React.js' });
    expect((await repos.get('projects')!.get(project.id)).skills).toBe('React.js, TypeScript');
    expect((await repos.get('experience')!.get(exp.id)).skills).toBe('Go');
  });

  it('merges tags when a rename makes two of them equal', async () => {
    const project = await repos.get('projects')!.create({ name: 'App', skills: 'React, ReactJS' });
    const before = await repos.get(SKILLS)!.create({ name: 'ReactJS' });
    await renameSkill(repos, before, { ...before, name: 'React' });
    expect((await repos.get('projects')!.get(project.id)).skills).toBe('React');
  });
});
