import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, functions, signIn } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { onAuthStateChanged } from 'firebase/auth';
import SEO from '../../components/SEO';
import { BrowserMultiFormatReader } from '@zxing/browser';

const DEFAULT_PRICE = 3980;
const CHECKIN_SESSION_STORAGE_KEY = 'checkin_process_selected_session_id';

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
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [scannerError, setScannerError] = useState('');
    const [scanAlert, setScanAlert] = useState(null);

    const videoRef = useRef(null);
    const scannerReaderRef = useRef(null);
    const scannerControlsRef = useRef(null);
    const scannerBootTimerRef = useRef(null);

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://lionbaker.web.app';
    const seoImage = `${siteOrigin}/signup.jpg`;
    const seoUrl = `${siteOrigin}/signup/checkin-process`;

    const selectedSession = useMemo(
        () => sessions.find((session) => session.id === selectedSessionId) || null,
        [sessions, selectedSessionId]
    );

    const sortedRegistrations = useMemo(() => {
        const toTimestamp = (value) => {
            if (!value) return Number.MAX_SAFE_INTEGER;
            const dateObj = new Date(value);
            return Number.isNaN(dateObj.getTime()) ? Number.MAX_SAFE_INTEGER : dateObj.getTime();
        };
        return [...registrations].sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
    }, [registrations]);

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
        };
    }, []);

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
        const found = registrations.find((reg) => reg.id === uid);
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

    const showNotFoundAlert = (uid) => {
        setScanAlert({
            type: 'error',
            text: `找不到學員資料（UID：${uid || '未知'}）`,
        });
        setTimeout(() => {
            setScanAlert(null);
        }, 2500);
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

    const handleCheckInOnly = async () => {
        if (!matchedRegistration) return;
        try {
            setOpLoading(true);
            const nowIso = new Date().toISOString();
            await patchRegistration(matchedRegistration, { checkInAt: nowIso });
        } catch (err) {
            console.error(err);
            setError(`報到失敗：${err.message}`);
        } finally {
            setOpLoading(false);
        }
    };

    const handleCashAndCheckIn = async () => {
        if (!matchedRegistration) return;
        try {
            setOpLoading(true);
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
        } catch (err) {
            console.error(err);
            setError(`收款報到失敗：${err.message}`);
        } finally {
            setOpLoading(false);
        }
    };

    const stopScanner = () => {
        setScanEnabled(false);
        setShowScannerModal(false);
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

    const startScanner = async () => {
        setScannerError('');
        if (!selectedSessionId) {
            setScannerError('請先選擇場次再開始掃描。');
            return;
        }

        setShowScannerModal(true);
        setScanEnabled(true);
        scannerBootTimerRef.current = setTimeout(async () => {
            try {
                if (!videoRef.current) {
                    setScannerError('掃描元件尚未就緒，請稍後再試。');
                    return;
                }

                if (!scannerReaderRef.current) {
                    scannerReaderRef.current = new BrowserMultiFormatReader();
                }
                const reader = scannerReaderRef.current;
                const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
                    if (result) {
                        const value = result.getText ? result.getText() : '';
                        if (value) {
                            const matchResult = findAndSetRegistration(value);
                            if (matchResult?.found) {
                                triggerScanFeedback(true);
                            } else {
                                triggerScanFeedback(false);
                                showNotFoundAlert(matchResult?.uid || extractUidFromScan(value));
                            }
                            stopScanner();
                        }
                    }
                });
                scannerControlsRef.current = controls;
            } catch (err) {
                console.error(err);
                setScannerError('無法啟用相機掃描，請確認相機權限或改用 HTTPS 網址。');
                stopScanner();
            }
        }, 120);
    };

    const uncheckedCount = sortedRegistrations.filter((reg) => !hasCheckedIn(reg)).length;

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
                {scanAlert?.type === 'error' && (
                    <article className="mb-4 rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 shadow-2xl backdrop-blur-xl">
                        {scanAlert.text}
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
                                <div className="flex gap-3">
                                    {!scanEnabled ? (
                                        <button
                                            type="button"
                                            onClick={startScanner}
                                            className="inline-flex items-center justify-center gap-3 rounded-2xl border border-cyan-300/40 bg-cyan-500/20 px-8 py-5 text-xl font-black text-cyan-100 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-500/30 sm:px-10"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                                            className="rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
                                        >
                                            停止掃描
                                        </button>
                                    )}
                                </div>
                                {scannerError && <p className="text-sm text-amber-200">{scannerError}</p>}
                            </div>

                            {matchedRegistration && (
                                <div className="mt-6 rounded-2xl border border-white/15 bg-slate-900/60 p-4">
                                    <div className="flex flex-col gap-4">
                                        <div>
                                            <h3 className="text-base font-bold text-white">{matchedRegistration.name}</h3>
                                            <p className="text-sm text-slate-300">{matchedRegistration.phone || '-'}</p>
                                        </div>

                                        {hasCheckedIn(matchedRegistration) && (
                                            <p className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                                                已於 {formatTime(matchedRegistration.checkInAt)} 報到
                                            </p>
                                        )}

                                        {!isPaid(matchedRegistration) ? (
                                            <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-4">
                                                <p className="font-bold text-amber-200">尚未繳費！請收取3980元</p>
                                                <div className="mt-3 flex gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={opLoading}
                                                        onClick={handleCashAndCheckIn}
                                                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                                    >
                                                        完成收款報到
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMatchedRegistration(null)}
                                                        className="rounded-xl border border-white/25 bg-white/5 px-4 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
                                                    >
                                                        取消
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={opLoading}
                                                onClick={handleCheckInOnly}
                                                className="w-fit rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                報到完成
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
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
                                </p>
                            </div>

                            <div className="mt-4 max-h-[480px] overflow-auto rounded-xl border border-white/15 bg-slate-900/60">
                                <table className="w-full text-left text-sm">
                                    <thead className="sticky top-0 bg-slate-900 text-slate-300">
                                        <tr>
                                            <th className="px-3 py-2">姓名</th>
                                            <th className="px-3 py-2">電話</th>
                                            <th className="px-3 py-2">繳費</th>
                                            <th className="px-3 py-2">報到</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedRegistrations.length === 0 ? (
                                            <tr>
                                                <td colSpan="4" className="px-3 py-6 text-center text-slate-400">
                                                    此場次尚無學員資料
                                                </td>
                                            </tr>
                                        ) : (
                                            sortedRegistrations.map((reg) => (
                                                <tr key={reg.id} className="border-t border-white/10">
                                                    <td className="px-3 py-2 font-semibold text-slate-100">{reg.name || '-'}</td>
                                                    <td className="px-3 py-2 text-slate-300">{reg.phone || '-'}</td>
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
            {showScannerModal && (
                <section className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
                    <article className="w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl">
                        <header className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-bold text-cyan-200">掃描學員 QR</h3>
                            <button
                                type="button"
                                onClick={stopScanner}
                                className="rounded-lg border border-white/25 px-3 py-1 text-xs font-bold text-slate-200 hover:bg-white/10"
                            >
                                關閉
                            </button>
                        </header>
                        <div className="overflow-hidden rounded-xl border border-white/20 bg-slate-900">
                            <video ref={videoRef} className="h-80 w-full object-cover" muted playsInline />
                        </div>
                        <p className="mt-3 text-sm text-slate-300">請將 QR 置中，掃到後會自動關閉。</p>
                    </article>
                </section>
            )}
        </main>
    );
};

export default CheckInProcess;
