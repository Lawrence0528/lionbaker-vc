import React, { useState } from 'react';

const ActivationScreen = ({ user, onRedeem, mode = 'activate' }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!code) return;
        setLoading(true);
        try {
            await onRedeem(code);
        } catch (e) {
            console.error(e);
            alert('啟用失敗：' + (e.message || '未知錯誤'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <div className="text-4xl mb-4">🔑</div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{mode === 'activate' ? '啟用您的帳號' : '請輸入您的金鑰'}</h2>
                <p className="text-slate-500 mb-6 text-sm">
                    {mode === 'activate'
                        ? '初次使用請輸入 VIP 序號以啟用服務。'
                        : '請輸入新的序號以啟用或延長服務效期。'}
                </p>

                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="VIBE-XXXX-YYYY"
                    className="w-full text-center text-xl tracking-widest p-3 bg-slate-100 border border-slate-300 rounded-lg text-slate-900 outline-none mb-4 uppercase placeholder:text-slate-400 placeholder:tracking-normal focus:border-[#10b981] focus:bg-slate-200 transition"
                />

                <button
                    onClick={handleSubmit}
                    disabled={loading || !code}
                    className="w-full py-3 bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-bold rounded-lg hover:brightness-110 disabled:opacity-50 transition"
                >
                    {loading ? '驗證中...' : '啟用序號'}
                </button>

                {mode === 'expire' && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <a href="/" className="text-sm text-slate-500 hover:text-slate-900 underline">回到列表</a>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivationScreen;
