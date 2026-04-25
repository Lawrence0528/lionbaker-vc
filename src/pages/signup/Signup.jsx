import React, { useState, useEffect, useMemo } from 'react';
import SEO from '../../components/SEO';
import { db, functions } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import liff from '@line/liff';

// Placeholder LIFF ID - User needs to replace this
const LIFF_ID = '2008963361-MrRNV5vJ';
const LINE_OA_ID = '@217vdaka'; // e.g., @123xxxxx (Must include @ if using R/oaMessage/ID, usually needs @)
const BUNNY_VIDEO_EMBED_URL = 'https://player.mediadelivery.net/embed/621248/77e09d16-cfb7-4f70-95bc-b038682b3fcb';

/** 台灣手機：09 開頭、僅 10 碼數字（不接受符號或連字號） */
const isValidTaiwanMobileDigits = (phone) => /^09\d{8}$/.test(String(phone).trim());

/** 基本 Email 格式（RFC 子集，足夠阻擋明顯錯誤） */
const isValidEmailFormat = (email) => {
    const s = String(email).trim();
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
};

/** 台灣公司統一編號（8 碼）檢核（含第 7 位為 7 之特殊規則） */
const isValidTaiwanGuiNumber = (raw) => {
    const id = String(raw).trim();
    if (!/^\d{8}$/.test(id)) return false;
    if (/^(\d)\1{7}$/.test(id)) return false;
    const weight = [1, 2, 1, 2, 1, 2, 4, 1];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
        const n = parseInt(id[i], 10) * weight[i];
        sum += Math.floor(n / 10) + (n % 10);
    }
    if (sum % 10 === 0) return true;
    if (id[6] === '7' && (sum + 1) % 10 === 0) return true;
    return false;
};

const REFRESHER_FEE = 500;
const DEFAULT_REFRESHER_MAX = 10;

