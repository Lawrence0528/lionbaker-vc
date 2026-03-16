import React, { useState } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

const UserSettings = ({ user, onClose, onUpdate }) => {
    const [alias, setAlias] = useState(user.alias || '');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            if (alias && alias !== user.alias) {
                const q = query(collection(db, 'users'), where('alias', '==', alias));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    alert('此 User ID 已被其他用戶使用，請更換一個。');
                    setLoading(false);
                    return;
                }
            }
            await updateDoc(doc(db, 'users', user.userId), { alias });
            onUpdate({ ...user, alias });
            alert('設定已更新！');
            onClose();
        } catch (e) {
            console.error(e);
            alert('更新失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-50/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 shadow-xl p-6 rounded-2xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900">✕</button>
                <h3 className="text-xl font-bold mb-4 text-emerald-500">個人設定</h3>
                <div className="space-y-4">
                    <div className="flex flex-col">
                        <label className="text-xs text-slate-500 mb-1">顯示名稱</label>
                        <input type="text" value={user.displayName} disabled className="rounded p-2 text-sm outline-none bg-slate-100 text-slate-500 cursor-not-allowed" />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-slate-500 mb-1">自訂 User ID (全域唯一)</label>
                        <input
                            type="text"
                            value={alias}
                            onChange={(e) => setAlias(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                            placeholder="例如: lawrence"
                            className="rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                            設定後，您的所有專案網址將變為：<br />
                            <span className="text-emerald-500">/u/{alias || user.userId}/[專案ID]</span>
                        </p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="w-full py-2 mt-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-[#10b981]/50 rounded-lg transition"
                    >
                        {loading ? '儲存中...' : '儲存設定'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserSettings;
