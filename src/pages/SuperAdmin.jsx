import React, { useState, useEffect } from 'react';
import { db, auth, signInWithGoogle, logOut } from '../firebase';
import { collection, getDocs, query, updateDoc, doc, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { copyToClipboard } from '../utils/clipboard';

const SuperAdmin = () => {
    const [userProfile, setUserProfile] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('users'); // users | licenses

    // User Mgmt State
    const [users, setUsers] = useState([]);

    // License Mgmt State
    const [licenses, setLicenses] = useState([]);
    const [genConfig, setGenConfig] = useState({ type: 'VIP', days: 30, count: 1 });
    const [generatedKeys, setGeneratedKeys] = useState([]);

    const ALLOWED_EMAIL = 'charge0528@gmail.com';

    const fetchUsers = async () => {
        const snap = await getDocs(collection(db, 'users'));
        setUsers(snap.docs.map(d => ({ userId: d.id, ...d.data() })));
    };

    const fetchLicenses = async () => {
        // Limit to last 100 for perf (or update logic later)
        const q = query(collection(db, 'license_keys'), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(q);
        setLicenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                const profile = {
                    userId: user.uid,
                    displayName: user.displayName || 'Admin',
                    email: user.email,
                    pictureUrl: user.photoURL
                };
                setUserProfile(profile);

                if (user.email === ALLOWED_EMAIL) {
                    setIsAdmin(true);
                    fetchUsers();
                    fetchLicenses();
                } else {
                    setIsAdmin(false);
                }
            } else {
                setUserProfile(null);
                setIsAdmin(false);
            }
            setAuthLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // --- Actions ---

    const handleBanUser = async (user) => {
        const newStatus = user.status === 'banned' ? 'active' : 'banned';
        if (!window.confirm(`確認要 ${newStatus === 'banned' ? '停權' : '解除停權'} ${user.displayName} 嗎？`)) return;
        await updateDoc(doc(db, 'users', user.userId), { status: newStatus });
        fetchUsers();
    };

    const handleUpdateExpiry = async (user) => {
        const dateStr = prompt('新的效期 (YYYY-MM-DD)', user.expiryDate ? new Date(user.expiryDate.seconds * 1000).toISOString().split('T')[0] : '');
        if (!dateStr) return;
        const newDate = new Date(dateStr);
        newDate.setHours(23, 59, 59);
        await updateDoc(doc(db, 'users', user.userId), { expiryDate: newDate });
        fetchUsers();
    };

    const generateKeys = async () => {
        if (!window.confirm(`確定要產生 ${genConfig.count} 組 ${genConfig.type} 金鑰 (${genConfig.days} 天) 嗎？`)) return;

        const newKeys = [];
        const batchPromises = [];

        for (let i = 0; i < genConfig.count; i++) {
            const code = `VIBE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const keyData = {
                code,
                type: genConfig.type,
                days: parseInt(genConfig.days),
                status: 'active',
                createdBy: userProfile.userId,
                createdAt: serverTimestamp()
            };
            newKeys.push(code);
            batchPromises.push(addDoc(collection(db, 'license_keys'), keyData));
        }

        await Promise.all(batchPromises);
        setGeneratedKeys(newKeys);
        fetchLicenses();
        alert('金鑰產生成功！');
    };

    const handleLogin = async () => {
        try {
            await signInWithGoogle();
        } catch (error) {
            console.error(error); // Using the variable instead to avoid modifying signature entirely if that causes issues, or just log it.
            alert('登入失敗');
        }
    };

    if (authLoading) return <div className="p-10 text-center text-white flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>;

    if (!userProfile) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans">
                <div className="bg-[#111] p-8 rounded-xl shadow-2xl text-center max-w-sm w-full border border-gray-800">
                    <h1 className="text-2xl font-bold text-red-500 mb-6">🛡️ Vibe SuperAdmin</h1>
                    <p className="text-gray-400 mb-8 text-sm">此頁面僅限高級管理員登入</p>
                    <button onClick={handleLogin} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded transition-colors flex items-center justify-center gap-2">
                        登入您的 Google 帳號
                    </button>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 font-sans">
                <div className="text-center text-red-500 font-bold mb-4 text-2xl">⛔ 權限不足 (Access Denied)</div>
                <div className="text-gray-400 mb-8 text-lg">{userProfile.email} 無法存取此頁面</div>
                <button onClick={logOut} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded">登出並換個帳號</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-gray-200 font-sans p-6">
            <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
                <h1 className="text-2xl font-bold text-red-500">🛡️ SuperAdmin 管理儀表板</h1>
                <div className="flex gap-4 items-center">
                    <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded ${activeTab === 'users' ? 'bg-red-900 text-white' : 'bg-gray-800'}`}>使用者管理</button>
                    <button onClick={() => setActiveTab('licenses')} className={`px-4 py-2 rounded ${activeTab === 'licenses' ? 'bg-red-900 text-white' : 'bg-gray-800'}`}>金鑰管理</button>
                    <button onClick={logOut} className="ml-4 text-gray-400 hover:text-white text-sm">登出</button>
                </div>
            </header>

            {activeTab === 'users' && (
                <div>
                    <div className="flex justify-between mb-4">
                        <h2 className="text-xl">使用者管理 ({users.length})</h2>
                        <button onClick={fetchUsers} className="bg-gray-700 px-3 py-1 rounded">重新整理</button>
                    </div>
                    <div className="overflow-x-auto bg-[#111] rounded-lg border border-gray-800">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-800 text-gray-400">
                                <tr>
                                    <th className="p-3">使用者</th>
                                    <th className="p-3">ID / 網址</th>
                                    <th className="p-3">狀態</th>
                                    <th className="p-3">方案</th>
                                    <th className="p-3">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.userId} className="border-b border-gray-800 hover:bg-white/5">
                                        <td className="p-3 flex items-center gap-2">
                                            <img src={u.pictureUrl} className="w-8 h-8 rounded-full" />
                                            <div className="truncate w-32">{u.displayName}</div>
                                        </td>
                                        <td className="p-3">
                                            <div className="text-xs text-gray-500">{u.userId}</div>
                                            <div className="text-blue-400">{u.alias ? `@${u.alias}` : '-'}</div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded text-xs ${u.status === 'banned' ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                                                {u.status || 'active'}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            {u.isSvip ? <span className="text-yellow-400 font-bold">♾️ SVIP</span> :
                                                u.expiryDate ? <span className="text-green-400">VIP ({new Date(u.expiryDate.seconds * 1000).toLocaleDateString()})</span> :
                                                    <span className="text-gray-500">免費</span>
                                            }
                                        </td>
                                        <td className="p-3 flex gap-2">
                                            <button onClick={() => handleUpdateExpiry(u)} className="text-blue-400 bg-blue-900/30 px-2 py-1 rounded hover:bg-blue-900/50">效期</button>
                                            <button onClick={() => handleBanUser(u)} className="text-red-400 bg-red-900/30 px-2 py-1 rounded hover:bg-red-900/50">
                                                {u.status === 'banned' ? '解鎖' : '停權'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'licenses' && (
                <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Generator */}
                        <div className="bg-[#111] p-6 rounded-lg border border-gray-700">
                            <h2 className="text-xl mb-4 text-yellow-500">🔑 金鑰產生器</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-gray-400 mb-1">類型</label>
                                    <select
                                        value={genConfig.type}
                                        onChange={e => setGenConfig({ ...genConfig, type: e.target.value })}
                                        className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                                    >
                                        <option value="VIP">VIP (限時)</option>
                                        <option value="SVIP">SVIP (永久)</option>
                                    </select>
                                </div>
                                {genConfig.type === 'VIP' && (
                                    <div>
                                        <label className="block text-gray-400 mb-1">效期天數</label>
                                        <input
                                            type="number"
                                            value={genConfig.days}
                                            onChange={e => setGenConfig({ ...genConfig, days: e.target.value })}
                                            className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-gray-400 mb-1">產生數量</label>
                                    <input
                                        type="number"
                                        value={genConfig.count}
                                        onChange={e => setGenConfig({ ...genConfig, count: e.target.value })}
                                        className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                                    />
                                </div>
                                <button
                                    onClick={generateKeys}
                                    className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded transition"
                                >
                                    產生金鑰
                                </button>
                            </div>

                            {generatedKeys.length > 0 && (
                                <div className="mt-6 bg-black p-4 rounded border border-gray-800">
                                    <h3 className="text-white mb-2 font-bold">最新產生的一批金鑰：</h3>
                                    <div className="font-mono text-green-400 text-sm break-all select-all cursror-text">
                                        {generatedKeys.map(k => <div key={k}>{k}</div>)}
                                    </div>
                                    <button onClick={async () => {
                                        const success = await copyToClipboard(generatedKeys.join('\n'));
                                        if (success) {
                                            alert('金鑰已全部複製！');
                                        } else {
                                            alert('複製失敗，請手動選取複製。');
                                        }
                                    }} className="mt-2 text-xs text-gray-400 hover:text-white">複製全部</button>
                                </div>
                            )}
                        </div>

                        {/* Recent Keys List */}
                        <div className="bg-[#111] p-6 rounded-lg border border-gray-700 overflow-hidden flex flex-col h-[500px]">
                            <div className="flex justify-between mb-4">
                                <h2 className="text-xl">最近金鑰</h2>
                                <button onClick={fetchLicenses} className="bg-gray-700 px-3 py-1 rounded text-xs">重新整理</button>
                            </div>
                            <div className="overflow-y-auto flex-1">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-800 text-gray-400 sticky top-0">
                                        <tr>
                                            <th className="p-2">序號碼</th>
                                            <th className="p-2">類型</th>
                                            <th className="p-2">狀態</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {licenses.map(l => (
                                            <tr key={l.id} className="border-b border-gray-800">
                                                <td className="p-2 font-mono text-gray-300">{l.code}</td>
                                                <td className="p-2">{l.type === 'SVIP' ? '♾️' : `${l.days}d`}</td>
                                                <td className="p-2">
                                                    <span className={`text-xs px-1 rounded ${l.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                                                        {l.status === 'active' ? '有效' : '已兌換'}
                                                    </span>
                                                    {l.redeemedUsers && l.redeemedUsers.length > 0 && <div className="text-[10px] text-gray-500 mt-1">已兌換: {l.redeemedUsers.length} 人</div>}
                                                    {/* 向下相容舊版單人兌換紀錄 */}
                                                    {l.redeemedBy && !l.redeemedUsers && <div className="text-[10px] text-gray-500 mt-1">單人已兌換</div>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdmin;