/** 複訓「前次場次」選項與寫入用：場次標題 ｜ 日期（週幾），不含上課時段 */
const formatRefresherPreviousLabel = (s) => {
    if (!s) return '';
    const title = (s.title || '課程場次').trim();
    if (!s.date) return title;
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) return title;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${title} ｜ ${y}/${m}/${day}（${wk}）`;
};

/** AI落地師培訓班 報名系統 - 學員填寫報名表單 */
const Signup = () => {
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
    /** 關閉報名之歷史場次（供複訓「前次參加場次」專用，與可報名場次分開載入） */
    const [closedSessionsForRefresher, setClosedSessionsForRefresher] = useState([]);
    const [closedSessionsForRefresherLoading, setClosedSessionsForRefresherLoading] = useState(true);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        source: '',
        lastFive: '',
        count: 1,
        paymentMethod: 'transfer',
        isTimeNotAvailable: false,
        wishTime: '',
        wishLocation: '',
        /** 一般發票 general；統一編號 tax_id */
        invoiceType: 'general',
        taxId: '',
        /** 正課 main、複訓 refresher */
        registrationKind: 'main',
        previousSessionId: ''
    });

    // UI State for Source Selection
    const [sourceOption, setSourceOption] = useState(''); // '嘉吉老師', 'Rich老師', 'Other'
    const [customSource, setCustomSource] = useState('');

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ai.lionbaker.com';
    const seoImage = `${siteOrigin}/signup.jpg`;
    const seoUrl = `${siteOrigin}/vibe`;

    /**
     * 複訓「前次參加場次」：只顯示後台已「關閉報名」的梯次（API 專用列表），再排除本場，由新到舊
     */
    const previousSessionOptions = useMemo(() => {
        return closedSessionsForRefresher
            .filter((s) => s.id && s.id !== selectedSessionId)
            .sort((a, b) => {
                const aTime = new Date(a.date).getTime();
                const bTime = new Date(b.date).getTime();
                const aOk = Number.isFinite(aTime);
                const bOk = Number.isFinite(bTime);
                if (!aOk && !bOk) return 0;
                if (!aOk) return 1;
                if (!bOk) return -1;
                return bTime - aTime;
            });
    }, [closedSessionsForRefresher, selectedSessionId]);

    /** 依「場次」設定的複訓收取人數上線（雲端未帶出時以 10 人為預設） */
    const selectedSessionObj = useMemo(
        () => (selectedSessionId && selectedSessionId !== 'time_not_available' ? sessions.find((s) => s.id === selectedSessionId) : null),
        [sessions, selectedSessionId]
    );
    const selectedRefresherMax = useMemo(() => {
        if (!selectedSessionObj) return DEFAULT_REFRESHER_MAX;
        const n = Number(selectedSessionObj.refresherMaxCapacity);
        return n > 0 ? n : DEFAULT_REFRESHER_MAX;
    }, [selectedSessionObj]);

    useEffect(() => {
        if (sourceOption === 'Other') {
            setFormData(prev => ({ ...prev, source: customSource }));
        } else {
            setFormData(prev => ({ ...prev, source: sourceOption }));
        }
    }, [sourceOption, customSource]);

    const handleUnmuteVideo = () => {
        // 有些瀏覽器需要使用者互動後才允許播放帶聲音的媒體
        setIsVideoMuted(false);
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

    // 關閉報名歷史場次（雲端 Callable，與可報名列表分開）
    useEffect(() => {
        const load = async () => {
            try {
                setClosedSessionsForRefresherLoading(true);
                const fn = httpsCallable(functions, 'getVibeClosedSessionsForRefresher');
                const res = await fn();
                setClosedSessionsForRefresher(res.data.sessions || []);
            } catch (e) {
                console.error('getVibeClosedSessionsForRefresher', e);
                setClosedSessionsForRefresher([]);
            } finally {
                setClosedSessionsForRefresherLoading(false);
            }
        };
        load();
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
                    // Process sessions: format date with end time
                    const processedManager = fetchedSessions.map(s => {
                        const dateObj = new Date(s.date);
                        const days = ['日', '一', '二', '三', '四', '五', '六'];
                        const dayName = days[dateObj.getDay()];
                        const startTime = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                        const endTime = s.endTime ? `～${s.endTime}` : '';
                        const formattedDate = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')} (${dayName}) ${startTime}${endTime}`;
                        return {
                            ...s,
                            displayDate: formattedDate
                        };
                    });

                    // 依開課日期由近到遠排序（日期近的排前面）
                    processedManager.sort((a, b) => {
                        const aTime = new Date(a.date).getTime();
                        const bTime = new Date(b.date).getTime();
                        const aValid = Number.isFinite(aTime);
                        const bValid = Number.isFinite(bTime);
                        if (!aValid && !bValid) return 0;
                        if (!aValid) return 1;
                        if (!bValid) return -1;
                        return aTime - bTime;
                    });

                    const signupOpenSessions = processedManager.filter((session) => session.isSignupOpen !== false);
                    setSessions(signupOpenSessions);
                    // Select the first open session by default
                    const firstOpen = signupOpenSessions.find(s => s.status === 'open');
                    if (firstOpen) {
                        setSelectedSessionId(firstOpen.id);
                    } else if (signupOpenSessions.length > 0) {
                        setSelectedSessionId(signupOpenSessions[0].id);
                    } else {
                        setSelectedSessionId('time_not_available');
                        setSessionsError('目前沒有開放報名場次，可改選「以上場次時間無法配合」留下許願資訊。');
                    }
                } else {
                    // Fallback if no sessions in DB
                    setSessions([
                        {
                            id: 'default_01',
                            date: '2026-02-08T13:00:00',
                            endTime: '17:30',
                            displayDate: '2026/02/08 (日) 13:00～17:30',
                            location: 'TOP SPACE 商務中心',
                            address: '臺中市中區民族路23號3樓',
                            price: 1980,
                            originalPrice: 5000,
                            status: 'open',
                            title: 'AI落地師培訓班 (預設)',
                            refresherMaxCapacity: DEFAULT_REFRESHER_MAX,
                            refresherCurrentCount: 0
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
                        endTime: '17:30',
                        displayDate: '2026/02/08 (日) 13:00～17:30',
                        location: 'TOP SPACE 商務中心',
                        address: '臺中市中區民族路23號3樓',
                        price: 1980,
                        originalPrice: 5000,
                        status: 'open',
                        title: 'AI落地師培訓班（預設）',
                        refresherMaxCapacity: DEFAULT_REFRESHER_MAX,
                        refresherCurrentCount: 0
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

    /** 手機僅允許數字、最多 10 碼，避免輸入 - 或符號 */
    const handlePhoneChange = (e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
        setFormData(prev => ({ ...prev, phone: digits }));
    };

    const handleTaxIdInput = (e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
        setFormData(prev => ({ ...prev, taxId: digits }));
    };

    const handleSessionSelect = (sessionId) => {
        const nextId = String(sessionId);
        setSelectedSessionId(nextId);
        if (nextId !== 'time_not_available') {
            setFormData(prev => ({
                ...prev,
                isTimeNotAvailable: false,
                wishTime: '',
                wishLocation: '',
                // 更換本場次時重新選擇曾參加之場次
                previousSessionId: ''
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                isTimeNotAvailable: true,
                registrationKind: 'main',
                previousSessionId: ''
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!selectedSessionId) {
            setError('請先選擇場次');
            return;
        }
        if (formData.isTimeNotAvailable) {
            if (!formData.wishTime.trim()) {
                setError('請填寫許願開課時間');
                return;
            }
            if (!formData.wishLocation.trim()) {
                setError('請填寫許願開課地點');
                return;
            }
        }

        const isRefresher = !formData.isTimeNotAvailable && formData.registrationKind === 'refresher';
        const isMain = !formData.isTimeNotAvailable && formData.registrationKind === 'main';

        /** 複訓不填推薦人，改由系統寫入來源 */
        if (!isRefresher && !formData.source) {
            setError('請填寫來源資訊');
            return;
        }
        if (!isValidTaiwanMobileDigits(formData.phone)) {
            setError('手機號碼須為 09 開頭的 10 碼數字，請勿輸入連字號或符號。');
            return;
        }
        if (!isValidEmailFormat(formData.email)) {
            setError('請填寫有效的 Email。');
            return;
        }

        /** 僅正課需填寫／驗證電子發票；複訓不開放發票欄位 */
        if (!formData.isTimeNotAvailable && isMain) {
            if (formData.invoiceType === 'tax_id') {
                if (formData.taxId.length !== 8) {
                    setError('統一編號須為 8 碼數字。');
                    return;
                }
                if (!isValidTaiwanGuiNumber(formData.taxId)) {
                    setError('統一編號校驗不正確，請確認 8 碼是否正確。');
                    return;
                }
            }
        }

        if (isRefresher) {
            if (previousSessionOptions.length === 0) {
                setError('目前沒有「關閉報名之歷史梯次」可勾選。請主辦於後台關閉舊梯報名、或先改選正課、或聯絡主辦。');
                return;
            }
            if (!formData.previousSessionId) {
                setError('請選擇曾參加之場次。');
                return;
            }
            if (String(formData.previousSessionId) === String(selectedSessionId)) {
                setError('曾參加之場次不可與本場次相同。');
                return;
            }
        }

        if (isMain) {
            if (formData.lastFive.length !== 5) {
                setError('匯款後五碼必須為 5 碼');
                return;
            }
        }

        setLoading(true);

        try {
            const selectedSession = sessions.find(s => s.id === selectedSessionId);
            const previousSession = isRefresher
                ? closedSessionsForRefresher.find((s) => s.id === formData.previousSessionId) || null
                : null;
            // 重要：無論 selectedSession 是否存在，都要寫入 sessionId，避免後台用 where(sessionId==...) 查不到
            const sessionInfo = {
                sessionId: selectedSessionId,
                sessionTitle: formData.isTimeNotAvailable ? '以上場次時間無法配合' : (selectedSession?.title || null),
                sessionDate: formData.isTimeNotAvailable ? null : (selectedSession?.date || null), // ISO 字串（由場次資料決定）
                sessionLocation: formData.isTimeNotAvailable ? null : (selectedSession?.location || null),
                sessionAddress: formData.isTimeNotAvailable ? null : (selectedSession?.address || null),
            };

            const sourceResolved = isRefresher ? '複訓' : formData.source;
            const basePayload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                phone: formData.phone,
                source: sourceResolved,
                count: formData.count || 1,
                isTimeNotAvailable: formData.isTimeNotAvailable,
                wishTime: formData.wishTime,
                wishLocation: formData.wishLocation,
                lineUserId: lineProfile?.userId || null,
                createdAt: serverTimestamp(),
                status: 'pending',
                ...sessionInfo,
            };

            if (formData.isTimeNotAvailable) {
                await addDoc(collection(db, 'registrations_vibe'), {
                    ...basePayload,
                    invoiceType: 'general',
                    taxId: null,
                    registrationKind: 'main',
                    previousSessionId: null,
                    previousSessionTitle: null,
                    previousSessionDate: null,
                    paymentMethod: 'none',
                    lastFive: '',
                    expectedFee: 0,
                });
            } else {
                await addDoc(collection(db, 'registrations_vibe'), {
                    ...basePayload,
                    invoiceType: isRefresher ? 'refresher_exempt' : formData.invoiceType,
                    taxId: isRefresher ? null : (formData.invoiceType === 'tax_id' ? formData.taxId : null),
                    registrationKind: formData.registrationKind,
                    previousSessionId: isRefresher ? formData.previousSessionId : null,
                    previousSessionTitle: isRefresher
                        ? (formatRefresherPreviousLabel(previousSession) || previousSession?.title || null)
                        : null,
                    previousSessionDate: isRefresher && previousSession?.date ? String(previousSession.date) : null,
                    paymentMethod: isRefresher ? 'on_site' : 'transfer',
                    lastFive: isMain ? formData.lastFive : '',
                    expectedFee: isRefresher ? REFRESHER_FEE : (Number(selectedSession?.price) || 0),
                });
            }

            if (isLiffLoggedIn && liff.isInClient()) {
                const methodText = formData.isTimeNotAvailable
                    ? ''
                    : (isRefresher
                        ? `\n報名類型：複訓（${REFRESHER_FEE} 元現場繳費）\n前次參加：${formatRefresherPreviousLabel(previousSession) || previousSession?.title || '-'}`
                        : `\n匯款後五碼：${formData.lastFive}`);

                const sessionText = formData.isTimeNotAvailable
                    ? `以上場次時間無法配合\n許願時間：${formData.wishTime}\n許願地點：${formData.wishLocation}`
                    : (selectedSession?.displayDate || '2026/02/08');
                const kindLine = !formData.isTimeNotAvailable && isMain
                    ? '\n報名類型：正課'
                    : '';

                await liff.sendMessages([
                    {
                        type: 'text',
                        text: `【報名成功】\n姓名：${formData.name}\n場次：${sessionText}${kindLine}${methodText}\n\n感謝您的報名，我們已收到您的資訊！`
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
                                const isRef = !formData.isTimeNotAvailable && formData.registrationKind === 'refresher';
                                const methodText = formData.isTimeNotAvailable
                                    ? ''
                                    : (isRef
                                        ? `\n報名類型：複訓（${REFRESHER_FEE} 元現場繳費）`
                                        : `\n匯款後五碼：${formData.lastFive}`);
                                const sessionText = formData.isTimeNotAvailable
                                    ? `以上場次時間無法配合\n許願時間：${formData.wishTime}\n許願地點：${formData.wishLocation}`
                                    : (sessions.find(s => s.id === selectedSessionId)?.displayDate || '-');
                                const sourceText = isRef ? '複訓' : formData.source;
                                const msg = `【AI落地師培訓班 報名回報】\n姓名：${formData.name}\n場次：${sessionText}${methodText}\n來源：${sourceText}\n\n(系統自動產生)`;
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
                                        src="/signup.jpg"
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
                                    {/* 直式 9:16 影片比例：height/width = 16/9 => paddingTop 約 177.78% */}
                                    <div style={{ position: 'relative', paddingTop: '177.78%' }}>
                                        <iframe
                                            src={`${BUNNY_VIDEO_EMBED_URL}?autoplay=true&loop=false&muted=${isVideoMuted ? 'true' : 'false'}&preload=true&responsive=true`}
                                            loading="lazy"
                                            style={{ border: 0, position: 'absolute', top: 0, height: '100%', width: '100%' }}
                                            title="AI落地師培訓班課程介紹"
                                            allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
                                            allowFullScreen
                                        />
                                    </div>
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
                                    <p className="text-sm font-bold text-slate-900">課程亮點</p>
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
                            <h2 className="text-lg font-bold text-slate-900">課程流程</h2>
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
                                            const rMax = Number(session.refresherMaxCapacity) > 0
                                                ? Number(session.refresherMaxCapacity)
                                                : DEFAULT_REFRESHER_MAX;
                                            const rCount = session.refresherCurrentCount || 0;
                                            const isRefresherFull = rCount >= rMax;

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
                                                                    `正課名額: 剩餘 ${(session.maxCapacity || 50) - (session.currentCount || 0)} 位`
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
                                                            <div>
                                                                <p className="text-xs font-bold text-emerald-800">複訓報名</p>
                                                                <p className="text-sm font-black text-emerald-700 mt-0.5">${REFRESHER_FEE.toLocaleString()}（現場繳費）</p>
                                                            </div>
                                                            <div className="text-xs text-slate-500">
                                                                {isRefresherFull ? (
                                                                    <span className="text-amber-700 font-semibold">複訓已額滿，報名可排備取</span>
                                                                ) : (
                                                                    `複訓可收: 剩餘 ${rMax - rCount} / ${rMax} 人`
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Special Option: Time Not Available */}
                                        <div
                                            key="time_not_available"
                                            role="button"
                                            tabIndex={0}
                                            className={`relative border rounded-2xl p-4 cursor-pointer transition-all outline-none ${selectedSessionId === 'time_not_available' ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                                            onClick={() => handleSessionSelect('time_not_available')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') handleSessionSelect('time_not_available');
                                            }}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2.5 h-2.5 rounded-full ${selectedSessionId === 'time_not_available' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                                    <span className="font-bold text-slate-900 text-base sm:text-lg">以上場次時間無法配合</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    {selectedSessionId === 'time_not_available' && (
                                                        <div className="text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-200">已選擇</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="pl-5">
                                                <div className="text-sm text-slate-600">
                                                    勾選此項後，請留下你希望的「開課時間 / 地點」，方便我們統計加開場次。
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!formData.isTimeNotAvailable && selectedSessionId && selectedSessionId !== 'time_not_available' && (
                                <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                                    <p className="text-sm font-bold text-slate-800 mb-3">報名類型 <span className="text-rose-600">*</span></p>
                                    <div className="flex flex-col gap-3">
                                        <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 bg-white p-3 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50/80">
                                            <input
                                                type="radio"
                                                name="registrationKind"
                                                className="mt-1 h-4 w-4"
                                                checked={formData.registrationKind === 'main'}
                                                onChange={() => setFormData(prev => ({ ...prev, registrationKind: 'main' }))}
                                            />
                                            <span>
                                                <span className="block font-bold text-slate-900">正課</span>
                                                <span className="block text-xs text-slate-600 mt-0.5">匯款報名，依本場次公告金額繳交。</span>
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 bg-white p-3 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/60">
                                            <input
                                                type="radio"
                                                name="registrationKind"
                                                className="mt-1 h-4 w-4"
                                                checked={formData.registrationKind === 'refresher'}
                                                onChange={() => setFormData((prev) => ({ ...prev, registrationKind: 'refresher', invoiceType: 'general', taxId: '' }))}
                                            />
                                            <span>
                                                <span className="block font-bold text-slate-900">複訓</span>
                                                <span className="block text-xs text-slate-600 mt-0.5">費用 {REFRESHER_FEE} 元、當天現場繳交。本場次可收 {selectedRefresherMax} 人（額滿可備取；人數在後台此場次設定，預設 10 人、場地小可下修）。</span>
                                            </span>
                                        </label>
                                    </div>
                                    {formData.registrationKind === 'refresher' && (
                                        <div className="mt-4">
                                            <label className="block text-sm font-semibold text-slate-700">
                                                前次參加場次 <span className="text-rose-600">*</span>
                                            </label>
                                            <p className="text-xs text-slate-500 mt-0.5 mb-2">僅列出主辦已在後台「關閉報名」的梯次。選項內文為 <strong>場次標題 ｜ 日期</strong>（不顯示上課時段）。</p>
                                            <select
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-emerald-200 text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none disabled:opacity-60"
                                                value={formData.previousSessionId}
                                                onChange={(e) => setFormData((prev) => ({ ...prev, previousSessionId: e.target.value }))}
                                                required
                                                disabled={closedSessionsForRefresherLoading}
                                            >
                                                <option value="">{closedSessionsForRefresherLoading ? '載入歷史梯次中…' : '請選擇曾參加之場次'}</option>
                                                {previousSessionOptions.map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {formatRefresherPreviousLabel(s)}
                                                    </option>
                                                ))}
                                            </select>
                                            {!closedSessionsForRefresherLoading && previousSessionOptions.length === 0 && (
                                                <p className="text-xs text-amber-800 mt-2">名單為空代表尚無「關閉報名」之梯次；請主辦先關閉舊梯、或你改選正課、或聯絡主辦協助。</p>
                                            )}
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* Wish Fields (Conditional) */}
                            {formData.isTimeNotAvailable && (
                                <section className="bg-emerald-50 rounded-2xl p-5 border border-emerald-200">
                                    <div className="flex items-center gap-2 mb-3 text-emerald-800 font-bold text-sm tracking-wide">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        許願開課資訊
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                                許願開課時間 <span className="text-rose-600">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="wishTime"
                                                value={formData.wishTime}
                                                onChange={handleChange}
                                                required={formData.isTimeNotAvailable}
                                                placeholder="請輸入您可以的日期時間"
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-emerald-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                                許願開課地點 <span className="text-rose-600">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="wishLocation"
                                                value={formData.wishLocation}
                                                onChange={handleChange}
                                                required={formData.isTimeNotAvailable}
                                                placeholder="請輸入您希望的開課地點"
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-emerald-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                </section>
                            )}


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
                                    onChange={handlePhoneChange}
                                    required
                                    inputMode="numeric"
                                    autoComplete="tel-national"
                                    placeholder="0912345678（僅 10 碼數字）"
                                    maxLength={10}
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-colors"
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    Email <span className="text-rose-600">*</span>
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    required
                                    placeholder="name@example.com"
                                    autoComplete="email"
                                    className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none transition-colors"
                                />
                            </div>

                            {!formData.isTimeNotAvailable && formData.registrationKind === 'main' && (
                                <div>
                                    <p className="text-sm font-semibold text-slate-700 mb-3">電子發票 <span className="text-rose-600">*</span></p>
                                    <div className="flex flex-col gap-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="invoiceType"
                                                className="h-4 w-4"
                                                checked={formData.invoiceType === 'general'}
                                                onChange={() => setFormData(prev => ({ ...prev, invoiceType: 'general', taxId: '' }))}
                                            />
                                            <span className="text-sm text-slate-800">一般發票</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="invoiceType"
                                                className="h-4 w-4"
                                                checked={formData.invoiceType === 'tax_id'}
                                                onChange={() => setFormData(prev => ({ ...prev, invoiceType: 'tax_id' }))}
                                            />
                                            <span className="text-sm text-slate-800">統一編號</span>
                                        </label>
                                    </div>
                                    {formData.invoiceType === 'tax_id' && (
                                        <div className="mt-3">
                                            <label className="block text-sm font-semibold text-slate-700 mb-1">
                                                統一編號 <span className="text-rose-600">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={formData.taxId}
                                                onChange={handleTaxIdInput}
                                                maxLength={8}
                                                placeholder="8 碼數字"
                                                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 tracking-widest focus:border-sky-400 focus:ring-4 focus:ring-sky-100 outline-none"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">僅能輸入 8 碼阿拉伯數字，送出前會檢查統編規則。</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 推薦人／來源：正課、許願需填；複訓由系統帶入不顯示 */}
                            {(formData.isTimeNotAvailable || formData.registrationKind === 'main') && (
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
                            )}
                            {/* Payment：正課＝匯款；複訓＝現場繳費 */}
                            {!formData.isTimeNotAvailable && formData.registrationKind === 'refresher' && (
                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
                                    <p className="font-bold text-base mb-1">複訓費用 {REFRESHER_FEE} 元</p>
                                    <p>請於上課當天於現場繳交現金（或由現場人員引導付款方式），無須匯款後五碼。</p>
                                </div>
                            )}

                            {!formData.isTimeNotAvailable && formData.registrationKind === 'main' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                                            付款方式 <span className="text-rose-600">*</span>
                                        </label>
                                        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-center text-sm font-semibold text-sky-900">
                                            轉帳匯款
                                        </div>
                                    </div>
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
                                </>
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
