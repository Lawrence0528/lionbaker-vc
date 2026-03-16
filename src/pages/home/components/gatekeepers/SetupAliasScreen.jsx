import React, { useState } from 'react';

const SetupAliasScreen = ({ onSave }) => {
    const [localAlias, setLocalAlias] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!localAlias) return;
        setLoading(true);
        try {
            await onSave(localAlias);
        } catch (e) {
            console.error(e);
            alert(e.message || '設定失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-50 z-[100] flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <div className="text-5xl mb-6 text-slate-900">🆔</div>
                <h2 className="text-3xl font-bold text-slate-900 mb-4">設定您的專屬 ID</h2>
                <p className="text-slate-500 mb-8 leading-relaxed">
                    這是您的全域唯一識別碼，將用於您的所有專案連結。<br />
                    <span className="text-xs text-slate-400">( 設定後不可隨意修改，請謹慎填寫 )</span>
                </p>

                <div className="text-left mb-2 text-xs text-slate-400 pl-1">User Alias (僅限英文數字)</div>
                <input
                    type="text"
                    value={localAlias}
                    onChange={(e) => setLocalAlias(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="例如: lawrence_2024"
                    className="w-full p-4 bg-slate-100 border border-slate-300 rounded-xl text-slate-900 outline-none mb-6 text-lg placeholder:text-slate-400 focus:border-[#10b981] focus:bg-slate-200 transition"
                />

                <div className="bg-slate-50 p-3 rounded-lg mb-6 flex items-center gap-2 justify-center text-xs text-slate-400 font-mono">
                    <span>預覽:</span>
                    <span className="text-emerald-500">/u/{localAlias || 'your-id'}/...</span>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={loading || !localAlias}
                    className="w-full py-4 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-[#10b981]/30 hover:bg-[#059669] disabled:opacity-50 transition text-lg"
                >
                    {loading ? '設定中...' : '確認 ID'}
                </button>
            </div>
        </div>
    );
};

export default SetupAliasScreen;
