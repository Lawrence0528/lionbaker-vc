/**
 * Cloudflare Worker：`*.u.lionbaker.com` 子網域路由
 *
 * 目標：
 * - `https://{user}.u.lionbaker.com/{project}` → 反代到上游 `https://run.lionbaker.com/u/{user}/{project}`
 * - 保留 querystring（例如 ?t= timestamp bust）
 *
 * 部署注意：
 * - 建議在 Cloudflare 設定「Route」把 `*.u.lionbaker.com/*` 指到此 Worker
 * - 上游預設 `run.lionbaker.com`，可用 Worker 變數 `UPSTREAM_ORIGIN` 覆蓋
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    const upstreamOrigin = (env && env.UPSTREAM_ORIGIN) || 'https://run.lionbaker.com';

    // 僅處理 *.u.lionbaker.com
    if (!host.endsWith('.u.lionbaker.com')) {
      return new Response('Not found', { status: 404 });
    }

    const userId = host.slice(0, -'.u.lionbaker.com'.length);
    if (!userId) return new Response('Not found', { status: 404 });

    // `/` 或 `/{project}` 或 `/{project}/...`
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) {
      return new Response('Not found', { status: 404 });
    }

    const projectId = parts[0];
    const rest = parts.slice(1).join('/');
    const upstreamPath = `/u/${encodeURIComponent(userId)}/${encodeURIComponent(projectId)}${rest ? `/${rest}` : ''}`;

    const upstreamUrl = new URL(upstreamOrigin);
    upstreamUrl.pathname = upstreamPath;
    upstreamUrl.search = url.search;

    const newReq = new Request(upstreamUrl.toString(), request);

    // 避免快取錯誤覆蓋（上游本身有 Cache-Control；此處保守直通）
    newReq.headers.set('Host', upstreamUrl.host);

    return fetch(newReq);
  },
};

