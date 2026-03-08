const BILIBILI_RELATION_URL = 'https://api.bilibili.com/x/relation/stat?vmid=291397844';

export async function fetchBilibiliStat() {
  const response = await fetch(BILIBILI_RELATION_URL, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`B站粉丝接口请求失败: ${response.status}`);
  }

  const payload = await response.json();
  const follower = Number(payload?.data?.follower);
  const following = Number(payload?.data?.following);

  if (!Number.isFinite(follower)) {
    throw new Error('B站粉丝接口返回异常');
  }

  return {
    follower,
    following: Number.isFinite(following) ? following : null
  };
}
