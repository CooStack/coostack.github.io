export function generateEmitterScript(project) {
  return [
    `count = ${Number(project?.count || 0)}`,
    `speed = ${Number(project?.speed || 0).toFixed(2)}`,
    `spread = ${Number(project?.spread || 0).toFixed(2)}`,
    `life = ${Number(project?.life || 0)}`,
    `color = \"${project?.color || '#ffffff'}\"`
  ].join('\n');
}
