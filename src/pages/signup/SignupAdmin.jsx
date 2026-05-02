import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { auth, functions, googleProvider, db, storage } from '../../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
    SIGNUP_LANDING_COLLECTION,
    SIGNUP_LANDING_DOC_ID,
    DEFAULT_SIGNUP_LANDING,
    normalizeSignupLandingData,
    extractYoutubeVideoId,
    resolvePosterSrc,
    SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION,
    VIBE_REFERRAL_CODES_COLLECTION,
} from './signupLandingShared';

const ADMIN_EMAIL = 'charge0528@gmail.com';

/** 報到 QR 連結一律使用此生產網域（勿跟瀏覽器網址列走 firebase hosting 預設網域） */
const PUBLIC_SIGNUP_CHECKIN_ORIGIN = 'https://ai.lionbaker.com';

const REFERRAL_SIGNUP_PUBLIC_PATH = '/signup';
const REFERRAL_CODE_LEN = 8;
const REFERRAL_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function randomSignupRefCode8() {
    let out = '';
    const buf = new Uint8Array(REFERRAL_CODE_LEN);
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(buf);
        for (let i = 0; i < REFERRAL_CODE_LEN; i++) {
            out += REFERRAL_CODE_CHARS[buf[i] % REFERRAL_CODE_CHARS.length];
        }
    } else {
        for (let i = 0; i < REFERRAL_CODE_LEN; i++) {
            out += REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)];
        }
    }
    return out;
}

function mapReferralSnapshotToRows(snap) {
    const rows = snap.docs.map((x) => {
        const data = x.data() || {};
        return {
            code: x.id,
            referrerName: String(data.referrerName || ''),
            upperReferrerName: String(data.upperReferrerName || ''),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        };
    });
    rows.sort((a, b) => {
        const ta =
            (typeof a.updatedAt?.toMillis === 'function' ? a.updatedAt.toMillis() : 0) ||
            (typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0);
        const tb =
            (typeof b.updatedAt?.toMillis === 'function' ? b.updatedAt.toMillis() : 0) ||
            (typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0);
        return tb - ta;
    });
    return rows;
}

function buildReferralPublicUrl(code) {
    const c = String(code || '').trim();
    return `${PUBLIC_SIGNUP_CHECKIN_ORIGIN}${REFERRAL_SIGNUP_PUBLIC_PATH}?ref=${encodeURIComponent(c)}`;
}

const REFRESHER_FEE = 500;
const DEFAULT_REFRESHER_MAX = 10;
const PAYEE_OPTIONS = ['', '嘉吉', '偉志', '白白'];

/** 舊資料僅有合併於 source 時，還原「推薦人／上層」 */
const splitMergedReferrerSource = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return { referrerName: '', upperReferrerName: '' };
    const m = s.match(/^(.+?)（上層：(.+)）$/);
    if (m) return { referrerName: String(m[1]).trim(), upperReferrerName: String(m[2]).trim() };
    return { referrerName: s, upperReferrerName: '' };
};

function getRegistrationReferrerParts(reg) {
    const docR = String(reg.referrerName ?? '').trim();
    const docU = String(reg.upperReferrerName ?? '').trim();
    if (docR || docU) return { referrerName: docR, upperReferrerName: docU };
    return splitMergedReferrerSource(reg.source || '');
}

/** 後台儲存時同步寫入合併摘要欄 source（與舊匯出相容） */
const buildMergedReferrerSourceField = (referrerName, upperReferrerName) => {
    const r = String(referrerName ?? '').trim();
    const u = String(upperReferrerName ?? '').trim();
    if (!r) return '';
    return u ? `${r}（上層：${u}）` : r;
};

