import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import SEO from '../../components/SEO';
import { db, functions } from '../../firebase';
import {
    resolvePosterSrc,
    resolvePosterSeoUrl,
    SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION,
    VIBE_REFERRAL_CODES_COLLECTION,
    normalizeVibeSignupRefParam,
    VIBE_REFERRAL_JOIN_ACTIVITY_LUCKY_DRAW,
} from './signupLandingShared';
import { useSignupLandingSettings } from './useSignupLandingSettings';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import liff from '@line/liff';

const LIFF_ID = '2008963361-MrRNV5vJ';
const LINE_OA_ID = '@217vdaka';

function buildYoutubeShortEmbedSrc(videoId, { muted, autoplay }) {
    const q = new URLSearchParams({ playsinline: '1', rel: '0', modestbranding: '1', mute: muted ? '1' : '0' });
    if (autoplay) q.set('autoplay', '1');
    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${q.toString()}`;
}

const isValidTaiwanMobileDigits = (phone) => /^09\d{8}$/.test(String(phone).trim());
const isValidEmailFormat = (email) => {
    const s = String(email).trim();
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
};
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
const normalizeGuiInput = (raw) =>
    String(raw ?? '')
        .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248))
        .replace(/\s/g, '').replace(/\D/g, '').slice(0, 8);

const REFRESHER_FEE = 500;
const DEFAULT_REFRESHER_MAX = 10;

const formatRefresherPreviousLabel = (s) => {
    if (!s) return '';
    const title = (s.title || '課程場次').trim();
    if (!s.date) return title;
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) return title;
    const y = d.getFullYear(); const m = d.getMonth() + 1; const day = d.getDate();
    const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${title} ｜ ${y}/${m}/${day}（${wk}）`;
};

/* ── Scroll-reveal hook ─────────────────────────────────────── */
const useReveal = (threshold = 0.12) => {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ob = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); ob.disconnect(); } }, { threshold });
        ob.observe(el);
        return () => ob.disconnect();
    }, [threshold]);
    return [ref, visible];
};

