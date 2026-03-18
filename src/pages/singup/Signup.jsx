import React, { useRef, useState, useEffect } from 'react';
import SEO from '../../components/SEO';
import { db, functions } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import liff from '@line/liff';

// Placeholder LIFF ID - User needs to replace this
const LIFF_ID = '2008963361-MrRNV5vJ';
const LINE_OA_ID = '@217vdaka'; // e.g., @123xxxxx (Must include @ if using R/oaMessage/ID, usually needs @)

/** AI落地師培訓班 報名系統 - 學員填寫報名表單 */
const Signup = () => {
    const videoRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [isLiffLoggedIn, setIsLiffLoggedIn] = useState(false);
    const [lineProfile, setLineProfile] = useState(null);
    const [isVideoMuted, setIsVideoMuted] = useState(true);

    // Sessions State
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [sessionsError, setSessionsError] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        source: '',
        lastFive: '',
        count: 1,
        paymentMethod: 'transfer' // 'transfer', 'cash', 'linepay'
    });

    // UI State for Source Selection
    const [sourceOption, setSourceOption] = useState(''); // '嘉吉老師', 'Rich老師', 'Other'
    const [customSource, setCustomSource] = useState('');

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://lionbaker.web.app';
    const seoImage = `${siteOrigin}/signup.png`;
    const seoUrl = `${siteOrigin}/vibe`;

    useEffect(() => {
        if (sourceOption === 'Other') {
            setFormData(prev => ({ ...prev, source: customSource }));
        } else {
            setFormData(prev => ({ ...prev, source: sourceOption }));
        }
    }, [sourceOption, customSource]);

    const handleUnmuteVideo = async () => {
        const el = videoRef.current;
        if (!el) return;
        try {
            el.muted = false;
            el.volume = Math.max(el.volume || 0, 0.8);
            setIsVideoMuted(false);
            // 有些瀏覽器需要使用者互動後才允許播放帶聲音的媒體
            await el.play().catch(() => {});
        } catch {
            // ignore
        }
    };

    // Initialize LIFF and Fetch Sessions
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Init LIFF
                if (LIFF_ID && LIFF_ID !== 'MY_LIFF_ID') {
                    await liff.init({ liffId: LIFF_ID });
                    if (liff.isLoggedIn()) {
                        setIsLiffLoggedIn(true);
                        const profile = await liff.getProfile();
                        setLineProfile(profile);
                        setFormData(prev => ({ ...prev, name: profile.displayName }));
                    }
                }
            } catch (err) {
                console.error('LIFF Init Error:', err);
            }

            // Fetch Sessions (Real Data)
        };
        init();
    }, []);

    // Fetch Sessions (Real Data)
    useEffect(() => {
        const fetchSessions = async () => {
            try {
                setSessionsLoading(true);
                setSessionsError('');
                const getSessionsFn = httpsCallable(functions, 'getVibeSessions');
                const result = await getSessionsFn();
                const fetchedSessions = result.data.sessions || [];

                if (fetchedSessions.length > 0) {
                    // Process sessions: format date
                    const processedManager = fetchedSessions.map(s => {
                        const dateObj = new Date(s.date);
                        const days = ['日', '一', '二', '三', '四', '五', '六'];
                        const dayName = days[dateObj.getDay()];
                        const formattedDate = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')} (${dayName}) ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                        return {
                            ...s,
                            displayDate: formattedDate
                        };
                    });
                    setSessions(processedManager);
                    // Select the first open session by default
                    const firstOpen = processedManager.find(s => s.status === 'open');
                    if (firstOpen) {
                        setSelectedSessionId(firstOpen.id);
                    } else if (processedManager.length > 0) {
                        setSelectedSessionId(processedManager[0].id);
                    }
                } else {
                    // Fallback if no sessions in DB
                    setSessions([
                        {
                            id: 'default_01',
                            date: '2026-02-08T13:00:00',
                            displayDate: '2026/02/08 (日) 13:00',
                            location: 'TOP SPACE 商務中心',
                            address: '臺中市中區民族路23號3樓',
                            price: 1980,
                            originalPrice: 5000,
                            status: 'open',
                            title: 'AI落地師培訓班 (預設)'
                        }
                    ]);
                    setSelectedSessionId('default_01');
                }
            } catch (err) {
                console.error("Failed to fetch sessions:", err);
                // 防呆：雲端函式/索引/網路異常時，至少提供一個可報名的預設場次，避免表單變空白
                setSessionsError('目前無法載入最新場次（可能是網路或系統忙碌）。已先載入預設場次，您仍可完成報名。');
                setSessions([
                    {
                        id: 'default_01',
                        date: '2026-02-08T13:00:00',
                        displayDate: '2026/02/08 (日) 13:00',
                        location: 'TOP SPACE 商務中心',
                        address: '臺中市中區民族路23號3樓',
                        price: 1980,
                        originalPrice: 5000,
                        status: 'open',
                        title: 'AI落地師培訓班（預設）'
                    }
                ]);
                setSelectedSessionId('default_01');
            } finally {
                setSessionsLoading(false);
            }
        };
        fetchSessions();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSessionSelect = (sessionId) => {
        setSelectedSessionId(sessionId);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!selectedSessionId) {
            setError('請先選擇場次');
            return;
        }
        if (!formData.source) {
            setError('請填寫來源資訊');
            return;
        }
        if (formData.paymentMethod === 'transfer' && formData.lastFive.length !== 5) {
            setError('匯款後五碼必須為 5 碼');
            return;
        }

        setLoading(true);

        try {
            const selectedSession = sessions.find(s => s.id === selectedSessionId);
            // 重要：無論 selectedSession 是否存在，都要寫入 sessionId，避免後台用 where(sessionId==...) 查不到
            const sessionInfo = {
                sessionId: selectedSessionId,
                sessionTitle: selectedSession?.title || null,
                sessionDate: selectedSession?.date || null, // ISO 字串（由場次資料決定）
                sessionLocation: selectedSession?.location || null,
            };

            await addDoc(collection(db, 'registrations_vibe'), {
                ...formData,
                ...sessionInfo,
                lineUserId: lineProfile?.userId || null,
                createdAt: serverTimestamp(),
                status: 'pending'
            });

            if (isLiffLoggedIn && liff.isInClient()) {
                const methodText = formData.paymentMethod === 'transfer' ? `匯款後五碼：${formData.lastFive}` :
                    formData.paymentMethod === 'cash' ? '付款方式：現金 (現場繳費)' :
                        '付款方式：LinePay';

                await liff.sendMessages([
                    {
                        type: 'text',
                        text: `【報名成功】\n姓名：${formData.name}\n場次：${selectedSession?.displayDate || '2026/02/08'}\n${methodText}\n\n感謝您的報名，我們已收到您的資訊！`
                    }
                ]);
            }

            setSuccess(true);
            window.scrollTo(0, 0);

        } catch (err) {
            console.error(err);
            setError('報名失敗，請檢查網路連線或稍後再試。');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <main className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4">
                <section className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center">
                    <div className="mx-auto inline-flex items-center justify-center w-16 h-16 bg-sky-50 text-sky-700 rounded-full mb-5 border border-sky-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">報名成功</h1>
                    <p className="text-slate-600 mb-6 leading-relaxed">
                        我們已收到您的資訊。<br />
                        {isLiffLoggedIn && liff.isInClient() && <span className="text-sm text-sky-700">(確認訊息已發送至聊天室)</span>}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-white font-semibold shadow-sm hover:bg-sky-500 transition-colors"
                    >
                        繼續報名
                    </button>
                    {isLiffLoggedIn && liff.isInClient() && (
                        <button
                            type="button"
                            onClick={() => liff.closeWindow()}
                            className="block w-full mt-3 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl transition-colors"
                        >
                            關閉視窗
                        </button>
                    )}

                    {!liff.isInClient() && (
                        <button
                            type="button"
                            onClick={() => {
                                const methodText = formData.paymentMethod === 'transfer' ? `匯款後五碼：${formData.lastFive}` :
                                    formData.paymentMethod === 'cash' ? '付款方式：現金' : '付款方式：LinePay';
                                const msg = `【AI落地師培訓班 報名回報】\n姓名：${formData.name}\n場次：${sessions.find(s => s.id === selectedSessionId)?.displayDate}\n${methodText}\n來源：${formData.source}\n\n(系統自動產生)`;
                                const url = `https://line.me/R/oaMessage/${LINE_OA_ID}/?${encodeURIComponent(msg)}`;
                                window.location.href = url;
                            }}
                            className="block w-full mt-3 bg-[#06c755] hover:bg-[#05b34c] text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.273.362 2.256-.37 3.597-.938 4.18-1.234A9.06 9.06 0 0 0 8 15z" />
                            </svg>
                            回報給官方帳號
                        </button>
                    )}
                </section>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-x-hidden">
            <SEO
                title="AI落地師培訓班｜報名"
                description="2026年在 AI 崛起的年代你還沒跟上嗎？零基礎也能學會 AI 變現與行銷整合，實戰打造拓客工具與電子名片。"
                image={seoImage}
                url={seoUrl}
                type="website"
                appName="LionBaker"
            />

            {/* Hero（Landing Page 視覺主體） */}
            <header className="relative overflow-hidden">
                <div className="absolute inset-0">
                    {/* 背景圖：左側保留暗面積讓文字更清楚 */}
                    <img
                        src="/bg.jpg"
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover object-right"
                        loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/20" />
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/0 to-slate-50/70" />
                    <div className="absolute inset-0 opacity-60 lp-noise mix-blend-overlay" />
                    <svg className="absolute -top-24 -right-24 w-[540px] h-[540px] opacity-60 lp-anim-drift" viewBox="0 0 600 600" aria-hidden="true">
                        <defs>
                            <radialGradient id="lpBlobA" cx="30%" cy="30%" r="70%">
                                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.60" />
                                <stop offset="58%" stopColor="#2563eb" stopOpacity="0.28" />
                                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.10" />
                            </radialGradient>
                        </defs>
                        <path fill="url(#lpBlobA)" d="M419 72c58 34 115 85 132 149 17 63-7 139-43 198-36 60-86 104-150 130-64 26-141 35-201 11-60-25-104-84-122-147-18-64-9-133 24-194 33-61 90-114 153-147 63-32 132-33 207 0z" />
                    </svg>
                    <svg className="absolute -bottom-28 -left-28 w-[520px] h-[520px] opacity-55 lp-anim-float" viewBox="0 0 600 600" aria-hidden="true">
                        <defs>
                            <radialGradient id="lpBlobB" cx="60%" cy="40%" r="70%">
                                <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.48" />
                                <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.22" />
                                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.10" />
                            </radialGradient>
                        </defs>
                        <path fill="url(#lpBlobB)" d="M447 128c53 49 81 123 78 195-3 73-36 145-93 192-56 46-136 67-205 50-69-18-126-74-154-142-28-69-26-151 10-216 37-66 108-114 178-132 71-18 135-1 186 53z" />
                    </svg>
                    <svg className="absolute inset-0 opacity-[0.16]" aria-hidden="true">
                        <defs>
                            <pattern id="lpGrid" width="48" height="48" patternUnits="userSpaceOnUse">
                                <path d="M48 0H0V48" fill="none" stroke="#0f172a" strokeOpacity="0.22" strokeWidth="1" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#lpGrid)" />
                    </svg>
                </div>

                <div className="relative mx-auto w-full max-w-6xl px-4 pt-10 pb-8 sm:pt-14 sm:pb-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <div className="text-left">
                            <p className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur border border-white/60 px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm">
                                <span className="inline-flex h-2 w-2 rounded-full bg-sky-500"></span>
                                2026 AI 落地實戰
                            </p>

                            <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                                AI落地師培訓班
                            </h1>
                            <p className="mt-3 text-base sm:text-lg text-slate-100/90 leading-relaxed max-w-xl drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
                                用最短時間做出「能拓客、能成交、能複製」的實戰工具。<span className="font-semibold text-white">不用寫程式</span>，零基礎也能上手。
                            </p>

                            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="rounded-2xl bg-white/70 backdrop-blur border border-white/60 shadow-sm p-4">
                                    <p className="text-xs font-semibold text-slate-600">上課形式</p>
                                    <p className="mt-1 font-black text-slate-900">實作帶走</p>
                                </div>
                                <div className="rounded-2xl bg-white/70 backdrop-blur border border-white/60 shadow-sm p-4">
                                    <p className="text-xs font-semibold text-slate-600">適合</p>
                                    <p className="mt-1 font-black text-slate-900">零基礎</p>
                                </div>
                                <div className="rounded-2xl bg-white/70 backdrop-blur border border-white/60 shadow-sm p-4 col-span-2 sm:col-span-1">
                                    <p className="text-xs font-semibold text-slate-600">成果</p>
                                    <p className="mt-1 font-black text-slate-900">工具上線</p>
                                </div>
                            </div>

                            <div className="mt-6 flex flex-col sm:flex-row gap-3">
                                <a
                                    href="#signup-form"
                                    className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-5 py-3 text-white font-bold shadow-lg shadow-sky-600/20 hover:bg-sky-500 transition-colors"
                                >
                                    立即報名
                                </a>
                                <a
                                    href="#course"
                                    className="inline-flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur px-5 py-3 text-slate-900 font-bold border border-white/60 shadow-sm hover:bg-white transition-colors"
                                >
                                    看課程介紹
                                </a>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <article className="bg-white/75 backdrop-blur rounded-3xl shadow-xl border border-white/60 overflow-hidden">
                                <div className="relative">
                                    <img
                                        src="/signup.png"
                                        alt="AI落地師培訓班活動海報"
                                        className="w-full h-auto"
                                        loading="lazy"
                                    />
                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/35 via-transparent to-transparent" />
                                </div>
                            </article>
                            <article className="bg-white/75 backdrop-blur rounded-3xl shadow-xl border border-white/60 p-4 sm:p-6">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="text-left">
                                        <h2 className="text-lg font-black text-slate-900">來聽聽同學怎麼說</h2>
                                        <p className="mt-1 text-sm text-slate-600">記得開聲音</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleUnmuteVideo}
                                        className={`shrink-0 rounded-2xl border px-3 py-1 text-xs font-bold transition-colors ${isVideoMuted ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                                    >
                                        {isVideoMuted ? '開聲音' : '已開聲音'}
                                    </button>
                                </div>
                                <div className="mt-4 overflow-hidden rounded-2xl bg-slate-100">
                                    <video
                                        ref={videoRef}
                                        className="w-full h-auto"
                                        src="/signup.mp4"
                                        poster="/signup.png"
                                        autoPlay
                                        loop
                                        muted={isVideoMuted}
                                        controls
                                        playsInline
                                        preload="auto"
                                    />
                                </div>
                            </article>
                        </div>
                    </div>
                </div>

                <div className="relative h-10 sm:h-14">
                    <svg className="absolute inset-x-0 bottom-0 w-full h-full" viewBox="0 0 1440 96" preserveAspectRatio="none" aria-hidden="true">
                        <path fill="#f8fafc" d="M0,64 C160,96 320,96 480,74 C640,53 800,10 960,10 C1120,10 1280,53 1440,42 L1440,96 L0,96 Z" />
                    </svg>
                </div>
            </header>

            <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:pb-12">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {/* 左側：內容（更像 Landing Page 的節奏） */}
                    <section id="course" className="space-y-6">
                        <article className="bg-white rounded-3xl shadow-xl border border-slate-200 p-5 sm:p-7 text-left">
                            <h2 className="text-lg font-bold text-slate-900">課程介紹（完整）</h2>
                            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                                2026 年在 AI 崛起的年代你還沒跟上嗎？這堂課的目標很明確：<span className="font-semibold text-slate-900">把你的想法落地成「可以拿來拓客、成交、複製」的工具</span>。
                                不用寫程式、不用背語法；你只要會打字用 LINE，就能在一天內做出可用的成果。
                            </p>

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-sm font-bold text-slate-900">不用基礎</p>
                                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                                        你不是來「學寫程式」的，你是來<span className="font-semibold">學怎麼解決問題</span>的。
                                        我們用可複製的流程，讓你用 AI 做出工具與內容。
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                    <p className="text-sm font-bold text-slate-900">免買主機</p>
                                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                                        提供專屬雲端平台與示範流程，從提示詞到上架部署一路帶你完成，減少卡關與試錯成本。
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-4">
                                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                                    <p className="text-sm font-bold text-sky-900">你會帶走的成果</p>
                                    <ul className="mt-2 space-y-1.5 text-sm text-sky-900/80 list-disc list-inside">
                                        <li>課堂實作你的專屬電子名片（可展示、可分享、可引導成交）</li>
                                        <li>課堂實作產業拓客工具（可依你的產業情境客製）</li>
                                        <li>一套可複製的「AI 落地流程」：從需求拆解 → 提示詞 → 產出 → 整合 → 上線</li>
                                    </ul>
                                </div>

                                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                                    <p className="text-sm font-bold text-slate-900">課程亮點（對應舊版海報）</p>
                                    <ul className="mt-2 space-y-1.5 text-sm text-slate-600 list-disc list-inside">
                                        <li>落地實現你的想法：不用打一行程式也能做出來</li>
                                        <li>不再「學寫程式」：只要會打字用 LINE，AI 幫你做出工具</li>
                                        <li>讓你駕馭 AI：用在行銷、內容、成交流程，成為少數會用科技賺錢的人</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                <p className="text-sm font-bold text-slate-900">特別加碼</p>
                                <ul className="mt-2 space-y-1.5 text-sm text-slate-600 list-disc list-inside">
                                    <li>教你用 AI 創作吸睛的 LINE 貼圖，並學會如何上架</li>
                                    <li>教你用 NFC 貼片，打造超高科技電子名片</li>
                                    <li>教你用 AI 生成源源不絕的短影音腳本</li>
                                </ul>
                            </div>

                            <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                <p className="text-sm font-bold text-slate-900">提醒與規則</p>
                                <ul className="mt-2 space-y-1.5 text-sm text-slate-600 list-disc list-inside">
                                    <li>未達開班人數，課程將視情況延班：可選擇延班或退款。</li>
                                </ul>
                            </div>
                        </article>
                        <article className="bg-white rounded-3xl shadow-xl border border-slate-200 p-5 sm:p-7 text-left">
                            <h2 className="text-lg font-bold text-slate-900">課程流程（一天做出成果）</h2>
                            <ol className="mt-4 space-y-3">
                                {[
                                    { title: '打開大腦｜學習新思維', desc: '2026 年最值錢的不是技術，是你的思維提升，打造不被淘汰的硬實力。' },
                                    { title: '各種 AI 案例介紹', desc: '把你的產業情境與目標拆成可落地的功能與內容。' },
                                    { title: '如何免學提示詞做出程式', desc: '用可複製的提示詞框架，快速產生內容與工具雛形。' },
                                    { title: '超簡單佈署程式', desc: '不用電腦也能佈署程式。' },
                                    { title: 'LINE 貼圖實作', desc: '教你快速打造自己吸睛武器。' },
                                    { title: 'NFC 貼片實作', desc: '用手機施展魔法，創造更多有價值的用途。' },
                                    { title: '短影音腳本生成', desc: '用工具快速解決你短影音腳本饋乏的問題。' }
                                ].map((step, idx) => (
                                    <li key={step.title} className="flex gap-3 rounded-2xl bg-slate-50 border border-slate-200 p-4">
                                        <div className="mt-0.5 shrink-0 w-9 h-9 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-sky-700">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{step.title}</p>
                                            <p className="mt-1 text-sm text-slate-600 leading-relaxed">{step.desc}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </article>
                    </section>

                    {/* 右側：報名表單 */}
                    <section id="signup-form" className="bg-white rounded-3xl shadow-xl border border-slate-200 p-4 sm:p-6">
                        <h2 className="text-xl font-bold text-slate-900">立即報名</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            請填寫資料完成報名，我們會以你提供的資訊進行後續確認。
                        </p>

                        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">

                            {/* Session Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-3">
                                    選擇場次 <span className="text-rose-600">*</span>
                                </label>
                                {sessionsError && (
                                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl">
                                        {sessionsError}
                                    </div>
                                )}
                                {sessionsLoading ? (
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                        正在載入場次...
                                    </div>
                                ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {sessions.map(session => {
                                        const isFull = (session.currentCount || 0) >= (session.maxCapacity || 50);

                                        return (
                                            <div
                                                key={session.id}
                                                role="button"
                                                tabIndex={0}
                                                className={`relative border rounded-2xl p-4 cursor-pointer transition-all outline-none ${selectedSessionId === session.id ? 'border-sky-400 bg-sky-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                                onClick={() => handleSessionSelect(session.id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') handleSessionSelect(session.id);
                                                }}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2.5 h-2.5 rounded-full ${isFull ? 'bg-amber-500' : selectedSessionId === session.id ? 'bg-sky-500' : 'bg-slate-300'}`}></div>
                                                        <span className="font-bold text-slate-900 text-base sm:text-lg">{session.displayDate}</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {isFull ? (
                                                            <div className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200">額滿候補中</div>
                                                        ) : (
                                                            selectedSessionId === session.id && <div className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-lg border border-sky-200">已選擇</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="pl-5">
                                                    <div className="text-slate-800 font-semibold mb-1">
                                                        {session.title || 'AI落地師培訓班'}
                                                    </div>
                                                    {!!session.note && (
                                                        <div className="mb-2 rounded-xl bg-white/70 border border-slate-200 px-3 py-2 text-sm text-slate-700">
                                                            <span className="whitespace-pre-line">{session.note}</span>
                                                        </div>
                                                    )}
                                                    <div className="text-sm text-slate-600 mb-2 flex items-start gap-1">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 mt-0.5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                        <span>{session.location}<br /><span className="text-xs text-slate-500">{session.address}</span></span>
                                                    </div>
                                                    <div className="flex justify-between items-end">
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-xl font-black text-sky-700">${session.price?.toLocaleString()}</span>
                                                            {!!session.originalPrice && (
                                                                <span className="text-sm text-slate-400 line-through">原價 ${session.originalPrice?.toLocaleString()}</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-500">
                                                            {isFull ? (
                                                                <span className="text-amber-700 font-semibold">已額滿，您的報名將排入備取</span>
                                                            ) : (
                                                                `名額狀態: 剩餘 ${(session.maxCapacity || 50) - (session.currentCount || 0)} 位`
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                )}
                            </div>

                            {/* Payment Method */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    付款方式 <span className="text-rose-600">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button type="button" onClick={() => setFormData(p => ({ ...p, paymentMethod: 'transfer' }))} className={`p-3 rounded-xl border text-sm font-semibold transition-all ${formData.paymentMethod === 'transfer' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                        轉帳匯款
                                    </button>
                                    <button type="button" onClick={() => setFormData(p => ({ ...p, paymentMethod: 'cash' }))} className={`p-3 rounded-xl border text-sm font-semibold transition-all ${formData.paymentMethod === 'cash' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                        現金支付
                                    </button>
                                    <button type="button" onClick={() => setFormData(p => ({ ...p, paymentMethod: 'linepay' }))} className={`p-3 rounded-xl border text-sm font-semibold transition-all ${formData.paymentMethod === 'linepay' ? 'bg-[#06c755] border-[#06c755] text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                        LinePay
                                    </button>
                                </div>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    真實姓名 <span className="text-rose-600">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    placeholder="請輸入您的姓名"
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-colors"
                                />
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    手機號碼 <span className="text-rose-600">*</span>
                                </label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    required
                                    placeholder="0912-345-678"
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-colors"
                                />
                            </div>

                            {/* Email (Optional) */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Email（選填）</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="name@example.com"
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-colors"
                                />
                            </div>

                            {/* Source */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-3">推薦人 / 來源 <span className="text-rose-600">*</span></label>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => setSourceOption('嘉吉老師')}
                                        className={`p-3 rounded-xl border text-sm font-semibold transition-all ${sourceOption === '嘉吉老師' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                                    >
                                        嘉吉老師
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSourceOption('Rich老師')}
                                        className={`p-3 rounded-xl border text-sm font-semibold transition-all ${sourceOption === 'Rich老師' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                                    >
                                        Rich老師
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSourceOption('Other')}
                                    className={`w-full p-3 rounded-xl border text-sm font-semibold transition-all mb-3 ${sourceOption === 'Other' ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                                >
                                    其他
                                </button>

                                {sourceOption === 'Other' && (
                                    <input
                                        type="text"
                                        value={customSource}
                                        onChange={(e) => setCustomSource(e.target.value)}
                                        required={sourceOption === 'Other'}
                                        placeholder="請填寫推薦人或來源 (例如: FB廣告)"
                                        className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-colors"
                                    />
                                )}
                            </div>

                            {/* Payment Details (Conditional) */}
                            {formData.paymentMethod === 'transfer' && (
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                                    <div className="flex items-center gap-2 mb-3 text-sky-700 font-bold text-sm tracking-wide">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                        匯款資訊
                                    </div>
                                    <div className="space-y-2 text-sm text-slate-700 mb-4">
                                        <div className="flex justify-between gap-4"><span className="text-slate-500">銀行代碼</span><span className="font-semibold text-slate-900">國泰世華 (013)</span></div>
                                        <div className="flex justify-between gap-4"><span className="text-slate-500">分行</span><span className="font-semibold text-slate-900">敦化分行</span></div>
                                        <div className="flex justify-between gap-4"><span className="text-slate-500">戶名</span><span className="font-semibold text-slate-900">焙獅健康顧問有限公司</span></div>
                                        <div className="mt-2 pt-3 border-t border-slate-200 text-center">
                                            <span className="block text-xs text-slate-500 mb-1">匯款帳號</span>
                                            <span className="text-xl font-black text-sky-700 select-all tracking-widest">212035012017</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                                            匯款帳號後五碼 <span className="text-rose-600">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                name="lastFive"
                                                value={formData.lastFive}
                                                onChange={handleChange}
                                                required
                                                maxLength={5}
                                                placeholder="XXXXX"
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-colors tracking-[0.5em] text-center text-lg placeholder-slate-300"
                                            />
                                            <div className="absolute right-3 top-4 text-xs text-slate-500">{formData.lastFive.length}/5</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {formData.paymentMethod === 'linepay' && (
                                <div className="bg-sky-50 rounded-2xl p-5 border border-sky-200">
                                    <h3 className="text-slate-900 font-bold mb-1">LinePay 付款</h3>
                                    <p className="text-sky-900 text-sm">請於 LinePay 繳費後通知銷帳。</p>
                                </div>
                            )}
                            {formData.paymentMethod === 'cash' && (
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                                    <h3 className="text-slate-900 font-bold mb-1">現場繳費</h3>
                                    <p className="text-slate-700 text-sm">請先繳交費用後通知銷帳。</p>
                                </div>
                            )}

                            {/* Error Msg */}
                            {error && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl text-center">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-4 px-4 rounded-2xl shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>請稍候...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>確認報名</span>
                                    </>
                                )}
                            </button>
                        </form>
                        <footer className="mt-8 text-center text-slate-400 text-xs">
                            <p>&copy; 2026 LionBaker</p>
                        </footer>
                    </section>
                </div>
            </div>
        </main>
    );
};

export default Signup;
