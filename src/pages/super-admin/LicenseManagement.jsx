import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs, query, addDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { copyToClipboard } from '../../utils/clipboard';

const LicenseManagement = ({ userProfile }) => {
    const [licenses, setLicenses] = useState([]);
    const [genConfig, setGenConfig] = useState({ type: 'VIP_PERSONAL', days: 30, count: 1, validUntil: '' });
    const [generatedKeys, setGeneratedKeys] = useState([]);

    const fetchLicenses = async () => {
        const q = query(collection(db, 'license_keys'), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(q);
        setLicenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    useEffect(() => {
        fetchLicenses();
    }, []);

    const generateKeys = async () => {
        if (!window.confirm(`確定要產生 ${genConfig.count} 組 ${genConfig.type} 金鑰 (${genConfig.days} 天) 嗎？`)) return;

        const newKeys = [];
        const batchPromises = [];

        for (let i = 0; i < genConfig.count; i++) {
            const code = `VIBE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const keyData = {
                code,
                type: genConfig.type,
                days: parseInt(genConfig.days) || 0,
                status: 'active',
                createdBy: userProfile?.userId,
                createdAt: serverTimestamp()
            };
            if (genConfig.type === 'VIP_CLASS' && genConfig.validUntil) {
                keyData.validUntil = genConfig.validUntil;
            }
            newKeys.push(code);
            batchPromises.push(addDoc(collection(db, 'license_keys'), keyData));
        }

        await Promise.all(batchPromises);
        setGeneratedKeys(newKeys);
        fetchLicenses();
        alert('金鑰產生成功！');
    };

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                                <option value="VIP_CLASS">VIP 課堂用 (限時 / 可重複使用)</option>
                                <option value="VIP_PERSONAL">VIP 個人用 (限時 / 一次性)</option>
                                <option value="SVIP">SVIP 終生會員 (永久 / 一次性)</option>
                            </select>
                        </div>
                        {genConfig.type === 'VIP_CLASS' && (
                            <div>
                                <label className="block text-gray-400 mb-1">最晚輸入期限 (選填)</label>
                                <input
                                    type="date"
                                    value={genConfig.validUntil}
                                    onChange={e => setGenConfig({ ...genConfig, validUntil: e.target.value })}
                                    className="w-full bg-black border border-gray-700 rounded p-2 text-white"
                                />
                            </div>
                        )}
                        {genConfig.type !== 'SVIP' && (
                            <div>
                                <label className="block text-gray-400 mb-1">給予效期天數</label>
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
                            <div className="font-mono text-green-400 text-sm break-all select-all cursor-text">
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
                                        <td className="p-2">
                                            {l.type === 'SVIP' ? '♾️ SVIP' : `${l.days}天`}
                                            <div className="text-[10px] text-gray-500 mt-0.5">
                                                {l.type === 'VIP_CLASS' ? '課堂用(多人)' : l.type === 'VIP_PERSONAL' ? '個人用(單次)' : l.type === 'SVIP' ? '一次性' : '通用'}
                                                {l.validUntil && <span> | 期限: {l.validUntil}</span>}
                                            </div>
                                        </td>
                                        <td className="p-2">
                                            <span className={`text-xs px-1 rounded ${l.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                                                {l.status === 'active' ? '有效' : '已兌換'}
                                            </span>
                                            {l.redeemedUsers && l.redeemedUsers.length > 0 && <div className="text-[10px] text-gray-500 mt-1">已兌換: {l.redeemedUsers.length} 人</div>}
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
    );
};

export default LicenseManagement;