/* ── Reveal wrapper component ───────────────────────────────── */
const Reveal = ({ children, delay = 0, direction = 'up', className = '' }) => {
    const [ref, visible] = useReveal();
    const transforms = { up: 'translateY(48px)', down: 'translateY(-48px)', left: 'translateX(-48px)', right: 'translateX(48px)', scale: 'scale(0.92)' };
    return (
        <div ref={ref} className={className} style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'none' : (transforms[direction] || transforms.up),
            transition: `opacity 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        }}>
            {children}
        </div>
    );
};

/* ── Parallax hook ──────────────────────────────────────────── */
const useParallax = (factor = 0.3) => {
    const [offset, setOffset] = useState(0);
    useEffect(() => {
        const onScroll = () => setOffset(window.scrollY * factor);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [factor]);
    return offset;
};

/* ═══════════════════════════════════════════════════════════════
   Main Component
═══════════════════════════════════════════════════════════════ */
const Signup = () => {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [isLiffLoggedIn, setIsLiffLoggedIn] = useState(false);
    const [lineProfile, setLineProfile] = useState(null);
    const [isVideoMuted, setIsVideoMuted] = useState(true);

    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [sessionsLoading, setSessionsLoading] = useState(true);
    const [sessionsError, setSessionsError] = useState('');
    const [closedSessionsForRefresher, setClosedSessionsForRefresher] = useState([]);
    const [closedSessionsForRefresherLoading, setClosedSessionsForRefresherLoading] = useState(true);

    const [formData, setFormData] = useState({
        name: '', email: '', phone: '', source: '', lastFive: '', count: 1,
        paymentMethod: 'transfer', isTimeNotAvailable: false, wishTime: '', wishLocation: '',
        invoiceType: 'general', taxId: '', registrationKind: 'main', previousSessionId: ''
    });
    const [sourceOption, setSourceOption] = useState('');
    const [customSource, setCustomSource] = useState('');
    /** 成功由 ?ref= 解析並鎖定時，不重寫 formData.source、並隱藏手動來源區塊 */
    const [signupReferralLocked, setSignupReferralLocked] = useState(false);
    /** 連結内含上層推薦人時存此物件；報名送出寫入 Firestore，但畫面上不揭露上層 */
    const [signupReferralMeta, setSignupReferralMeta] = useState(null);
    const [signupReferralCode, setSignupReferralCode] = useState('');
    const [signupRefUrlNotice, setSignupRefUrlNotice] = useState('');
    /** 對應推薦文件 `joinActivityLuckyDraw`：為 true 時顯示活動／抽獎區 */
    const [referralJoinActivityLuckyDraw, setReferralJoinActivityLuckyDraw] = useState(false);
    const [luckyDrawName, setLuckyDrawName] = useState('');
    const [luckyDrawEmail, setLuckyDrawEmail] = useState('');
    const [luckyDrawPhone, setLuckyDrawPhone] = useState('');
    const [luckyDrawSubmitting, setLuckyDrawSubmitting] = useState(false);
    /** 獨立抽獎送出回饋（不影響課程報名的 error） */
    const [luckyDrawFeedback, setLuckyDrawFeedback] = useState({ tone: '', text: '' });
    /** 登記成功後由後端回傳的 8 碼折扣碼 */
    const [luckyDrawDiscountCode, setLuckyDrawDiscountCode] = useState('');
    const [luckyDrawCodeCopied, setLuckyDrawCodeCopied] = useState(false);
    /** ISO 字串；折扣碼須於此前（登記日起算 30 日）前使用 */
    const [luckyDrawDiscountExpiresAt, setLuckyDrawDiscountExpiresAt] = useState('');
    /** 後端回傳已登記時為 true，文案改為「您已參加過…」 */
    const [luckyDrawAlreadyRegistered, setLuckyDrawAlreadyRegistered] = useState(false);
    /** 供重寄信：送出當下的 Email／手機（成功後表單可能清空） */
    const [luckyDrawContactLocked, setLuckyDrawContactLocked] = useState(null);
    const [luckyDrawResendBusy, setLuckyDrawResendBusy] = useState(false);

    /** 母親節抽獎折扣碼：正課折抵、帶入聯絡資料、鎖定複訓 */
    const [courseDiscountInput, setCourseDiscountInput] = useState('');
    const [courseDiscountVerified, setCourseDiscountVerified] = useState(false);
    const [courseDiscountLoading, setCourseDiscountLoading] = useState(false);
    const [courseDiscountError, setCourseDiscountError] = useState('');
    const [courseDiscountAmountNtd, setCourseDiscountAmountNtd] = useState(100);
    const [courseLotteryEntryId, setCourseLotteryEntryId] = useState('');
    const [courseDiscountCodeNormalized, setCourseDiscountCodeNormalized] = useState('');

    const parallaxOffset = useParallax(0.25);

    const { youtubeVideos: landingYoutubeVideos, posterImageUrl: landingPosterUrl } = useSignupLandingSettings();

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ai.lionbaker.com';
    const posterSrc = resolvePosterSrc(landingPosterUrl);
    const seoImage = resolvePosterSeoUrl(landingPosterUrl, siteOrigin);
    const seoUrl = `${siteOrigin}/vibe`;

    const previousSessionOptions = useMemo(() => {
        return closedSessionsForRefresher
            .filter((s) => s.id && s.id !== selectedSessionId)
            .sort((a, b) => {
                const aTime = new Date(a.date).getTime(); const bTime = new Date(b.date).getTime();
                const aOk = Number.isFinite(aTime); const bOk = Number.isFinite(bTime);
                if (!aOk && !bOk) return 0; if (!aOk) return 1; if (!bOk) return -1;
                return bTime - aTime;
            });
    }, [closedSessionsForRefresher, selectedSessionId]);

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
        if (signupReferralLocked) return;
        if (sourceOption === 'Other') setFormData(prev => ({ ...prev, source: customSource }));
        else setFormData(prev => ({ ...prev, source: sourceOption }));
    }, [sourceOption, customSource, signupReferralLocked]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const raw = new URLSearchParams(window.location.search).get('ref');
        if (raw == null || String(raw).trim() === '') return;

        const alnum = normalizeVibeSignupRefParam(raw);
        if (alnum.length !== 8) {
            setReferralJoinActivityLuckyDraw(false);
            setSignupRefUrlNotice('推薦連結代碼須為 8 碼英數字，請向主辦確認網址。');
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const snap = await getDoc(doc(db, VIBE_REFERRAL_CODES_COLLECTION, alnum));
                if (cancelled) return;
                if (!snap.exists()) {
                    setReferralJoinActivityLuckyDraw(false);
                    setSignupRefUrlNotice('查無此推薦連結代碼，請改用手動選擇「推薦人 / 來源」。');
                    return;
                }
                const row = snap.data() || {};
                const refName = String(row.referrerName || '').trim();
                const upper = String(row.upperReferrerName || '').trim();
                if (!refName) {
                    setReferralJoinActivityLuckyDraw(false);
                    setSignupRefUrlNotice('此推薦連結資料未設定姓名，請聯絡主辦或使用手動來源。');
                    return;
                }
                setSignupReferralLocked(true);
                setSignupReferralMeta({ referrerName: refName, upperReferrerName: upper });
                setSignupReferralCode(alnum);
                setReferralJoinActivityLuckyDraw(Boolean(row[VIBE_REFERRAL_JOIN_ACTIVITY_LUCKY_DRAW]));
                setSignupRefUrlNotice('');
                setFormData(prev => ({ ...prev, source: refName }));
            } catch (e) {
                if (!cancelled) {
                    console.error('resolve referral ref', e);
                    setReferralJoinActivityLuckyDraw(false);
                    setSignupRefUrlNotice('無法載入推薦連結資料，請稍後再試或改用手動選擇來源。');
                }
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                if (LIFF_ID && LIFF_ID !== 'MY_LIFF_ID') {
                    await liff.init({ liffId: LIFF_ID });
                    if (liff.isLoggedIn()) {
                        setIsLiffLoggedIn(true);
                        const profile = await liff.getProfile();
                        setLineProfile(profile);
                        setFormData(prev => ({ ...prev, name: profile.displayName }));
                    }
                }
            } catch (err) { console.error('LIFF Init Error:', err); }
        };
        init();
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                setClosedSessionsForRefresherLoading(true);
                const fn = httpsCallable(functions, 'getVibeClosedSessionsForRefresher');
                const res = await fn();
                setClosedSessionsForRefresher(res.data.sessions || []);
            } catch (e) { console.error('getVibeClosedSessionsForRefresher', e); setClosedSessionsForRefresher([]); }
            finally { setClosedSessionsForRefresherLoading(false); }
        };
        load();
    }, []);

    useEffect(() => {
        const fetchSessions = async () => {
            try {
                setSessionsLoading(true); setSessionsError('');
                const getSessionsFn = httpsCallable(functions, 'getVibeSessions');
                const result = await getSessionsFn();
                const fetchedSessions = result.data.sessions || [];
                if (fetchedSessions.length > 0) {
                    const processedManager = fetchedSessions.map(s => {
                        const dateObj = new Date(s.date);
                        const days = ['日', '一', '二', '三', '四', '五', '六'];
                        const dayName = days[dateObj.getDay()];
                        const startTime = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                        const endTime = s.endTime ? `～${s.endTime}` : '';
                        return { ...s, displayDate: `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')} (${dayName}) ${startTime}${endTime}` };
                    });
                    processedManager.sort((a, b) => { const aT = new Date(a.date).getTime(); const bT = new Date(b.date).getTime(); const aV = Number.isFinite(aT); const bV = Number.isFinite(bT); if (!aV && !bV) return 0; if (!aV) return 1; if (!bV) return -1; return aT - bT; });
                    const signupOpenSessions = processedManager.filter((s) => s.isSignupOpen !== false);
                    setSessions(signupOpenSessions);
                    const firstOpen = signupOpenSessions.find(s => s.status === 'open');
                    if (firstOpen) setSelectedSessionId(firstOpen.id);
                    else if (signupOpenSessions.length > 0) setSelectedSessionId(signupOpenSessions[0].id);
                    else if (SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION) {
                        setSelectedSessionId('time_not_available');
                        setSessionsError('目前沒有開放報名場次，可改選「以上場次時間無法配合」留下許願資訊。');
                    } else {
                        setSelectedSessionId(null);
                        setSessionsError('目前沒有開放報名場次，請稍後再試或聯絡主辦。');
                    }
                } else {
                    setSessions([{ id: 'default_01', date: '2026-02-08T13:00:00', endTime: '17:30', displayDate: '2026/02/08 (日) 13:00～17:30', location: 'TOP SPACE 商務中心', address: '臺中市中區民族路23號3樓', price: 1980, originalPrice: 5000, status: 'open', title: 'AI落地師培訓班 (預設)', refresherMaxCapacity: DEFAULT_REFRESHER_MAX, refresherCurrentCount: 0 }]);
                    setSelectedSessionId('default_01');
                }
            } catch (err) {
                console.error("Failed to fetch sessions:", err);
                setSessionsError('目前無法載入最新場次（可能是網路或系統忙碌）。已先載入預設場次，您仍可完成報名。');
                setSessions([{ id: 'default_01', date: '2026-02-08T13:00:00', endTime: '17:30', displayDate: '2026/02/08 (日) 13:00～17:30', location: 'TOP SPACE 商務中心', address: '臺中市中區民族路23號3樓', price: 1980, originalPrice: 5000, status: 'open', title: 'AI落地師培訓班（預設）', refresherMaxCapacity: DEFAULT_REFRESHER_MAX, refresherCurrentCount: 0 }]);
                setSelectedSessionId('default_01');
            } finally { setSessionsLoading(false); }
        };
        fetchSessions();
    }, []);

    const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
    const handlePhoneChange = (e) => { const digits = e.target.value.replace(/\D/g, '').slice(0, 10); setFormData(prev => ({ ...prev, phone: digits })); };
    const handleLuckyDrawPhoneChange = (e) => { setLuckyDrawPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); };

    const formatLuckyDrawExpiryZh = useCallback((iso) => {
        if (!iso) return '';
        const ms = Date.parse(iso);
        const d = new Date(Number.isFinite(ms) ? ms : Date.now());
        return d.toLocaleString('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
    }, []);

    const handleLuckyDrawResendEmail = async () => {
        const email = luckyDrawContactLocked?.email?.trim() || luckyDrawEmail.trim();
        const phone = luckyDrawContactLocked?.phone || luckyDrawPhone;
        if (!email || !isValidTaiwanMobileDigits(phone)) {
            setLuckyDrawFeedback({ tone: 'err', text: '請先完成登記或保留登記時的手機與 Email。' });
            return;
        }
        setLuckyDrawResendBusy(true);
        setLuckyDrawFeedback({ tone: '', text: '' });
        try {
            const resendFn = httpsCallable(functions, 'resendMothersDay2026LuckyDrawEmail');
            await resendFn({ email, phone });
            setLuckyDrawFeedback({
                tone: 'ok',
                text: '確認信已重新寄出，請稍候查看信箱（含垃圾信匣）。',
            });
        } catch (err) {
            console.error('lucky draw resend', err);
            const msg = typeof err?.message === 'string' ? err.message.trim() : '';
            setLuckyDrawFeedback({
                tone: 'err',
                text: msg || '重寄失敗，請確認手機與 Email 與登記時完全一致後再試。',
            });
        } finally {
            setLuckyDrawResendBusy(false);
        }
    };

    const handleLuckyDrawSubmit = async (e) => {
        e.preventDefault();
        if (!signupReferralLocked || !referralJoinActivityLuckyDraw || !signupReferralCode) return;
        setLuckyDrawFeedback({ tone: '', text: '' });

        const name = luckyDrawName.trim();
        if (!name) {
            setLuckyDrawFeedback({ tone: 'err', text: '請填寫姓名。' });
            return;
        }
        if (!isValidEmailFormat(luckyDrawEmail)) {
            setLuckyDrawFeedback({ tone: 'err', text: '請填寫有效的 Email。' });
            return;
        }
        if (!isValidTaiwanMobileDigits(luckyDrawPhone)) {
            setLuckyDrawFeedback({ tone: 'err', text: '手機須為 09 開頭的 10 碼數字。' });
            return;
        }

        const submittedEmail = luckyDrawEmail.trim();
        const submittedPhone = luckyDrawPhone;

        setLuckyDrawSubmitting(true);
        try {
            const submitLucky = httpsCallable(functions, 'submitMothersDay2026LuckyDrawEntry');
            const { data } = await submitLucky({
                name,
                email: submittedEmail,
                phone: submittedPhone,
                referralCode: signupReferralCode,
                referrerSnapshot: signupReferralMeta?.referrerName ? String(signupReferralMeta.referrerName).trim().slice(0, 80) : '',
                prizeSummary: '2026年5月30日（六）AI落地師一日課程｜乙名｜免費上課名額',
                commentOnPostRequired: true,
                drawAnnouncementNote: '2026年5月11日開獎',
                lineUserId: lineProfile?.userId || '',
            });

            const code = typeof data?.discountCode === 'string' ? data.discountCode.trim() : '';
            const expIso = typeof data?.discountExpiresAt === 'string' ? data.discountExpiresAt.trim() : '';

            setLuckyDrawContactLocked({ email: submittedEmail, phone: submittedPhone });
            setLuckyDrawDiscountExpiresAt(expIso);
            setLuckyDrawDiscountCode(code);
            setLuckyDrawCodeCopied(false);

            if (data?.alreadyRegistered) {
                setLuckyDrawAlreadyRegistered(true);
                setLuckyDrawFeedback({
                    tone: 'info',
                    text:
                        (typeof data?.message === 'string' && data.message.trim()
                            ? data.message.trim()
                            : '您已參加過母親節抽獎活動。') +
                        ' 系統已再次寄送確認信至您的 Email（若未收到請查看垃圾信匣，或使用下方重寄）。',
                });
                return;
            }

            setLuckyDrawAlreadyRegistered(false);
            setLuckyDrawFeedback({
                tone: 'ok',
                text: '登記成功！已寄送確認信至您的 Email（含海報與折扣碼）。請務必先完成貼文留言以利抽獎資格認定。',
            });
            setLuckyDrawName('');
            setLuckyDrawEmail('');
            setLuckyDrawPhone('');
        } catch (err) {
            console.error('lucky draw submit', err);
            const code = typeof err?.code === 'string' ? err.code : '';
            if (code === 'functions/already-exists') {
                setLuckyDrawFeedback({
                    tone: 'err',
                    text: err.message?.trim?.() ||
                        '此手機或 Email 已登記過母親節抽獎，每人限乙次（不分推薦連結）。',
                });
                return;
            }
            setLuckyDrawFeedback({ tone: 'err', text: '送出失敗，請檢查網路後再試。' });
        } finally {
            setLuckyDrawSubmitting(false);
        }
    };
    const handleTaxIdInput = (e) => { const digits = normalizeGuiInput(e.target.value); setFormData(prev => ({ ...prev, taxId: digits })); };

    const handleSessionSelect = (sessionId) => {
        const nextId = String(sessionId);
        if (!SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION && nextId === 'time_not_available') return;
        setSelectedSessionId(nextId);
        if (nextId === 'time_not_available') {
            setCourseDiscountInput('');
            setCourseDiscountVerified(false);
            setCourseLotteryEntryId('');
            setCourseDiscountCodeNormalized('');
            setCourseDiscountError('');
            setFormData(prev => ({ ...prev, isTimeNotAvailable: true, registrationKind: 'main', previousSessionId: '' }));
        } else {
            setFormData(prev => ({ ...prev, isTimeNotAvailable: false, wishTime: '', wishLocation: '', previousSessionId: '' }));
        }
    };

    const clearCourseDiscount = useCallback(() => {
        setCourseDiscountVerified(false);
        setCourseLotteryEntryId('');
        setCourseDiscountCodeNormalized('');
        setCourseDiscountError('');
        setCourseDiscountAmountNtd(100);
    }, []);

    const handleApplyCourseDiscount = async () => {
        setCourseDiscountError('');
        const code = String(courseDiscountInput).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 8) {
            setCourseDiscountError('請輸入 8 碼英數字折扣碼。');
            return;
        }
        setCourseDiscountLoading(true);
        try {
            const verifyFn = httpsCallable(functions, 'verifyMothersDayDiscountForCourseSignup');
            const { data } = await verifyFn({ discountCode: code });
            if (!data?.ok) {
                setCourseDiscountError('無法驗證折扣碼。');
                return;
            }
            const amt = Number(data.discountAmountNtd);
            setCourseDiscountVerified(true);
            setCourseDiscountAmountNtd(Number.isFinite(amt) && amt > 0 ? amt : 100);
            setCourseLotteryEntryId(String(data.lotteryEntryId || ''));
            setCourseDiscountCodeNormalized(String(data.discountCode || code));
            setFormData((prev) => ({
                ...prev,
                registrationKind: 'main',
                name: String(data.name || '').trim(),
                phone: String(data.phone || '').replace(/\D/g, '').slice(0, 10),
                email: String(data.email || '').trim(),
            }));
        } catch (err) {
            console.error('course discount verify', err);
            setCourseDiscountVerified(false);
            setCourseLotteryEntryId('');
            setCourseDiscountCodeNormalized('');
            const msg = typeof err?.message === 'string' ? err.message.trim() : '';
            setCourseDiscountError(msg || '查無有效折扣碼或已失效。');
        } finally {
            setCourseDiscountLoading(false);
        }
    };

    const computeMainPriceAfterDiscount = useCallback((listPrice) => {
        const n = Number(listPrice) || 0;
        if (!courseDiscountVerified) return n;
        return Math.max(0, n - courseDiscountAmountNtd);
    }, [courseDiscountVerified, courseDiscountAmountNtd]);

    const handleSubmit = async (e) => {
        e.preventDefault(); setError('');
        if (!selectedSessionId) { setError('請先選擇場次'); return; }
        if (!SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION && formData.isTimeNotAvailable) {
            setError('請選擇有效場次後再送出。');
            return;
        }
        if (formData.isTimeNotAvailable) {
            if (!formData.wishTime.trim()) { setError('請填寫許願開課時間'); return; }
            if (!formData.wishLocation.trim()) { setError('請填寫許願開課地點'); return; }
        }
        const isRefresher = !formData.isTimeNotAvailable && formData.registrationKind === 'refresher';
        const isMain = !formData.isTimeNotAvailable && formData.registrationKind === 'main';
        if (!isRefresher && !formData.source) { setError('請填寫來源資訊'); return; }
        if (!isValidTaiwanMobileDigits(formData.phone)) { setError('手機號碼須為 09 開頭的 10 碼數字，請勿輸入連字號或符號。'); return; }
        if (!isValidEmailFormat(formData.email)) { setError('請填寫有效的 Email。'); return; }
        const normalizedTaxId = normalizeGuiInput(formData.taxId);
        if (!formData.isTimeNotAvailable && isMain) {
            if (formData.invoiceType === 'tax_id') {
                if (normalizedTaxId.length !== 8) { setError('統一編號須為 8 碼數字。'); return; }
                if (!isValidTaiwanGuiNumber(normalizedTaxId)) { setError('統一編號校驗不正確，請確認 8 碼是否正確。'); return; }
            }
        }
        if (isRefresher) {
            if (previousSessionOptions.length === 0) { setError('目前沒有「關閉報名之歷史梯次」可勾選。請主辦於後台關閉舊梯報名、或先改選正課、或聯絡主辦。'); return; }
            if (!formData.previousSessionId) { setError('請選擇曾參加之場次。'); return; }
            if (String(formData.previousSessionId) === String(selectedSessionId)) { setError('曾參加之場次不可與本場次相同。'); return; }
        }
        if (isMain) { if (formData.lastFive.length !== 5) { setError('匯款後五碼必須為 5 碼'); return; } }
        if (courseDiscountVerified && (formData.isTimeNotAvailable || !isMain)) {
            setError('母親節折扣碼僅適用正課報名，請移除折扣或改選一般場次。');
            return;
        }
        setLoading(true);
        try {
            const checkDup = httpsCallable(functions, 'checkVibeRegistrationDuplicate');
            const dupResult = await checkDup({ sessionId: selectedSessionId, email: formData.email.trim(), phone: formData.phone });
            if (dupResult.data?.duplicate) { setError('此手機或 Email 已用於本場次報名，若為本人重複送出請聯絡主辦；若誤用他人聯絡方式請改填正確資料。'); return; }
            const selectedSession = sessions.find(s => s.id === selectedSessionId);
            const listPriceNtd = Number(selectedSession?.price) || 0;
            const expectedMainFee = formData.isTimeNotAvailable
                ? 0
                : isRefresher
                  ? REFRESHER_FEE
                  : computeMainPriceAfterDiscount(listPriceNtd);
            const previousSession = isRefresher ? closedSessionsForRefresher.find((s) => s.id === formData.previousSessionId) || null : null;
            const sessionInfo = {
                sessionId: selectedSessionId,
                sessionTitle: formData.isTimeNotAvailable ? '以上場次時間無法配合' : (selectedSession?.title || null),
                sessionDate: formData.isTimeNotAvailable ? null : (selectedSession?.date || null),
                sessionLocation: formData.isTimeNotAvailable ? null : (selectedSession?.location || null),
                sessionAddress: formData.isTimeNotAvailable ? null : (selectedSession?.address || null),
            };
            let sourceResolved;
            let referrerNameOut;
            let upperReferrerNameOut;
            if (isRefresher) {
                sourceResolved = '複訓';
                referrerNameOut = null;
                upperReferrerNameOut = null;
            } else if (signupReferralMeta) {
                referrerNameOut = String(signupReferralMeta.referrerName || '').trim();
                upperReferrerNameOut = String(signupReferralMeta.upperReferrerName || '').trim() || null;
                sourceResolved = referrerNameOut;
            } else {
                referrerNameOut = String(formData.source || '').trim();
                upperReferrerNameOut = null;
                sourceResolved = referrerNameOut;
            }
            const basePayload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                phone: formData.phone,
                source: sourceResolved,
                referrerName: referrerNameOut,
                upperReferrerName: upperReferrerNameOut,
                referralCode: signupReferralLocked && signupReferralCode ? signupReferralCode : null,
                count: formData.count || 1,
                isTimeNotAvailable: formData.isTimeNotAvailable,
                wishTime: formData.wishTime,
                wishLocation: formData.wishLocation,
                lineUserId: lineProfile?.userId || null,
                createdAt: serverTimestamp(),
                status: 'pending',
                ...sessionInfo,
            };
            const discountExtra = {
                mothersDayDiscountCode: isMain && courseDiscountVerified ? courseDiscountCodeNormalized : null,
                mothersDayDiscountAmountNtd: isMain && courseDiscountVerified ? courseDiscountAmountNtd : null,
                sessionListPriceNtd: isMain ? listPriceNtd : null,
            };

            let docRef;
            if (formData.isTimeNotAvailable) {
                docRef = await addDoc(collection(db, 'registrations_vibe'), {
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
                    mothersDayDiscountCode: null,
                    mothersDayDiscountAmountNtd: null,
                    sessionListPriceNtd: null,
                });
            } else {
                docRef = await addDoc(collection(db, 'registrations_vibe'), {
                    ...basePayload,
                    ...discountExtra,
                    invoiceType: isRefresher ? 'refresher_exempt' : formData.invoiceType,
                    taxId: isRefresher ? null : (formData.invoiceType === 'tax_id' ? normalizedTaxId : null),
                    registrationKind: formData.registrationKind,
                    previousSessionId: isRefresher ? formData.previousSessionId : null,
                    previousSessionTitle: isRefresher ? (formatRefresherPreviousLabel(previousSession) || previousSession?.title || null) : null,
                    previousSessionDate: isRefresher && previousSession?.date ? String(previousSession.date) : null,
                    paymentMethod: isRefresher ? 'on_site' : 'transfer',
                    lastFive: isMain ? formData.lastFive : '',
                    expectedFee: isRefresher ? REFRESHER_FEE : expectedMainFee,
                });
            }

            if (!formData.isTimeNotAvailable && isMain && courseDiscountVerified && courseLotteryEntryId && courseDiscountCodeNormalized) {
                try {
                    const redeemFn = httpsCallable(functions, 'redeemMothersDayCourseDiscount');
                    await redeemFn({
                        lotteryEntryId: courseLotteryEntryId,
                        registrationId: docRef.id,
                        discountCode: courseDiscountCodeNormalized,
                        email: formData.email.trim(),
                        phone: formData.phone,
                        sessionListPrice: listPriceNtd,
                    });
                } catch (redeemErr) {
                    console.error('redeem mothers day discount', redeemErr);
                    setError('報名已送出，但折扣碼未能完成核銷；請勿重複報名，並請截圖聯絡主辦確認應繳金額。');
                    return;
                }
            }

            try {
                const mailFn = httpsCallable(functions, 'sendVibeCourseRegistrationConfirmationEmail');
                await mailFn({ registrationId: docRef.id });
            } catch (mailErr) {
                console.error('signup confirmation email', mailErr);
            }

            if (isLiffLoggedIn && liff.isInClient()) {
                const feeLine = !formData.isTimeNotAvailable && isMain && courseDiscountVerified
                    ? `\n應繳費用：${expectedMainFee.toLocaleString()} 元（已套用母親節折扣）`
                    : (!formData.isTimeNotAvailable && isMain ? `\n應繳費用：${expectedMainFee.toLocaleString()} 元` : '');
                const methodText = formData.isTimeNotAvailable ? '' : (isRefresher ? `\n報名類型：複訓（${REFRESHER_FEE} 元現場繳費）\n前次參加：${formatRefresherPreviousLabel(previousSession) || previousSession?.title || '-'}` : `\n匯款後五碼：${formData.lastFive}`);
                const sessionText = formData.isTimeNotAvailable ? `以上場次時間無法配合\n許願時間：${formData.wishTime}\n許願地點：${formData.wishLocation}` : (selectedSession?.displayDate || '2026/02/08');
                const kindLine = !formData.isTimeNotAvailable && isMain ? '\n報名類型：正課' : '';
                await liff.sendMessages([{ type: 'text', text: `【報名成功】\n姓名：${formData.name}\n場次：${sessionText}${kindLine}${feeLine}${methodText}\n\n感謝您的報名，我們已收到您的資訊！` }]);
            }
            setSuccess(true); window.scrollTo(0, 0);
        } catch (err) { console.error(err); setError('報名失敗，請檢查網路連線或稍後再試。'); }
        finally { setLoading(false); }
    };

    /* ── Success Screen ──────────────────────────────────────── */
    if (success) {
        return (
            <main className="min-h-screen bg-black text-white font-sans flex items-center justify-center p-4">
                <style>{`@keyframes successPop{0%{opacity:0;transform:scale(0.8) translateY(20px)}100%{opacity:1;transform:none}}.success-card{animation:successPop 0.6s cubic-bezier(0.16,1,0.3,1) forwards}`}</style>
                <section className="success-card w-full max-w-md bg-zinc-900 rounded-3xl border border-zinc-800 p-8 text-center">
                    <div className="mx-auto inline-flex items-center justify-center w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full mb-6 border border-emerald-500/20">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-white mb-3">報名成功</h1>
                    <p className="text-zinc-400 mb-8 leading-relaxed">
                        我們已收到您的報名資訊。<br />
                        {isLiffLoggedIn && liff.isInClient() && <span className="text-sm text-emerald-400">確認訊息已發送至您的 LINE 聊天室</span>}
                    </p>
                    <button type="button" onClick={() => window.location.reload()} className="w-full bg-white text-black font-bold py-3.5 rounded-2xl hover:bg-zinc-100 transition-colors mb-3">繼續報名</button>
                    {isLiffLoggedIn && liff.isInClient() && (
                        <button type="button" onClick={() => liff.closeWindow()} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-3.5 rounded-2xl transition-colors">關閉視窗</button>
                    )}
                    {!liff.isInClient() && (
                        <button type="button" onClick={() => {
                            const isRef = !formData.isTimeNotAvailable && formData.registrationKind === 'refresher';
                            const methodText = formData.isTimeNotAvailable ? '' : (isRef ? `\n報名類型：複訓（${REFRESHER_FEE} 元現場繳費）` : `\n匯款後五碼：${formData.lastFive}`);
                            const sessionText = formData.isTimeNotAvailable ? `以上場次時間無法配合\n許願時間：${formData.wishTime}\n許願地點：${formData.wishLocation}` : (sessions.find(s => s.id === selectedSessionId)?.displayDate || '-');
                            const sourceText = isRef ? '複訓' : formData.source;
                            const msg = `【AI落地師培訓班 報名回報】\n姓名：${formData.name}\n場次：${sessionText}${methodText}\n來源：${sourceText}\n\n(系統自動產生)`;
                            window.location.href = `https://line.me/R/oaMessage/${LINE_OA_ID}/?${encodeURIComponent(msg)}`;
                        }} className="w-full mt-3 bg-[#06c755] hover:bg-[#05b34c] text-white py-3.5 rounded-2xl font-bold transition-colors flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.273.362 2.256-.37 3.597-.938 4.18-1.234A9.06 9.06 0 0 0 8 15z" /></svg>
                            回報給官方帳號
                        </button>
                    )}
                </section>
            </main>
        );
    }

    /* ── Main Landing Page ───────────────────────────────────── */
    return (
        <main className="bg-black text-white font-sans antialiased overflow-x-hidden">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
                @keyframes heroFadeIn { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:none; } }
                @keyframes scrollBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
                @keyframes gradientShift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
                @keyframes pulseGlow { 0%,100%{box-shadow:0 0 20px rgba(56,189,248,0.2)} 50%{box-shadow:0 0 40px rgba(56,189,248,0.45)} }
                @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
                .hero-title { animation: heroFadeIn 1.1s cubic-bezier(0.16,1,0.3,1) 0.1s both; }
                .hero-sub { animation: heroFadeIn 1.1s cubic-bezier(0.16,1,0.3,1) 0.3s both; }
                .hero-ctas { animation: heroFadeIn 1.1s cubic-bezier(0.16,1,0.3,1) 0.5s both; }
                .scroll-bounce { animation: scrollBounce 1.8s ease-in-out infinite; }
                .gradient-text { background: linear-gradient(135deg,#38bdf8,#818cf8,#e879f9); background-size:200% 200%; animation: gradientShift 4s ease infinite; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
                .form-card { background: rgba(255,255,255,0.03); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); }
                .ticker-track { display:flex; width:max-content; animation: ticker 30s linear infinite; }
                .ticker-track:hover { animation-play-state: paused; }
                .card-hover { transition: transform 0.3s ease, box-shadow 0.3s ease; }
                .card-hover:hover { transform: translateY(-4px); box-shadow: 0 24px 48px rgba(0,0,0,0.5); }
                .session-card { transition: all 0.25s cubic-bezier(0.16,1,0.3,1); }
                .glow-btn { box-shadow: 0 0 0 rgba(56,189,248,0); transition: box-shadow 0.3s ease, transform 0.2s ease; }
                .glow-btn:hover { box-shadow: 0 0 30px rgba(56,189,248,0.4); transform: scale(1.02); }
                .glow-btn:active { transform: scale(0.98); }
            `}</style>

            <SEO
                title="AI落地師培訓班｜報名"
                description="2026年在 AI 崛起的年代你還沒跟上嗎？零基礎也能學會 AI 變現與行銷整合，實戰打造拓客工具與電子名片。"
                image={seoImage} url={seoUrl} type="website" appName="LionBaker"
            />

            {/* ══ HERO ══════════════════════════════════════════════ */}
            <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
                {/* Background */}
                <div className="absolute inset-0">
                    <img src="/bg.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center"
                        style={{ transform: `translateY(${parallaxOffset}px)`, willChange: 'transform', scale: '1.1' }} />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
                </div>

                {/* Ambient orbs */}
                <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] rounded-full bg-sky-500/10 blur-[120px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-violet-500/10 blur-[100px] pointer-events-none" />

                <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-20 pb-32">
                    {/* 首頁 hero 不放海報；海報固定排在下方「你會帶走」區塊之後 */}
                    <div className="max-w-3xl">
                        <div className="hero-title inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 backdrop-blur px-4 py-1.5 text-xs font-semibold text-sky-300 mb-8">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" style={{boxShadow:'0 0 8px #38bdf8'}}></span>
                            2026 AI 落地實戰 · 台灣唯一實作培訓
                        </div>

                        <h1 className="hero-title text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight text-white mb-6">
                            讓 AI 替你<br />
                            <span className="gradient-text">賺錢、拓客、成交</span>
                        </h1>

                        <p className="hero-sub text-xl sm:text-2xl text-zinc-300 leading-relaxed max-w-xl mb-10">
                            一天實作課，零基礎帶走可用工具。<br />
                            <span className="text-white font-semibold">不寫程式、不買主機</span>，只要會打字就能上手。
                        </p>

                        <div className="hero-ctas flex flex-wrap gap-4">
                            <a href="#signup-form" className="glow-btn inline-flex items-center justify-center rounded-2xl bg-sky-500 px-8 py-4 text-white font-bold text-lg shadow-xl">
                                立即報名
                                <svg className="ml-2 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </a>
                            <a href="#course" className="inline-flex items-center justify-center rounded-2xl bg-white/8 border border-white/15 backdrop-blur px-8 py-4 text-white font-bold text-lg hover:bg-white/12 transition-colors">
                                了解課程
                            </a>
                        </div>
                    </div>
                </div>

                {/* Scroll indicator */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50">
                    <span className="text-xs text-zinc-400 tracking-widest uppercase">Scroll</span>
                    <div className="scroll-bounce w-5 h-5 text-zinc-400">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
            </section>

            {/* ══ TICKER ════════════════════════════════════════════ */}
            <div className="py-4 bg-zinc-950 border-y border-zinc-800 overflow-hidden">
                <div className="ticker-track">
                    {[...Array(2)].map((_, i) => (
                        <div key={i} className="flex items-center gap-8 px-4">
                            {['零基礎也能學會', 'AI 落地實戰', '一天帶走可用工具', '不用寫程式', '立即可複製流程', '真實學員回饋', '拓客 · 成交 · 複製', '2026 限定場次'].map((t) => (
                                <span key={t} className="flex items-center gap-3 text-sm font-semibold text-zinc-500 whitespace-nowrap">
                                    <span className="w-1 h-1 rounded-full bg-sky-500/60 inline-block shrink-0" />
                                    {t}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* ══ STATS ════════════════════════════════════════════ */}
            <section className="py-24 bg-zinc-950">
                <div className="mx-auto max-w-6xl px-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { num: '1 天', label: '完整實作課程', sub: '從零到上線' },
                            { num: '零基礎', label: '無任何門檻', sub: '只要會打字' },
                            { num: '3 樣', label: '帶走實戰工具', sub: '可即時使用' },
                            { num: '複製', label: '可傳授的流程', sub: 'AI 落地方法論' },
                        ].map((s, i) => (
                            <Reveal key={s.num} delay={i * 80}>
                                <div className="card-hover rounded-3xl bg-zinc-900 border border-zinc-800 p-6 text-center">
                                    <div className="text-3xl font-black text-white mb-1">{s.num}</div>
                                    <div className="text-sm font-semibold text-zinc-300">{s.label}</div>
                                    <div className="text-xs text-zinc-600 mt-1">{s.sub}</div>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            {/* ══ MAIN CONTENT ══════════════════════════════════════ */}
            <section className="bg-black pb-24">
                <div className="mx-auto max-w-6xl px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

                        {/* ── Left: Course Info ─────────────────────── */}
                        <div id="course" className="space-y-8">

                            {signupReferralLocked && referralJoinActivityLuckyDraw ? (
                                <Reveal>
                                    <article
                                        id="mothers-day-lottery"
                                        className="rounded-3xl bg-black border border-[#5c1313]/55 shadow-xl shadow-black/40 overflow-hidden"
                                    >
                                        <div className="p-5 sm:p-6 pb-0">
                                            <div className="inline-flex items-center gap-2 rounded-full bg-[#4a0e0e]/90 border border-[#7f1d1d]/80 px-3 py-1 text-xs font-semibold text-white mb-4">
                                                母親節限定｜抽獎活動
                                            </div>
                                            <div className="rounded-2xl overflow-hidden border border-[#5c1313]/50 bg-[#0a0a0a]">
                                                <img
                                                    src="/mother.png"
                                                    alt="母親節抽獎活動海報"
                                                    className="w-full h-auto block"
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            </div>
                                        </div>
                                        <form onSubmit={handleLuckyDrawSubmit} className="p-5 sm:p-6 pt-6 flex flex-col gap-5 border-t border-[#d4af37]/25">
                                            <div>
                                                <p className="text-sm font-bold text-white mb-1 tracking-tight">抽獎登記</p>
                                                <p className="text-xs text-zinc-400 leading-relaxed">
                                                    下列送出僅適用<strong className="text-zinc-200">本區抽獎</strong>，
                                                    <strong className="text-zinc-200">不會替你送出底下的課程報名表</strong>；須報名課請另填右側表單。
                                                    <span className="block mt-2 text-[#fde68a]/95">
                                                        每人<strong className="text-white">限登記乙次</strong>；
                                                        若<strong className="text-white">手機或 Email（不比對大小寫）任一項</strong>已被使用過，
                                                        將無法再登記（<strong className="text-white">不分推薦連結／推薦碼</strong>）。
                                                    </span>
                                                </p>
                                            </div>

                                            {!luckyDrawDiscountCode ? (
                                                <div className="flex flex-col gap-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-zinc-200 mb-1.5">抽獎聯絡姓名 <span className="text-[#ff4d6d]">*</span></label>
                                                        <input
                                                            type="text"
                                                            value={luckyDrawName}
                                                            onChange={(e) => setLuckyDrawName(e.target.value)}
                                                            autoComplete="name"
                                                            placeholder="請輸入姓名"
                                                            className="w-full px-4 py-3 rounded-xl bg-[#121212] border border-[#5c1313]/45 text-white placeholder-zinc-600 focus:border-[#ff4d6d]/55 focus:ring-2 focus:ring-[#ff4d6d]/15 outline-none text-sm transition-colors"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold text-zinc-200 mb-1.5">Email <span className="text-[#ff4d6d]">*</span></label>
                                                        <input
                                                            type="email"
                                                            value={luckyDrawEmail}
                                                            onChange={(e) => setLuckyDrawEmail(e.target.value)}
                                                            autoComplete="email"
                                                            placeholder="name@example.com"
                                                            className="w-full px-4 py-3 rounded-xl bg-[#121212] border border-[#5c1313]/45 text-white placeholder-zinc-600 focus:border-[#ff4d6d]/55 focus:ring-2 focus:ring-[#ff4d6d]/15 outline-none text-sm transition-colors"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold text-zinc-200 mb-1.5">手機號碼 <span className="text-[#ff4d6d]">*</span></label>
                                                        <input
                                                            type="tel"
                                                            inputMode="numeric"
                                                            autoComplete="tel"
                                                            value={luckyDrawPhone}
                                                            onChange={handleLuckyDrawPhoneChange}
                                                            placeholder="0912345678（僅 10 碼數字）"
                                                            className="w-full px-4 py-3 rounded-xl bg-[#121212] border border-[#5c1313]/45 text-white placeholder-zinc-600 focus:border-[#ff4d6d]/55 focus:ring-2 focus:ring-[#ff4d6d]/15 outline-none text-sm transition-colors"
                                                        />
                                                    </div>
                                                </div>
                                            ) : null}
                                            {luckyDrawFeedback.text ? (
                                                <div
                                                    role="alert"
                                                    className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                                                        luckyDrawFeedback.tone === 'ok'
                                                            ? 'bg-emerald-950/40 border border-emerald-500/35 text-emerald-100'
                                                            : luckyDrawFeedback.tone === 'info'
                                                              ? 'bg-amber-950/35 border border-[#d4af37]/40 text-amber-100'
                                                              : luckyDrawFeedback.tone === 'err'
                                                                ? 'bg-[#4a0e0e]/35 border border-[#ff4d6d]/35 text-rose-100'
                                                                : 'border border-zinc-700 text-zinc-300'
                                                    }`}
                                                >
                                                    {luckyDrawFeedback.text}
                                                </div>
                                            ) : null}
                                            {luckyDrawDiscountCode ? (
                                                <div className="rounded-2xl border border-[#d4af37]/55 bg-[#422006]/25 px-4 py-4 flex flex-col gap-3">
                                                    <p className="text-xs font-bold text-[#fde047] tracking-wider">
                                                        {luckyDrawAlreadyRegistered ? '您的登記折扣碼' : '您的專屬折扣碼'}
                                                    </p>
                                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                        <p className="flex-1 font-mono text-2xl sm:text-[1.65rem] font-black tracking-[0.2em] text-white text-center sm:text-left break-all">
                                                            {luckyDrawDiscountCode}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    await navigator.clipboard.writeText(luckyDrawDiscountCode);
                                                                    setLuckyDrawCodeCopied(true);
                                                                    window.setTimeout(() => setLuckyDrawCodeCopied(false), 2200);
                                                                } catch {
                                                                    setLuckyDrawCodeCopied(false);
                                                                }
                                                            }}
                                                            className="shrink-0 rounded-xl border border-[#ff4d6d]/45 bg-[#ff4d6d]/15 hover:bg-[#ff4d6d]/25 text-[#fda4af] font-bold text-sm px-5 py-3 transition-colors"
                                                        >
                                                            {luckyDrawCodeCopied ? '已複製' : '複製折扣碼'}
                                                        </button>
                                                    </div>
                                                    {luckyDrawDiscountExpiresAt ? (
                                                        <p className="text-xs text-[#fde68a]/95 leading-relaxed">
                                                            <span className="font-semibold text-white">使用期限：</span>
                                                            {formatLuckyDrawExpiryZh(luckyDrawDiscountExpiresAt)} 前（登記日起算 30 日內須使用）
                                                        </p>
                                                    ) : null}
                                                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                                                        {luckyDrawAlreadyRegistered
                                                            ? '此為您先前登記所核發之折扣碼。如需確認信可點選下方重寄。'
                                                            : '請保存此碼；確認信已寄至您登記的 Email。'}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        disabled={luckyDrawResendBusy || !luckyDrawContactLocked}
                                                        onClick={handleLuckyDrawResendEmail}
                                                        className="w-full rounded-xl border border-[#d4af37]/50 bg-[#422006]/40 hover:bg-[#422006]/60 text-[#fde047] font-bold text-sm py-3 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        {luckyDrawResendBusy ? '寄送中…' : '重新寄送確認信至 Email'}
                                                    </button>
                                                </div>
                                            ) : null}
                                            <button
                                                type="submit"
                                                disabled={luckyDrawSubmitting || !!luckyDrawDiscountCode}
                                                className="w-full rounded-2xl bg-gradient-to-r from-[#7f1d1d] to-[#991b1b] hover:from-[#991b1b] hover:to-[#b91c1c] border border-[#5c1313]/80 text-white font-black text-base py-3.5 shadow-lg shadow-[#450a0a]/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {luckyDrawSubmitting ? '送出中…' : luckyDrawDiscountCode ? '已完成登記' : '登記抽獎'}
                                            </button>
                                        </form>
                                    </article>
                                </Reveal>
                            ) : null}

                            {/* Course intro */}
                            <Reveal>
                                <article className="rounded-3xl bg-zinc-900 border border-zinc-800 p-7">
                                    <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 border border-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-400 mb-4">課程核心</div>
                                    <h2 className="text-2xl font-black text-white mb-4">你來對了</h2>
                                    <p className="text-zinc-400 leading-relaxed mb-6">
                                        2026 年，AI 已經不是「未來的技術」，而是<span className="text-white font-semibold">現在能賺錢的工具</span>。這堂課只有一個目標：讓你帶著<span className="text-white font-semibold">可用的成果</span>回家，而不是一肚子「應該很有用」的知識。
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {[
                                            { icon: '⚡', title: '當天實作', desc: '課堂完成你的電子名片與拓客工具，不帶未完成的作業回家' },
                                            { icon: '🎯', title: '精準落地', desc: '依你的產業情境客製，不是通用範例，而是你的實際工具' },
                                            { icon: '♾️', title: '流程可複製', desc: '學會「AI 落地方法論」，往後每個需求都能自己解決' },
                                            { icon: '🚀', title: '立即上線', desc: '不需要主機、不需要工程師，手機就能部署上線' },
                                        ].map((item, i) => (
                                            <Reveal key={item.title} delay={i * 60} direction="up">
                                                <div className="rounded-2xl bg-zinc-800/60 border border-zinc-700/50 p-4">
                                                    <div className="text-xl mb-2">{item.icon}</div>
                                                    <p className="font-bold text-white text-sm mb-1">{item.title}</p>
                                                    <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                                                </div>
                                            </Reveal>
                                        ))}
                                    </div>
                                </article>
                            </Reveal>

                            {/* What you'll take home */}
                            <Reveal>
                                <article className="rounded-3xl bg-gradient-to-br from-sky-950/60 to-violet-950/60 border border-sky-500/20 p-7">
                                    <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 border border-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-400 mb-4">你會帶走</div>
                                    <h2 className="text-xl font-black text-white mb-5">三樣實戰成果，當天完成</h2>
                                    <div className="space-y-3">
                                        {[
                                            { n: '01', title: '你的專屬電子名片', desc: '可展示、可分享、可引導成交的高科技名片，結合 NFC 貼片現場製作' },
                                            { n: '02', title: '產業拓客工具', desc: '依你的行業量身打造，讓 AI 幫你做客戶開發，可直接拿來用' },
                                            { n: '03', title: 'AI 落地流程手冊', desc: '從需求拆解 → 提示詞 → 產出 → 整合 → 上線，完整可複製方法論' },
                                        ].map((item, i) => (
                                            <Reveal key={item.n} delay={i * 80} direction="left">
                                                <div className="flex gap-4 items-start rounded-2xl bg-white/4 border border-white/6 p-4">
                                                    <div className="shrink-0 w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center font-black text-sky-400 text-xs">{item.n}</div>
                                                    <div>
                                                        <p className="font-bold text-white mb-0.5">{item.title}</p>
                                                        <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
                                                    </div>
                                                </div>
                                            </Reveal>
                                        ))}
                                    </div>
                                </article>
                            </Reveal>

                            {/* 活動海報：固定緊接「你會帶走」版塊（全解析度同一位置） */}
                            <Reveal>
                                <div className="rounded-3xl overflow-hidden shadow-2xl border border-zinc-800">
                                    <img src={posterSrc} alt="AI落地師培訓班活動海報" className="w-full h-auto" loading="lazy" />
                                </div>
                            </Reveal>

                            {/* Curriculum */}
                            <Reveal>
                                <article className="rounded-3xl bg-zinc-900 border border-zinc-800 p-7">
                                    <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 border border-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-400 mb-4">課程流程</div>
                                    <h2 className="text-xl font-black text-white mb-5">一天，七個關鍵時刻</h2>
                                    <ol className="space-y-2">
                                        {[
                                            { title: '打開大腦・升級思維', desc: '2026 年最值錢的不是技術，是你如何思考 AI 能為你做什麼' },
                                            { title: 'AI 落地案例大賞', desc: '跨產業的實際應用案例，找到你能立刻抄作業的靈感' },
                                            { title: '免寫程式・也能做出程式', desc: '用可複製的對話框架，讓 AI 幫你生成完整功能' },
                                            { title: '超簡單部署上線', desc: '手機就能完成，不需要電腦、不需要主機、不需要工程師' },
                                            { title: 'LINE 貼圖實作', desc: '用 AI 設計你的吸睛品牌貼圖，完整教學到上架流程' },
                                            { title: 'NFC 高科技電子名片', desc: '一碰手機就跳出你的名片頁面，讓客戶留下深刻印象' },
                                            { title: '短影音腳本生成器', desc: '用工具批量產出短影音腳本，解決你最頭痛的內容問題' },
                                        ].map((step, idx) => (
                                            <Reveal key={step.title} delay={idx * 50}>
                                                <li className="flex gap-3 rounded-2xl bg-zinc-800/50 border border-zinc-700/40 p-4 hover:border-zinc-600/60 transition-colors">
                                                    <div className="shrink-0 w-8 h-8 rounded-xl bg-zinc-700 flex items-center justify-center font-black text-zinc-300 text-xs">{idx + 1}</div>
                                                    <div>
                                                        <p className="font-bold text-white text-sm">{step.title}</p>
                                                        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{step.desc}</p>
                                                    </div>
                                                </li>
                                            </Reveal>
                                        ))}
                                    </ol>
                                    <div className="mt-5 rounded-2xl bg-zinc-800/60 border border-zinc-700/40 p-4">
                                        <p className="text-xs font-bold text-zinc-400 mb-2">提醒與規則</p>
                                        <p className="text-xs text-zinc-600">未達開班人數，課程將視情況延班；可選擇延班或全額退款。</p>
                                    </div>
                                </article>
                            </Reveal>

                            {/* Video Testimonials */}
                            <Reveal>
                                <article className="rounded-3xl bg-zinc-900 border border-zinc-800 p-7">
                                    <div className="flex items-start justify-between gap-3 mb-5">
                                        <div>
                                            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 mb-3">學員真心話</div>
                                            <h2 className="text-xl font-black text-white">他們說的，比我說的更真</h2>
                                        </div>
                                        <button type="button" onClick={() => setIsVideoMuted(false)}
                                            className={`shrink-0 rounded-2xl border px-3 py-1.5 text-xs font-bold transition-all ${isVideoMuted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                                            {isVideoMuted ? '🔇 開聲音' : '🔊 已開聲'}
                                        </button>
                                    </div>
                                    <div className={`grid gap-4 ${landingYoutubeVideos.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2'}`}>
                                        {landingYoutubeVideos.length === 0 ? (
                                            <p className="text-sm text-zinc-500 py-6 text-center">尚未設定學員回饋影片，請洽主辦或稍後再試。</p>
                                        ) : (
                                            landingYoutubeVideos.map((v, idx) => (
                                                <div key={`${v.videoId}-${idx}`} className="overflow-hidden rounded-2xl bg-zinc-800">
                                                    <p className="px-3 py-2 text-xs font-bold text-zinc-400">{v.label}</p>
                                                    <div style={{ position: 'relative', paddingTop: '177.78%' }}>
                                                        <iframe
                                                            key={`${v.videoId}-${isVideoMuted}`}
                                                            src={buildYoutubeShortEmbedSrc(v.videoId, { muted: isVideoMuted, autoplay: idx === 0 })}
                                                            loading={idx === 0 ? 'eager' : 'lazy'}
                                                            style={{ border: 0, position: 'absolute', top: 0, height: '100%', width: '100%' }}
                                                            title={v.label}
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                            referrerPolicy="strict-origin-when-cross-origin"
                                                            allowFullScreen
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </article>
                            </Reveal>
                        </div>

                        {/* ── Right: Signup Form ────────────────────── */}
                        <div id="signup-form" className="lg:sticky lg:top-6">
                            <Reveal direction="right">
                                <div className="rounded-3xl bg-zinc-950 border border-zinc-800 overflow-hidden" style={{boxShadow:'0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px rgba(0,0,0,0.6)'}}>
                                    <div className="bg-gradient-to-r from-sky-600 to-violet-600 px-6 py-5">
                                        <h2 className="text-xl font-black text-white">立即報名</h2>
                                        <p className="text-sky-100/80 text-sm mt-1">填寫資料完成報名，我們將以您提供的資訊進行確認。</p>
                                    </div>

                                    <form onSubmit={handleSubmit} className="p-5 sm:p-6 flex flex-col gap-5">

                                        {/* 母親節抽獎折扣碼（正課折抵；套用後鎖定複訓並帶入聯絡資料） */}
                                        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                                            <label className="block text-sm font-bold text-emerald-300 mb-2">母親節活動折扣碼（選填）</label>
                                            <p className="text-xs text-zinc-500 mb-3 leading-relaxed">
                                                若您已完成母親節抽獎登記並取得折扣碼，請輸入後按「套用」。將折抵正課費用並自動帶入姓名／手機／Email；<strong className="text-zinc-400">限正課</strong>，複訓將無法選取。
                                            </p>
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    type="text"
                                                    value={courseDiscountInput}
                                                    onChange={(e) => setCourseDiscountInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                                                    placeholder="8 碼英數字"
                                                    autoComplete="off"
                                                    className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 font-mono tracking-wider focus:border-emerald-500/50 outline-none text-sm"
                                                />
                                                <div className="flex gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={handleApplyCourseDiscount}
                                                        disabled={courseDiscountLoading}
                                                        className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 text-sm disabled:opacity-50"
                                                    >
                                                        {courseDiscountLoading ? '驗證中…' : '套用'}
                                                    </button>
                                                    {courseDiscountVerified ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => { clearCourseDiscount(); setCourseDiscountInput(''); }}
                                                            className="rounded-xl border border-zinc-600 text-zinc-300 font-semibold px-4 py-3 text-sm hover:bg-zinc-800"
                                                        >
                                                            移除
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {courseDiscountError ? (
                                                <p className="mt-2 text-xs text-rose-400">{courseDiscountError}</p>
                                            ) : null}
                                            {courseDiscountVerified ? (
                                                <p className="mt-2 text-xs text-emerald-400/90">
                                                    已套用：正課折抵 {courseDiscountAmountNtd.toLocaleString()} 元（場次列表已顯示折後價）。
                                                </p>
                                            ) : null}
                                        </div>

                                        {/* Session Selection */}
                                        <div>
                                            <label className="block text-sm font-semibold text-zinc-300 mb-3">選擇場次 <span className="text-rose-400">*</span></label>
                                            {sessionsError && <div className="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-xl">{sessionsError}</div>}
                                            {sessionsLoading ? (
                                                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">正在載入場次...</div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-3">
                                                    {sessions.map(session => {
                                                        const isFull = (session.currentCount || 0) >= (session.maxCapacity || 50);
                                                        const rMax = Number(session.refresherMaxCapacity) > 0 ? Number(session.refresherMaxCapacity) : DEFAULT_REFRESHER_MAX;
                                                        const rCount = session.refresherCurrentCount || 0;
                                                        const isRefresherFull = rCount >= rMax;
                                                        const isSelected = selectedSessionId === session.id;
                                                        return (
                                                            <div key={session.id} role="button" tabIndex={0}
                                                                className={`session-card relative border rounded-2xl p-4 cursor-pointer outline-none ${isSelected ? 'border-sky-500/60 bg-sky-500/6' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40'}`}
                                                                onClick={() => handleSessionSelect(session.id)}
                                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSessionSelect(session.id); }}>
                                                                <div className="flex justify-between items-center mb-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-2 h-2 rounded-full ${isFull ? 'bg-amber-400' : isSelected ? 'bg-sky-400' : 'bg-zinc-600'}`} style={isSelected ? {boxShadow:'0 0 8px #38bdf8'} : {}}></div>
                                                                        <span className="font-bold text-white text-sm">{session.displayDate}</span>
                                                                    </div>
                                                                    {isFull ? <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-lg border border-amber-500/20">額滿候補</span>
                                                                        : isSelected ? <span className="text-xs bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-lg border border-sky-500/20">已選擇</span> : null}
                                                                </div>
                                                                <div className="pl-4">
                                                                    <div className="text-zinc-300 font-semibold text-sm mb-1.5">{session.title || 'AI落地師培訓班'}</div>
                                                                    {!!session.note && <div className="mb-2 rounded-xl bg-zinc-800/60 border border-zinc-700/40 px-3 py-2 text-xs text-zinc-400"><span className="whitespace-pre-line">{session.note}</span></div>}
                                                                    <div className="text-xs text-zinc-500 mb-2 flex items-start gap-1.5">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 mt-0.5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                        <span>{session.location}<br /><span className="text-zinc-600">{session.address}</span></span>
                                                                    </div>
                                                                    <div className="flex justify-between items-end">
                                                                        <div className="flex items-baseline gap-2 flex-wrap">
                                                                            <span className={`text-xl font-black ${courseDiscountVerified ? 'text-emerald-400' : 'text-sky-400'}`}>
                                                                                ${computeMainPriceAfterDiscount(session.price).toLocaleString()}
                                                                            </span>
                                                                            {courseDiscountVerified && (
                                                                                <span className="text-sm text-zinc-500 line-through">${Number(session.price || 0).toLocaleString()}</span>
                                                                            )}
                                                                            {!!session.originalPrice && <span className="text-xs text-zinc-600 line-through">原價 ${session.originalPrice?.toLocaleString()}</span>}
                                                                        </div>
                                                                        <div className="text-xs text-zinc-600">{isFull ? <span className="text-amber-400">已額滿，報名排備取</span> : `正課名額：剩 ${(session.maxCapacity || 50) - (session.currentCount || 0)} 位`}</div>
                                                                    </div>
                                                                    <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
                                                                        <div>
                                                                            <p className="text-xs font-bold text-emerald-400">複訓報名</p>
                                                                            <p className="text-sm font-black text-emerald-300 mt-0.5">${REFRESHER_FEE.toLocaleString()} 現場繳費</p>
                                                                        </div>
                                                                        <div className="text-xs text-zinc-600">{isRefresherFull ? <span className="text-amber-400">複訓額滿，可排備取</span> : `複訓可收：剩 ${rMax - rCount} / ${rMax} 人`}</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION && (
                                                        <div role="button" tabIndex={0}
                                                            className={`session-card relative border rounded-2xl p-4 cursor-pointer outline-none ${selectedSessionId === 'time_not_available' ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40'}`}
                                                            onClick={() => handleSessionSelect('time_not_available')}
                                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSessionSelect('time_not_available'); }}>
                                                            <div className="flex justify-between items-center mb-1">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-2 h-2 rounded-full ${selectedSessionId === 'time_not_available' ? 'bg-emerald-400' : 'bg-zinc-600'}`}></div>
                                                                    <span className="font-bold text-white text-sm">以上場次時間無法配合</span>
                                                                </div>
                                                                {selectedSessionId === 'time_not_available' && <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20">已選擇</span>}
                                                            </div>
                                                            <div className="pl-4 text-xs text-zinc-500">勾選後請填寫您希望的開課時間與地點，方便我們統計加開場次。</div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Registration Kind */}
                                        {!formData.isTimeNotAvailable && selectedSessionId && selectedSessionId !== 'time_not_available' && (
                                            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
                                                <p className="text-sm font-bold text-zinc-300 mb-3">報名類型 <span className="text-rose-400">*</span></p>
                                                <div className="flex flex-col gap-2">
                                                    <label className={`flex items-start gap-3 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 p-3 has-[:checked]:border-sky-500/50 has-[:checked]:bg-sky-500/5 transition-colors ${courseDiscountVerified ? 'ring-1 ring-emerald-500/30' : ''}`}>
                                                        <input type="radio" name="registrationKind" className="mt-1 h-4 w-4" checked={formData.registrationKind === 'main'} onChange={() => setFormData(prev => ({ ...prev, registrationKind: 'main' }))} />
                                                        <span><span className="block font-bold text-white text-sm">正課</span><span className="block text-xs text-zinc-500 mt-0.5">匯款報名，依本場次公告金額繳交。</span></span>
                                                    </label>
                                                    <label className={`flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 transition-colors ${courseDiscountVerified ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-500/5'}`}>
                                                        <input type="radio" name="registrationKind" className="mt-1 h-4 w-4" disabled={courseDiscountVerified} checked={formData.registrationKind === 'refresher'} onChange={() => setFormData((prev) => ({ ...prev, registrationKind: 'refresher', invoiceType: 'general', taxId: '' }))} />
                                                        <span><span className="block font-bold text-white text-sm">複訓</span><span className="block text-xs text-zinc-500 mt-0.5">費用 {REFRESHER_FEE} 元、當天現場繳交。本場次可收 {selectedRefresherMax} 人。</span></span>
                                                    </label>
                                                    {courseDiscountVerified ? (
                                                        <p className="text-xs text-amber-400/90">已套用母親節折扣，僅能選擇正課。</p>
                                                    ) : null}
                                                </div>
                                                {formData.registrationKind === 'refresher' && (
                                                    <div className="mt-4">
                                                        <label className="block text-sm font-semibold text-zinc-300 mb-1">前次參加場次 <span className="text-rose-400">*</span></label>
                                                        <p className="text-xs text-zinc-600 mb-2">僅列出主辦已「關閉報名」的梯次。</p>
                                                        <select className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none disabled:opacity-50 text-sm"
                                                            value={formData.previousSessionId} onChange={(e) => setFormData((prev) => ({ ...prev, previousSessionId: e.target.value }))} required disabled={closedSessionsForRefresherLoading}>
                                                            <option value="">{closedSessionsForRefresherLoading ? '載入歷史梯次中…' : '請選擇曾參加之場次'}</option>
                                                            {previousSessionOptions.map((s) => <option key={s.id} value={s.id}>{formatRefresherPreviousLabel(s)}</option>)}
                                                        </select>
                                                        {!closedSessionsForRefresherLoading && previousSessionOptions.length === 0 && <p className="text-xs text-amber-400 mt-2">尚無「關閉報名」之梯次；請聯絡主辦協助。</p>}
                                                    </div>
                                                )}
                                            </section>
                                        )}

                                        {/* Wish Fields */}
                                        {SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION && formData.isTimeNotAvailable && (
                                            <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                                                <p className="text-sm font-bold text-emerald-400 mb-4">許願開課資訊</p>
                                                <div className="flex flex-col gap-4">
                                                    <div>
                                                        <label className="block text-sm font-semibold text-zinc-300 mb-1">許願開課時間 <span className="text-rose-400">*</span></label>
                                                        <input type="text" name="wishTime" value={formData.wishTime} onChange={handleChange} required={formData.isTimeNotAvailable} placeholder="請輸入您可以的日期時間" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold text-zinc-300 mb-1">許願開課地點 <span className="text-rose-400">*</span></label>
                                                        <input type="text" name="wishLocation" value={formData.wishLocation} onChange={handleChange} required={formData.isTimeNotAvailable} placeholder="請輸入您希望的開課地點" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm" />
                                                    </div>
                                                </div>
                                            </section>
                                        )}

                                        {/* Name */}
                                        <div>
                                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">真實姓名 <span className="text-rose-400">*</span></label>
                                            <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="請輸入您的姓名" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 outline-none text-sm transition-colors" />
                                        </div>

                                        {/* Phone */}
                                        <div>
                                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">手機號碼 <span className="text-rose-400">*</span></label>
                                            <input type="tel" name="phone" value={formData.phone} onChange={handlePhoneChange} required inputMode="numeric" autoComplete="tel-national" placeholder="0912345678（僅 10 碼數字）" maxLength={10} className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 outline-none text-sm transition-colors" />
                                        </div>

                                        {/* Email */}
                                        <div>
                                            <label className="block text-sm font-semibold text-zinc-300 mb-1.5">Email <span className="text-rose-400">*</span></label>
                                            <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="name@example.com" autoComplete="email" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 outline-none text-sm transition-colors" />
                                        </div>

                                        {/* Invoice */}
                                        {!formData.isTimeNotAvailable && formData.registrationKind === 'main' && (
                                            <div>
                                                <p className="text-sm font-semibold text-zinc-300 mb-3">電子發票 <span className="text-rose-400">*</span></p>
                                                <div className="flex gap-3">
                                                    <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 has-[:checked]:border-sky-500/50 has-[:checked]:bg-sky-500/5 transition-colors">
                                                        <input type="radio" name="invoiceType" className="h-4 w-4" checked={formData.invoiceType === 'general'} onChange={() => setFormData(prev => ({ ...prev, invoiceType: 'general', taxId: '' }))} />
                                                        <span className="text-sm text-zinc-300">一般發票</span>
                                                    </label>
                                                    <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 has-[:checked]:border-sky-500/50 has-[:checked]:bg-sky-500/5 transition-colors">
                                                        <input type="radio" name="invoiceType" className="h-4 w-4" checked={formData.invoiceType === 'tax_id'} onChange={() => setFormData(prev => ({ ...prev, invoiceType: 'tax_id' }))} />
                                                        <span className="text-sm text-zinc-300">統一編號</span>
                                                    </label>
                                                </div>
                                                {formData.invoiceType === 'tax_id' && (
                                                    <div className="mt-3">
                                                        <label className="block text-sm font-semibold text-zinc-300 mb-1.5">統一編號 <span className="text-rose-400">*</span></label>
                                                        <input type="text" inputMode="numeric" value={formData.taxId} onChange={handleTaxIdInput} maxLength={8} placeholder="8 碼數字" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 tracking-widest focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 outline-none text-sm" />
                                                        <p className="text-xs text-zinc-600 mt-1">僅能輸入 8 碼數字，送出前會驗證統編規則。</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Source */}
                                        {signupRefUrlNotice && (formData.isTimeNotAvailable || formData.registrationKind === 'main') && (
                                            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                                                {signupRefUrlNotice}
                                            </div>
                                        )}
                                        {(formData.isTimeNotAvailable || formData.registrationKind === 'main') && signupReferralLocked && (
                                            <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-sky-300">
                                                <p className="font-semibold text-sky-200 mb-0.5">推薦人 / 來源（已由連結帶入）</p>
                                                <p className="text-zinc-300">{signupReferralMeta?.referrerName || formData.source}</p>
                                            </div>
                                        )}
                                        {(formData.isTimeNotAvailable || formData.registrationKind === 'main') && !signupReferralLocked && (
                                            <div>
                                                <label className="block text-sm font-semibold text-zinc-300 mb-3">推薦人 / 來源 <span className="text-rose-400">*</span></label>
                                                <div className="grid grid-cols-2 gap-2 mb-2">
                                                    <button type="button" onClick={() => setSourceOption('嘉吉老師')} className={`p-3 rounded-xl border text-sm font-semibold transition-all ${sourceOption === '嘉吉老師' ? 'bg-sky-500 border-sky-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>嘉吉老師</button>
                                                    <button type="button" onClick={() => setSourceOption('Rich老師')} className={`p-3 rounded-xl border text-sm font-semibold transition-all ${sourceOption === 'Rich老師' ? 'bg-white border-white text-black' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>Rich老師</button>
                                                </div>
                                                <button type="button" onClick={() => setSourceOption('Other')} className={`w-full p-3 rounded-xl border text-sm font-semibold transition-all mb-2 ${sourceOption === 'Other' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}>其他</button>
                                                {sourceOption === 'Other' && (
                                                    <input type="text" value={customSource} onChange={(e) => setCustomSource(e.target.value)} required={sourceOption === 'Other'} placeholder="請填寫推薦人或來源（例如：FB廣告）" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-600 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 outline-none text-sm transition-colors" />
                                                )}
                                            </div>
                                        )}

                                        {/* Refresher payment notice */}
                                        {!formData.isTimeNotAvailable && formData.registrationKind === 'refresher' && (
                                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
                                                <p className="font-bold text-base text-emerald-400 mb-1">複訓費用 {REFRESHER_FEE} 元</p>
                                                <p className="text-xs text-emerald-400/70">請於上課當天現場繳交現金，無須匯款後五碼。</p>
                                            </div>
                                        )}

                                        {/* Payment / lastFive */}
                                        {!formData.isTimeNotAvailable && formData.registrationKind === 'main' && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-semibold text-zinc-300 mb-2">付款方式 <span className="text-rose-400">*</span></label>
                                                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-center text-sm font-semibold text-sky-400">轉帳匯款</div>
                                                </div>
                                                <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5">
                                                    <p className="text-sm font-bold text-zinc-300 mb-3 flex items-center gap-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                                        匯款資訊
                                                    </p>
                                                    <div className="space-y-2 text-sm mb-4">
                                                        <div className="flex justify-between gap-4"><span className="text-zinc-600">銀行代碼</span><span className="font-semibold text-zinc-300">國泰世華 (013)</span></div>
                                                        <div className="flex justify-between gap-4"><span className="text-zinc-600">分行</span><span className="font-semibold text-zinc-300">敦化分行</span></div>
                                                        <div className="flex justify-between gap-4"><span className="text-zinc-600">戶名</span><span className="font-semibold text-zinc-300">焙獅健康顧問有限公司</span></div>
                                                        <div className="mt-2 pt-3 border-t border-zinc-800 text-center">
                                                            <span className="block text-xs text-zinc-600 mb-1">匯款帳號</span>
                                                            <span className="text-xl font-black text-sky-400 select-all tracking-widest">212035012017</span>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-semibold text-zinc-300 mb-2">匯款帳號後五碼 <span className="text-rose-400">*</span></label>
                                                        <div className="relative">
                                                            <input type="text" name="lastFive" value={formData.lastFive} onChange={handleChange} required maxLength={5} placeholder="XXXXX" className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-700 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/15 outline-none tracking-[0.5em] text-center text-lg transition-colors" />
                                                            <div className="absolute right-3 top-3.5 text-xs text-zinc-600">{formData.lastFive.length}/5</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* Error */}
                                        {error && <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl text-center">{error}</div>}

                                        {/* Submit */}
                                        <button type="submit" disabled={loading} className="glow-btn w-full bg-gradient-to-r from-sky-500 to-sky-600 text-white font-bold py-4 px-4 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base">
                                            {loading ? (
                                                <>
                                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                                    <span>請稍候...</span>
                                                </>
                                            ) : <span>確認報名</span>}
                                        </button>
                                    </form>
                                    <div className="px-6 pb-5 text-center text-zinc-700 text-xs">&copy; 2026 LionBaker</div>
                                </div>
                            </Reveal>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
};

export default Signup;
