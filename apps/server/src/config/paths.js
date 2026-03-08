import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_ROOT = path.resolve(__dirname, '..', '..');
export const WEB_ROOT = path.resolve(SERVER_ROOT, '..', 'web');
export const WEB_DIST_ROOT = path.join(WEB_ROOT, 'dist');
export const WEB_INDEX_FILE = path.join(WEB_DIST_ROOT, 'index.html');
export const DATA_ROOT = path.join(SERVER_ROOT, 'data');
export const PROJECTS_ROOT = path.join(DATA_ROOT, 'projects');
export const PROJECT_INDEX_FILE = path.join(PROJECTS_ROOT, 'index.json');
export const API_PORT = Number(process.env.PORT || 3001);
