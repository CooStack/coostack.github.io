import { evalBuilder, evalBuilderWithMeta } from './builder-tools.js';
import { getProjectNodes } from './node-helpers.js';
import { normalizePointsBuilderProject } from './normalizer.js';

export function evaluatePointsNodes(nodes = []) {
  return evalBuilder(nodes);
}

export function evaluatePointsProject(project) {
  const normalized = normalizePointsBuilderProject(project, project?.tool || 'pointsbuilder');
  return evalBuilder(getProjectNodes(normalized));
}

export function evaluatePointsProjectWithMeta(project) {
  const normalized = normalizePointsBuilderProject(project, project?.tool || 'pointsbuilder');
  return evalBuilderWithMeta(getProjectNodes(normalized));
}
