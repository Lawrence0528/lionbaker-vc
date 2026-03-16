import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);

    const fetchUsers = async () => {
        const snap = await getDocs(collection(db, 'users'));
        setUsers(snap.docs.map(d => ({ userId: d.id, ...d.data() })));
    };

    useEffect(() => {
        fetchUsers();
    }, []);

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

    return (
        <div>
            <div className="flex justify-between mb-4">
                <h2 className="text-xl">用戶數： {users.length}</h2>
                <button onClick={fetchUsers} className="bg-gray-700 px-3 py-1 rounded">重新整理</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {users.map(u => {
                    const statusLabel = u.status === 'banned' ? '停權' : '啟用';
                    const planLabel = u.isSvip ? '♾️ SVIP' :
                        u.expiryDate ? `VIP (${new Date(u.expiryDate.seconds * 1000).toLocaleDateString()})` : '免費';
                    return (
                        <button
                            key={u.userId}
                            type="button"
                            onClick={() => setSelectedUser(u)}
                            className="bg-[#111] rounded-xl border border-gray-800 p-3 text-left hover:border-gray-600 transition-all hover:shadow-lg hover:shadow-black/20 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full"
                        >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <img src={u.pictureUrl} alt={u.displayName} className="w-10 h-10 rounded-full shrink-0 object-cover" />
                                <div className="min-w-0 flex-1">
                                    <span className="font-medium text-white truncate block">{u.displayName}</span>
                                    <span className="text-sm text-blue-400 truncate block">{u.alias ? `@${u.alias}` : '-'}</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 w-full sm:w-auto sm:shrink-0">
                                <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${u.status === 'banned' ? 'bg-red-900/80 text-red-200' : 'bg-green-900/80 text-green-200'}`}>{statusLabel}</span>
                                <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${u.isSvip ? 'text-yellow-400 bg-yellow-900/30' : u.expiryDate ? 'text-green-400 bg-green-900/30' : 'text-gray-500 bg-gray-800'}`}>{planLabel}</span>
                                <span className="text-gray-500" aria-hidden="true">›</span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {selectedUser && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
                    onClick={() => setSelectedUser(null)}
                >
                    <div
                        className="bg-[#111] rounded-2xl border border-gray-700 shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-gray-800">
                            <div className="flex items-center gap-4 mb-4">
                                <img src={selectedUser.pictureUrl} alt={selectedUser.displayName} className="w-16 h-16 rounded-full shrink-0 object-cover" />
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-lg font-bold text-white truncate">{selectedUser.displayName}</h3>
                                    <div className="text-blue-400">{selectedUser.alias ? `@${selectedUser.alias}` : '-'}</div>
                                    <div className="text-xs text-gray-500 mt-1 break-all">{selectedUser.userId}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <span className={`px-2 py-1 rounded text-xs ${selectedUser.status === 'banned' ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                                    {selectedUser.status === 'banned' ? '停權' : '啟用'}
                                </span>
                                <span className={`px-2 py-1 rounded text-xs ${selectedUser.isSvip ? 'text-yellow-400 bg-yellow-900/30' : selectedUser.expiryDate ? 'text-green-400 bg-green-900/30' : 'text-gray-500 bg-gray-800'}`}>
                                    {selectedUser.isSvip ? '♾️ SVIP' : selectedUser.expiryDate ? `VIP (${new Date(selectedUser.expiryDate.seconds * 1000).toLocaleDateString()})` : '免費'}
                                </span>
                            </div>
                        </div>
                        <div className="p-4 flex gap-2">
                            <button
                                onClick={() => { handleUpdateExpiry(selectedUser); setSelectedUser(null); }}
                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition"
                            >
                                修改效期
                            </button>
                            <button
                                onClick={() => { handleBanUser(selectedUser); setSelectedUser(null); }}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition"
                            >
                                {selectedUser.status === 'banned' ? '解除停權' : '停權'}
                            </button>
                        </div>
                        <div className="p-4 pt-0">
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
                            >
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
