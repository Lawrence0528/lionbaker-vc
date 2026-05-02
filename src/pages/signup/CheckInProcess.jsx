import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, functions, signIn } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import SEO from '../../components/SEO';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { resolvePosterSeoUrl } from './signupLandingShared';
import { useSignupLandingSettings } from './useSignupLandingSettings';

const DEFAULT_PRICE = 3980;
const CHECKIN_SESSION_STORAGE_KEY = 'checkin_process_selected_session_id';

const CHECKIN_CAMERA_STORAGE_KEY = 'checkin_process_camera_choice';

/** 僅快取／播放這兩段（未繳費不播放音效） */
const PLAYABLE_CHECKIN_AUDIO_KEYS = ['notfound', 'success'];

const CHECKIN_AUDIO_URLS = {
    notfound: '/checkin-notfound.mp3',
    success: '/checkin-success.mp3',
};

const CHECKIN_AUDIO_CACHE_PREFIX = 'lb_checkin_audio_b64_v1_';

/** 讀 localStorage 快取，沒有則 fetch 後寫入；回傳給 Audio 用的 data URL */
const getOrFetchCheckinAudioDataUrl = async (key) => {
    const path = CHECKIN_AUDIO_URLS[key];
    if (!path) throw new Error(`未知音效：${key}`);
    const storageKey = `${CHECKIN_AUDIO_CACHE_PREFIX}${key}`;
    try {
        const cached = window.localStorage.getItem(storageKey);
        if (cached && cached.length > 64) {
            return `data:audio/mpeg;base64,${cached}`;
        }
    } catch {
        /* 忽略 */
    }

    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`讀取音效失敗：${res.status}`);
    }
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const b64 = btoa(binary);
    try {
        window.localStorage.setItem(storageKey, b64);
    } catch (err) {
        console.warn('報到音效寫入 localStorage 失敗（可能超過配額），仍使用本次載入：', err);
    }
    return `data:audio/mpeg;base64,${b64}`;
};

const readStoredCameraChoice = () => {
    try {
        if (typeof window === 'undefined') return 'auto';
        return window.localStorage.getItem(CHECKIN_CAMERA_STORAGE_KEY) || 'auto';
    } catch {
        return 'auto';
    }
};