/** 複訓名單「前次報名場次」欄（與報名寫入之 title / 日期 對齊） */
const getRefresherPreviousSessionText = (reg) => {
    if (!reg) return '—';
    const t = (reg.previousSessionTitle || '').trim();
    if (t) return t;
    if (reg.previousSessionDate) {
        const d = new Date(reg.previousSessionDate);
        if (!Number.isNaN(d.getTime())) {
            const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
            return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${wk}）`;
        }
        return String(reg.previousSessionDate);
    }
    return '—';
};

/**
 * 複訓身份檢查：依學員填報的「前次場次」對應 vibe_sessions 文件 ID。
 * 優先 previousSessionId；舊資料無 ID 時再以 previousSessionTitle（及同標題多場時配合 previousSessionDate）推斷。
 */
const resolveRefresherCompareSessionId = (reg, sessionList) => {
    const pid = reg.previousSessionId != null ? String(reg.previousSessionId).trim() : '';
    if (pid) return pid;

    const title = (reg.previousSessionTitle || '').trim();
    if (!title) return '';

    const normTitle = (t) => String(t || '').trim();
    const hits = sessionList.filter((s) => normTitle(s.title) === title);

    if (hits.length === 1) return hits[0].id;

    if (hits.length > 1 && reg.previousSessionDate) {
        const targetMs = new Date(reg.previousSessionDate).getTime();
        if (!Number.isNaN(targetMs)) {
            let bestId = '';
            let bestDiff = Infinity;
            for (const h of hits) {
                const ms = new Date(h.date).getTime();
                if (Number.isNaN(ms)) continue;
                const diff = Math.abs(ms - targetMs);
                if (diff < bestDiff) {
                    bestDiff = diff;
                    bestId = h.id;
                }
            }
            if (bestId) return bestId;
        }
    }

    return hits[0]?.id || '';
};

/** 身份比對用：去空白、轉小寫、手機僅留數字 */
const normalizeIdentityText = (value) => String(value || '').trim().toLowerCase();
const normalizePhoneDigits = (value) => String(value || '').replace(/\D/g, '');

const SignupAdmin = () => {
    const isDev = import.meta?.env?.DEV;
    const isMockMode = isDev && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === '1';

    const [adminEmail, setAdminEmail] = useState(null);
    const isAdmin = !!adminEmail || isMockMode;
    const [viewMode, setViewMode] = useState('sessions'); // 'sessions', 'registrations', 'landing'
    const [sessions, setSessions] = useState([]);
    const [registrations, setRegistrations] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    /** 報名名單：正課 main / 複訓 refresher（僅有場次之場次） */
    const [registrationListTab, setRegistrationListTab] = useState('main');

    // UI State
    const [loading, setLoading] = useState(true);
    const [opLoading, setOpLoading] = useState(false);
    const [error, setError] = useState('');

    // Modal State: Create Session
    const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
    const [newSession, setNewSession] = useState({
        title: 'AI落地師培訓班',
        date: '',
        time: '10:00',
        endTime: '16:00',
        location: 'TOP SPACE商務中心',
        address: '臺中市中區民族路23號3樓',
        price: 3980,
        originalPrice: 5000,
        maxCapacity: 20,
        note: '',
        isSignupOpen: true,
        refresherMaxCapacity: DEFAULT_REFRESHER_MAX
    });

    // Modal State: Edit Session
    const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
    const [sessionToEdit, setSessionToEdit] = useState(null);
    const [editSessionForm, setEditSessionForm] = useState({
        title: '',
        date: '',
        time: '',
        endTime: '',
        location: '',
        address: '',
        price: 0,
        originalPrice: 0,
        maxCapacity: 50,
        note: '',
        status: 'open',
        isSignupOpen: true,
        refresherMaxCapacity: DEFAULT_REFRESHER_MAX
    });

    // Modal State: Edit Registration
    const [isEditRegOpen, setIsEditRegOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [editForm, setEditForm] = useState({
        status: '',
        paymentMethod: '',
        receivedAmount: 0,
        adminNote: '',
        sessionId: '',
        payee: '',
        invoiceType: 'general',
        taxId: '',
        referrerName: '',
        upperReferrerName: '',
    });
    const [identityVerifiedMap, setIdentityVerifiedMap] = useState({});

    /** 報名頁設定（Firestore + Storage 海報） */
    const [landingDraft, setLandingDraft] = useState(null);
    const [landingLoadError, setLandingLoadError] = useState('');
    const [landingSaving, setLandingSaving] = useState(false);
    const [landingUploading, setLandingUploading] = useState(false);
    const [landingMsg, setLandingMsg] = useState('');
    const landingPosterInputRef = useRef(null);

    /** 報名頁推薦連結 CRUD：`vibe_referral_codes` */
    const [referralCrudMode, setReferralCrudMode] = useState(null); // null | 'create' | 'edit'
    const [referralForm, setReferralForm] = useState({ code: '', referrerName: '', upperReferrerName: '' });
    const [referralList, setReferralList] = useState([]);
    const [referralListLoading, setReferralListLoading] = useState(false);
    const [referralOpMsg, setReferralOpMsg] = useState('');
    const [referralSaving, setReferralSaving] = useState(false);

    useEffect(() => {
        if (isMockMode) {
            const now = new Date();
            const iso = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 13, 0, 0).toISOString();
            const mockSessions = [
                {
                    id: 'mock_session_01',
                    title: 'AI落地師培訓班（本地假資料）',
                    date: iso,
                    endTime: '16:00',
                    note: '（本地假資料）可填寫場次備註，例如：請提早 10 分鐘報到。',
                    location: 'TOP SPACE 商務中心',
                    address: '臺中市中區民族路23號3樓',
                    price: 1980,
                    originalPrice: 5000,
                    maxCapacity: 50,
                    currentCount: 2,
                    refresherMaxCapacity: DEFAULT_REFRESHER_MAX,
                    refresherCurrentCount: 1,
                    status: 'open',
                    isSignupOpen: true
                },
                {
                    id: 'mock_session_02',
                    title: 'AI落地師培訓班 進階班（本地假資料）',
                    date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 21, 13, 0, 0).toISOString(),
                    endTime: '18:00',
                    note: '',
                    location: 'TOP SPACE 商務中心',
                    address: '臺中市中區民族路23號3樓',
                    price: 2980,
                    originalPrice: 6800,
                    maxCapacity: 30,
                    currentCount: 30,
                    refresherMaxCapacity: DEFAULT_REFRESHER_MAX,
                    refresherCurrentCount: 0,
                    status: 'open',
                    isSignupOpen: true
                }
            ];
            setAdminEmail('local-dev@mock');
            setSessions(mockSessions);
            setLoading(false);
            setError('');
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                if (user.email === ADMIN_EMAIL) {
                    setAdminEmail(user.email);
                    fetchSessions(user.email);
                } else {
                    signOut(auth);
                    setError('存取被拒：非管理員帳號。');
                    setAdminEmail(null);
                    setLoading(false);
                }
            } else {
                setAdminEmail(null);
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, [isMockMode]);

    const handleLogin = async () => {
        try {
            setLoading(true);
            setError('');
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            console.error(err);
            setError('登入失敗或已取消');
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
    };

    useEffect(() => {
        if (!adminEmail || viewMode !== 'landing') return;
        if (isMockMode) {
            const n = DEFAULT_SIGNUP_LANDING;
            setLandingDraft({
                rows: n.youtubeVideos.map((v) => ({ urlOrId: v.videoId, label: v.label })),
                posterImageUrl: n.posterImageUrl,
            });
            setLandingLoadError('');
            return;
        }
        let cancelled = false;
        setLandingLoadError('');
        setLandingDraft(null);
        (async () => {
            try {
                const snap = await getDoc(doc(db, SIGNUP_LANDING_COLLECTION, SIGNUP_LANDING_DOC_ID));
                const n = snap.exists() ? normalizeSignupLandingData(snap.data()) : { ...DEFAULT_SIGNUP_LANDING };
                if (cancelled) return;
                setLandingDraft({
                    rows:
                        n.youtubeVideos.length > 0
                            ? n.youtubeVideos.map((v) => ({ urlOrId: v.videoId, label: v.label }))
                            : [{ urlOrId: '', label: '' }],
                    posterImageUrl: n.posterImageUrl,
                });
            } catch (e) {
                if (!cancelled) {
                    setLandingLoadError(e.message || '讀取報名頁設定失敗');
                    setLandingDraft({
                        rows: DEFAULT_SIGNUP_LANDING.youtubeVideos.map((v) => ({
                            urlOrId: v.videoId,
                            label: v.label,
                        })),
                        posterImageUrl: '',
                    });
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [adminEmail, viewMode, isMockMode]);

    const reloadReferralList = useCallback(async () => {
        if (isMockMode) {
            setReferralList([]);
            return;
        }
        setReferralListLoading(true);
        try {
            const snap = await getDocs(collection(db, VIBE_REFERRAL_CODES_COLLECTION));
            setReferralList(mapReferralSnapshotToRows(snap));
        } catch (e) {
            console.error(e);
        } finally {
            setReferralListLoading(false);
        }
    }, [isMockMode]);

    useEffect(() => {
        if (!adminEmail || viewMode !== 'landing' || isMockMode) return;
        reloadReferralList();
    }, [adminEmail, viewMode, isMockMode, reloadReferralList]);

    const handleLandingSave = async () => {
        if (!landingDraft) return;
        setLandingMsg('');
        if (isMockMode) {
            setLandingMsg('本地 mock 模式無法寫入 Firestore，請於正式環境以管理員登入後儲存。');
            return;
        }
        setLandingSaving(true);
        try {
            const youtubeVideos = landingDraft.rows
                .map((row, i) => ({
                    videoId: extractYoutubeVideoId(row.urlOrId),
                    label: (row.label || '').trim() || `學員回饋 ${i + 1}`,
                }))
                .filter((v) => /^[\w-]{11}$/.test(v.videoId));
            await setDoc(
                doc(db, SIGNUP_LANDING_COLLECTION, SIGNUP_LANDING_DOC_ID),
                {
                    youtubeVideos,
                    posterImageUrl: (landingDraft.posterImageUrl || '').trim(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            setLandingMsg('已儲存，報名頁與分享預覽圖將自動更新。');
        } catch (e) {
            setLandingMsg(`儲存失敗：${e.message || e}`);
        } finally {
            setLandingSaving(false);
        }
    };

    const openReferralCreate = () => {
        setReferralCrudMode('create');
        setReferralForm({
            code: randomSignupRefCode8(),
            referrerName: '',
            upperReferrerName: '',
        });
        setReferralOpMsg('');
    };

    const openReferralEdit = (r) => {
        setReferralCrudMode('edit');
        setReferralForm({
            code: r.code,
            referrerName: r.referrerName,
            upperReferrerName: r.upperReferrerName,
        });
        setReferralOpMsg('');
    };

    const cancelReferralCrud = () => {
        setReferralCrudMode(null);
        setReferralForm({ code: '', referrerName: '', upperReferrerName: '' });
        setReferralOpMsg('');
    };

    const regenerateReferralCodeDraft = () => {
        if (referralCrudMode !== 'create') return;
        setReferralForm((p) => ({ ...p, code: randomSignupRefCode8() }));
        setReferralOpMsg('已重新隨機產生網址代碼。');
    };

    const copyReferralUrlFromForm = async () => {
        const code = referralForm.code.trim();
        if (!/^[A-Za-z0-9]{8}$/.test(code)) {
            setReferralOpMsg('請先輸入或產生 8 碼英數網址代碼。');
            return;
        }
        const url = buildReferralPublicUrl(code);
        try {
            await navigator.clipboard.writeText(url);
            setReferralOpMsg('完整推薦網址已複製到剪貼簿。');
        } catch {
            setReferralOpMsg(`無法自動複製，請手動複製：${url}`);
        }
    };

    const copyReferralUrlByCode = async (code) => {
        const url = buildReferralPublicUrl(code);
        try {
            await navigator.clipboard.writeText(url);
            setReferralOpMsg('已複製該筆推薦網址。');
        } catch {
            setReferralOpMsg(`無法自動複製：${url}`);
        }
    };

    const submitReferralForm = async () => {
        setReferralOpMsg('');
        if (!referralCrudMode) {
            setReferralOpMsg('請先按「新增推薦連結」或從列表選擇「編輯」。');
            return;
        }
        if (isMockMode) {
            setReferralOpMsg('mock 模式無法寫入 Firestore。');
            return;
        }
        const code = referralForm.code.trim();
        if (!/^[A-Za-z0-9]{8}$/.test(code)) {
            setReferralOpMsg('網址代碼須為 8 碼英數字，不可含空白或其他符號。');
            return;
        }
        const referrerName = referralForm.referrerName.trim();
        if (!referrerName) {
            setReferralOpMsg('請填寫「推薦人姓名」。');
            return;
        }
        const upperReferrerName = referralForm.upperReferrerName.trim();
        const wasCreate = referralCrudMode === 'create';
        setReferralSaving(true);
        try {
            const refDoc = doc(db, VIBE_REFERRAL_CODES_COLLECTION, code);
            const existed = await getDoc(refDoc);
            if (wasCreate && existed.exists()) {
                setReferralOpMsg('此網址代碼已存在，請按「重新隨機產生代碼」或手動改成未使用的 8 碼。');
                return;
            }
            if (!wasCreate && !existed.exists()) {
                setReferralOpMsg('找不到此筆資料，可能已被刪除。請重新整理列表。');
                await reloadReferralList();
                return;
            }
            const payload = {
                referrerName,
                upperReferrerName,
                updatedAt: serverTimestamp(),
            };
            if (!existed.exists()) {
                payload.createdAt = serverTimestamp();
            }
            await setDoc(refDoc, payload, { merge: true });
            await reloadReferralList();
            setReferralCrudMode(null);
            setReferralForm({ code: '', referrerName: '', upperReferrerName: '' });
            setReferralOpMsg(wasCreate ? `已建立。推薦網址：${buildReferralPublicUrl(code)}` : `已更新「${code}」。`);
        } catch (e) {
            setReferralOpMsg(`儲存失敗：${e.message || e}`);
        } finally {
            setReferralSaving(false);
        }
    };

    const deleteReferralRow = async (code) => {
        if (isMockMode) {
            setReferralOpMsg('mock 模式無法刪除。');
            return;
        }
        const c = String(code || '').trim();
        if (!window.confirm(`確定刪除代碼「${c}」？刪除後該連結即失效，已送出之報名紀錄不會自動變更。`)) {
            return;
        }
        setReferralOpMsg('');
        try {
            await deleteDoc(doc(db, VIBE_REFERRAL_CODES_COLLECTION, c));
            if (referralCrudMode === 'edit' && referralForm.code === c) {
                cancelReferralCrud();
            }
            await reloadReferralList();
            setReferralOpMsg(`已刪除「${c}」。`);
        } catch (e) {
            setReferralOpMsg(`刪除失敗：${e.message || e}`);
        }
    };

    const handleLandingPosterChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setLandingMsg('請選擇圖片檔（image/*）。');
            return;
        }
        const MAX = 5 * 1024 * 1024;
        if (file.size >= MAX) {
            setLandingMsg('檔案請小於 5MB（Firebase Storage 規則上限）。');
            return;
        }
        if (isMockMode) {
            setLandingMsg('mock 模式無法上傳 Storage。');
            e.target.value = '';
            return;
        }
        setLandingUploading(true);
        setLandingMsg('');
        try {
            const safe = file.name.replace(/[^\w.-]/g, '_').slice(0, 80);
            const path = `signup_page/poster_${Date.now()}_${safe}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setLandingDraft((d) => (d ? { ...d, posterImageUrl: url } : d));
            setLandingMsg('圖片已上傳，請按「儲存設定」寫入報名頁（含 SEO 分享圖）。');
        } catch (err) {
            setLandingMsg(`上傳失敗：${err.message || err}`);
        } finally {
            setLandingUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const addLandingVideoRow = () => {
        setLandingDraft((d) => (d ? { ...d, rows: [...d.rows, { urlOrId: '', label: '' }] } : d));
    };

    const removeLandingVideoRow = (index) => {
        setLandingDraft((d) => (d ? { ...d, rows: d.rows.filter((_, i) => i !== index) } : d));
    };

    const updateLandingVideoRow = (index, field, value) => {
        setLandingDraft((d) => {
            if (!d) return d;
            const rows = d.rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
            return { ...d, rows };
        });
    };

    const clearLandingPoster = () => {
        setLandingDraft((d) => (d ? { ...d, posterImageUrl: '' } : d));
        setLandingMsg('已清除自訂海報（請按儲存套用）；未設定時報名頁使用預設 public 圖。');
    };

    const buildTimeNotAvailableSession = () => ({
        id: 'time_not_available',
        title: '以上場次時間無法配合',
        date: null,
        endTime: '',
        note: '此分類用於彙整「以上場次時間無法配合」的許願開課時間/地點。',
        location: '-',
        address: '-',
        price: 0,
        originalPrice: 0,
        maxCapacity: 0,
        currentCount: 0,
        status: 'open',
        isSignupOpen: true
    });

    const fetchSessions = async (userId) => {
        setLoading(true);
        try {
            if (isMockMode) return;
            // 注意：onAuthStateChanged 內 setAdminEmail 是非同步更新，這裡用參數 userId(=email) 判斷可避免競態
            if (userId !== ADMIN_EMAIL) throw new Error('需要管理員權限');
            const getSessionsFn = httpsCallable(functions, 'getVibeSessions');
            const result = await getSessionsFn({ userId });
            setSessions(result.data.sessions || []);
        } catch (err) {
            console.error(err);
            if (err.message.includes('permission-denied')) {
                setError('權限不足：頁面僅限管理員訪問。');
            } else {
                setError(`讀取場次失敗: ${err.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchRegistrations = async (session) => {
        setLoading(true);
        setSelectedSession(session);
        setViewMode('registrations');
        setRegistrationListTab('main');
        setIdentityVerifiedMap({});
        try {
            if (isMockMode) {
                const mockRegs = [
                    {
                        id: 'mock_reg_01',
                        sessionId: session.id,
                        createdAt: new Date().toISOString(),
                        name: '王小明',
                        email: 'ming@example.com',
                        phone: '0912-345-678',
                        source: '嘉吉老師',
                        paymentMethod: 'transfer',
                        lastFive: '12345',
                        receivedAmount: 1980,
                        status: 'confirmed',
                        count: 1,
                        adminNote: '已核對',
                        invoiceType: 'general',
                        payee: '嘉吉',
                        registrationKind: 'main',
                    },
                    {
                        id: 'mock_reg_02',
                        sessionId: session.id,
                        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
                        name: '陳小華',
                        email: 'hua@example.com',
                        phone: '0988-000-111',
                        source: 'FB廣告',
                        paymentMethod: 'on_site',
                        lastFive: '',
                        receivedAmount: 0,
                        status: 'pending',
                        count: 1,
                        adminNote: '',
                        invoiceType: 'tax_id',
                        taxId: '04595202',
                        payee: '白白',
                        registrationKind: 'refresher',
                        previousSessionId: 'mock_session_01',
                        previousSessionTitle: 'AI落地師培訓班（本地假資料）',
                    },
                    {
                        id: 'mock_reg_03',
                        sessionId: session.id,
                        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
                        name: '林小美',
                        email: 'mei@example.com',
                        phone: '0900-222-333',
                        source: 'Rich老師',
                        paymentMethod: 'linepay',
                        receivedAmount: 1980,
                        status: 'cancelled',
                        count: 1,
                        adminNote: '臨時有事',
                        invoiceType: 'general',
                        payee: '',
                        registrationKind: 'main',
                    }
                ];
                setRegistrations(mockRegs);
                setLoading(false);
                return;
            }
            if (!adminEmail) throw new Error('需要管理員權限');

            const getRegFn = httpsCallable(functions, 'getVibeRegistrations');
            const result = await getRegFn({ sessionId: session.id });
            const regs = result.data.registrations || [];
            setRegistrations(regs);
            setError('');

            // Auto-Sync：正課、複訓人數分開寫入 session
            const realMainCount = regs
                .filter(r => r.status !== 'cancelled' && (r.registrationKind || 'main') === 'main')
                .reduce((acc, r) => acc + (r.count || 1), 0);
            const realRefresherCount = regs
                .filter(r => r.status !== 'cancelled' && r.registrationKind === 'refresher')
                .reduce((acc, r) => acc + (r.count || 1), 0);
            const needMainSync = (session.currentCount || 0) !== realMainCount;
            const needRefSync = (session.refresherCurrentCount ?? 0) !== realRefresherCount;
            if (session.id !== 'time_not_available' && (needMainSync || needRefSync)) {
                const updateFn = httpsCallable(functions, 'updateVibeSession');
                updateFn({
                    sessionId: session.id,
                    updates: { currentCount: realMainCount, refresherCurrentCount: realRefresherCount }
                }).catch((err) => console.error("Auto-sync failed:", err));
                setSelectedSession((prev) => ({
                    ...prev,
                    currentCount: realMainCount,
                    refresherCurrentCount: realRefresherCount
                }));
                setSessions((prev) => prev.map((s) => (s.id === session.id
                    ? { ...s, currentCount: realMainCount, refresherCurrentCount: realRefresherCount }
                    : s
                )));
            }
        } catch (err) {
            console.error(err);
            setError(`讀取報名資料失敗: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // --- Session Actions ---

    const handleCreateSession = async (e) => {
        e.preventDefault();
        if (!isAdmin) return;
        setOpLoading(true);
        try {
            if (isMockMode) {
                const isoDate = new Date(`${newSession.date}T${newSession.time}`).toISOString();
                const endIsoDate = newSession.endTime ? new Date(`${newSession.date}T${newSession.endTime}`).toISOString() : null;
                const created = {
                    id: `mock_session_${Math.random().toString(16).slice(2)}`,
                    ...newSession,
                    date: isoDate,
                    endDate: endIsoDate,
                    price: Number(newSession.price),
                    originalPrice: Number(newSession.originalPrice),
                    maxCapacity: Number(newSession.maxCapacity),
                    currentCount: 0,
                    refresherMaxCapacity: Number(newSession.refresherMaxCapacity) > 0 ? Number(newSession.refresherMaxCapacity) : DEFAULT_REFRESHER_MAX,
                    refresherCurrentCount: 0,
                    status: 'open',
                    isSignupOpen: newSession.isSignupOpen !== false
                };
                setSessions(prev => [created, ...prev]);
                setIsCreateSessionOpen(false);
                alert('（本地假資料）場次已建立');
                return;
            }
            // Combine Date & Time
            const isoDate = new Date(`${newSession.date}T${newSession.time}`).toISOString();
            const endIsoDate = newSession.endTime ? new Date(`${newSession.date}T${newSession.endTime}`).toISOString() : null;

            const createFn = httpsCallable(functions, 'createVibeSession');
            await createFn({
                ...newSession,
                date: isoDate,
                endDate: endIsoDate,
                refresherMaxCapacity: Number(newSession.refresherMaxCapacity) > 0
                    ? Number(newSession.refresherMaxCapacity)
                    : DEFAULT_REFRESHER_MAX
            });

            setIsCreateSessionOpen(false);
            fetchSessions(adminEmail);
            alert('場次建立成功');
        } catch (err) {
            alert('建立失敗: ' + err.message);
        } finally {
            setOpLoading(false);
        }
    };

    const openEditSessionModal = (session) => {
        setSessionToEdit(session);
        const dateObj = new Date(session.date);
        const endDateObj = session.endDate ? new Date(session.endDate) : null;
        setEditSessionForm({
            title: session.title,
            date: session.date.split('T')[0],
            time: `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`,
            endTime: session.endTime || (endDateObj ? `${String(endDateObj.getHours()).padStart(2, '0')}:${String(endDateObj.getMinutes()).padStart(2, '0')}` : ''),
            location: session.location,
            address: session.address,
            price: session.price,
            originalPrice: session.originalPrice,
            maxCapacity: session.maxCapacity || 50,
            note: session.note || '',
            status: session.status || 'open',
            isSignupOpen: session.isSignupOpen !== false,
            refresherMaxCapacity: (session.refresherMaxCapacity ?? 0) > 0 ? session.refresherMaxCapacity : DEFAULT_REFRESHER_MAX
        });
        setIsEditSessionOpen(true);
    };

    const handleUpdateSession = async (e) => {
        e.preventDefault();
        if (!isAdmin) return;
        setOpLoading(true);
        try {
            if (isMockMode) {
                const isoDate = new Date(`${editSessionForm.date}T${editSessionForm.time}`).toISOString();
                const endIsoDate = editSessionForm.endTime ? new Date(`${editSessionForm.date}T${editSessionForm.endTime}`).toISOString() : null;
                setSessions(prev => prev.map(s => s.id === sessionToEdit.id ? {
                    ...s,
                    ...editSessionForm,
                    date: isoDate,
                    endDate: endIsoDate,
                    price: Number(editSessionForm.price),
                    originalPrice: Number(editSessionForm.originalPrice),
                    maxCapacity: Number(editSessionForm.maxCapacity),
                    refresherMaxCapacity: Number(editSessionForm.refresherMaxCapacity) > 0
                        ? Number(editSessionForm.refresherMaxCapacity)
                        : DEFAULT_REFRESHER_MAX
                } : s));
                setIsEditSessionOpen(false);
                alert('（本地假資料）場次已更新');
                return;
            }
            const isoDate = new Date(`${editSessionForm.date}T${editSessionForm.time}`).toISOString();
            const endIsoDate = editSessionForm.endTime ? new Date(`${editSessionForm.date}T${editSessionForm.endTime}`).toISOString() : null;

            const updateFn = httpsCallable(functions, 'updateVibeSession');
            await updateFn({
                sessionId: sessionToEdit.id,
                updates: {
                    ...editSessionForm,
                    date: isoDate,
                    endDate: endIsoDate,
                    price: Number(editSessionForm.price),
                    originalPrice: Number(editSessionForm.originalPrice),
                    maxCapacity: Number(editSessionForm.maxCapacity),
                    refresherMaxCapacity: Number(editSessionForm.refresherMaxCapacity) > 0
                        ? Number(editSessionForm.refresherMaxCapacity)
                        : DEFAULT_REFRESHER_MAX
                }
            });

            setIsEditSessionOpen(false);
            fetchSessions(adminEmail); // Refresh to show new data
            alert('場次更新成功');
        } catch (err) {
            alert('更新失敗: ' + err.message);
        } finally {
            setOpLoading(false);
        }
    };

    // --- Registration Actions ---

    const openEditModal = (reg) => {
        setEditTarget(reg);
        const isInvoiceEditable =
            (reg.registrationKind || 'main') !== 'refresher' && reg.invoiceType !== 'refresher_exempt';
        const refParts = getRegistrationReferrerParts(reg);
        setEditForm({
            status: reg.status || 'pending',
            paymentMethod: reg.paymentMethod || 'transfer',
            receivedAmount: reg.receivedAmount ?? (reg.registrationKind === 'refresher' ? REFRESHER_FEE : (selectedSession?.price || 1980)),
            adminNote: reg.adminNote || '',
            sessionId: reg.sessionId || selectedSession?.id || '',
            payee: reg.payee || '',
            invoiceType: isInvoiceEditable && reg.invoiceType === 'tax_id' ? 'tax_id' : 'general',
            taxId: isInvoiceEditable && reg.taxId ? String(reg.taxId) : '',
            referrerName: refParts.referrerName,
            upperReferrerName: refParts.upperReferrerName,
        });
        setIsEditRegOpen(true);
    };

    const handleUpdateRegistration = async () => {
        if (!editTarget) return;
        if (!isAdmin) return;
        setOpLoading(true);
        try {
            const nextSessionId = editForm.sessionId || editTarget.sessionId || selectedSession?.id || '';
            if (!nextSessionId) {
                alert('請先選擇要歸屬的場次');
                return;
            }

            const targetSession = sessions.find(s => s.id === nextSessionId) || null;
            const willMoveToAnotherSession = !!(editTarget.sessionId || selectedSession?.id) && nextSessionId !== (editTarget.sessionId || selectedSession?.id);

            const isRefresherReg = (editTarget.registrationKind || '') === 'refresher';
            const canEditInvoice = !isRefresherReg && editTarget.invoiceType !== 'refresher_exempt';

            if (canEditInvoice && editForm.invoiceType === 'tax_id') {
                const tid = String(editForm.taxId || '').trim();
                if (!/^\d{8}$/.test(tid)) {
                    alert('統一編號須為 8 位數字。');
                    setOpLoading(false);
                    return;
                }
            }

            const referrerNameTrim = String(editForm.referrerName || '').trim();
            const upperReferrerTrim = String(editForm.upperReferrerName || '').trim();
            const sourceMergedPatch = buildMergedReferrerSourceField(referrerNameTrim, upperReferrerTrim);

            if (isMockMode) {
                if (willMoveToAnotherSession) {
                    setRegistrations(prev => prev.filter(r => r.id !== editTarget.id));
                } else {
                    setRegistrations(prev => prev.map(r => r.id === editTarget.id ? {
                        ...r,
                        ...editForm,
                        ...(isRefresherReg
                            ? { receivedAmount: r.receivedAmount, payee: r.payee, paymentMethod: r.paymentMethod }
                            : { receivedAmount: Number(editForm.receivedAmount), payee: editForm.payee }
                        ),
                        ...(canEditInvoice
                            ? {
                                invoiceType: editForm.invoiceType === 'tax_id' ? 'tax_id' : 'general',
                                taxId: editForm.invoiceType === 'tax_id' ? String(editForm.taxId || '').trim() : null
                            }
                            : {}
                        ),
                        referrerName: referrerNameTrim || null,
                        upperReferrerName: upperReferrerTrim || null,
                        source: sourceMergedPatch || referrerNameTrim || editTarget.source || '',
                    } : r));
                }
                setIsEditRegOpen(false);
                setEditTarget(null);
                return;
            }
            const updateFn = httpsCallable(functions, 'updateVibeRegistration');
            const paymentUpdates = isRefresherReg
                ? {
                    paymentMethod: editTarget.paymentMethod,
                    receivedAmount: Number(editTarget.receivedAmount ?? 0),
                    payee: editTarget.payee || null,
                }
                : {
                    paymentMethod: editForm.paymentMethod,
                    receivedAmount: Number(editForm.receivedAmount),
                    payee: editForm.payee || null,
                };
            const invoicePatch = canEditInvoice
                ? {
                    invoiceType: editForm.invoiceType === 'tax_id' ? 'tax_id' : 'general',
                    taxId: editForm.invoiceType === 'tax_id' ? String(editForm.taxId || '').trim() : null
                }
                : {};
            await updateFn({
                
                registrationId: editTarget.id,
                updates: {
                    status: editForm.status,
                    ...paymentUpdates,
                    ...invoicePatch,
                    adminNote: editForm.adminNote,
                    sessionId: nextSessionId,
                    sessionTitle: targetSession?.title || null,
                    sessionDate: targetSession?.date || null,
                    sessionLocation: targetSession?.location || null,
                    sessionAddress: targetSession?.address || null,
                    referrerName: referrerNameTrim || null,
                    upperReferrerName: upperReferrerTrim || null,
                    source: sourceMergedPatch || referrerNameTrim || editTarget.source || '',
                }
            });

            // Optimistic Update
            if (willMoveToAnotherSession) {
                setRegistrations(prev => prev.filter(r => r.id !== editTarget.id));
            } else {
                setRegistrations(prev => prev.map(r => r.id === editTarget.id ? {
                    ...r,
                    ...editForm,
                    sessionId: nextSessionId,
                    ...(isRefresherReg
                        ? { receivedAmount: r.receivedAmount, payee: r.payee, paymentMethod: r.paymentMethod }
                        : { receivedAmount: Number(editForm.receivedAmount), payee: editForm.payee }
                    ),
                    ...invoicePatch,
                    referrerName: referrerNameTrim || null,
                    upperReferrerName: upperReferrerTrim || null,
                    source: sourceMergedPatch || referrerNameTrim || editTarget.source || '',
                } : r));
            }
            setIsEditRegOpen(false);
            setEditTarget(null);
        } catch (err) {
            alert('更新失敗: ' + err.message);
        } finally {
            setOpLoading(false);
        }
    };

    const handleDeleteRegistration = async (regId) => {
        if (!confirm('確定要刪除此筆報名資料嗎？此操作無法復原。')) return;
        if (!isAdmin) return;
        setOpLoading(true);
        try {
            if (isMockMode) {
                setRegistrations(prev => prev.filter(r => r.id !== regId));
                return;
            }
            const deleteFn = httpsCallable(functions, 'deleteVibeRegistration');
            await deleteFn({  registrationId: regId });

            setRegistrations(prev => prev.filter(r => r.id !== regId));
        } catch (err) {
            alert('刪除失敗: ' + err.message);
        } finally {
            setOpLoading(false);
        }
    };

    const handleQuickCancel = async (reg) => {
        if (!confirm(`確定要取消 ${reg.name} 的報名嗎？`)) return;
        if (!isAdmin) return;
        setOpLoading(true);
        try {
            if (isMockMode) {
                setRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'cancelled' } : r));
                return;
            }
            const updateFn = httpsCallable(functions, 'updateVibeRegistration');
            await updateFn({
                
                registrationId: reg.id,
                updates: { status: 'cancelled' }
            });
            setRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, status: 'cancelled' } : r));
        } catch (err) {
            alert('操作失敗: ' + err.message);
        } finally {
            setOpLoading(false);
        }
    };

    /** 測試後還原：清除報到時間，並重設為待核對／實收 0（報到畫面「已繳費」仍會看實收金額） */
    const handleClearCheckInInfo = async (reg) => {
        if (!reg?.id) return;
        if (!isAdmin) return;
        const name = reg.name || '此學員';
        if (
            !window.confirm(
                `確定要清除「${name}」的報到與現場收款紀錄？\n\n將移除報到時間、狀態改為「待核對」、實收金額改為 0。備註欄不會自動刪除，若需清理請再按「編輯」。`
            )
        ) {
            return;
        }
        setOpLoading(true);
        try {
            const updates = {
                checkInAt: null,
                status: 'pending',
                receivedAmount: 0,
                paymentMethod: '',
            };
            if (isMockMode) {
                setRegistrations((prev) =>
                    prev.map((r) =>
                        r.id === reg.id
                            ? {
                                  ...r,
                                  ...updates,
                              }
                            : r
                    )
                );
                alert('（本地假資料）已清除報到資訊');
                return;
            }
            const updateFn = httpsCallable(functions, 'updateVibeRegistration');
            await updateFn({
                registrationId: reg.id,
                updates,
            });
            setRegistrations((prev) =>
                prev.map((r) => (r.id === reg.id ? { ...r, ...updates } : r))
            );
            alert('已清除報到資訊');
        } catch (err) {
            alert('清除失敗: ' + err.message);
        } finally {
            setOpLoading(false);
        }
    };

    const formatCheckInShort = (value) => {
        if (!value) return '';
        try {
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleString('zh-TW', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
        } catch {
            return '';
        }
    };

    const buildCheckInUrl = (registrationId) => {
        const origin = PUBLIC_SIGNUP_CHECKIN_ORIGIN.replace(/\/$/, '');
        return `${origin}/signup/checkin/${registrationId}`;
    };

    /** 與「複製報到」相同純文字內文、主旨（備援／剪貼簿用） */
    const buildCheckInMessage = (reg) => {
        if (!reg?.id) return null;
        const url = buildCheckInUrl(reg.id);

        const parseDate = (value) => {
            if (!value) return null;
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        };

        const formatDateTime = (dateObj) => {
            if (!dateObj) return '-';
            return dateObj.toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        };

        const sessionDateObj = parseDate(reg.sessionDate) || (selectedSession?.date ? parseDate(selectedSession.date) : null);
        const checkInDateObj = sessionDateObj ? new Date(sessionDateObj.getTime() - 30 * 60 * 1000) : null;
        const sessionTimeText = formatDateTime(sessionDateObj);
        const checkInTimeText = formatDateTime(checkInDateObj).split(' ').pop() || '-';
        const loc = selectedSession?.location || reg.sessionLocation || '—';
        const addr = selectedSession?.address || reg.sessionAddress;
        const sessionLocationText = addr ? `${loc}（${addr}）` : loc;

        const isRef = reg.registrationKind === 'refresher';
        const kindLabelPlain = isRef ? '複訓' : '正課';
        const listPrice = isRef ? REFRESHER_FEE : (selectedSession?.price ?? 0);
        const feeLine = reg.status === 'pending'
            ? (isRef
                ? `請記得當天帶複訓學費${listPrice}元現場繳費`
                : (listPrice
                    ? `若尚未匯款完成，請依簡訊/官方通知處理；參考場次學費 $${listPrice} 元。`
                    : '請依簡訊或官方帳號通知完成付款與核對。'))
            : null;

        const text = [
            '【AI落地師培訓班｜報到資訊】',
            `報名類型：${kindLabelPlain}`,
            `學員：${reg.name || '-'}`,
            `場次：${reg.sessionTitle || selectedSession?.title || '-'}`,
            `上課時間：${sessionTimeText}（${checkInTimeText}開放報到）`,
            `地點：${sessionLocationText}`,
            `報到連結：${url}`,
            ...(feeLine ? [feeLine] : []),
            '',
            '請於現場出示此頁面 QR 碼完成報到。'
        ].join('\n');

        const subject = `【AI落地師培訓班】〔${kindLabelPlain}〕報到資訊（${(reg.name || '-').trim()}）`;
        return { text, subject };
    };

    const copyCheckInLink = async (reg) => {
        const built = buildCheckInMessage(reg);
        if (!built) {
            alert('無法產生報到連結：缺少 UID');
            return;
        }
        try {
            await navigator.clipboard.writeText(built.text);
            alert('報到資訊已複製到剪貼簿');
        } catch (err) {
            console.error(err);
            alert(`複製失敗，請手動複製：${built.text}`);
        }
    };

    /** 透過 Cloud Functions + Resend 批次寄送報到 HTML 信（含「確認出席」連結） */
    const handleSendAllCheckInEmailsResend = async () => {
        if (!selectedSession || selectedSession.id === 'time_not_available') {
            alert('請先選擇一般場次名單頁。');
            return;
        }
        const kind = registrationListTab === 'refresher' ? 'refresher' : 'main';
        const candidates = displayedRegistrations.filter(
            (r) => r.status !== 'cancelled' && String(r.email || '').trim().includes('@')
        );
        if (candidates.length === 0) {
            alert('目前清單沒有可寄送的 Email（已排除已取消與空白信箱）。');
            return;
        }
        const tabLabel = kind === 'main' ? '正課' : '複訓';
        if (
            !window.confirm(
                `即將透過 Resend 寄出「報到 QR／行前提醒」HTML 信件給 ${candidates.length} 位學員（${tabLabel}；不含「已取消」）。\n寄件前請確認已於 Firebase 設定 RESEND_API_KEY、ATTENDANCE_CONFIRM_SECRET，並完成網域／寄件者設定。\n\n確定送出？`
            )
        ) {
            return;
        }
        if (isMockMode) {
            alert(`（本地 mock）模擬寄送 ${candidates.length} 封，未呼叫雲端函式。`);
            return;
        }
        setOpLoading(true);
        try {
            const fn = httpsCallable(functions, 'sendVibeCheckInEmailsBatch');
            const result = await fn({ sessionId: selectedSession.id, listKind: kind });
            const data = result?.data || {};
            const sent = data.sent ?? 0;
            const failures = Array.isArray(data.failures) ? data.failures : [];
            const warnings = Array.isArray(data.warnings) ? data.warnings : [];
            if (failures.length > 0) {
                console.warn('Resend 部分失敗：', failures);
            }
            let msg = `寄送結果：成功 ${sent} 封。${failures.length ? `失敗 ${failures.length} 封（詳見瀏覽器 Console）。` : ''}`;
            if (warnings.length > 0) {
                msg += `\n\n${warnings.join('\n\n')}`;
            }
            alert(msg);
        } catch (err) {
            console.error(err);
            alert(`寄送失敗：${err.message || err}`);
        } finally {
            setOpLoading(false);
        }
    };

    /** 單筆：與「全部送出」相同之 Resend HTML 報到信 */
    const handleSendOneCheckInEmailResend = async (reg) => {
        if (!reg?.id) return;
        if (reg.status === 'cancelled') {
            alert('已取消的報名無法寄送通知信。');
            return;
        }
        const to = (reg?.email || '').trim();
        if (!to || !to.includes('@')) {
            alert('此學員未填寫有效 Email。');
            return;
        }
        if (isMockMode) {
            alert('（本地 mock）未實際呼叫 Resend。');
            return;
        }
        if (!window.confirm(`確定以 Resend 寄出「報到 QR／行前提醒」HTML 信給 ${(reg.name || '').trim() || '學員'}（${to}）？`)) {
            return;
        }
        setOpLoading(true);
        try {
            const fn = httpsCallable(functions, 'sendVibeCheckInEmailSingle');
            await fn({ registrationId: reg.id });
            alert('已送出信件。');
        } catch (err) {
            console.error(err);
            const msg = err?.message || String(err);
            alert(`寄送失敗：${msg}`);
        } finally {
            setOpLoading(false);
        }
    };

    const formatDate = (value) => {
        if (!value) return '-';
        try {
            if (typeof value === 'object' && typeof value.toDate === 'function') {
                return value.toDate().toLocaleString('zh-TW');
            }
            return new Date(value).toLocaleString('zh-TW');
        } catch {
            return '-';
        }
    };

    /** 名單表格：台灣時區、月/日 24 小時制（例：04/19 14:05） */
    const formatRegistrationListTime = (value) => {
        if (value == null || value === '') return '—';
        try {
            const d =
                typeof value === 'object' && typeof value?.toDate === 'function'
                    ? value.toDate()
                    : new Date(value);
            if (Number.isNaN(d.getTime())) return '—';
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Taipei',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }).formatToParts(d);
            const pick = (t) => parts.find((p) => p.type === t)?.value ?? '';
            return `${pick('month')}/${pick('day')} ${pick('hour')}:${pick('minute')}`;
        } catch {
            return '—';
        }
    };

    const formatSessionDateTime = (session) => {
        if (!session?.date) return '-';
        try {
            const d = new Date(session.date);
            return `${d.toLocaleDateString('zh-TW')} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}${session.endTime ? `～${session.endTime}` : ''}`;
        } catch {
            return '-';
        }
    };

    // Helper to get unique locations
    const existingLocations = [...new Set(sessions.map(s => s.location).filter(Boolean))];

    // Map existing locations to addresses for auto-fill
    const locationAddressMap = sessions.reduce((acc, s) => {
        if (s.location && s.address) acc[s.location] = s.address;
        return acc;
    }, {});

    const sortedSessions = useMemo(() => {
        // 依開課日期由新到舊（最近日期在列表最上方）；無效或缺少日期者排在後方
        return [...sessions].sort((a, b) => {
            const aTime = a?.date ? new Date(a.date).getTime() : null;
            const bTime = b?.date ? new Date(b.date).getTime() : null;
            const aValid = aTime != null && Number.isFinite(aTime);
            const bValid = bTime != null && Number.isFinite(bTime);
            if (aValid && bValid) return bTime - aTime;
            if (aValid && !bValid) return -1;
            if (!aValid && bValid) return 1;
            return 0;
        });
    }, [sessions]);

    const sortedRegistrations = useMemo(() => {
        const statusOrder = {
            confirmed: 0,
            pending: 1,
            cancelled: 2
        };

        const getTimestamp = (value) => {
            if (!value) return Number.MAX_SAFE_INTEGER;
            if (typeof value === 'string') {
                const parsed = Date.parse(value);
                return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
            }
            if (typeof value === 'object' && typeof value.toDate === 'function') {
                return value.toDate().getTime();
            }
            return Number.MAX_SAFE_INTEGER;
        };

        return [...registrations].sort((a, b) => {
            const aStatusRank = statusOrder[a.status] ?? Number.MAX_SAFE_INTEGER;
            const bStatusRank = statusOrder[b.status] ?? Number.MAX_SAFE_INTEGER;
            if (aStatusRank !== bStatusRank) return aStatusRank - bStatusRank;

            return getTimestamp(a.createdAt) - getTimestamp(b.createdAt);
        });
    }, [registrations]);

    /** 依分頁顯示正課 / 複訓（舊資料視為正課） */
    const displayedRegistrations = useMemo(() => {
        if (!selectedSession || selectedSession.id === 'time_not_available') {
            return sortedRegistrations;
        }
        if (registrationListTab === 'refresher') {
            return sortedRegistrations.filter((r) => r.registrationKind === 'refresher');
        }
        return sortedRegistrations.filter((r) => (r.registrationKind || 'main') === 'main');
    }, [sortedRegistrations, registrationListTab, selectedSession?.id]);

    /** 正課／複訓分頁：複訓名單不顯示發票、收款、付款、金額欄 */
    const isRefresherListTab =
        !!selectedSession && selectedSession.id !== 'time_not_available' && registrationListTab === 'refresher';

    const paymentMethodToLabel = (pm) => {
        if (pm === 'transfer') return '轉帳';
        if (pm === 'on_site') return '現場繳費';
        if (pm === 'cash') return '現金';
        if (pm === 'linepay') return 'LinePay';
        if (pm === 'none') return '—';
        return '未指定';
    };

    const statusToLabel = (status) => {
        if (status === 'confirmed') return '已付款';
        if (status === 'cancelled') return '已取消';
        return '待核對';
    };

    /** 報到清除按鈕暫時關閉 */
    const showClearCheckInButton = false;

    const escapeCsvCell = (value) => {
        const s = value === null || value === undefined ? '' : String(value);
        if (/[",\r\n]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const sanitizeFilenameSegment = (raw) => (raw || 'export').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);

    const formatInvoiceForCsv = (reg) => {
        if (reg.registrationKind === 'refresher' || reg.invoiceType === 'refresher_exempt') return '複訓不開發票';
        if (reg.invoiceType === 'tax_id' && reg.taxId) return `統編 ${reg.taxId}`;
        return '一般';
    };

    const handleBatchVerifyRefresherIdentity = async () => {
        if (!selectedSession || selectedSession.id === 'time_not_available') {
            alert('請先進入一般場次的名單頁，再執行身份檢查。');
            return;
        }
        const refresherRegs = displayedRegistrations.filter((r) => (r.registrationKind || '') === 'refresher');
        if (refresherRegs.length === 0) {
            alert('目前複訓名單沒有可檢查的學員。');
            return;
        }

        setOpLoading(true);
        try {
            const getRegFn = !isMockMode ? httpsCallable(functions, 'getVibeRegistrations') : null;
            const rosterCache = {};

            const loadMainRoster = async (sessionId) => {
                const sid = String(sessionId);
                if (rosterCache[sid]) return rosterCache[sid];
                let list = [];
                if (isMockMode) {
                    list = registrations.filter((r) => r.sessionId === sid);
                } else {
                    const result = await getRegFn({ sessionId: sid });
                    list = result?.data?.registrations || [];
                }
                const main = (Array.isArray(list) ? list : []).filter(
                    (r) =>
                        String(r.status || '') !== 'cancelled' &&
                        (r.registrationKind || 'main') === 'main'
                );
                rosterCache[sid] = main;
                return main;
            };

            const pairs = refresherRegs.map((reg) => ({
                reg,
                compareSid: resolveRefresherCompareSessionId(reg, sortedSessions),
            }));

            const skippedNoSession = pairs.filter((p) => !p.compareSid);
            const skippedIncomplete = pairs.filter((p) => {
                if (!p.compareSid) return false;
                const regEmail = normalizeIdentityText(p.reg.email);
                const regPhone = normalizePhoneDigits(p.reg.phone);
                return !regEmail && !regPhone;
            });

            const uniqueIds = [...new Set(pairs.map((p) => p.compareSid).filter(Boolean))];
            await Promise.all(uniqueIds.map((id) => loadMainRoster(id)));

            const verified = {};
            for (const { reg, compareSid } of pairs) {
                if (!compareSid) continue;
                const regEmail = normalizeIdentityText(reg.email);
                const regPhone = normalizePhoneDigits(reg.phone);
                const hasEmail = !!regEmail;
                const hasPhone = !!regPhone;
                if (!hasEmail && !hasPhone) continue;

                const candidates = rosterCache[compareSid] || [];
                const matched = candidates.some((target) => {
                    const tEmail = normalizeIdentityText(target.email);
                    const tPhone = normalizePhoneDigits(target.phone);
                    const emailOk = hasEmail && !!tEmail && regEmail === tEmail;
                    const phoneOk = hasPhone && !!tPhone && regPhone === tPhone;
                    return emailOk || phoneOk;
                });
                if (matched && reg.id) verified[reg.id] = true;
            }

            setIdentityVerifiedMap(verified);

            const lines = [
                `身份檢查完成：與前次場次正課名單比對（Email 或手機任一相符即成立），共 ${Object.keys(verified).length} 位符合。`,
            ];
            if (skippedNoSession.length > 0) {
                lines.push(`無法對應前次場次（無場次 ID 且標題亦對不到）：略過 ${skippedNoSession.length} 位。`);
            }
            if (skippedIncomplete.length > 0) {
                lines.push(`Email 與手機皆空白，無法比對：略過 ${skippedIncomplete.length} 位。`);
            }
            alert(lines.join('\n'));
        } catch (err) {
            alert(`身份檢查失敗: ${err.message}`);
        } finally {
            setOpLoading(false);
        }
    };

    const handleExportRegistrationsCsv = () => {
        if (!selectedSession) return;
        if (displayedRegistrations.length === 0) {
            alert('目前沒有可匯出的報名資料');
            return;
        }

        const listKindLabel = selectedSession.id === 'time_not_available' ? '全部' : (registrationListTab === 'refresher' ? '複訓' : '正課');
        const csvOmitPaymentColumns = isRefresherListTab;

        const headers = csvOmitPaymentColumns
            ? [
                '名單類型',
                '場次名稱',
                '報名時間',
                '姓名',
                'Email',
                '電話',
                '來源',
                '推薦人',
                '上層推薦人',
                '報名類型',
                '前次參加場次',
                '人數',
                '狀態',
                '管理備註',
                '報到時間',
                '許願時間',
                '許願地點',
                '報名編號',
                '報到連結',
            ]
            : [
            '名單類型',
            '場次名稱',
            '報名時間',
            '姓名',
            'Email',
            '電話',
            '來源',
            '推薦人',
            '上層推薦人',
            '電子發票/統編',
            '收款人',
            '報名類型',
            '前次參加場次',
            '付款方式',
            '轉帳末五碼',
            '人數',
            '實收金額',
            '狀態',
            '管理備註',
            '報到時間',
            '許願時間',
            '許願地點',
            '報名編號',
            '報到連結',
        ];

        const rows = displayedRegistrations.map((reg) => {
            const checkInUrl = reg.id ? buildCheckInUrl(reg.id) : '';
            const refCsv = getRegistrationReferrerParts(reg);
            if (csvOmitPaymentColumns) {
                return [
                    listKindLabel,
                    selectedSession.title || '',
                    formatDate(reg.createdAt),
                    reg.name || '',
                    reg.email || '',
                    reg.phone || '',
                    reg.source || '',
                    refCsv.referrerName || '',
                    refCsv.upperReferrerName || '',
                    (reg.registrationKind || 'main') === 'refresher' ? '複訓' : '正課',
                    [reg.previousSessionTitle, reg.previousSessionDate].filter(Boolean).join(' '),
                    reg.count ?? 1,
                    statusToLabel(reg.status),
                    reg.adminNote || '',
                    reg.checkInAt ? formatDate(reg.checkInAt) : '',
                    reg.wishTime || '',
                    reg.wishLocation || '',
                    reg.id || '',
                    checkInUrl,
                ];
            }
            return [
                listKindLabel,
                selectedSession.title || '',
                formatDate(reg.createdAt),
                reg.name || '',
                reg.email || '',
                reg.phone || '',
                reg.source || '',
                refCsv.referrerName || '',
                refCsv.upperReferrerName || '',
                formatInvoiceForCsv(reg),
                reg.payee || '',
                (reg.registrationKind || 'main') === 'refresher' ? '複訓' : '正課',
                [reg.previousSessionTitle, reg.previousSessionDate].filter(Boolean).join(' '),
                paymentMethodToLabel(reg.paymentMethod),
                reg.lastFive || '',
                reg.count ?? 1,
                reg.receivedAmount ?? '',
                statusToLabel(reg.status),
                reg.adminNote || '',
                reg.checkInAt ? formatDate(reg.checkInAt) : '',
                reg.wishTime || '',
                reg.wishLocation || '',
                reg.id || '',
                checkInUrl,
            ];
        });

        const csvBody = [headers, ...rows].map((line) => line.map(escapeCsvCell).join(',')).join('\r\n');
        const csvContent = `\uFEFF${csvBody}`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `報名名單_${sanitizeFilenameSegment(selectedSession.title)}_${stamp}.csv`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleNewSessionLocationChange = (e) => {
        const loc = e.target.value;
        // Only auto-fill if we have a known address for this EXACT location name
        // ensuring we don't accidentally overwrite if user is typing a new location name that doesn't match yet (though unlikely with exact key match)
        const matchedAddr = locationAddressMap[loc];

        setNewSession(prev => ({
            ...prev,
            location: loc, // Always update location
            address: matchedAddr || prev.address // Update address only if match found, otherwise keep existing
        }));
    };

    const handleEditSessionLocationChange = (e) => {
        const loc = e.target.value;
        const matchedAddr = locationAddressMap[loc];

        setEditSessionForm(prev => ({
            ...prev,
            location: loc,
            address: matchedAddr || prev.address
        }));
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            {viewMode === 'registrations' && (
                                <button onClick={() => setViewMode('sessions')} className="text-slate-400 hover:text-slate-600 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                            )}
                            AI落地師培訓班{' '}
                            {viewMode === 'sessions' ? '場次管理' : viewMode === 'landing' ? '報名頁設定' : '報名名單管理'}
                        </h1>
                        {adminEmail && (
                            <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
                                Admin: <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-700">{adminEmail}</span>
                                <button onClick={handleLogout} className="text-blue-500 hover:underline text-xs">登出</button>
                            </p>
                        )}
                        {adminEmail && viewMode !== 'registrations' && (
                            <nav className="flex flex-wrap gap-2 mt-4" aria-label="後台選單">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setViewMode('sessions');
                                        setLandingMsg('');
                                    }}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'sessions' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                                >
                                    場次管理
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setViewMode('landing');
                                        setLandingMsg('');
                                    }}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'landing' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                                >
                                    報名頁設定
                                </button>
                            </nav>
                        )}
                    </div>
                    {isAdmin && viewMode === 'sessions' && (
                        <button onClick={() => setIsCreateSessionOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow transition-colors flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            新增場次
                        </button>
                    )}
                </header>

                {isMockMode && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl mb-6 text-sm">
                        目前為本地測試模式（`?mock=1`）：免登入、使用假資料，不會呼叫 Firebase Functions。
                    </div>
                )}

                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">{error}</div>}

                {loading ? (
                    <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
                ) : !adminEmail ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-slate-200 mt-10">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">需要管理員權限</h2>
                        <p className="text-slate-500 mb-6 font-mono text-sm max-w-sm text-center">請使用授權的管理員 Google 帳號登入系統管理後台。</p>
                        <button onClick={handleLogin} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-md transition-colors font-bold flex items-center gap-2">
                            使用 Google 登入
                        </button>
                    </div>
                ) : (
                    <>
                        {/* VIEW MODE: 報名頁公開設定（影片 / 海報） */}
                        {viewMode === 'landing' && (
                            <section className="bg-white rounded-xl shadow-md border border-slate-200 p-6 md:p-8 mb-8">
                                <h2 className="sr-only">報名頁設定</h2>
                                {landingDraft === null ? (
                                    <div className="flex justify-center py-16">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-6">
                                        {landingLoadError ? (
                                            <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                                                {landingLoadError}（已載入預設值供編輯）
                                            </div>
                                        ) : null}
                                        <p className="text-slate-600 text-sm leading-relaxed">
                                            此設定會即時套用到公開報名頁（影片區塊、活動海報與分享預覽圖）。資料存放在 Firestore{' '}
                                            <code className="bg-slate-100 px-1 rounded text-xs">
                                                {SIGNUP_LANDING_COLLECTION}/{SIGNUP_LANDING_DOC_ID}
                                            </code>
                                            ；海報檔案於 Storage 路徑 <code className="bg-slate-100 px-1 rounded text-xs">signup_page/</code>。
                                        </p>

                                        <div>
                                            <h3 className="text-lg font-bold text-slate-800 mb-1">YouTube 學員回饋影片</h3>
                                            <p className="text-xs text-slate-500 mb-4">
                                                可新增多列；每列貼上完整網址（Shorts／一般影片／youtu.be）或 11
                                                碼影片 ID。儲存時無法解析的列會自動略過。
                                            </p>
                                            <div className="flex flex-col gap-3">
                                                {landingDraft.rows.map((row, idx) => (
                                                    <div
                                                        key={`yt-${idx}`}
                                                        className="flex flex-col lg:flex-row gap-3 lg:items-center border border-slate-100 rounded-xl p-4 bg-slate-50/80"
                                                    >
                                                        <label className="flex-1 flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                                            連結或影片 ID
                                                            <input
                                                                type="text"
                                                                value={row.urlOrId}
                                                                onChange={(e) => updateLandingVideoRow(idx, 'urlOrId', e.target.value)}
                                                                placeholder="https://www.youtube.com/shorts/xxxxxxxxxxx"
                                                                className="font-normal text-base px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                                            />
                                                        </label>
                                                        <label className="flex-1 flex flex-col gap-1 text-xs font-semibold text-slate-600">
                                                            顯示標題
                                                            <input
                                                                type="text"
                                                                value={row.label}
                                                                onChange={(e) => updateLandingVideoRow(idx, 'label', e.target.value)}
                                                                placeholder="例如：學員真心回饋 ①"
                                                                className="font-normal text-base px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                                            />
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeLandingVideoRow(idx)}
                                                            className="text-rose-600 hover:text-rose-700 text-sm font-bold px-3 py-2 lg:self-end shrink-0"
                                                        >
                                                            移除
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={addLandingVideoRow}
                                                className="mt-3 text-blue-600 hover:text-blue-700 text-sm font-bold"
                                            >
                                                + 新增一列影片
                                            </button>
                                        </div>

                                        <div>
                                            <h3 className="text-lg font-bold text-slate-800 mb-1">活動海報</h3>
                                            <p className="text-xs text-slate-500 mb-4">
                                                建議直式海報，僅支援圖片、單檔 5MB 以內。上傳後請按下方「儲存設定」一併寫入（含 SEO
                                                og:image）。
                                            </p>
                                            <div className="flex flex-col sm:flex-row gap-6 items-start">
                                                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-w-xs w-full shrink-0">
                                                    <img
                                                        src={resolvePosterSrc(landingDraft.posterImageUrl)}
                                                        alt="海報預覽"
                                                        className="w-full h-auto object-cover"
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-3 items-start">
                                                    <input
                                                        ref={landingPosterInputRef}
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={handleLandingPosterChange}
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={landingUploading || isMockMode}
                                                        onClick={() => landingPosterInputRef.current?.click()}
                                                        className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                                                    >
                                                        {landingUploading ? '上傳中…' : '選擇圖片上傳'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={clearLandingPoster}
                                                        className="text-slate-600 hover:text-slate-800 text-sm underline"
                                                    >
                                                        清除自訂海報（未儲存前仍以預覽為準）
                                                    </button>
                                                    {isMockMode ? (
                                                        <p className="text-xs text-amber-700">mock 模式無法上傳至 Storage。</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>

                                        <section className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/35 p-4 md:p-6" aria-labelledby="referral-crud-heading">
                                            <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <h3 id="referral-crud-heading" className="text-lg font-bold text-slate-800">
                                                        推薦連結管理
                                                    </h3>
                                                    <p className="text-xs text-slate-600 mt-1 leading-relaxed max-w-3xl">
                                                        對應 Firestore{' '}
                                                        <code className="bg-white/80 px-1 rounded border border-emerald-100 text-[11px]">{VIBE_REFERRAL_CODES_COLLECTION}</code>
                                                        ：每個 8 碼為一筆資料（可多筆並存）。
                                                        學員開啟 <code className="bg-white/80 px-1 rounded border border-emerald-100 text-[11px]">?ref=</code>{' '}
                                                        會自動依該筆帶入「來源」並隱藏手選。
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={isMockMode || referralCrudMode !== null}
                                                    onClick={openReferralCreate}
                                                    title={referralCrudMode !== null ? '請先完成或取消目前表單' : ''}
                                                    className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow disabled:opacity-45 disabled:cursor-not-allowed"
                                                >
                                                    新增推薦連結
                                                </button>
                                            </header>

                                            {referralCrudMode && (
                                                <div className="rounded-xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
                                                    <h4 className="text-base font-bold text-slate-800 mb-4">
                                                        {referralCrudMode === 'create' ? '新增「推薦連結」' : `編輯「${referralForm.code || '—'}」`}
                                                    </h4>
                                                    <div className="flex flex-col gap-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 md:col-span-1">
                                                                網址代碼（8 碼英數字）
                                                                <input
                                                                    type="text"
                                                                    inputMode="text"
                                                                    autoComplete="off"
                                                                    spellCheck={false}
                                                                    maxLength={8}
                                                                    disabled={referralCrudMode === 'edit'}
                                                                    value={referralForm.code}
                                                                    onChange={(e) =>
                                                                        setReferralForm((prev) => ({
                                                                            ...prev,
                                                                            code: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8),
                                                                        }))
                                                                    }
                                                                    className={`font-mono text-sm px-3 py-2 rounded-lg border border-slate-200 tracking-wide ${referralCrudMode === 'edit' ? 'bg-slate-100 text-slate-600' : 'bg-white'}`}
                                                                    placeholder="8 碼"
                                                                />
                                                            </label>
                                                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 md:col-span-1">
                                                                推薦人姓名
                                                                <input
                                                                    type="text"
                                                                    value={referralForm.referrerName}
                                                                    onChange={(e) =>
                                                                        setReferralForm((prev) => ({ ...prev, referrerName: e.target.value }))
                                                                    }
                                                                    placeholder="例如：Rich老師"
                                                                    className="font-normal text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                                                />
                                                            </label>
                                                            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 md:col-span-1">
                                                                上層推薦人（選填）
                                                                <input
                                                                    type="text"
                                                                    value={referralForm.upperReferrerName}
                                                                    onChange={(e) =>
                                                                        setReferralForm((prev) => ({
                                                                            ...prev,
                                                                            upperReferrerName: e.target.value,
                                                                        }))
                                                                    }
                                                                    placeholder="將寫入「推薦人（上層：○○）」"
                                                                    className="font-normal text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white"
                                                                />
                                                            </label>
                                                        </div>
                                                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center sm:justify-between">
                                                            <code
                                                                className="text-[11px] bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg break-all text-slate-700"
                                                                title="完整報名連結預覽"
                                                            >
                                                                {referralForm.code && /^[A-Za-z0-9]{8}$/.test(referralForm.code.trim())
                                                                    ? buildReferralPublicUrl(referralForm.code.trim())
                                                                    : `${PUBLIC_SIGNUP_CHECKIN_ORIGIN}${REFERRAL_SIGNUP_PUBLIC_PATH}?ref=________`}
                                                            </code>
                                                            <div className="flex flex-wrap gap-2">
                                                                {referralCrudMode === 'create' ? (
                                                                    <button
                                                                        type="button"
                                                                        disabled={isMockMode}
                                                                        onClick={regenerateReferralCodeDraft}
                                                                        className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                                                                    >
                                                                        重新隨機代碼
                                                                    </button>
                                                                ) : null}
                                                                <button
                                                                    type="button"
                                                                    disabled={isMockMode}
                                                                    onClick={copyReferralUrlFromForm}
                                                                    className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                                                                >
                                                                    複製網址
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={referralSaving}
                                                                    onClick={cancelReferralCrud}
                                                                    className="border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold"
                                                                >
                                                                    取消
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={referralSaving || isMockMode}
                                                                    onClick={submitReferralForm}
                                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                                                                >
                                                                    {referralSaving ? '處理中…' : referralCrudMode === 'create' ? '建立' : '更新'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {referralOpMsg ? (
                                                <div className="text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">
                                                    {referralOpMsg}
                                                </div>
                                            ) : null}

                                            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/90 flex flex-wrap items-center gap-2 justify-between">
                                                    <h4 className="text-sm font-bold text-slate-800">推薦連結列表</h4>
                                                    <span className="text-xs text-slate-500">
                                                        {referralListLoading ? '載入中…' : `共 ${referralList.length} 筆`}
                                                    </span>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    {referralListLoading ? (
                                                        <div className="px-4 py-8 text-center text-sm text-slate-500">載入資料中…</div>
                                                    ) : referralList.length === 0 ? (
                                                        <div className="px-4 py-8 text-center text-sm text-slate-500">
                                                            尚未建立任何推薦連結。請按右上角「新增推薦連結」建立第一筆。
                                                        </div>
                                                    ) : (
                                                        <table className="min-w-full text-sm text-left border-collapse">
                                                            <thead>
                                                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                                                    <th scope="col" className="px-3 py-2.5 font-bold text-slate-600 whitespace-nowrap">
                                                                        網址代碼
                                                                    </th>
                                                                    <th scope="col" className="px-3 py-2.5 font-bold text-slate-600">
                                                                        推薦人
                                                                    </th>
                                                                    <th scope="col" className="px-3 py-2.5 font-bold text-slate-600 hidden sm:table-cell">
                                                                        上層
                                                                    </th>
                                                                    <th scope="col" className="px-3 py-2.5 font-bold text-slate-600 min-w-[180px]">
                                                                        連結預覽
                                                                    </th>
                                                                    <th scope="col" className="px-3 py-2.5 font-bold text-slate-600 text-right whitespace-nowrap">
                                                                        操作
                                                                    </th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {referralList.map((r) => {
                                                                    const url = buildReferralPublicUrl(r.code);
                                                                    return (
                                                                        <tr key={r.code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                                                                            <td className="px-3 py-2.5 align-top">
                                                                                <span className="font-mono font-bold text-slate-900">{r.code}</span>
                                                                            </td>
                                                                            <td className="px-3 py-2.5 align-top text-slate-800">{r.referrerName || '—'}</td>
                                                                            <td className="px-3 py-2.5 align-top text-slate-600 hidden sm:table-cell">
                                                                                {r.upperReferrerName || '—'}
                                                                            </td>
                                                                            <td className="px-3 py-2.5 align-top">
                                                                                <span className="text-xs text-slate-500 max-w-[14rem] sm:max-w-xs inline-block truncate" title={url}>
                                                                                    {url}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-3 py-2.5 align-top">
                                                                                <div className="flex flex-wrap justify-end gap-1.5">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => copyReferralUrlByCode(r.code)}
                                                                                        className="text-xs font-bold text-sky-700 hover:text-sky-900 px-2 py-1 rounded-lg border border-sky-200 bg-sky-50"
                                                                                    >
                                                                                        複製
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={referralCrudMode !== null}
                                                                                        onClick={() => openReferralEdit(r)}
                                                                                        className="text-xs font-bold text-emerald-800 hover:text-emerald-950 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 disabled:opacity-40"
                                                                                    >
                                                                                        編輯
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={referralCrudMode !== null || isMockMode}
                                                                                        onClick={() => deleteReferralRow(r.code)}
                                                                                        className="text-xs font-bold text-rose-700 hover:text-rose-900 px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 disabled:opacity-40"
                                                                                    >
                                                                                        刪除
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            </div>
                                        </section>

                                        {landingMsg ? (
                                            <div className="text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm whitespace-pre-wrap">
                                                {landingMsg}
                                            </div>
                                        ) : null}

                                        <div className="flex flex-wrap gap-3 pt-2">
                                            <button
                                                type="button"
                                                disabled={landingSaving || isMockMode}
                                                onClick={handleLandingSave}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow disabled:opacity-50"
                                            >
                                                {landingSaving ? '儲存中…' : '儲存設定'}
                                            </button>
                                            {isMockMode ? (
                                                <span className="text-xs text-slate-500 self-center">mock 模式無法寫入 Firestore。</span>
                                            ) : null}
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* VIEW MODE: SESSIONS */}
                        {viewMode === 'sessions' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {SHOW_SIGNUP_TIME_NOT_AVAILABLE_OPTION && (
                                    <div
                                        key="time_not_available_card"
                                        className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all border border-emerald-100 group relative overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
                                        <div className="relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="text-xl font-bold text-slate-800">以上場次時間無法配合</h3>
                                                <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 text-xs font-bold px-2 py-1 rounded">
                                                    許願統計
                                                </div>
                                            </div>
                                            <p className="text-slate-500 text-sm mb-3">彙整學員希望的開課時間與地點</p>
                                            <p className="text-emerald-700 font-bold mb-4 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                點進去看填寫內容
                                            </p>

                                            <div className="flex justify-end items-center text-sm text-slate-500">
                                                <button
                                                    type="button"
                                                    onClick={() => fetchRegistrations(buildTimeNotAvailableSession())}
                                                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-4 py-2 rounded-lg transition-colors border border-emerald-200"
                                                >
                                                    管理 &rarr;
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {sessions.length === 0 && (
                                    <div className="col-span-full text-center py-20 bg-white rounded-xl shadow-sm border border-dashed border-slate-300">
                                        <p className="text-slate-500 mb-4">目前沒有場次資料</p>
                                        {isAdmin && (
                                            <button onClick={() => setIsCreateSessionOpen(true)} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">立即建立場次</button>
                                        )}
                                    </div>
                                )}
                                {sortedSessions.map(session => (
                                    <div key={session.id} className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all border border-slate-100 group relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
                                        <div className="relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="text-xl font-bold text-slate-800">{session.title}</h3>
                                                <button onClick={(e) => { e.stopPropagation(); openEditSessionModal(session); }} className="text-slate-400 hover:text-blue-600 p-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                            </div>
                                            <div className="mb-2">
                                                {session.isSignupOpen !== false ? (
                                                    <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                                        開放報名
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                                        關閉報名
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-500 text-sm mb-3">📍 {session.location}</p>
                                            <p className="text-blue-600 font-bold mb-4 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                {new Date(session.date).toLocaleDateString()}{' '}
                                                {new Date(session.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                {session.endTime ? `～${session.endTime}` : ''}
                                            </p>
                                            {session.note && (
                                                <p className="text-slate-500 text-sm mb-4 line-clamp-2">
                                                    {session.note}
                                                </p>
                                            )}

                                            {/* Capacity：正課 + 複訓 */}
                                            <div className="mb-2">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-slate-500">正課</span>
                                                    <span className={`font-bold ${(session.currentCount || 0) >= (session.maxCapacity || 50) ? 'text-red-500' : 'text-green-600'}`}>
                                                        {session.currentCount || 0} / {session.maxCapacity || 50}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${(session.currentCount || 0) >= (session.maxCapacity || 50) ? 'bg-red-500' : 'bg-green-500'}`}
                                                        style={{ width: `${Math.min(100, ((session.currentCount || 0) / (session.maxCapacity || 50)) * 100)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                            <div className="mb-4">
                                                {(() => {
                                                    const rMax = session.refresherMaxCapacity > 0 ? session.refresherMaxCapacity : DEFAULT_REFRESHER_MAX;
                                                    const rCur = session.refresherCurrentCount || 0;
                                                    return (
                                                        <>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-slate-500">複訓 $500 可收</span>
                                                                <span className={`font-bold ${rCur >= rMax ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                    {rCur} / {rMax}
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${rCur >= rMax ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                                    style={{ width: `${Math.min(100, (rCur / rMax) * 100)}%` }}
                                                                />
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>

                                            <div className="flex justify-between items-center text-sm text-slate-500">
                                                {((session.currentCount || 0) >= (session.maxCapacity || 50)) ? (
                                                    <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">額滿</span>
                                                ) : (
                                                    <span>NT$ {session.price}</span>
                                                )}
                                                <button
                                                    onClick={() => fetchRegistrations(session)}
                                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition-colors text-left leading-snug"
                                                    title="正課/複訓人數可進名單內分頁查看"
                                                >
                                                    報名管理
                                                    <span className="block text-xs font-mono text-slate-500 mt-0.5">
                                                        正{session.currentCount || 0} / 複{session.refresherCurrentCount || 0}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* VIEW MODE: REGISTRATIONS */}
                        {viewMode === 'registrations' && selectedSession && (
                            <div className="space-y-6 animate-fade-in-up">
                                {/* Session Info Card */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                        <div>
                                            <h2 className="text-2xl font-bold text-slate-800 mb-2">{selectedSession.title}</h2>
                                            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-bold text-slate-400">DATE:</span>{' '}
                                                    {formatSessionDateTime(selectedSession)}
                                                </div>
                                                <div className="flex items-center gap-1"><span className="font-bold text-slate-400">LOC:</span> {selectedSession.location}</div>
                                                <div className="flex items-center gap-1"><span className="font-bold text-slate-400">ADDR:</span> {selectedSession.address}</div>
                                                <div className="flex items-center gap-1"><span className="font-bold text-slate-400">單價:</span> ${selectedSession.price}</div>
                                                {!isRefresherListTab && (
                                                <div className="flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded border border-green-200"><span className="font-bold text-green-600">本列表總實收:</span> <span className="text-green-700 font-bold">${displayedRegistrations.filter(r => r.status === 'confirmed').reduce((sum, r) => sum + (r.receivedAmount || 0), 0)}</span></div>
                                                )}
                                            </div>
                                            {selectedSession.note && (
                                                <div className="mt-3 text-sm text-slate-600">
                                                    <span className="font-bold text-slate-400">NOTE:</span> {selectedSession.note}
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-2 md:mt-0 w-full md:w-auto md:text-right">
                                            {selectedSession.id === 'time_not_available' ? (
                                                <>
                                                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">人數</div>
                                                    <div className="text-3xl font-black text-slate-800">
                                                        {registrations.filter((r) => r.status !== 'cancelled').reduce((acc, r) => acc + (r.count || 1), 0)}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="text-xs text-slate-500 font-bold mb-1">本頁名額（{registrationListTab === 'refresher' ? '複訓' : '正課'}）</div>
                                                    <div className="text-2xl font-black text-slate-800">
                                                        {displayedRegistrations.filter((r) => r.status !== 'cancelled').reduce((acc, r) => acc + (r.count || 1), 0)}
                                                        <span className="text-lg text-slate-400 font-normal">/
                                                            {registrationListTab === 'refresher'
                                                                ? (selectedSession.refresherMaxCapacity > 0 ? selectedSession.refresherMaxCapacity : DEFAULT_REFRESHER_MAX)
                                                                : (selectedSession.maxCapacity || 50)}
                                                        </span>
                                                    </div>
                                                    {registrationListTab === 'refresher' && (() => {
                                                        const rMax = selectedSession.refresherMaxCapacity > 0 ? selectedSession.refresherMaxCapacity : DEFAULT_REFRESHER_MAX;
                                                        const n = displayedRegistrations.filter((r) => r.status !== 'cancelled').reduce((acc, r) => acc + (r.count || 1), 0);
                                                        if (n < rMax) return null;
                                                        return (
                                                            <div className="text-xs text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded inline-block mt-1">複訓額滿（可備取）</div>
                                                        );
                                                    })()}
                                                    {registrationListTab === 'main' && (selectedSession.currentCount || 0) >= (selectedSession.maxCapacity || 50) && (
                                                        <div className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded inline-block mt-1">正課額滿</div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>


                                <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
                                    {selectedSession.id !== 'time_not_available' && (
                                        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-100/80 px-3 py-2">
                                            <button
                                                type="button"
                                                onClick={() => setRegistrationListTab('main')}
                                                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                                                    registrationListTab === 'main'
                                                        ? 'bg-sky-600 text-white shadow'
                                                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                正課名單
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRegistrationListTab('refresher')}
                                                className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                                                    registrationListTab === 'refresher'
                                                        ? 'bg-emerald-600 text-white shadow'
                                                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                複訓名單
                                            </button>
                                        </div>
                                    )}
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                                        {isRefresherListTab && (
                                            <button
                                                type="button"
                                                onClick={handleBatchVerifyRefresherIdentity}
                                                disabled={opLoading || displayedRegistrations.length === 0}
                                                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-800 shadow-sm transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                title="依填報的前次場次載入該場正課名單（不含已取消）；複訓列與名單若 Email 相同或手機相同即視為符合；無 previousSessionId 時會用場次標題對應"
                                            >
                                                一鍵檢查身份
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleSendAllCheckInEmailsResend}
                                            disabled={
                                                opLoading ||
                                                displayedRegistrations.length === 0 ||
                                                !selectedSession ||
                                                selectedSession.id === 'time_not_available'
                                            }
                                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300 bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                                            title="以 Resend 寄出報到 HTML 信給目前清單所有有效 Email（已排除已取消）"
                                        >
                                            全部寄送通知
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleExportRegistrationsCsv}
                                            disabled={displayedRegistrations.length === 0}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            匯出 CSV
                                        </button>
                                    </div>
                                    <div className="hidden md:block overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                                    <th className="p-3 font-semibold min-w-[130px]">時間</th>
                                                    <th className="p-3 font-semibold min-w-[180px]">學員</th>
                                                    {!isRefresherListTab && (
                                                    <>
                                                    <th className="p-3 font-semibold min-w-[100px]">推薦人</th>
                                                    <th className="p-3 font-semibold w-[70px]">收款</th>
                                                    <th className="p-3 font-semibold min-w-[90px]">付款</th>
                                                    <th className="p-3 font-semibold min-w-[100px]">金額 / 備註</th>
                                                    </>
                                                    )}
                                                    {isRefresherListTab && (
                                                        <>
                                                        <th className="p-3 font-semibold min-w-[100px]">推薦人</th>
                                                        <th className="p-3 font-semibold min-w-[200px]">前次報名場次</th>
                                                        <th className="p-3 font-semibold min-w-[100px]">備註</th>
                                                        </>
                                                    )}
                                                    <th className="p-3 font-semibold min-w-[120px]">狀態 / 報到</th>
                                                    <th className="p-3 font-semibold min-w-[180px]">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                                                {displayedRegistrations.length === 0 ? (
                                                    <tr><td colSpan={isRefresherListTab ? 7 : 8} className="p-8 text-center text-slate-400">此分類尚無報名資料</td></tr>
                                                ) : displayedRegistrations.map((reg) => {
                                                    const previousSessionText = getRefresherPreviousSessionText(reg);
                                                    return (
                                                    <tr key={reg.id} className={`hover:bg-slate-50 transition-colors ${reg.status === 'cancelled' ? 'opacity-50 grayscale bg-slate-50' : ''}`}>
                                                        <td className="p-3 text-slate-500 text-xs align-top whitespace-nowrap font-mono">{formatRegistrationListTime(reg.createdAt)}</td>
                                                        <td className="p-3 align-top">
                                                            <div className="font-bold text-slate-800 inline-flex items-center gap-2">
                                                                <span>{reg.name}</span>
                                                                {isRefresherListTab && identityVerifiedMap[reg.id] && (
                                                                    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">已核對身份</span>
                                                                )}
                                                            </div>
                                                            <div className="font-mono text-xs text-slate-500 mt-0.5">{reg.phone}</div>
                                                            {!isRefresherListTab && reg.registrationKind === 'refresher' && (reg.previousSessionTitle || reg.previousSessionDate) && (
                                                                <div className="text-[10px] text-slate-600 mt-1">前次：{reg.previousSessionTitle || reg.previousSessionDate || '—'}</div>
                                                            )}
                                                            {(reg.sessionId === 'time_not_available' || reg.isTimeNotAvailable) && (
                                                                <div className="mt-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                                                                    <div className="font-bold mb-0.5">許願開課</div>
                                                                    <div>時間：{reg.wishTime || '-'}</div>
                                                                    <div>地點：{reg.wishLocation || '-'}</div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        {!isRefresherListTab && (
                                                        <>
                                                        <td className="p-3 text-xs text-slate-700 align-top max-w-[200px]">
                                                            {(() => {
                                                                const pr = getRegistrationReferrerParts(reg);
                                                                const main = pr.referrerName || reg.source || '';
                                                                if (!main && !pr.upperReferrerName) {
                                                                    return <span className="text-slate-400">—</span>;
                                                                }
                                                                return (
                                                                    <div className="space-y-1">
                                                                        {main ? (
                                                                            <div className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded px-1.5 py-1 break-words">{main}</div>
                                                                        ) : null}
                                                                        {pr.upperReferrerName ? (
                                                                            <div className="text-[10px] text-violet-900 bg-violet-50 border border-violet-100 rounded px-1.5 py-0.5 break-words">
                                                                                上層：{pr.upperReferrerName}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="p-3 text-sm align-top">{reg.payee ? <span className="font-bold text-amber-900">{reg.payee}</span> : <span className="text-slate-300">—</span>}</td>
                                                        <td className="p-3 align-top">
                                                            <div className="text-sm font-medium">{paymentMethodToLabel(reg.paymentMethod)}</div>
                                                            {reg.paymentMethod === 'transfer' && reg.lastFive && (
                                                                <div className="text-xs text-slate-500 font-mono">末五碼:{reg.lastFive}</div>
                                                            )}
                                                        </td>
                                                        <td className="p-3 align-top">
                                                            <div className="font-bold">
                                                                {reg.status === 'confirmed' ? (
                                                                    <span className="text-green-600">${reg.receivedAmount}</span>
                                                                ) : (
                                                                    <span className="text-slate-400">-</span>
                                                                )}
                                                            </div>
                                                            {reg.adminNote && <div className="text-xs text-slate-500 mt-1 max-w-[150px] truncate" title={reg.adminNote}>{reg.adminNote}</div>}
                                                            {(reg.invoiceType === 'tax_id' && reg.taxId && reg.registrationKind !== 'refresher' && reg.invoiceType !== 'refresher_exempt') ? (
                                                                <div className="text-[11px] font-mono text-slate-800 mt-1.5 border-t border-slate-100 pt-1">
                                                                    統編 {reg.taxId}
                                                                </div>
                                                            ) : null}
                                                        </td>
                                                        </>
                                                        )}
                                                        {isRefresherListTab && (
                                                            <>
                                                            <td className="p-3 text-xs text-slate-700 align-top max-w-[200px]">
                                                                {(() => {
                                                                    const pr = getRegistrationReferrerParts(reg);
                                                                    const main = pr.referrerName || reg.source || '';
                                                                    if (!main && !pr.upperReferrerName) {
                                                                        return <span className="text-slate-400">—</span>;
                                                                    }
                                                                    return (
                                                                        <div className="space-y-1">
                                                                            {main ? (
                                                                                <div className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded px-1.5 py-1 break-words">{main}</div>
                                                                            ) : null}
                                                                            {pr.upperReferrerName ? (
                                                                                <div className="text-[10px] text-violet-900 bg-violet-50 border border-violet-100 rounded px-1.5 py-0.5 break-words">
                                                                                    上層：{pr.upperReferrerName}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </td>
                                                            <td className="p-3 align-top text-xs text-slate-700 max-w-[220px]">
                                                                <span className="line-clamp-4" title={previousSessionText !== '—' ? previousSessionText : undefined}>{previousSessionText}</span>
                                                            </td>
                                                            <td className="p-3 align-top text-xs text-slate-600 max-w-[140px]">
                                                                {reg.adminNote ? <span className="line-clamp-3" title={reg.adminNote}>{reg.adminNote}</span> : <span className="text-slate-300">—</span>}
                                                            </td>
                                                            </>
                                                        )}
                                                        <td className="p-4">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${reg.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                                                reg.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                                    'bg-yellow-100 text-yellow-800'
                                                                }`}>
                                                                {reg.status === 'confirmed' ? '已付款' : reg.status === 'cancelled' ? '已取消' : '待核對'}
                                                            </span>
                                                            {reg.checkInAt ? (
                                                                <div className="mt-1.5 text-[11px] font-medium text-slate-600">
                                                                    已報到 {formatCheckInShort(reg.checkInAt)}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-1.5 text-[11px] text-slate-400">尚未報到</div>
                                                            )}
                                                            {reg.attendanceConfirmedAt && (
                                                                <div className="mt-1.5 inline-flex rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                                                                    會出席
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex flex-wrap gap-2">
                                                                <button
                                                                    onClick={() => openEditModal(reg)}
                                                                    className="px-3 py-1 bg-white border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 font-bold"
                                                                >
                                                                    編輯
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSendOneCheckInEmailResend(reg)}
                                                                    disabled={opLoading || !reg.email || reg.status === 'cancelled'}
                                                                    className="px-3 py-1 bg-violet-600 border border-violet-600 rounded text-xs text-white hover:bg-violet-500 font-bold disabled:cursor-not-allowed disabled:opacity-50"
                                                                    title="透過 Resend 寄送與「全部送出」相同之 HTML 報到信（含確認出席連結）"
                                                                >
                                                                    寄送通知
                                                                </button>
                                                                <button
                                                                    onClick={() => copyCheckInLink(reg)}
                                                                    className="px-3 py-1 bg-emerald-600 border border-emerald-600 rounded text-xs text-white hover:bg-emerald-700 font-bold"
                                                                    title="複製報到 QR 頁面連結"
                                                                >
                                                                    複製
                                                                </button>
                                                                
                                                                {showClearCheckInButton && reg.status !== 'cancelled' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleClearCheckInInfo(reg)}
                                                                        disabled={opLoading}
                                                                        className="px-3 py-1 rounded text-xs font-bold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                                                        title="清除報到時間並重設為待核對、實收 0（方便測試還原）"
                                                                    >
                                                                        清除報到
                                                                    </button>
                                                                )}
                                                                {/* {reg.status !== 'cancelled' && (
                                                                    <button onClick={() => handleQuickCancel(reg)} className="text-red-400 hover:text-red-600 text-xs underline">
                                                                        取消報名
                                                                    </button>
                                                                )} */}
                                                                {/* <button onClick={() => handleDeleteRegistration(reg.id)} className="text-slate-400 hover:text-red-600 text-xs" title="刪除">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                </button> */}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* 手機版：卡片式清單，避免表格擠壓 */}
                                    <div className="md:hidden p-4">
                                        {displayedRegistrations.length === 0 ? (
                                            <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                此分類尚無報名資料
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {displayedRegistrations.map((reg) => {
                                                    const paymentLabel = paymentMethodToLabel(reg.paymentMethod);
                                                    const paymentTail = reg.paymentMethod === 'transfer' && reg.lastFive
                                                        ? `（末五碼 ${reg.lastFive}）`
                                                        : '';
                                                    const previousSessionText = getRefresherPreviousSessionText(reg);
                                                    return (
                                                    <article
                                                        key={reg.id}
                                                        className={`bg-slate-50 border border-slate-200 rounded-xl p-3 ${reg.status === 'cancelled' ? 'opacity-60 grayscale' : ''}`}
                                                    >
                                                        <div className="text-[11px] leading-snug text-slate-500 font-mono">{formatRegistrationListTime(reg.createdAt)}</div>
                                                        <div className="mt-0.5 flex items-start justify-between gap-2 min-w-0">
                                                            <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                                                <span className="font-bold text-slate-800 text-sm shrink-0">{reg.name}</span>
                                                                {isRefresherListTab && identityVerifiedMap[reg.id] && (
                                                                    <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">已核對身份</span>
                                                                )}
                                                                {reg.registrationKind === 'refresher' && !isRefresherListTab && (
                                                                    <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 rounded">複訓</span>
                                                                )}
                                                                <span className="font-mono text-[11px] text-slate-500 break-all w-full">{reg.phone}</span>
                                                            </div>
                                                            <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                                                                <span className={`text-[10px] leading-tight inline-flex items-center px-1.5 py-px rounded font-bold whitespace-nowrap ${reg.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                                                    reg.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                                        'bg-yellow-100 text-yellow-800'
                                                                    }`}>
                                                                    {reg.status === 'confirmed' ? '已付款' : reg.status === 'cancelled' ? '已取消' : '待核對'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {(() => {
                                                            const pr = getRegistrationReferrerParts(reg);
                                                            const main = pr.referrerName || reg.source;
                                                            if (!main && !pr.upperReferrerName) return null;
                                                            return (
                                                                <div className="mt-1.5 flex flex-wrap gap-1 items-start">
                                                                    {main ? (
                                                                        <span className="text-[10px] text-blue-800 bg-blue-50 border border-blue-100 px-1.5 py-px rounded max-w-full break-words">推薦：{main}</span>
                                                                    ) : null}
                                                                    {pr.upperReferrerName ? (
                                                                        <span className="text-[9px] text-violet-900 bg-violet-50 border border-violet-100 px-1.5 py-px rounded max-w-full break-words">
                                                                            上層：{pr.upperReferrerName}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })()}

                                                        {(reg.sessionId === 'time_not_available' || reg.isTimeNotAvailable) && (
                                                            <div className="mt-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
                                                                <div className="font-bold mb-0.5">許願開課</div>
                                                                <div>時間：{reg.wishTime || '-'}</div>
                                                                <div>地點：{reg.wishLocation || '-'}</div>
                                                            </div>
                                                        )}

                                                        {!isRefresherListTab && reg.payee && (
                                                            <div className="mt-1.5 text-[11px] text-slate-600">
                                                                <span className="text-slate-500">收款</span>：
                                                                <span className="font-bold text-amber-900">{reg.payee}</span>
                                                            </div>
                                                        )}
                                                        {reg.registrationKind === 'refresher' && (reg.previousSessionTitle || reg.previousSessionDate) && (
                                                            <div className="mt-0.5 text-[10px] text-slate-600">前次：{reg.previousSessionTitle || reg.previousSessionDate}</div>
                                                        )}

                                                        {isRefresherListTab ? (
                                                            reg.adminNote && (
                                                                <div className="mt-1.5 text-[11px] text-slate-600">
                                                                    <span className="text-slate-500">備註</span>：{reg.adminNote}
                                                                </div>
                                                            )
                                                        ) : (
                                                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-800 items-baseline">
                                                            <span className="min-w-0">
                                                                <span className="text-slate-500">付款方式</span>：
                                                                <span className="font-medium">{paymentLabel}{paymentTail}</span>
                                                            </span>
                                                            <span className="shrink-0 whitespace-nowrap">
                                                                <span className="text-slate-500">金額</span>：
                                                                {reg.status === 'confirmed' ? (
                                                                    <span className="font-bold text-emerald-600">${reg.receivedAmount}</span>
                                                                ) : (
                                                                    <span className="text-slate-400">-</span>
                                                                )}
                                                            </span>
                                                            {reg.adminNote ? (
                                                                <span className="min-w-0 flex-1 overflow-hidden text-[11px] text-slate-600 text-ellipsis whitespace-nowrap" title={reg.adminNote}>
                                                                    <span className="text-slate-500">備註</span>：{reg.adminNote}
                                                                </span>
                                                            ) : null}
                                                            {(reg.invoiceType === 'tax_id' && reg.taxId && reg.registrationKind !== 'refresher' && reg.invoiceType !== 'refresher_exempt') ? (
                                                                <span className="w-full text-[11px] font-mono text-slate-800 border-t border-slate-200 pt-1 mt-1">
                                                                    統編 {reg.taxId}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        )}

                                                        <div className="mt-1.5 text-[11px] text-slate-600">
                                                            <span className="text-slate-500">現場報到</span>：
                                                            {reg.checkInAt ? (
                                                                <span className="font-medium text-slate-800">{formatCheckInShort(reg.checkInAt)}</span>
                                                            ) : (
                                                                <span className="text-slate-400">尚未</span>
                                                            )}
                                                        </div>
                                                        {reg.attendanceConfirmedAt && (
                                                            <div className="mt-1 inline-flex rounded-full border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                                                                會出席
                                                            </div>
                                                        )}

                                                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSendOneCheckInEmailResend(reg)}
                                                                disabled={opLoading || !reg.email || reg.status === 'cancelled'}
                                                                className="flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-bold border border-violet-600 bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                                                title="透過 Resend 寄送 HTML 報到信"
                                                            >
                                                                寄報到信
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyCheckInLink(reg)}
                                                                className="flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-bold border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
                                                                title="複製報到 QR 頁面連結"
                                                            >
                                                                複製報到
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => openEditModal(reg)}
                                                                className="flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                                                            >
                                                                編輯
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteRegistration(reg.id)}
                                                                className="flex-1 min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-white text-red-600 hover:bg-red-50 active:bg-red-100 transition-colors inline-flex items-center justify-center gap-1"
                                                                title="刪除"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                刪除
                                                            </button>
                                                        </div>
                                                        {showClearCheckInButton && reg.status !== 'cancelled' && (
                                                            <div className="mt-2 flex flex-col gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearCheckInInfo(reg)}
                                                                    disabled={opLoading}
                                                                    className="w-full min-h-[40px] rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                                                >
                                                                    清除報到資訊
                                                                </button>
                                                            </div>
                                                        )}
                                                        {reg.status !== 'cancelled' && (
                                                            <div className="mt-2 flex flex-col gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleQuickCancel(reg)}
                                                                    className="w-full min-h-[36px] text-center text-xs font-bold text-red-500 underline"
                                                                >
                                                                    取消報名
                                                                </button>
                                                            </div>
                                                        )}
                                                    </article>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* MODAL: CREATE SESSION */}
                {isAdmin && isCreateSessionOpen && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in-up max-h-[90vh] overflow-y-auto">
                            <h3 className="text-xl font-bold text-slate-800 mb-6">新增場次</h3>
                            <form onSubmit={handleCreateSession} className="space-y-4">
                                <div><label className="text-xs font-bold text-slate-500 uppercase">標題</label><input type="text" value={newSession.title} onChange={e => setNewSession({ ...newSession, title: e.target.value })} className="w-full border p-2 rounded" /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">日期</label><input type="date" value={newSession.date} onChange={e => setNewSession({ ...newSession, date: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">時間</label><input type="time" value={newSession.time} onChange={e => setNewSession({ ...newSession, time: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">結束時間</label><input type="time" value={newSession.endTime} onChange={e => setNewSession({ ...newSession, endTime: e.target.value })} className="w-full border p-2 rounded" /></div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">地點</label>
                                    <input
                                        type="text"
                                        list="locations"
                                        value={newSession.location}
                                        onChange={handleNewSessionLocationChange}
                                        required
                                        placeholder="輸入或選擇地點"
                                        className="w-full border p-2 rounded"
                                    />
                                    <datalist id="locations">
                                        {existingLocations.map(loc => <option key={loc} value={loc} />)}
                                    </datalist>
                                </div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">地址</label><input type="text" value={newSession.address} onChange={e => setNewSession({ ...newSession, address: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">價格</label><input type="number" value={newSession.price} onChange={e => setNewSession({ ...newSession, price: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">原價</label><input type="number" value={newSession.originalPrice} onChange={e => setNewSession({ ...newSession, originalPrice: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                                    <p className="text-xs font-bold text-slate-700 mb-2">人數名額（正課與複訓分開，依場地調整）</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500">正課名額上限</label>
                                            <input type="number" min="1" value={newSession.maxCapacity} onChange={e => setNewSession({ ...newSession, maxCapacity: e.target.value })} required className="w-full border p-2 rounded bg-white" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500">複訓收取人數</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={newSession.refresherMaxCapacity}
                                                onChange={e => setNewSession({ ...newSession, refresherMaxCapacity: e.target.value })}
                                                className="w-full border p-2 rounded bg-white"
                                                placeholder={`預設 ${DEFAULT_REFRESHER_MAX}`}
                                            />
                                            <p className="text-[11px] text-slate-500 mt-1 leading-snug">預設 {DEFAULT_REFRESHER_MAX} 人；場地較小可在此下修。後台以「人數」寫入本場次。</p>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">備註</label>
                                    <textarea value={newSession.note} onChange={e => setNewSession({ ...newSession, note: e.target.value })} className="w-full border p-2 rounded h-24" placeholder="例如：請攜帶筆電 / 提早 10 分鐘報到"></textarea>
                                </div>
                                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={newSession.isSignupOpen !== false}
                                        onChange={e => setNewSession({ ...newSession, isSignupOpen: e.target.checked })}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm font-semibold text-slate-700">開放報名</span>
                                </label>

                                <div className="flex gap-3 mt-8 pt-4 border-t">
                                    <button type="button" onClick={() => setIsCreateSessionOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200">取消</button>
                                    <button type="submit" disabled={opLoading} className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50">{opLoading ? '處理中...' : '建立'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL: EDIT SESSION */}
                {isEditSessionOpen && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in-up max-h-[90vh] overflow-y-auto">
                            <h3 className="text-xl font-bold text-slate-800 mb-6">編輯場次</h3>
                            <form onSubmit={handleUpdateSession} className="space-y-4">
                                <div><label className="text-xs font-bold text-slate-500 uppercase">標題</label><input type="text" value={editSessionForm.title} onChange={e => setEditSessionForm({ ...editSessionForm, title: e.target.value })} className="w-full border p-2 rounded" /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">日期</label><input type="date" value={editSessionForm.date} onChange={e => setEditSessionForm({ ...editSessionForm, date: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">時間</label><input type="time" value={editSessionForm.time} onChange={e => setEditSessionForm({ ...editSessionForm, time: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">結束時間</label><input type="time" value={editSessionForm.endTime} onChange={e => setEditSessionForm({ ...editSessionForm, endTime: e.target.value })} className="w-full border p-2 rounded" /></div>
                                </div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">地點</label><input type="text" list="locations_edit" value={editSessionForm.location} onChange={handleEditSessionLocationChange} required className="w-full border p-2 rounded" />
                                    <datalist id="locations_edit">
                                        {existingLocations.map(loc => <option key={loc} value={loc} />)}
                                    </datalist>
                                </div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">地址</label><input type="text" value={editSessionForm.address} onChange={e => setEditSessionForm({ ...editSessionForm, address: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">價格</label><input type="number" value={editSessionForm.price} onChange={e => setEditSessionForm({ ...editSessionForm, price: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">原價</label><input type="number" value={editSessionForm.originalPrice} onChange={e => setEditSessionForm({ ...editSessionForm, originalPrice: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                                    <p className="text-xs font-bold text-slate-700 mb-2">人數名額（正課與複訓分開，依場地調整）</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500">正課名額上限</label>
                                            <input type="number" min="1" value={editSessionForm.maxCapacity} onChange={e => setEditSessionForm({ ...editSessionForm, maxCapacity: e.target.value })} required className="w-full border p-2 rounded bg-white" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500">複訓收取人數</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={editSessionForm.refresherMaxCapacity}
                                                onChange={e => setEditSessionForm({ ...editSessionForm, refresherMaxCapacity: e.target.value })}
                                                className="w-full border p-2 rounded bg-white"
                                                placeholder={`預設 ${DEFAULT_REFRESHER_MAX}`}
                                            />
                                            <p className="text-[11px] text-slate-500 mt-1 leading-snug">預設 {DEFAULT_REFRESHER_MAX} 人；場地較小可下修。與正課人數分開。</p>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">備註</label>
                                    <textarea value={editSessionForm.note} onChange={e => setEditSessionForm({ ...editSessionForm, note: e.target.value })} className="w-full border p-2 rounded h-24" placeholder="例如：請攜帶筆電 / 提早 10 分鐘報到"></textarea>
                                </div>
                                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editSessionForm.isSignupOpen !== false}
                                        onChange={e => setEditSessionForm({ ...editSessionForm, isSignupOpen: e.target.checked })}
                                        className="h-4 w-4"
                                    />
                                    <span className="text-sm font-semibold text-slate-700">開放報名</span>
                                </label>

                                <div className="flex gap-3 mt-8 pt-4 border-t">
                                    <button type="button" onClick={() => setIsEditSessionOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200">取消</button>
                                    <button type="submit" disabled={opLoading} className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50">{opLoading ? '儲存變更' : '儲存'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* MODAL: EDIT REGISTRATION */}
                {isEditRegOpen && editTarget && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full flex flex-col max-h-[min(90vh,90dvh)] min-h-0 overflow-hidden animate-fade-in-up overscroll-contain">
                            <div className="shrink-0 px-6 pt-6">
                                <h3 className="text-xl font-bold text-slate-800 mb-4">編輯 / 核對資料</h3>
                                <div className="bg-slate-50 p-3 rounded-lg text-sm">
                                    <p><span className="text-slate-500">學員：</span> <span className="font-bold">{editTarget.name}</span></p>
                                    {editTarget.email && <p><span className="text-slate-500">Email：</span> {editTarget.email}</p>}
                                    <p><span className="text-slate-500">電話：</span> {editTarget.phone}</p>
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4 space-y-4">
                                <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-3">
                                    <p className="text-xs font-bold text-slate-700">推薦來源</p>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">推薦人（等同「來源」主欄位）</label>
                                    <input
                                        type="text"
                                        value={editForm.referrerName}
                                        onChange={(e) => setEditForm({ ...editForm, referrerName: e.target.value })}
                                        className="w-full border border-slate-200 p-2 rounded-lg text-sm bg-white"
                                        placeholder="例如：嘉吉老師、FB 廣告"
                                    />
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">上層推薦人</label>
                                    <input
                                        type="text"
                                        value={editForm.upperReferrerName}
                                        onChange={(e) => setEditForm({ ...editForm, upperReferrerName: e.target.value })}
                                        className="w-full border border-slate-200 p-2 rounded-lg text-sm bg-white"
                                        placeholder="選填；有上線時填寫"
                                    />
                                    <p className="text-[11px] text-slate-500 leading-relaxed">
                                        儲存時會寫入欄位 <code className="bg-white px-1 rounded border text-[10px]">referrerName</code>、
                                        <code className="bg-white px-1 rounded border text-[10px]">upperReferrerName</code>，並同步更新合併欄{' '}
                                        <code className="bg-white px-1 rounded border text-[10px]">來源（source）</code>（供舊報表對照）。
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">狀態</label>
                                    <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="w-full border p-2 rounded">
                                        <option value="pending">待核對 (Pending)</option>
                                        <option value="confirmed">已付款 (Confirmed)</option>
                                        <option value="cancelled">已取消 (Cancelled)</option>
                                    </select>
                                </div>
                                {editTarget.registrationKind !== 'refresher' && (
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">收款人（收費註記）</label>
                                    <select
                                        value={editForm.payee}
                                        onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
                                        className="w-full border p-2 rounded"
                                    >
                                        {PAYEE_OPTIONS.map((p) => (
                                            <option key={p || 'empty'} value={p}>{p || '未指定'}</option>
                                        ))}
                                    </select>
                                </div>
                                )}
                                {editTarget.registrationKind !== 'refresher' && editTarget.invoiceType !== 'refresher_exempt' && (
                                <div className="space-y-2">
                                    <span className="block text-sm font-bold text-slate-600">電子發票</span>
                                    <div className="flex flex-col gap-2">
                                        <label className="inline-flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="adminInvoiceType"
                                                checked={editForm.invoiceType === 'general'}
                                                onChange={() => setEditForm((prev) => ({ ...prev, invoiceType: 'general', taxId: '' }))}
                                                className="h-4 w-4"
                                            />
                                            <span className="text-sm text-slate-800">二聯式（一般 / 不需統編）</span>
                                        </label>
                                        <label className="inline-flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="adminInvoiceType"
                                                checked={editForm.invoiceType === 'tax_id'}
                                                onChange={() => setEditForm((prev) => ({ ...prev, invoiceType: 'tax_id' }))}
                                                className="h-4 w-4"
                                            />
                                            <span className="text-sm text-slate-800">三聯式（公司統一編號）</span>
                                        </label>
                                    </div>
                                    {editForm.invoiceType === 'tax_id' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">統一編號（8 碼）</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={8}
                                                value={editForm.taxId}
                                                onChange={(e) => {
                                                    const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                                                    setEditForm((prev) => ({ ...prev, taxId: digits }));
                                                }}
                                                className="w-full border p-2 rounded font-mono"
                                                placeholder="12345678"
                                            />
                                        </div>
                                    )}
                                </div>
                                )}
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">場次</label>
                                    <select
                                        value={editForm.sessionId}
                                        onChange={e => setEditForm({ ...editForm, sessionId: e.target.value })}
                                        className="w-full border p-2 rounded"
                                    >
                                        <option value="">請選擇場次</option>
                                        {sortedSessions.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {s.title}｜{new Date(s.date).toLocaleDateString('zh-TW')} {new Date(s.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">變更場次後，此筆資料會從目前名單移除（請到新場次查看）。</p>
                                </div>
                                {editTarget.registrationKind !== 'refresher' && (
                                <>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">付款方式</label>
                                    <select value={editForm.paymentMethod} onChange={e => setEditForm({ ...editForm, paymentMethod: e.target.value })} className="w-full border p-2 rounded">
                                        <option value="transfer">轉帳匯款</option>
                                        <option value="on_site">現場繳費（含複訓）</option>
                                        <option value="cash">現場現金</option>
                                        <option value="linepay">LinePay</option>
                                        <option value="none">無（許願/特殊）</option>
                                        <option value="">未指定</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">實收金額</label>
                                    <input type="number" value={editForm.receivedAmount} onChange={e => setEditForm({ ...editForm, receivedAmount: e.target.value })} className="w-full border p-2 rounded" />
                                </div>
                                </>
                                )}
                                {editTarget.registrationKind === 'refresher' && (
                                    <p className="text-xs text-slate-500 bg-emerald-50/80 border border-emerald-100 rounded-lg px-2 py-1.5">複訓以現場繳 500 元管理；名單上不顯示收款／付款／實收，儲存時不會變更這些後台欄位。</p>
                                )}
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">備註</label>
                                    <textarea value={editForm.adminNote} onChange={e => setEditForm({ ...editForm, adminNote: e.target.value })} className="w-full border p-2 rounded h-20" placeholder="例如：早鳥優惠..."></textarea>
                                </div>
                            </div>

                            <div className="shrink-0 flex gap-3 border-t border-slate-100 bg-white px-6 pb-6 pt-4">
                                <button type="button" onClick={() => setIsEditRegOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200">取消</button>
                                <button type="button" onClick={handleUpdateRegistration} disabled={opLoading} className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">{opLoading ? '儲存' : '儲存變更'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SignupAdmin;
