import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Share2 } from 'lucide-react';
import liff from '@line/liff';
import SEO from '../../components/SEO';

const LIFF_ID = '2008893070-ZtPU49Et';
const SIGNUP_URL = 'https://ai.lionbaker.com/signup';
const SHARE_LIFF_URL = `https://liff.line.me/${LIFF_ID}`;
const FLEX_JSON_PATH = '/line-flex/ai-course-flex-message.json';

const previewImages = [
    { src: '/line-flex/01-hero.png', alt: '不是學更多 AI 工具，而是讓 AI 幫你做出東西' },
    { src: '/line-flex/02-journey.png?v=20260517-user', alt: '從 AI 幼幼班升級成 AI 指揮官' },
    { src: '/line-flex/03-results.png?v=20260517-user', alt: '當天帶走 5 個實作成果' },
    { src: '/line-flex/04-tools.png?v=20260517-user', alt: '不寫程式也能做出程式' },
    { src: '/line-flex/05-signup.png?v=20260517-user', alt: '把 AI 變成你的工作助力' },
];

function buildFallbackFlex() {
    return {
        type: 'carousel',
        contents: previewImages.map((image) => ({
            type: 'bubble',
            size: 'mega',
            hero: {
                type: 'image',
                url: new URL(image.src, 'https://ai.lionbaker.com').toString(),
                size: 'full',
                aspectRatio: '9:16',
                aspectMode: 'cover',
                action: { type: 'uri', label: '立即報名', uri: SIGNUP_URL },
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                contents: [
                    {
                        type: 'button',
                        style: 'secondary',
                        height: 'sm',
                        action: { type: 'uri', label: '分享給朋友', uri: SHARE_LIFF_URL },
                    },
                ],
            },
        })),
    };
}

function isLocalHost() {
    if (typeof window === 'undefined') return false;
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

const SignupLineShare = () => {
    const [status, setStatus] = useState('準備分享課程資訊...');
    const [isSharing, setIsSharing] = useState(false);
    const [isShared, setIsShared] = useState(false);
    const [error, setError] = useState('');
    const [flexMessage, setFlexMessage] = useState(null);

    const shareMessages = useMemo(() => {
        const flex = flexMessage || buildFallbackFlex();
        return [
            {
                type: 'flex',
                altText: 'AI 落地師培訓班：一天做出可用 AI 工具',
                contents: flex,
            },
        ];
    }, [flexMessage]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${FLEX_JSON_PATH}?v=20260517-user`, { cache: 'no-store' });
                if (!res.ok) throw new Error(`Flex JSON ${res.status}`);
                const json = await res.json();
                if (!cancelled) setFlexMessage(json);
            } catch (err) {
                console.warn('load flex json fallback', err);
                if (!cancelled) setFlexMessage(buildFallbackFlex());
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const shareToLine = useCallback(async ({ auto = false } = {}) => {
        setError('');
        setIsSharing(true);
        setStatus('正在開啟 LINE 分享視窗...');
        try {
            if (isLocalHost()) {
                setStatus('本機預覽模式：正式網址會自動開啟 LINE 分享。');
                setIsSharing(false);
                return;
            }

            await liff.init({ liffId: LIFF_ID });

            if (!liff.isLoggedIn()) {
                setStatus('正在登入 LINE，登入後會回到分享頁。');
                liff.login({ redirectUri: window.location.href });
                return;
            }

            if (!liff.isApiAvailable('shareTargetPicker')) {
                throw new Error('目前環境不支援 LINE 分享選擇器，請用 LINE App 開啟此頁。');
            }

            const result = await liff.shareTargetPicker(shareMessages);
            if (result) {
                setIsShared(true);
                setStatus('已送出分享，可以回到 LINE 對話囉。');
            } else {
                setStatus(auto ? '尚未送出分享，你可以按下方按鈕再分享一次。' : '已取消分享。');
            }
        } catch (err) {
            console.error('share AI course flex', err);
            setError(err?.message || '分享時發生問題，請稍後再試。');
            setStatus('分享沒有完成。');
        } finally {
            setIsSharing(false);
        }
    }, [shareMessages]);

    useEffect(() => {
        if (!flexMessage) return;
        shareToLine({ auto: true });
    }, [flexMessage, shareToLine]);

    return (
        <main className="min-h-screen bg-[#020617] text-white">
            <SEO
                title="分享 AI 落地師培訓班｜Lion Baker"
                description="把 AI 落地師培訓班 Flex Message 分享給 LINE 好友。"
                image="https://ai.lionbaker.com/line-flex/01-hero.png"
                url="https://ai.lionbaker.com/signup/line"
            />
            <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-10">
                <div className="grid flex-1 items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
                    <div>
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-black text-sky-200">
                            <Share2 size={16} />
                            LINE 課程分享
                        </div>
                        <h1 className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
                            把這堂 AI 實作課
                            <span className="mt-2 block text-sky-300">分享給朋友</span>
                        </h1>
                        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
                            頁面開啟後會自動喚起 LINE 分享視窗，送出的內容就是課程 Flex Message。每張圖可點擊報名，底部也有分享給朋友按鈕。
                        </p>

                        <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30">
                            <div className="flex items-start gap-3">
                                <div className="mt-1 rounded-full bg-sky-400/15 p-2 text-sky-200">
                                    {isShared ? <CheckCircle2 size={22} /> : <Loader2 size={22} className={isSharing ? 'animate-spin' : ''} />}
                                </div>
                                <div>
                                    <p className="font-black text-white">{status}</p>
                                    {error ? <p className="mt-2 text-sm font-bold text-rose-300">{error}</p> : null}
                                </div>
                            </div>
                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => shareToLine()}
                                    disabled={isSharing}
                                    className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky-500 px-5 py-4 text-base font-black text-white shadow-lg shadow-sky-950/40 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
                                    分享給 LINE 好友
                                </button>
                                <a
                                    href={SIGNUP_URL}
                                    className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-base font-black text-white transition hover:bg-white/10"
                                >
                                    前往報名頁
                                    <ExternalLink size={18} />
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 lg:mx-0 lg:px-0">
                        {previewImages.map((image, index) => (
                            <a
                                key={image.src}
                                href={SIGNUP_URL}
                                className="block w-[72vw] max-w-[320px] shrink-0 snap-start overflow-hidden rounded-3xl border border-sky-400/20 bg-black shadow-2xl shadow-black/50 lg:w-[280px]"
                            >
                                <img src={image.src} alt={image.alt} className="aspect-[9/16] w-full object-cover" />
                                <div className="flex items-center justify-between border-t border-white/10 bg-slate-950 px-4 py-3 text-sm font-black text-sky-100">
                                    <span>{String(index + 1).padStart(2, '0')}</span>
                                    <span className="inline-flex items-center gap-1">
                                        立即報名 <ArrowRight size={16} />
                                    </span>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
};

export default SignupLineShare;
