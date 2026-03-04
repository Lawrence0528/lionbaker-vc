import React, { useState, useEffect } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import liff from '@line/liff';

// Placeholder LIFF ID - User needs to replace this
const LIFF_ID = '2008963361-Dp4eie0r';

const VibeCodingAdmin = () => {
    const [lineParam, setLineParam] = useState(null);
    const [viewMode, setViewMode] = useState('sessions'); // 'sessions', 'registrations'
    const [sessions, setSessions] = useState([]);
    const [registrations, setRegistrations] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);

    // UI State
    const [loading, setLoading] = useState(true);
    const [opLoading, setOpLoading] = useState(false);
    const [error, setError] = useState('');

    // Modal State: Create Session
    const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
    const [newSession, setNewSession] = useState({
        title: 'Vibe Coding 基礎實戰班',
        date: '',
        time: '13:00',
        location: '',
        address: '',
        price: 1980,
        originalPrice: 5000,
        maxCapacity: 50
    });

    // Modal State: Edit Session
    const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
    const [sessionToEdit, setSessionToEdit] = useState(null);
    const [editSessionForm, setEditSessionForm] = useState({
        title: '',
        date: '',
        time: '',
        location: '',
        address: '',
        price: 0,
        originalPrice: 0,
        maxCapacity: 50,
        status: 'open'
    });

    // Modal State: Edit Registration
    const [isEditRegOpen, setIsEditRegOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [editForm, setEditForm] = useState({
        status: '',
        paymentMethod: '',
        receivedAmount: 0,
        adminNote: ''
    });

    useEffect(() => {
        const init = async () => {
            try {
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.log('Skipping LIFF for local testing');
                    setLineParam('Ue17ac074742b4f21da6f6b41307a246a');
                    fetchSessions('Ue17ac074742b4f21da6f6b41307a246a');
                } else if (LIFF_ID && LIFF_ID !== 'MY_LIFF_ID') {
                    await Promise.race([
                        liff.init({ liffId: LIFF_ID }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('LIFF_TIMEOUT')), 5000))
                    ]);
                    if (liff.isLoggedIn()) {
                        const profile = await liff.getProfile();
                        setLineParam(profile.userId);
                        fetchSessions(profile.userId);
                    } else {
                        liff.login();
                    }
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                setError('初始化失敗');
                setLoading(false);
            }
        };
        init();
    }, []);

    const fetchSessions = async (userId) => {
        setLoading(true);
        try {
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
        try {
            const getRegFn = httpsCallable(functions, 'getVibeRegistrations');
            const result = await getRegFn({ userId: lineParam, sessionId: session.id });
            const regs = result.data.registrations || [];
            setRegistrations(regs);

            // Auto-Sync Capacity Logic
            // Calculate active count from fetched registrations
            const realActiveCount = regs.filter(r => r.status !== 'cancelled').reduce((acc, r) => acc + (r.count || 1), 0);

            // If mismatch with session's stored count, trigger a background update
            if (session.currentCount !== realActiveCount) {
                console.log(`Syncing capacity for session ${session.id}: DB=${session.currentCount}, Real=${realActiveCount}`);
                const updateFn = httpsCallable(functions, 'updateVibeSession');

                // Do not await to avoid blocking UI, run in background
                updateFn({
                    userId: lineParam,
                    sessionId: session.id,
                    updates: { currentCount: realActiveCount }
                }).catch(err => console.error("Auto-sync failed:", err));

                // Update local state to reflect reality immediately
                setSelectedSession(prev => ({ ...prev, currentCount: realActiveCount }));
                // Also update sessions list
                setSessions(prev => prev.map(s => s.id === session.id ? { ...s, currentCount: realActiveCount } : s));
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
        setOpLoading(true);
        try {
            // Combine Date & Time
            const isoDate = new Date(`${newSession.date}T${newSession.time}`).toISOString();

            const createFn = httpsCallable(functions, 'createVibeSession');
            await createFn({
                userId: lineParam,
                ...newSession,
                date: isoDate
            });

            setIsCreateSessionOpen(false);
            fetchSessions(lineParam);
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
        setEditSessionForm({
            title: session.title,
            date: session.date.split('T')[0],
            time: `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`,
            location: session.location,
            address: session.address,
            price: session.price,
            originalPrice: session.originalPrice,
            maxCapacity: session.maxCapacity || 50,
            status: session.status || 'open'
        });
        setIsEditSessionOpen(true);
    };

    const handleUpdateSession = async (e) => {
        e.preventDefault();
        setOpLoading(true);
        try {
            const isoDate = new Date(`${editSessionForm.date}T${editSessionForm.time}`).toISOString();

            const updateFn = httpsCallable(functions, 'updateVibeSession');
            await updateFn({
                userId: lineParam,
                sessionId: sessionToEdit.id,
                updates: {
                    ...editSessionForm,
                    date: isoDate,
                    price: Number(editSessionForm.price),
                    originalPrice: Number(editSessionForm.originalPrice),
                    maxCapacity: Number(editSessionForm.maxCapacity)
                }
            });

            setIsEditSessionOpen(false);
            fetchSessions(lineParam); // Refresh to show new data
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
        setEditForm({
            status: reg.status || 'pending',
            paymentMethod: reg.paymentMethod || 'transfer',
            receivedAmount: reg.receivedAmount || (selectedSession?.price || 1980),
            adminNote: reg.adminNote || ''
        });
        setIsEditRegOpen(true);
    };

    const handleUpdateRegistration = async () => {
        if (!editTarget) return;
        setOpLoading(true);
        try {
            const updateFn = httpsCallable(functions, 'updateVibeRegistration');
            await updateFn({
                userId: lineParam,
                registrationId: editTarget.id,
                updates: {
                    ...editForm,
                    receivedAmount: Number(editForm.receivedAmount)
                }
            });

            // Optimistic Update
            setRegistrations(prev => prev.map(r => r.id === editTarget.id ? { ...r, ...editForm, receivedAmount: Number(editForm.receivedAmount) } : r));
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
        setOpLoading(true);
        try {
            const deleteFn = httpsCallable(functions, 'deleteVibeRegistration');
            await deleteFn({ userId: lineParam, registrationId: regId });

            setRegistrations(prev => prev.filter(r => r.id !== regId));
        } catch (err) {
            alert('刪除失敗: ' + err.message);
        } finally {
            setOpLoading(false);
        }
    };

    const handleQuickCancel = async (reg) => {
        if (!confirm(`確定要取消 ${reg.name} 的報名嗎？`)) return;
        setOpLoading(true);
        try {
            const updateFn = httpsCallable(functions, 'updateVibeRegistration');
            await updateFn({
                userId: lineParam,
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

    const formatDate = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString('zh-TW');
    };

    // Helper to get unique locations
    const existingLocations = [...new Set(sessions.map(s => s.location).filter(Boolean))];

    // Map existing locations to addresses for auto-fill
    const locationAddressMap = sessions.reduce((acc, s) => {
        if (s.location && s.address) acc[s.location] = s.address;
        return acc;
    }, {});

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
                            Vibe Coding {viewMode === 'sessions' ? '場次管理' : '報名名單管理'}
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Admin ID: <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-700">{lineParam || '...'}</span></p>
                    </div>
                    {viewMode === 'sessions' && (
                        <button onClick={() => setIsCreateSessionOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow transition-colors flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            新增場次
                        </button>
                    )}
                </header>

                {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">{error}</div>}

                {loading ? (
                    <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>
                ) : (
                    <>
                        {/* VIEW MODE: SESSIONS */}
                        {viewMode === 'sessions' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sessions.length === 0 && (
                                    <div className="col-span-full text-center py-20 bg-white rounded-xl shadow-sm border border-dashed border-slate-300">
                                        <p className="text-slate-500 mb-4">目前沒有場次資料</p>
                                        <button onClick={() => setIsCreateSessionOpen(true)} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">立即建立場次</button>
                                    </div>
                                )}
                                {sessions.map(session => (
                                    <div key={session.id} className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-all border border-slate-100 group relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150"></div>
                                        <div className="relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="text-xl font-bold text-slate-800">{session.title}</h3>
                                                <button onClick={(e) => { e.stopPropagation(); openEditSessionModal(session); }} className="text-slate-400 hover:text-blue-600 p-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>
                                            </div>
                                            <p className="text-slate-500 text-sm mb-3">📍 {session.location}</p>
                                            <p className="text-blue-600 font-bold mb-4 flex items-center gap-1">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                {new Date(session.date).toLocaleDateString()} {new Date(session.date).getHours()}:00
                                            </p>

                                            {/* Capacity Bar */}
                                            <div className="mb-4">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="text-slate-500">報名狀況</span>
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

                                            <div className="flex justify-between items-center text-sm text-slate-500">
                                                {((session.currentCount || 0) >= (session.maxCapacity || 50)) ? (
                                                    <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">額滿</span>
                                                ) : (
                                                    <span>NT$ {session.price}</span>
                                                )}
                                                <button onClick={() => fetchRegistrations(session)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg transition-colors">
                                                    管理 ({session.currentCount || 0}) &rarr;
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
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-2xl font-bold text-slate-800 mb-2">{selectedSession.title}</h2>
                                            <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                                                <div className="flex items-center gap-1"><span className="font-bold text-slate-400">DATE:</span> {new Date(selectedSession.date).toLocaleDateString()} {new Date(selectedSession.date).getHours()}:00</div>
                                                <div className="flex items-center gap-1"><span className="font-bold text-slate-400">LOC:</span> {selectedSession.location}</div>
                                                <div className="flex items-center gap-1"><span className="font-bold text-slate-400">ADDR:</span> {selectedSession.address}</div>
                                                <div className="flex items-center gap-1"><span className="font-bold text-slate-400">單價:</span> ${selectedSession.price}</div>
                                                <div className="flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded border border-green-200"><span className="font-bold text-green-600">總實收:</span> <span className="text-green-700 font-bold">${registrations.filter(r => r.status === 'confirmed').reduce((sum, r) => sum + (r.receivedAmount || 0), 0)}</span></div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-500 uppercase font-bold mb-1">Capacity</div>
                                            <div className="text-3xl font-black text-slate-800">
                                                {/* Calculate Active Count Client Side for Admin Accuracy */}
                                                {registrations.filter(r => r.status !== 'cancelled').reduce((acc, r) => acc + (r.count || 1), 0)}
                                                <span className="text-lg text-slate-400 font-normal">/{selectedSession.maxCapacity || 50}</span>
                                            </div>
                                            {(selectedSession.currentCount || 0) >= (selectedSession.maxCapacity || 50) && (
                                                <div className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded inline-block mt-1">FULL</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl shadow-lg run-overflow-hidden border border-slate-200">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                                                    <th className="p-4 font-semibold">時間</th>
                                                    <th className="p-4 font-semibold">姓名 / 電話</th>
                                                    <th className="p-4 font-semibold">付款方式</th>
                                                    <th className="p-4 font-semibold">金額 / 備註</th>
                                                    <th className="p-4 font-semibold">狀態</th>
                                                    <th className="p-4 font-semibold">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                                                {registrations.length === 0 ? (
                                                    <tr><td colSpan="6" className="p-8 text-center text-slate-400">此場次尚無報名資料</td></tr>
                                                ) : registrations.map(reg => (
                                                    <tr key={reg.id} className={`hover:bg-slate-50 transition-colors ${reg.status === 'cancelled' ? 'opacity-50 grayscale bg-slate-50' : ''}`}>
                                                        <td className="p-4 text-slate-500 text-xs">{formatDate(reg.createdAt)}</td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-slate-800">{reg.name}</div>
                                                            <div className="font-mono text-xs text-slate-500">{reg.phone}</div>
                                                            <div className="mt-1 text-xs text-blue-600 bg-blue-50 inline-block px-1 rounded">{reg.source}</div>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="text-sm font-medium">
                                                                {reg.paymentMethod === 'transfer' && '轉帳'}
                                                                {reg.paymentMethod === 'cash' && '現金'}
                                                                {reg.paymentMethod === 'linepay' && 'LinePay'}
                                                                {!reg.paymentMethod && '未指定'}
                                                            </div>
                                                            {reg.paymentMethod === 'transfer' && reg.lastFive && (
                                                                <div className="text-xs text-slate-500 font-mono">末五碼:{reg.lastFive}</div>
                                                            )}
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold">
                                                                {reg.status === 'confirmed' ? (
                                                                    <span className="text-green-600">${reg.receivedAmount}</span>
                                                                ) : (
                                                                    <span className="text-slate-400">-</span>
                                                                )}
                                                            </div>
                                                            {reg.adminNote && <div className="text-xs text-slate-500 mt-1 max-w-[150px] truncate" title={reg.adminNote}>{reg.adminNote}</div>}
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${reg.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                                                reg.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                                    'bg-yellow-100 text-yellow-800'
                                                                }`}>
                                                                {reg.status === 'confirmed' ? '已確認' : reg.status === 'cancelled' ? '已取消' : '待核對'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => openEditModal(reg)}
                                                                    className="px-3 py-1 bg-white border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 font-bold"
                                                                >
                                                                    編輯
                                                                </button>
                                                                {reg.status !== 'cancelled' && (
                                                                    <button onClick={() => handleQuickCancel(reg)} className="text-red-400 hover:text-red-600 text-xs underline">
                                                                        取消
                                                                    </button>
                                                                )}
                                                                <button onClick={() => handleDeleteRegistration(reg.id)} className="text-slate-400 hover:text-red-600 text-xs" title="刪除">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* MODAL: CREATE SESSION */}
                {isCreateSessionOpen && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in-up max-h-[90vh] overflow-y-auto">
                            <h3 className="text-xl font-bold text-slate-800 mb-6">新增場次</h3>
                            <form onSubmit={handleCreateSession} className="space-y-4">
                                <div><label className="text-xs font-bold text-slate-500 uppercase">標題</label><input type="text" value={newSession.title} onChange={e => setNewSession({ ...newSession, title: e.target.value })} className="w-full border p-2 rounded" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">日期</label><input type="date" value={newSession.date} onChange={e => setNewSession({ ...newSession, date: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">時間</label><input type="time" value={newSession.time} onChange={e => setNewSession({ ...newSession, time: e.target.value })} required className="w-full border p-2 rounded" /></div>
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
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">價格</label><input type="number" value={newSession.price} onChange={e => setNewSession({ ...newSession, price: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">原價</label><input type="number" value={newSession.originalPrice} onChange={e => setNewSession({ ...newSession, originalPrice: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                </div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">名額上限</label><input type="number" value={newSession.maxCapacity} onChange={e => setNewSession({ ...newSession, maxCapacity: e.target.value })} required className="w-full border p-2 rounded" /></div>

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
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">日期</label><input type="date" value={editSessionForm.date} onChange={e => setEditSessionForm({ ...editSessionForm, date: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">時間</label><input type="time" value={editSessionForm.time} onChange={e => setEditSessionForm({ ...editSessionForm, time: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                </div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">地點</label><input type="text" list="locations_edit" value={editSessionForm.location} onChange={handleEditSessionLocationChange} required className="w-full border p-2 rounded" />
                                    <datalist id="locations_edit">
                                        {existingLocations.map(loc => <option key={loc} value={loc} />)}
                                    </datalist>
                                </div>
                                <div><label className="text-xs font-bold text-slate-500 uppercase">地址</label><input type="text" value={editSessionForm.address} onChange={e => setEditSessionForm({ ...editSessionForm, address: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">價格</label><input type="number" value={editSessionForm.price} onChange={e => setEditSessionForm({ ...editSessionForm, price: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">名額上限</label><input type="number" value={editSessionForm.maxCapacity} onChange={e => setEditSessionForm({ ...editSessionForm, maxCapacity: e.target.value })} required className="w-full border p-2 rounded" /></div>
                                </div>

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
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in-up">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">編輯 / 核對資料</h3>
                            <div className="bg-slate-50 p-3 rounded-lg text-sm mb-4">
                                <p><span className="text-slate-500">學員：</span> <span className="font-bold">{editTarget.name}</span></p>
                                <p><span className="text-slate-500">電話：</span> {editTarget.phone}</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">狀態</label>
                                    <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} className="w-full border p-2 rounded">
                                        <option value="pending">待核對 (Pending)</option>
                                        <option value="confirmed">已確認 (Confirmed)</option>
                                        <option value="cancelled">已取消 (Cancelled)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">付款方式</label>
                                    <select value={editForm.paymentMethod} onChange={e => setEditForm({ ...editForm, paymentMethod: e.target.value })} className="w-full border p-2 rounded">
                                        <option value="transfer">轉帳匯款</option>
                                        <option value="cash">現場現金</option>
                                        <option value="linepay">LinePay</option>
                                        <option value="">未指定</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">實收金額</label>
                                    <input type="number" value={editForm.receivedAmount} onChange={e => setEditForm({ ...editForm, receivedAmount: e.target.value })} className="w-full border p-2 rounded" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 mb-1">備註</label>
                                    <textarea value={editForm.adminNote} onChange={e => setEditForm({ ...editForm, adminNote: e.target.value })} className="w-full border p-2 rounded h-20" placeholder="例如：早鳥優惠..."></textarea>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button onClick={() => setIsEditRegOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200">取消</button>
                                <button onClick={handleUpdateRegistration} disabled={opLoading} className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50">{opLoading ? '儲存' : '儲存變更'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VibeCodingAdmin;
