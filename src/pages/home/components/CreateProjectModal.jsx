import React, { useState } from 'react';
import { db } from '../../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { PROJECT_TYPES } from '../constants';

const CreateProjectModal = ({ userProfile, defaultName, onClose, onCreate }) => {
    const [name, setName] = useState(defaultName);
    const [projectType, setProjectType] = useState('website');
    const [projectAlias, setProjectAlias] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!name || !projectAlias) {
            alert('專案名稱與 ID 皆為必填');
            return;
        }
        setLoading(true);
        try {
            const q = query(
                collection(db, 'projects'),
                where('userId', '==', userProfile.userId),
                where('projectAlias', '==', projectAlias)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                alert('此專案 ID 已存在，請更換一個。');
                setLoading(false);
                return;
            }
            await onCreate({ name, projectAlias, projectType });
        } catch (e) {
            console.error(e);
            alert('建立前檢查失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-50/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
            <div className="bg-white border border-slate-200 shadow-xl p-6 rounded-2xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900">✕</button>
                <div className="text-4xl mb-4 text-center">📁</div>
                <h3 className="text-2xl font-bold mb-2 text-emerald-500 text-center">建立新專案</h3>
                <p className="text-slate-500 mb-6 text-sm text-center">
                    請決定專案名稱與網址 ID，建立後<strong className="text-red-500 ml-1">網址 ID 均不可修改</strong>。
                </p>
                <div className="space-y-5">
                    <div className="flex flex-col">
                        <label className="text-sm text-slate-600 font-bold mb-1">專案名稱</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="例如: 2026年行銷活動"
                            className="rounded-lg p-3 text-base outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-sm text-slate-600 font-bold mb-1">專案類型</label>
                        <select
                            value={projectType}
                            onChange={(e) => setProjectType(e.target.value)}
                            className="rounded-lg p-3 text-base outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                        >
                            {PROJECT_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-sm text-slate-600 font-bold mb-1">專案自訂 ID (Project Alias)</label>
                        <input
                            type="text"
                            value={projectAlias}
                            onChange={(e) => setProjectAlias(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                            placeholder="僅限英文數字，例如: event_2026"
                            className="rounded-lg p-3 text-base outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                        <div className="bg-slate-50 p-3 rounded-lg mt-2 flex items-center justify-center text-xs text-slate-500 font-mono break-all">
                            /u/{userProfile.alias || userProfile.userId}/<span className="text-emerald-500 ml-1">{projectAlias || 'project-id'}</span>
                        </div>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !name || !projectAlias}
                        className="w-full py-3 mt-2 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 disabled:opacity-50 transition text-lg"
                    >
                        {loading ? '建立中...' : '確認建立'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateProjectModal;
