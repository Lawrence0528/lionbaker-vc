import React, { useState, useEffect, useMemo } from 'react';
import { auth, functions, googleProvider } from '../../firebase';
import { collection, query, orderBy, getDocs } from 'firebase/firestore'; // Keep getDocs for fallback/dev
import { httpsCallable } from 'firebase/functions';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const ADMIN_EMAIL = 'charge0528@gmail.com';

const SignupAdmin = () => {
    const isDev = import.meta?.env?.DEV;
    const isMockMode = isDev && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === '1';

    const [adminEmail, setAdminEmail] = useState(null);
    const isAdmin = !!adminEmail || isMockMode;
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
        isSignupOpen: true
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
        isSignupOpen: true
    });

    // Modal State: Edit Registration
    const [isEditRegOpen, setIsEditRegOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [editForm, setEditForm] = useState({
        status: '',
        paymentMethod: '',
        receivedAmount: 0,
        adminNote: '',
        sessionId: ''
    });

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
                    currentCount: 8,
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
        try {
            if (isMockMode) {
                const mockRegs = [
                    {
                        id: 'mock_reg_01',
                        createdAt: new Date().toISOString(),
                        name: '王小明',
                        phone: '0912-345-678',
                        source: '嘉吉老師',
                        paymentMethod: 'transfer',
                        lastFive: '12345',
                        receivedAmount: 1980,
                        status: 'confirmed',
                        count: 1,
                        adminNote: '已核對'
                    },
                    {
                        id: 'mock_reg_02',
                        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
                        name: '陳小華',
                        phone: '0988-000-111',
                        source: 'FB廣告',
                        paymentMethod: 'cash',
                        receivedAmount: 0,
                        status: 'pending',
                        count: 2,
                        adminNote: ''
                    },
                    {
                        id: 'mock_reg_03',
                        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
                        name: '林小美',
                        phone: '0900-222-333',
                        source: 'Rich老師',
                        paymentMethod: 'linepay',
                        receivedAmount: 1980,
                        status: 'cancelled',
                        count: 1,
                        adminNote: '臨時有事'
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

            // Auto-Sync Capacity Logic
            // Calculate active count from fetched registrations
            const realActiveCount = regs.filter(r => r.status !== 'cancelled').reduce((acc, r) => acc + (r.count || 1), 0);

            // If mismatch with session's stored count, trigger a background update
            if (session.id !== 'time_not_available' && session.currentCount !== realActiveCount) {
                console.log(`Syncing capacity for session ${session.id}: DB=${session.currentCount}, Real=${realActiveCount}`);
                const updateFn = httpsCallable(functions, 'updateVibeSession');

                // Do not await to avoid blocking UI, run in background
                updateFn({
                    
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
                endDate: endIsoDate
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
            isSignupOpen: session.isSignupOpen !== false
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
                    maxCapacity: Number(editSessionForm.maxCapacity)
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
                    maxCapacity: Number(editSessionForm.maxCapacity)
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
        setEditForm({
            status: reg.status || 'pending',
            paymentMethod: reg.paymentMethod || 'transfer',
            receivedAmount: reg.receivedAmount || (selectedSession?.price || 1980),
            adminNote: reg.adminNote || '',
            sessionId: reg.sessionId || selectedSession?.id || ''
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

            if (isMockMode) {
                if (willMoveToAnotherSession) {
                    setRegistrations(prev => prev.filter(r => r.id !== editTarget.id));
                } else {
                    setRegistrations(prev => prev.map(r => r.id === editTarget.id ? { ...r, ...editForm, receivedAmount: Number(editForm.receivedAmount) } : r));
                }
                setIsEditRegOpen(false);
                setEditTarget(null);
                return;
            }
            const updateFn = httpsCallable(functions, 'updateVibeRegistration');
            await updateFn({
                
                registrationId: editTarget.id,
                updates: {
                    ...editForm,
                    receivedAmount: Number(editForm.receivedAmount),
                    sessionId: nextSessionId,
                    sessionTitle: targetSession?.title || null,
                    sessionDate: targetSession?.date || null,
                    sessionLocation: targetSession?.location || null,
                }
            });

            // Optimistic Update
            if (willMoveToAnotherSession) {
                setRegistrations(prev => prev.filter(r => r.id !== editTarget.id));
            } else {
                setRegistrations(prev => prev.map(r => r.id === editTarget.id ? { ...r, ...editForm, receivedAmount: Number(editForm.receivedAmount), sessionId: nextSessionId } : r));
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
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ai.lionbaker.com';
        return `${origin}/signup/checkin/${registrationId}`;
    };

    const copyCheckInLink = async (reg) => {
        if (!reg?.id) {
            alert('無法產生報到連結：缺少 UID');
            return;
        }
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

        const sessionDateObj = parseDate(reg.sessionDate);
        const checkInDateObj = sessionDateObj ? new Date(sessionDateObj.getTime() - 30 * 60 * 1000) : null;
        const sessionTimeText = formatDateTime(sessionDateObj);
        const checkInTimeText = formatDateTime(checkInDateObj).split(' ').pop() || '-';
        const sessionLocationText = reg.sessionLocation
            ? `${reg.sessionLocation}（台中市中區民族路 23 號 3 樓）`
            : 'TOP SPACE 商務中心（台中市中區民族路 23 號 3 樓）';

        const message = [
            '【AI落地師培訓班｜報到資訊】',
            `學員：${reg.name || '-'}`,
            `場次：${reg.sessionTitle || '-'}`,
            `上課時間：${sessionTimeText}（${checkInTimeText}開放報到）`,
            `地點：${sessionLocationText}`,
            `報到連結：${url}`,
            ...(reg.status === 'pending' ? ['請記得當天帶學費3980元現場繳費'] : []),
            '',
            '請於現場出示此頁面 QR 碼完成報到。'
        ].join('\n');

        try {
            await navigator.clipboard.writeText(message);
            alert('報到資訊已複製到剪貼簿');
        } catch (err) {
            console.error(err);
            alert(`複製失敗，請手動複製：${message}`);
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
        // 依開課日期由近到遠排序（日期近的排前面）
        return [...sessions].sort((a, b) => {
            const aTime = a?.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
            const bTime = b?.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
            const aValid = Number.isFinite(aTime);
            const bValid = Number.isFinite(bTime);
            if (!aValid && !bValid) return 0;
            if (!aValid) return 1;
            if (!bValid) return -1;
            return aTime - bTime;
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

    const paymentMethodToLabel = (pm) => {
        if (pm === 'transfer') return '轉帳';
        if (pm === 'cash') return '現金';
        if (pm === 'linepay') return 'LinePay';
        return '未指定';
    };

    const statusToLabel = (status) => {
        if (status === 'confirmed') return '已確認';
        if (status === 'cancelled') return '已取消';
        return '待核對';
    };

    const escapeCsvCell = (value) => {
        const s = value === null || value === undefined ? '' : String(value);
        if (/[",\r\n]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };

    const sanitizeFilenameSegment = (raw) => (raw || 'export').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);

    const handleExportRegistrationsCsv = () => {
        if (!selectedSession) return;
        if (sortedRegistrations.length === 0) {
            alert('目前沒有可匯出的報名資料');
            return;
        }

        const headers = [
            '場次名稱',
            '報名時間',
            '姓名',
            '電話',
            '來源',
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
            '報到連結'
        ];

        const rows = sortedRegistrations.map((reg) => {
            const checkInUrl = reg.id ? buildCheckInUrl(reg.id) : '';
            return [
                selectedSession.title || '',
                formatDate(reg.createdAt),
                reg.name || '',
                reg.phone || '',
                reg.source || '',
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
                checkInUrl
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
                            AI落地師培訓班 {viewMode === 'sessions' ? '場次管理' : '報名名單管理'}
                        </h1>
                        {adminEmail && (
                            <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
                                Admin: <span className="font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-700">{adminEmail}</span>
                                <button onClick={handleLogout} className="text-blue-500 hover:underline text-xs">登出</button>
                            </p>
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
                        {/* VIEW MODE: SESSIONS */}
                        {viewMode === 'sessions' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* Special Card: Time Not Available */}
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
                                                onClick={() => fetchRegistrations(buildTimeNotAvailableSession())}
                                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-4 py-2 rounded-lg transition-colors border border-emerald-200"
                                            >
                                                管理 &rarr;
                                            </button>
                                        </div>
                                    </div>
                                </div>

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
                                                    報名管理 ({session.currentCount || 0}) &rarr;
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
                                                <div className="flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded border border-green-200"><span className="font-bold text-green-600">總實收:</span> <span className="text-green-700 font-bold">${registrations.filter(r => r.status === 'confirmed').reduce((sum, r) => sum + (r.receivedAmount || 0), 0)}</span></div>
                                            </div>
                                            {selectedSession.note && (
                                                <div className="mt-3 text-sm text-slate-600">
                                                    <span className="font-bold text-slate-400">NOTE:</span> {selectedSession.note}
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-2 md:mt-0 w-full md:w-auto md:text-right">
                                            <div className="text-xs text-slate-500 uppercase font-bold mb-1">Capacity</div>
                                            <div className="text-3xl font-black text-slate-800">
                                                {/* Calculate Active Count Client Side for Admin Accuracy */}
                                                {registrations.filter(r => r.status !== 'cancelled').reduce((acc, r) => acc + (r.count || 1), 0)}
                                                <span className="text-lg text-slate-400 font-normal">/{selectedSession.id === 'time_not_available' ? '-' : (selectedSession.maxCapacity || 50)}</span>
                                            </div>
                                            {selectedSession.id !== 'time_not_available' && (selectedSession.currentCount || 0) >= (selectedSession.maxCapacity || 50) && (
                                                <div className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded inline-block mt-1">FULL</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                                    <p className="font-bold text-amber-900">報到掃描頁「已繳費」怎麼判斷？</p>
                                    <p className="mt-1 leading-relaxed">
                                        只要<strong>狀態為「已確認」</strong>或<strong>實收金額大於 0</strong>，就會顯示已繳費。若在 Firestore
                                        只把狀態改回待核對、但實收欄位仍大於 0，畫面仍會是已繳費。測試後若要還原，請用名單上的「清除報到資訊」。
                                    </p>
                                </div>

                                <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                                        <button
                                            type="button"
                                            onClick={handleExportRegistrationsCsv}
                                            disabled={sortedRegistrations.length === 0}
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
                                                    <th className="p-4 font-semibold">時間</th>
                                                    <th className="p-4 font-semibold">姓名 / 電話</th>
                                                    <th className="p-4 font-semibold">付款方式</th>
                                                    <th className="p-4 font-semibold">金額 / 備註</th>
                                                    <th className="p-4 font-semibold">狀態 / 報到</th>
                                                    <th className="p-4 font-semibold">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                                                {sortedRegistrations.length === 0 ? (
                                                    <tr><td colSpan="6" className="p-8 text-center text-slate-400">此場次尚無報名資料</td></tr>
                                                ) : sortedRegistrations.map(reg => (
                                                    <tr key={reg.id} className={`hover:bg-slate-50 transition-colors ${reg.status === 'cancelled' ? 'opacity-50 grayscale bg-slate-50' : ''}`}>
                                                        <td className="p-4 text-slate-500 text-xs">{formatDate(reg.createdAt)}</td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-slate-800">{reg.name}</div>
                                                            <div className="font-mono text-xs text-slate-500">{reg.phone}</div>
                                                            <div className="mt-1 text-xs text-blue-600 bg-blue-50 inline-block px-1 rounded">{reg.source}</div>
                                                            {(reg.sessionId === 'time_not_available' || reg.isTimeNotAvailable) && (
                                                                <div className="mt-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                                                                    <div className="font-bold mb-0.5">許願開課</div>
                                                                    <div>時間：{reg.wishTime || '-'}</div>
                                                                    <div>地點：{reg.wishLocation || '-'}</div>
                                                                </div>
                                                            )}
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
                                                            {reg.checkInAt ? (
                                                                <div className="mt-1.5 text-[11px] font-medium text-slate-600">
                                                                    已報到 {formatCheckInShort(reg.checkInAt)}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-1.5 text-[11px] text-slate-400">尚未報到</div>
                                                            )}
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="flex flex-wrap gap-2">
                                                                <button
                                                                    onClick={() => copyCheckInLink(reg)}
                                                                    className="px-3 py-1 bg-emerald-600 border border-emerald-600 rounded text-xs text-white hover:bg-emerald-700 font-bold"
                                                                    title="複製報到 QR 頁面連結"
                                                                >
                                                                    複製報到資訊
                                                                </button>
                                                                <button
                                                                    onClick={() => openEditModal(reg)}
                                                                    className="px-3 py-1 bg-white border border-slate-300 rounded text-xs text-slate-600 hover:bg-slate-50 font-bold"
                                                                >
                                                                    編輯
                                                                </button>
                                                                {reg.status !== 'cancelled' && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleClearCheckInInfo(reg)}
                                                                        disabled={opLoading}
                                                                        className="px-3 py-1 rounded text-xs font-bold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                                                        title="清除報到時間並重設為待核對、實收 0（方便測試還原）"
                                                                    >
                                                                        清除報到資訊
                                                                    </button>
                                                                )}
                                                                {reg.status !== 'cancelled' && (
                                                                    <button onClick={() => handleQuickCancel(reg)} className="text-red-400 hover:text-red-600 text-xs underline">
                                                                        取消報名
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

                                    {/* 手機版：卡片式清單，避免表格擠壓 */}
                                    <div className="md:hidden p-4">
                                        {sortedRegistrations.length === 0 ? (
                                            <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                此場次尚無報名資料
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {sortedRegistrations.map(reg => {
                                                    const paymentLabel = reg.paymentMethod === 'transfer' ? '轉帳'
                                                        : reg.paymentMethod === 'cash' ? '現金'
                                                            : reg.paymentMethod === 'linepay' ? 'LinePay'
                                                                : '未指定';
                                                    const paymentTail = reg.paymentMethod === 'transfer' && reg.lastFive
                                                        ? `（末五碼 ${reg.lastFive}）`
                                                        : '';
                                                    return (
                                                    <article
                                                        key={reg.id}
                                                        className={`bg-slate-50 border border-slate-200 rounded-xl p-3 ${reg.status === 'cancelled' ? 'opacity-60 grayscale' : ''}`}
                                                    >
                                                        <div className="text-[11px] leading-snug text-slate-500">{formatDate(reg.createdAt)}</div>
                                                        <div className="mt-0.5 flex items-start justify-between gap-2 min-w-0">
                                                            <div className="min-w-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                                                <span className="font-bold text-slate-800 text-sm shrink-0">{reg.name}</span>
                                                                <span className="font-mono text-[11px] text-slate-500 break-all">{reg.phone}</span>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                                                <span className="text-[10px] leading-tight text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-px rounded whitespace-nowrap">
                                                                    {reg.source || '—'}
                                                                </span>
                                                                <span className={`text-[10px] leading-tight inline-flex items-center px-1.5 py-px rounded font-bold whitespace-nowrap ${reg.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                                                    reg.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                                        'bg-yellow-100 text-yellow-800'
                                                                    }`}>
                                                                    {reg.status === 'confirmed' ? '已確認' : reg.status === 'cancelled' ? '已取消' : '待核對'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {(reg.sessionId === 'time_not_available' || reg.isTimeNotAvailable) && (
                                                            <div className="mt-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5">
                                                                <div className="font-bold mb-0.5">許願開課</div>
                                                                <div>時間：{reg.wishTime || '-'}</div>
                                                                <div>地點：{reg.wishLocation || '-'}</div>
                                                            </div>
                                                        )}

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
                                                        </div>

                                                        <div className="mt-1.5 text-[11px] text-slate-600">
                                                            <span className="text-slate-500">現場報到</span>：
                                                            {reg.checkInAt ? (
                                                                <span className="font-medium text-slate-800">{formatCheckInShort(reg.checkInAt)}</span>
                                                            ) : (
                                                                <span className="text-slate-400">尚未</span>
                                                            )}
                                                        </div>

                                                        <div className="mt-2 flex gap-2">
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
                                                        {reg.status !== 'cancelled' && (
                                                            <div className="mt-2 flex flex-col gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearCheckInInfo(reg)}
                                                                    disabled={opLoading}
                                                                    className="w-full min-h-[40px] rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                                                >
                                                                    清除報到資訊
                                                                </button>
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
                                <div><label className="text-xs font-bold text-slate-500 uppercase">名額上限</label><input type="number" value={newSession.maxCapacity} onChange={e => setNewSession({ ...newSession, maxCapacity: e.target.value })} required className="w-full border p-2 rounded" /></div>
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
                                    <div><label className="text-xs font-bold text-slate-500 uppercase">名額上限</label><input type="number" value={editSessionForm.maxCapacity} onChange={e => setEditSessionForm({ ...editSessionForm, maxCapacity: e.target.value })} required className="w-full border p-2 rounded" /></div>
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

export default SignupAdmin;
