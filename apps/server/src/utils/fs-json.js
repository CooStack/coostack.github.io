import fs from 'node:fs/promises';

export async function ensureDir(path) {
  await fs.mkdir(path, { recursive: true });
}

export async function readJson(path, fallback = null) {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

export async function writeJson(path, value) {
  const text = JSON.stringify(value, null, 2);
  await fs.writeFile(path, `${text}\n`, 'utf-8');
}
