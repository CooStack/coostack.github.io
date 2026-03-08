function sanitizeBaseName(raw, fallback = 'export') {
  const text = String(raw || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
  return text || fallback;
}

export function buildKotlinExport({ tool, name, content }) {
  const filename = `${sanitizeBaseName(name || tool || 'project')}.kt`;
  return {
    tool,
    filename,
    content: String(content || ''),
    generatedAt: new Date().toISOString(),
    summary: `已为 ${tool || 'unknown'} 生成 Kotlin 导出内容。`
  };
}
