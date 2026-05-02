/** Firestore：`signup_page_settings/default`，報名頁公開素材（前端訂閱 + 後台編輯） */

/** 設為 true 時恢復：報名頁「以上場次時間無法配合」選項與後台許願統計卡片 */
export const SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION = false;

export const SIGNUP_LANDING_COLLECTION = 'signup_page_settings';
export const SIGNUP_LANDING_DOC_ID = 'default';

/** 後台未設定海報時使用（保留 public 既有檔） */
export const FALLBACK_POSTER_PATH = '/S__158801977.jpg';

export const DEFAULT_SIGNUP_LANDING = {
    youtubeVideos: [
        { videoId: 'ea3_moV1XQk', label: '學員真心回饋 ①' },
        { videoId: 'PRAX2uy1jHs', label: '學員真心回饋 ②' },
    ],
    /** 空字串表示沿用 FALLBACK_POSTER_PATH */
    posterImageUrl: '',
};

const YT_ID_RE = /^[\w-]{11}$/;

/**
 * 從網址或純 ID 解析 YouTube video id（支援 watch / shorts / embed / youtu.be）
 */
export function extractYoutubeVideoId(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (YT_ID_RE.test(s)) return s;
    try {
        const u = s.includes('://') ? new URL(s) : new URL(`https://${s}`);
        const host = u.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0];
            return id ? id.slice(0, 11) : '';
        }
        if (host.includes('youtube.com')) {
            const v = u.searchParams.get('v');
            if (v && YT_ID_RE.test(v.slice(0, 11))) return v.slice(0, 11);
            const parts = u.pathname.split('/').filter(Boolean);
            for (const key of ['embed', 'shorts', 'live']) {
                const i = parts.indexOf(key);
                if (i >= 0 && parts[i + 1] && YT_ID_RE.test(parts[i + 1].slice(0, 11))) return parts[i + 1].slice(0, 11);
            }
        }
    } catch {
        /* ignore */
    }
    return '';
}

/** img／SEO 用：絕對網址或本站路徑 */
export function resolvePosterSrc(posterImageUrl) {
    const u = String(posterImageUrl ?? '').trim();
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    if (u.startsWith('/')) return u;
    return FALLBACK_POSTER_PATH;
}

export function resolvePosterSeoUrl(posterImageUrl, siteOrigin) {
    const src = resolvePosterSrc(posterImageUrl);
    if (src.startsWith('http')) return src;
    const origin = String(siteOrigin || '').replace(/\/$/, '');
    return `${origin}${src.startsWith('/') ? src : `/${src}`}`;
}

/** Firestore 文件資料 → 與預設合併（後台欄位缺漏時） */
export function normalizeSignupLandingData(data) {
    if (!data || typeof data !== 'object') {
        return { ...DEFAULT_SIGNUP_LANDING };
    }
    let youtubeVideos;
    if (Array.isArray(data.youtubeVideos)) {
        youtubeVideos = data.youtubeVideos
            .map((v, i) => ({
                videoId: String(v?.videoId ?? '').trim().slice(0, 11),
                label: String(v?.label ?? `影片 ${i + 1}`).trim() || `影片 ${i + 1}`,
            }))
            .filter((v) => YT_ID_RE.test(v.videoId));
    } else {
        youtubeVideos = [...DEFAULT_SIGNUP_LANDING.youtubeVideos];
    }

    const posterRaw = data.posterImageUrl;
    const posterImageUrl =
        typeof posterRaw === 'string' ? posterRaw.trim() : '';

    return { youtubeVideos, posterImageUrl };
}
