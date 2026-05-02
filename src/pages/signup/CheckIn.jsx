import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import SEO from '../../components/SEO';

const CheckIn = () => {
    const { uid } = useParams();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [registration, setRegistration] = useState(null);

    const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ai.lionbaker.com';
    const seoImage = `${siteOrigin}/S__158801977.jpg`;
    const seoUrl = `${siteOrigin}/signup/checkin/${uid || ''}`;

    const qrSrc = useMemo(() => {
        const payload = encodeURIComponent(uid || '');
        return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=20&data=${payload}`;
    }, [uid]);

    useEffect(() => {
        document.title = '報到 QR 碼 | AI落地師培訓班';
    }, []);

    useEffect(() => {
        const fetchRegistration = async () => {
            if (!uid) {
                setError('缺少報到 UID，請確認連結是否完整。');
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError('');
                const regRef = doc(db, 'registrations_vibe', uid);
                const snapshot = await getDoc(regRef);
                if (!snapshot.exists()) {
                    setError('找不到這筆報名資料，請聯絡主辦單位。');
                    return;
                }
                setRegistration({ id: snapshot.id, ...snapshot.data() });
            } catch (err) {
                console.error(err);
                setError('讀取報到資訊失敗，請稍後再試。');
            } finally {
                setLoading(false);
            }
        };
        fetchRegistration();
    }, [uid]);

    const toDateObject = (value) => {
        if (!value) return null;
        if (typeof value === 'string') {
            const parsed = new Date(value);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        if (typeof value === 'object' && typeof value.toDate === 'function') {
            return value.toDate();
        }
        return null;
    };

    const formatDate = (value) => {
        const dateObj = toDateObject(value);
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

    const formatCheckInTime = (value) => {
        const dateObj = toDateObject(value);
        if (!dateObj) return '-';
        const checkInDate = new Date(dateObj.getTime() - 30 * 60 * 1000);
        return checkInDate.toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    const statusText = registration?.status === 'confirmed' ? '已完成付款' : registration?.status === 'cancelled' ? '已取消' : '未完成付款';
    const statusClass = registration?.status === 'confirmed'
        ? 'text-emerald-300 border-emerald-300/40 bg-emerald-500/10'
        : registration?.status === 'cancelled'
            ? 'text-rose-300 border-rose-300/40 bg-rose-500/10'
            : 'text-amber-300 border-amber-300/40 bg-amber-500/10';

    const attendanceConfirmedFromUrl = searchParams.get('attendance') === 'confirmed';
    const attendanceConfirmedAt = registration?.attendanceConfirmedAt;
    const hasAttendanceRecord = !!(attendanceConfirmedAt || attendanceConfirmedFromUrl);

    const locationDisplay = useMemo(() => {
        const loc = String(registration?.sessionLocation || '').trim();
        const addr = String(registration?.sessionAddress || '').trim();
        if (!loc && !addr) return '-';
        if (loc && addr) return `${loc}（${addr}）`;
        return loc || addr;
    }, [registration?.sessionLocation, registration?.sessionAddress]);

    const isRefresherCourse = registration?.registrationKind === 'refresher';
    const courseKindLabel = isRefresherCourse ? '複訓' : '正課';

    return (
        <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-6 text-slate-100 sm:py-8">
            <SEO
                title="報到 QR 碼｜AI落地師培訓班"
                description="AI落地師培訓班報到 QR 碼與學員報到資訊頁面。"
                image={seoImage}
                url={seoUrl}
                type="website"
                appName="LionBaker"
            />

            <div className="absolute inset-0">
                <img src="/bg.jpg" alt="" aria-hidden="true" className="h-full w-full object-cover object-center" />
                <div className="absolute inset-0 bg-slate-950/75" />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900/35 via-slate-950/70 to-slate-950" />
            </div>

            <section className="relative mx-auto w-full max-w-md">
                <header className="mb-4 px-1 text-center">
                    <p className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-200">
                        CHECK-IN PASS
                    </p>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-white">報到 QR 碼</h1>
                    <p className="mt-2 text-sm text-slate-300">現場請出示此頁面，讓工作人員掃描完成報到。</p>
                </header>

                {!loading && !error && hasAttendanceRecord && (
                    <div className="mb-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-center text-sm font-semibold text-emerald-100 shadow-lg">
                        已確認出席，感謝您；現場請仍出示此 QR 完成報到。
                    </div>
                )}

                {loading && (
                    <article className="rounded-3xl border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-300 border-t-transparent"></div>
                            <p className="text-sm text-slate-200">正在載入報到資訊...</p>
                        </div>
                    </article>
                )}

                {!loading && error && (
                    <article className="rounded-3xl border border-rose-300/40 bg-rose-500/10 p-5 text-rose-100 shadow-2xl backdrop-blur-xl">
                        {error}
                    </article>
                )}

                {!loading && !error && (
                    <div className="flex flex-col gap-4">
                        <article className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-bold tracking-[0.2em] text-slate-300">
                                    AI落地師通行證 AI-PASS
                                    <span
                                        className={`ml-2 inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-black tracking-wide ${isRefresherCourse ? 'border-violet-400/70 bg-violet-600/35 text-violet-50' : 'border-amber-500 bg-gradient-to-b from-yellow-300 to-amber-400 text-amber-950 shadow-[0_0_18px_rgba(251,191,36,0.55)]'}`}
                                    >
                                        {courseKindLabel}
                                    </span>
                                </span>
                                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}>{statusText}</span>
                            </div>
                            <div className="mx-auto w-fit rounded-2xl border border-white/20 bg-white p-3 shadow-lg shadow-cyan-500/10">
                                <img src={qrSrc} alt={`報到 QR 碼，代碼 ${uid}`} className="h-56 w-56 rounded-xl sm:h-64 sm:w-64" />
                            </div>
                            <p className="mt-3 text-center text-[11px] text-slate-300 break-all">UID：{uid}</p>
                        </article>

                        <article className="rounded-3xl border border-white/15 bg-slate-900/70 p-5 shadow-2xl backdrop-blur-xl">
                            <h2 className="mb-3 text-base font-bold text-cyan-200">報到資訊</h2>
                            <div className="flex flex-col gap-2.5 text-sm">
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><span className="font-bold text-slate-400">姓名：</span>{registration?.name || '-'}</div>
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><span className="font-bold text-slate-400">電話：</span>{registration?.phone || '-'}</div>
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><span className="font-bold text-slate-400">場次：</span>{registration?.sessionTitle || '-'}</div>
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><span className="font-bold text-slate-400">上課時間：</span>{`${formatDate(registration?.sessionDate)}（${formatCheckInTime(registration?.sessionDate).split(' ').pop()}開放報到）`}</div>
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><span className="font-bold text-slate-400">地點：</span>{locationDisplay}</div>
                            </div>
                        </article>

                        <article className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-5 shadow-2xl backdrop-blur-xl">
                            <h2 className="mb-3 text-base font-bold text-cyan-100">行前提醒</h2>
                            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-100">
                                <li>建議提早 15 分鐘到場，方便現場簽到與入座。</li>
                                <li>請先把手機充飽電，並攜帶行動電源。</li>
                                <li>請先安裝 Gemini App，現場可直接操作。</li>
                                <li>課程長達 3.5 小時，建議攜帶個人水杯隨時補充水分。</li>
                            </ul>
                        </article>
                    </div>
                )}
            </section>
        </main>
    );
};

export default CheckIn;