const CheckInProcess = () => {
    const [adminEmail, setAdminEmail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [registrations, setRegistrations] = useState([]);
    const [matchedRegistration, setMatchedRegistration] = useState(null);
    const [opLoading, setOpLoading] = useState(false);
    const [scanEnabled, setScanEnabled] = useState(false);
    const [scannerError, setScannerError] = useState('');
    /** 中央報到彈窗：notfound／unpaid／ready（已繳費待報到）／success */
    const [checkInDialog, setCheckInDialog] = useState(null);
    /** auto=交給瀏覽器（預設後鏡頭優先）；user／environment；或 videoinput 的 deviceId */
    const [cameraChoice, setCameraChoice] = useState(readStoredCameraChoice);
    const [cameraDevices, setCameraDevices] = useState([]);

    const videoRef = useRef(null);
    const scannerReaderRef = useRef(null);
    const scannerControlsRef = useRef(null);
    const scannerBootTimerRef = useRef(null);
    const checkInDialogTimerRef = useRef(null);
    /** 連續解碼時同一條碼會重複觸發，短時間內略過避免震動／音效洗版 */
    const lastScanDedupeRef = useRef({ text: '', at: 0 });
    /** ZXing 回呼閉包不會更新，改以 ref 讀取目前場次與名單 */
    const registrationsRef = useRef([]);
    const selectedSessionIdRef = useRef('');
    /** 預載報到音效，避免每次 new Audio 未緩衝完成就 play；並配合解鎖降低「時有時無」 */
    const checkinAudioElsRef = useRef(null);
    const checkinAudioPrimedRef = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        let cancelled = false;
        const dispose = (m) => {
            if (!m) return;
            Object.values(m).forEach((a) => {
                try {
                    a.pause();
                    a.src = '';
                    a.load();
                } catch {
                    /* 忽略 */
                }
            });
        };

        (async () => {
            const m = {};
            for (const key of PLAYABLE_CHECKIN_AUDIO_KEYS) {
                try {
                    const dataUrl = await getOrFetchCheckinAudioDataUrl(key);
                    if (cancelled) {
                        dispose(m);
                        return;
                    }
                    const a = new Audio(dataUrl);
                    a.preload = 'auto';
                    a.setAttribute('playsinline', '');
                    try {
                        a.load();
                    } catch {
                        /* 忽略 */
                    }
                    m[key] = a;
                } catch (err) {
                    console.warn(`報到音效「${key}」載入失敗`, err);
                }
            }
            if (cancelled) {
                dispose(m);
                return;
            }
            checkinAudioElsRef.current = m;
        })();

        return () => {
            cancelled = true;
            dispose(checkinAudioElsRef.current);
            checkinAudioElsRef.current = null;
            checkinAudioPrimedRef.current = false;
        };
    }, []);

    /** 在使用者手勢內呼叫（例如按下「開始掃描」），略過靜音 play 以通過瀏覽器自動播放限制 */
    const primeCheckinAudio = useCallback(async () => {
        if (checkinAudioPrimedRef.current) return;
        const m = checkinAudioElsRef.current;
        if (!m) return;
        let anyUnlocked = false;
        for (const key of PLAYABLE_CHECKIN_AUDIO_KEYS) {
            const a = m[key];
            if (!a) continue;
            try {
                a.muted = true;
                await a.play();
                a.pause();
                a.currentTime = 0;
                a.muted = false;
                anyUnlocked = true;
            } catch {
                try {
                    a.muted = false;
                } catch {
                    /* 忽略 */
                }
            }
        }
        if (anyUnlocked) {
            checkinAudioPrimedRef.current = true;
        }
    }, []);

    const playCheckinSound = (key) => {
        if (key === 'notpaid') return;
        const a = checkinAudioElsRef.current?.[key];
        if (!a) return;
        try {
            a.muted = false;
            a.pause();
            a.currentTime = 0;
            const p = a.play();
            if (p && typeof p.then === 'function') {
                p.catch(() => {});
            }
        } catch {
            /* 忽略 */
        }
    };

    /** LIFF／手機：第一次觸碰或點擊頁面時解鎖音效（與「開始掃描」併用） */
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        let done = false;
        const tryPrime = () => {
            if (done) return;
            done = true;
            void primeCheckinAudio();
        };
        document.body.addEventListener('touchstart', tryPrime, { passive: true });
        document.body.addEventListener('click', tryPrime, { passive: true });
        return () => {
            document.body.removeEventListener('touchstart', tryPrime);
            document.body.removeEventListener('click', tryPrime);
        };
    }, [primeCheckinAudio]);

    const { posterImageUrl: landingPosterUrl } = useSignupLandingSettings();

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ai.lionbaker.com';
    const seoImage = resolvePosterSeoUrl(landingPosterUrl, siteOrigin);
    const seoUrl = `${siteOrigin}/signup/checkin-process`;

    const selectedSession = useMemo(
        () => sessions.find((session) => session.id === selectedSessionId) || null,
        [sessions, selectedSessionId]
    );

    useEffect(() => {
        registrationsRef.current = registrations;
    }, [registrations]);

    useEffect(() => {
        selectedSessionIdRef.current = selectedSessionId;
    }, [selectedSessionId]);

    /** 僅目前選擇場次、且非已取消（報到畫面不顯示取消名單） */
    const checkInRegistrations = useMemo(() => {
        const toTimestamp = (value) => {
            if (!value) return Number.MAX_SAFE_INTEGER;
            const dateObj = new Date(value);
            return Number.isNaN(dateObj.getTime()) ? Number.MAX_SAFE_INTEGER : dateObj.getTime();
        };
        const sid = String(selectedSessionId || '');
        const scoped = registrations.filter(
            (r) => r?.status !== 'cancelled' && String(r.sessionId || '') === sid
        );
        return [...scoped].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
    }, [registrations, selectedSessionId]);

    const checkInRegistrationPool = () => {
        const sid = String(selectedSessionIdRef.current || '');
        return registrationsRef.current.filter(
            (r) => r?.status !== 'cancelled' && String(r.sessionId || '') === sid
        );
    };

    useEffect(() => {
        document.title = '報到掃描作業 | AI落地師培訓班';
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                try {
                    await signIn();
                } catch (err) {
                    console.error(err);
                    setError('登入初始化失敗，請重新整理頁面。');
                    setLoading(false);
                }
                return;
            }
            setAdminEmail(user.email || 'anonymous');
            setError('');
            await fetchSessions();
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!adminEmail) return;
        if (!selectedSessionId) return;
        fetchRegistrations(selectedSessionId);
    }, [adminEmail, selectedSessionId]);

    useEffect(() => {
        if (!selectedSessionId || typeof window === 'undefined') return;
        window.localStorage.setItem(CHECKIN_SESSION_STORAGE_KEY, selectedSessionId);
    }, [selectedSessionId]);

    useEffect(() => {
        return () => {
            stopScanner();
            if (checkInDialogTimerRef.current) {
                clearTimeout(checkInDialogTimerRef.current);
                checkInDialogTimerRef.current = null;
            }
        };
    }, []);

    const clearCheckInDialogTimer = () => {
        if (checkInDialogTimerRef.current) {
            clearTimeout(checkInDialogTimerRef.current);
            checkInDialogTimerRef.current = null;
        }
    };

    const scheduleCheckInDialogClose = (ms = 2000, onClose) => {
        clearCheckInDialogTimer();
        checkInDialogTimerRef.current = setTimeout(() => {
            checkInDialogTimerRef.current = null;
            setCheckInDialog(null);
            if (typeof onClose === 'function') onClose();
        }, ms);
    };

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const getSessionsFn = httpsCallable(functions, 'getVibeSessions');
            const result = await getSessionsFn();
            const fetchedSessions = result.data.sessions || [];
            const availableSessions = fetchedSessions.filter((s) => s.id !== 'time_not_available');
            setSessions(availableSessions);
            const rememberedSessionId =
                typeof window !== 'undefined'
                    ? window.localStorage.getItem(CHECKIN_SESSION_STORAGE_KEY) || ''
                    : '';
            const hasRemembered = availableSessions.some((s) => s.id === rememberedSessionId);
            setSelectedSessionId((prev) => {
                if (prev && availableSessions.some((s) => s.id === prev)) return prev;
                if (hasRemembered) return rememberedSessionId;
                return availableSessions[0]?.id || '';
            });
        } catch (err) {
            console.error(err);
            setError(`讀取場次失敗：${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchRegistrations = async (sessionId) => {
        setLoading(true);
        try {
            const getRegistrationsFn = httpsCallable(functions, 'getVibeRegistrations');
            const result = await getRegistrationsFn({ sessionId });
            const list = (result.data.registrations || []).map((reg) => ({
                ...reg,
                receivedAmount: Number(reg.receivedAmount || 0),
            }));
            setRegistrations(list);
        } catch (err) {
            console.error(err);
            setError(`讀取名單失敗：${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const extractUidFromScan = (rawText) => {
        const text = String(rawText || '').trim();
        if (!text) return '';
        try {
            const url = new URL(text);
            const segments = url.pathname.split('/').filter(Boolean);
            return segments[segments.length - 1] || '';
        } catch {
            return text;
        }
    };

    const findAndSetRegistration = (rawText) => {
        const uid = extractUidFromScan(rawText);
        if (!uid) {
            setMatchedRegistration(null);
            return { found: false, uid: '' };
        }
        const found = checkInRegistrationPool().find((reg) => reg.id === uid);
        setMatchedRegistration(found || null);
        return { found: !!found, uid };
    };

    const triggerScanFeedback = (isSuccess = true) => {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(isSuccess ? [120, 40, 120] : [200, 80, 200]);
        }

        if (typeof window !== 'undefined' && window.AudioContext) {
            const audioCtx = new window.AudioContext();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = isSuccess ? 'sine' : 'square';
            oscillator.frequency.value = isSuccess ? 880 : 320;
            gainNode.gain.value = 0.06;
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + (isSuccess ? 0.12 : 0.2));
            oscillator.onended = () => {
                audioCtx.close().catch(() => {});
            };
        }
    };

    const refreshCameraDevices = async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
        try {
            const list = await navigator.mediaDevices.enumerateDevices();
            const videos = list
                .filter((d) => d.kind === 'videoinput' && d.deviceId)
                .map((d, i) => ({
                    deviceId: d.deviceId,
                    label: d.label?.trim() || `鏡頭 ${i + 1}`,
                }));
            setCameraDevices(videos);
        } catch (err) {
            console.warn(err);
        }
    };

    useEffect(() => {
        refreshCameraDevices();
    }, []);

    const handleDecodedScan = (result) => {
        if (!result) return;
        const value = result.getText ? result.getText() : '';
        if (!value) return;
        const now = Date.now();
        const dedupeMs = 2200;
        if (value === lastScanDedupeRef.current.text && now - lastScanDedupeRef.current.at < dedupeMs) {
            return;
        }
        lastScanDedupeRef.current = { text: value, at: now };

        const matchResult = findAndSetRegistration(value);
        if (matchResult?.found) {
            triggerScanFeedback(true);
            const reg = checkInRegistrationPool().find((r) => r.id === matchResult.uid);
            if (reg) {
                clearCheckInDialogTimer();
                if (hasCheckedIn(reg)) {
                    setMatchedRegistration(reg);
                    playCheckinSound('success');
                    setCheckInDialog({
                        type: 'success',
                        subtitle: `已於 ${formatTime(reg.checkInAt)} 報到`,
                    });
                    scheduleCheckInDialogClose(2000, () => setMatchedRegistration(null));
                } else if (!isPaid(reg)) {
                    setMatchedRegistration(reg);
                    setCheckInDialog({ type: 'unpaid', registration: reg });
                } else {
                    setMatchedRegistration(reg);
                    setCheckInDialog({ type: 'ready', registration: reg });
                }
            }
        } else {
            triggerScanFeedback(false);
            showNotFoundDialog(matchResult?.uid || extractUidFromScan(value));
        }
    };

    const attachScannerPipeline = async (choice) => {
        if (!videoRef.current) {
            setScannerError('掃描元件尚未就緒，請稍後再試。');
            return;
        }
        if (!scannerReaderRef.current) {
            scannerReaderRef.current = new BrowserMultiFormatReader();
        }
        const reader = scannerReaderRef.current;

        let controls;
        if (choice === 'user') {
            controls = await reader.decodeFromConstraints(
                { video: { facingMode: 'user' } },
                videoRef.current,
                handleDecodedScan
            );
        } else if (choice === 'environment') {
            controls = await reader.decodeFromConstraints(
                { video: { facingMode: 'environment' } },
                videoRef.current,
                handleDecodedScan
            );
        } else if (choice === 'auto' || !choice) {
            controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, handleDecodedScan);
        } else {
            controls = await reader.decodeFromVideoDevice(choice, videoRef.current, handleDecodedScan);
        }
        scannerControlsRef.current = controls;
        await refreshCameraDevices();
    };

    const showNotFoundDialog = (uid) => {
        clearCheckInDialogTimer();
        playCheckinSound('notfound');
        setCheckInDialog({
            type: 'notfound',
            text: `找不到學員資料（UID：${uid || '未知'}）`,
        });
        scheduleCheckInDialogClose(2000);
    };

    const isPaid = (reg) => {
        if (!reg) return false;
        return reg.status === 'confirmed' || Number(reg.receivedAmount || 0) > 0;
    };

    const hasCheckedIn = (reg) => !!reg?.checkInAt;

    const formatTime = (value) => {
        if (!value) return '';
        const dateObj = new Date(value);
        if (Number.isNaN(dateObj.getTime())) return '';
        return dateObj.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const formatDateShort = (value) => {
        const dateObj = value ? new Date(value) : new Date();
        const month = dateObj.getMonth() + 1;
        const day = dateObj.getDate();
        return `${month}/${day}`;
    };

    const patchRegistration = async (target, updates) => {
        const updateFn = httpsCallable(functions, 'updateVibeRegistration');
        await updateFn({
            registrationId: target.id,
            updates,
        });

        setRegistrations((prev) =>
            prev.map((reg) => (reg.id === target.id ? { ...reg, ...updates } : reg))
        );
        setMatchedRegistration((prev) => (prev?.id === target.id ? { ...prev, ...updates } : prev));
    };

    const showSuccessDialog = (subtitle) => {
        clearCheckInDialogTimer();
        playCheckinSound('success');
        setCheckInDialog({
            type: 'success',
            subtitle: subtitle || '',
        });
        scheduleCheckInDialogClose(2000, () => setMatchedRegistration(null));
    };

    const handleCheckInOnly = async () => {
        if (!matchedRegistration) return;
        try {
            setOpLoading(true);
            await primeCheckinAudio();
            const nowIso = new Date().toISOString();
            await patchRegistration(matchedRegistration, { checkInAt: nowIso });
            setCheckInDialog(null);
            showSuccessDialog('');
        } catch (err) {
            console.error(err);
            setError(`報到失敗：${err.message}`);
        } finally {
            setOpLoading(false);
        }
    };

    const closeUnpaidDialog = () => {
        clearCheckInDialogTimer();
        setCheckInDialog(null);
        setMatchedRegistration(null);
    };

    const handleCashAndCheckIn = async () => {
        if (!matchedRegistration) return;
        try {
            setOpLoading(true);
            await primeCheckinAudio();
            const now = new Date();
            const nowIso = now.toISOString();
            const note = `${formatDateShort(nowIso)}報到時繳款`;
            const previousNote = String(matchedRegistration.adminNote || '').trim();
            const nextNote = previousNote ? `${previousNote}\n${note}` : note;
            await patchRegistration(matchedRegistration, {
                checkInAt: nowIso,
                status: 'confirmed',
                paymentMethod: 'cash',
                receivedAmount: Number(selectedSession?.price || DEFAULT_PRICE),
                adminNote: nextNote,
            });
            setCheckInDialog(null);
            showSuccessDialog('');
        } catch (err) {
            console.error(err);
            setError(`收款報到失敗：${err.message}`);
        } finally {
            setOpLoading(false);
        }
    };

    const stopScannerControlsOnly = () => {
        lastScanDedupeRef.current = { text: '', at: 0 };
        if (scannerBootTimerRef.current) {
            clearTimeout(scannerBootTimerRef.current);
            scannerBootTimerRef.current = null;
        }
        if (scannerControlsRef.current) {
            scannerControlsRef.current.stop();
            scannerControlsRef.current = null;
        }
        if (scannerReaderRef.current) {
            scannerReaderRef.current.stopContinuousDecode();
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    const stopScanner = () => {
        stopScannerControlsOnly();
        setScanEnabled(false);
    };

    const handleCameraChoiceChange = (e) => {
        const next = e.target.value;
        setCameraChoice(next);
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(CHECKIN_CAMERA_STORAGE_KEY, next);
            }
        } catch (_) {
            /* 忽略 */
        }
        if (scanEnabled) {
            setScannerError('');
            stopScannerControlsOnly();
            scannerBootTimerRef.current = setTimeout(async () => {
                try {
                    await attachScannerPipeline(next);
                } catch (err) {
                    console.error(err);
                    setScannerError('切換鏡頭失敗，請改選其他選項或重新整理頁面。');
                }
            }, 120);
        }
    };

    const startScanner = async () => {
        setScannerError('');
        if (!selectedSessionId) {
            setScannerError('請先選擇場次再開始掃描。');
            return;
        }

        await primeCheckinAudio();
        setScanEnabled(true);
        scannerBootTimerRef.current = setTimeout(async () => {
            try {
                await attachScannerPipeline(cameraChoice);
            } catch (err) {
                console.error(err);
                setScannerError('無法啟用相機掃描，請確認相機權限或改用 HTTPS 網址。');
                stopScanner();
            }
        }, 120);
    };

    const uncheckedCount = checkInRegistrations.filter((reg) => !hasCheckedIn(reg)).length;

    return (
        <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-6 text-slate-100 sm:py-8">
            <SEO
                title="報到掃描作業｜AI落地師培訓班"
                description="管理員報到掃描與現場收款報到作業頁面。"
                image={seoImage}
                url={seoUrl}
                type="website"
                appName="LionBaker"
            />
            <div className="absolute inset-0">
                <img src="/bg.jpg" alt="" aria-hidden="true" className="h-full w-full object-cover object-center" />
                <div className="absolute inset-0 bg-slate-950/80" />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-950/75 to-slate-950" />
            </div>
            <section className="relative mx-auto max-w-6xl">
                <header className="mb-6 rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
                    <div className="flex flex-col gap-2 text-center md:text-left">
                        <div>
                            <p className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-200">
                                CHECK-IN PROCESS
                            </p>
                            <h1 className="mt-3 text-2xl font-black text-white">報到掃描作業</h1>
                            <p className="mt-1 text-sm text-slate-300">掃描學員 QR 後可直接完成報到與現場收款。</p>
                        </div>
                    </div>
                </header>

                {error && (
                    <article className="mb-4 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 backdrop-blur-xl">
                        {error}
                    </article>
                )}
                {loading ? (
                    <article className="rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
                        <p className="text-center text-slate-200">載入中...</p>
                    </article>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
                        <section className="rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
                            <div className="flex flex-col gap-4">
                                <h3 className="text-base font-bold text-cyan-200">掃描學員 QR</h3>
                                <div className="flex flex-col gap-2">
                                    <label htmlFor="checkin-camera" className="text-sm font-semibold text-slate-200">
                                        鏡頭來源
                                    </label>
                                    <select
                                        id="checkin-camera"
                                        value={cameraChoice}
                                        onChange={handleCameraChoiceChange}
                                        className="rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                                    >
                                        <option value="auto">自動（預設，後鏡頭優先）</option>
                                        <option value="user">前鏡頭（自拍）</option>
                                        <option value="environment">後鏡頭</option>
                                        {cameraDevices.map((d) => (
                                            <option key={d.deviceId} value={d.deviceId}>
                                                {d.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs leading-relaxed text-slate-500">
                                        授權相機後會列出本機鏡頭；掃描中也可切換。固定自拍請選「前鏡頭」。
                                    </p>
                                </div>
                                {!scanEnabled ? (
                                    <button
                                        type="button"
                                        onClick={startScanner}
                                        className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-cyan-300/40 bg-cyan-500/20 px-8 py-5 text-xl font-black text-cyan-100 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-500/30 sm:w-auto sm:px-10"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M3 9V5a2 2 0 0 1 2-2h4" />
                                            <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
                                            <path d="M3 15v4a2 2 0 0 0 2 2h4" />
                                            <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
                                            <path d="M8 8h2v2H8z" />
                                            <path d="M14 8h2v2h-2z" />
                                            <path d="M8 14h2v2H8z" />
                                            <path d="M14 14h2v2h-2z" />
                                        </svg>
                                        開始掃描
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={stopScanner}
                                        className="w-full rounded-2xl border border-white/25 bg-white/10 px-8 py-4 text-base font-black text-slate-100 shadow-lg transition hover:bg-white/15 sm:w-auto"
                                    >
                                        停止掃描
                                    </button>
                                )}
                                {scannerError && <p className="text-sm text-amber-200">{scannerError}</p>}
                                <div className="relative overflow-hidden rounded-xl border border-white/20 bg-slate-900">
                                    <video ref={videoRef} className="aspect-[4/3] h-auto min-h-[200px] w-full object-cover sm:min-h-[280px]" muted playsInline />
                                    {!scanEnabled && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/85 px-4 text-center text-sm text-slate-400">
                                            <span>相機未啟用</span>
                                            <span className="text-xs text-slate-500">請先選擇場次與鏡頭，再按「開始掃描」</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-sm text-slate-300">
                                    請將 QR 置中；掃描後可連續掃下一位。結束時按「停止掃描」關閉相機。
                                </p>
                            </div>
                        </section>

                        <section className="rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
                            <h2 className="text-lg font-bold text-cyan-200">場次與學員</h2>
                            <div className="mt-4 flex flex-col gap-3">
                                <label className="text-sm font-semibold text-slate-200">選擇場次</label>
                                <select
                                    value={selectedSessionId}
                                    onChange={(e) => setSelectedSessionId(e.target.value)}
                                    className="rounded-xl border border-white/20 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400"
                                >
                                    {sessions.map((session) => (
                                        <option key={session.id} value={session.id}>
                                            {session.title}｜{new Date(session.date).toLocaleString('zh-TW')}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-sm text-slate-200">
                                    未報到：<span className="font-bold text-rose-300">{uncheckedCount}</span> 人
                                    <span className="ml-2 text-xs text-slate-400">（目前選擇場次，不含已取消）</span>
                                </p>
                            </div>

                            <div className="mt-4 max-h-[480px] overflow-auto rounded-xl border border-white/15 bg-slate-900/60">
                                <table className="w-full text-left text-sm">
                                    <thead className="sticky top-0 bg-slate-900 text-slate-300">
                                        <tr>
                                            <th className="px-3 py-2">姓名</th>
                                            <th className="px-3 py-2">繳費</th>
                                            <th className="px-3 py-2">報到</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {checkInRegistrations.length === 0 ? (
                                            <tr>
                                                <td colSpan="3" className="px-3 py-6 text-center text-slate-400">
                                                    此場次尚無有效報名資料
                                                </td>
                                            </tr>
                                        ) : (
                                            checkInRegistrations.map((reg) => (
                                                <tr key={reg.id} className="border-t border-white/10">
                                                    <td className="px-3 py-2 font-semibold text-slate-100">{reg.name || '-'}</td>
                                                    <td className="px-3 py-2">
                                                        {isPaid(reg) ? (
                                                            <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">已繳費</span>
                                                        ) : (
                                                            <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">未繳費</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-300">
                                                        {hasCheckedIn(reg) ? (
                                                            <span className="text-xs font-semibold text-emerald-300">{formatTime(reg.checkInAt)}報到</span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">未報到</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                )}
            </section>

            {checkInDialog && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                    role="presentation"
                    onClick={(e) => {
                        if (checkInDialog.type === 'unpaid' || checkInDialog.type === 'ready') return;
                        if (e.target === e.currentTarget) {
                            clearCheckInDialogTimer();
                            setCheckInDialog(null);
                            if (checkInDialog.type === 'notfound' || checkInDialog.type === 'success') {
                                setMatchedRegistration(null);
                            }
                        }
                    }}
                >
                    <article
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="checkin-dialog-title"
                        className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900/95 p-6 shadow-2xl shadow-black/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {checkInDialog.type === 'notfound' && (
                            <div className="flex flex-col gap-4 text-center">
                                <h2 id="checkin-dialog-title" className="text-lg font-black text-rose-200">
                                    找不到 QR 報到資訊
                                </h2>
                                <p className="text-sm text-slate-300">{checkInDialog.text}</p>
                                <p className="text-xs text-slate-500">此視窗將於 2 秒後自動關閉</p>
                            </div>
                        )}

                        {checkInDialog.type === 'unpaid' && (
                            <div className="flex flex-col gap-4">
                                <h2 id="checkin-dialog-title" className="text-center text-lg font-black text-white">
                                    {checkInDialog.registration.name}
                                </h2>
                                <p className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-center font-bold text-amber-200">
                                    尚未繳費！請收取 {Number(selectedSession?.price || DEFAULT_PRICE)} 元
                                </p>
                                <p className="text-center text-sm text-slate-400">請繳費後完成報到</p>
                                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                                    <button
                                        type="button"
                                        disabled={opLoading}
                                        onClick={handleCashAndCheckIn}
                                        className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        完成收款報到
                                    </button>
                                    <button
                                        type="button"
                                        disabled={opLoading}
                                        onClick={closeUnpaidDialog}
                                        className="rounded-xl border border-white/25 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 hover:bg-white/10 disabled:opacity-50"
                                    >
                                        取消
                                    </button>
                                </div>
                            </div>
                        )}

                        {checkInDialog.type === 'ready' && (
                            <div className="flex flex-col gap-4">
                                <h2 id="checkin-dialog-title" className="text-center text-lg font-black text-white">
                                    {checkInDialog.registration.name}
                                </h2>
                                <p className="text-center text-sm text-emerald-200/90">已繳費，可完成報到</p>
                                <div className="flex justify-center gap-3">
                                    <button
                                        type="button"
                                        disabled={opLoading}
                                        onClick={handleCheckInOnly}
                                        className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                        報到完成
                                    </button>
                                    <button
                                        type="button"
                                        disabled={opLoading}
                                        onClick={closeUnpaidDialog}
                                        className="rounded-xl border border-white/25 bg-white/5 px-6 py-3 text-sm font-bold text-slate-100 hover:bg-white/10 disabled:opacity-50"
                                    >
                                        取消
                                    </button>
                                </div>
                            </div>
                        )}

                        {checkInDialog.type === 'success' && (
                            <div className="flex flex-col gap-3 text-center">
                                <h2 id="checkin-dialog-title" className="text-lg font-black text-emerald-200">
                                    您已報到成功
                                </h2>
                                {checkInDialog.subtitle ? (
                                    <p className="text-sm text-slate-300">{checkInDialog.subtitle}</p>
                                ) : null}
                                <p className="text-xs text-slate-500">此視窗將於 2 秒後自動關閉</p>
                            </div>
                        )}
                    </article>
                </div>
            )}
        </main>
    );
};

export default CheckInProcess;
