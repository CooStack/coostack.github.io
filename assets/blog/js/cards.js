// 让工具卡片整卡可点击（不使用 <a>，避免默认链接/visited 样式）
(() => {
  function bindCard(card) {
    const href = card.getAttribute('data-href');
    if (!href) return;

    // 可访问性
    if (!card.hasAttribute('role')) card.setAttribute('role', 'link');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');

    card.addEventListener('click', (e) => {
      // 仅处理主按钮点击；文本选中时不跳转
      if (e.defaultPrevented) return;
      if (typeof e.button === 'number' && e.button !== 0) return;
      const sel = window.getSelection ? String(window.getSelection()) : '';
      if (sel && sel.length > 0) return;
      window.location.href = href;
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = href;
      }
    });
  }

  function init() {
    document.querySelectorAll('.card-tool[data-href]').forEach(bindCard);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
