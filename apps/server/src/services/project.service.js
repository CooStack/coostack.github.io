import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS_ROOT, PROJECT_INDEX_FILE } from '../config/paths.js';
import { ensureDir, readJson, writeJson } from '../utils/fs-json.js';

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `proj_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function fileNameFor(tool, id) {
  return `${tool}--${id}.json`;
}

function filePathFor(tool, id) {
  return path.join(PROJECTS_ROOT, fileNameFor(tool, id));
}

async function readIndex() {
  await ensureDir(PROJECTS_ROOT);
  return (await readJson(PROJECT_INDEX_FILE, [])) || [];
}

async function writeIndex(index) {
  await ensureDir(PROJECTS_ROOT);
  await writeJson(PROJECT_INDEX_FILE, index);
}

export async function listProjects({ tool, q } = {}) {
  const index = await readIndex();
  return index
    .filter((item) => (!tool || item.tool === tool))
    .filter((item) => {
      if (!q) return true;
      const keyword = String(q).toLowerCase();
      return [item.name, item.description, item.tool].some((field) => String(field || '').toLowerCase().includes(keyword));
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getProject(tool, id) {
  return readJson(filePathFor(tool, id), null);
}

export async function saveProject(input = {}) {
  const tool = String(input.tool || '').trim();
  if (!tool) {
    throw new Error('tool 不能为空');
  }
  const id = String(input.id || makeId());
  const current = await getProject(tool, id);
  const createdAt = current?.createdAt || nowIso();
  const project = {
    id,
    tool,
    name: String(input.name || 'Untitled Project').trim(),
    description: String(input.description || '').trim(),
    tags: Array.isArray(input.tags) ? input.tags : [],
    payload: input.payload || {},
    createdAt,
    updatedAt: nowIso()
  };

  await ensureDir(PROJECTS_ROOT);
  await writeJson(filePathFor(tool, id), project);

  const index = await readIndex();
  const metadata = {
    id: project.id,
    tool: project.tool,
    name: project.name,
    description: project.description,
    tags: project.tags,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
  const nextIndex = index.filter((item) => !(item.tool === tool && item.id === id));
  nextIndex.push(metadata);
  await writeIndex(nextIndex);
  return project;
}

export async function deleteProject(tool, id) {
  const target = filePathFor(tool, id);
  await fs.rm(target, { force: true });
  const index = await readIndex();
  const nextIndex = index.filter((item) => !(item.tool === tool && item.id === id));
  await writeIndex(nextIndex);
  return { ok: true };
}

export async function recentProjects(limit = 8) {
  const items = await listProjects();
  return items.slice(0, limit);
}
