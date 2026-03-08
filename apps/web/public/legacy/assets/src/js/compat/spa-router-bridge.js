(function installLegacySpaRouterBridge() {
  const params = new URLSearchParams(window.location.search || '');
  const routes = {
    home: params.get('spa_home') || '',
    generator: params.get('spa_generator') || '',
    shaderBuilder: params.get('spa_shader_builder') || '',
    composition: params.get('spa_composition') || '',
    pointsBuilder: params.get('spa_pointsbuilder') || '',
    compositionPointsBuilder: params.get('spa_composition_pointsbuilder') || '',
    bezier: params.get('spa_bezier') || ''
  };

  const aliasMap = {
    './index.html': 'home',
    '../index.html': 'home',
    'index.html': 'home',
    './generator.html': 'generator',
    'generator.html': 'generator',
    './shader_builder.html': 'shaderBuilder',
    'shader_builder.html': 'shaderBuilder',
    './composition_builder.html': 'composition',
    'composition_builder.html': 'composition',
    './pointsbuilder.html': 'pointsBuilder',
    'pointsbuilder.html': 'pointsBuilder',
    './composition_pointsbuilder.html': 'compositionPointsBuilder',
    'composition_pointsbuilder.html': 'compositionPointsBuilder',
    './bezier.html': 'bezier',
    'bezier.html': 'bezier'
  };

  function getRouteKey(rawHref) {
    const text = String(rawHref || '').trim();
    if (!text) return '';
    const noHash = text.split('#')[0] || '';
    const noQuery = noHash.split('?')[0] || '';
    return aliasMap[noQuery] || '';
  }

  function getSuffix(rawHref) {
    const text = String(rawHref || '').trim();
    if (!text) return '';
    const queryIndex = text.indexOf('?');
    const hashIndex = text.indexOf('#');
    const indexes = [queryIndex, hashIndex].filter((value) => value >= 0);
    if (!indexes.length) return '';
    return text.slice(Math.min(...indexes));
  }

  function resolveHref(rawHref) {
    const routeKey = getRouteKey(rawHref);
    if (!routeKey || !routes[routeKey]) return rawHref;
    return `${routes[routeKey]}${getSuffix(rawHref)}`;
  }

  function navigate(rawHref, options = {}) {
    const targetWindow = options.targetTop !== false && window.top ? window.top : window;
    targetWindow.location.href = resolveHref(rawHref);
  }

  function patchAnchors() {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const rawHref = anchor.getAttribute('href');
      const resolved = resolveHref(rawHref);
      if (!resolved || resolved === rawHref) return;
      anchor.setAttribute('href', resolved);
      if (window.top && window.top !== window) {
        anchor.setAttribute('target', '_top');
      }
    });
  }

  window.__legacySpaRoutes = routes;
  window.__legacyResolveHref = resolveHref;
  window.__legacyNavigate = navigate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchAnchors, { once: true });
  } else {
    patchAnchors();
  }
})();
