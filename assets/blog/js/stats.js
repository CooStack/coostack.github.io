// 个人主页数据：B站头像（定时刷新）
// 粉丝数量功能已移除：请在 index.html 中自行填写平台主页的 href
(() => {
  const VMID = 291397844;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function placeholderAvatarDataURI() {
    const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#2f80ed"/>
      <stop offset="1" stop-color="#bb6bd9"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="22" fill="url(#g)"/>
  <circle cx="64" cy="54" r="22" fill="rgba(255,255,255,.85)"/>
  <rect x="28" y="82" width="72" height="30" rx="15" fill="rgba(255,255,255,.65)"/>
</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  async function getAvatar() {
    // 注意：浏览器直连 api.bilibili.com 会被 CORS 拦截，本项目通过本地 server.js 代理：/api/bili/*
    const r = await fetch(`/api/bili/acc?mid=${VMID}`, { cache: "no-store" });
    if (!r.ok) throw new Error("acc http " + r.status);
    const j = await r.json();
    const face = j?.data?.face;
    if (!face) throw new Error("acc invalid");
    return face;
  }

  async function refreshOnce() {
    const avatarEl = $("#avatarImg");
    if (!avatarEl) return;

    try {
      const face = await getAvatar();
      if (face) avatarEl.src = face;
    } catch (e) {
      // 首屏失败时：给个本地占位，避免空白
      if (!avatarEl.src) avatarEl.src = placeholderAvatarDataURI();
      console.warn("[profile] avatar refresh failed:", e);
    }
  }

  const Profile = {
    init({ intervalMs = 60000 } = {}) {
      refreshOnce();
      window.setInterval(refreshOnce, clamp(intervalMs, 10000, 300000));
    },
  };

  window.Profile = Profile;
})();
