import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';

// --- 常見欄位中英對照表 ---
const FIELD_MAPPING = {
    name: '姓名',
    phone: '電話',
    email: '信箱',
    address: '地址',
    score: '滿意度/評分',
    learning_reflection: '學習心得',
    impressive_part: '印象深刻的部分',
    suggestions: '建議與回饋',
    whisper: '悄悄話',
    submitted_at: '提交時間',
    application: '應用場景/用途',
    photo_url: '照片網址/截圖',
    company: '公司名稱',
    title: '職稱'
};

const translateField = (key) => {
    const lowerKey = key.toLowerCase();
    return FIELD_MAPPING[lowerKey] || key;
};

const FormResponseViewer = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [projectName, setProjectName] = useState('');

    const fetchData = async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            // 先獲取專案名稱（選用）
            // const projectSnap = await getDoc(doc(db, 'projects', projectId));
            // if (projectSnap.exists()) {
            //     setProjectName(projectSnap.data().name);
            // }

            const q = query(collection(db, `projects/${projectId}/form_responses`));
            const snap = await getDocs(q);
            const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // sort by _createdAt desc
            docs.sort((a, b) => {
                const tA = a._createdAt?.seconds || 0;
                const tB = b._createdAt?.seconds || 0;
                return tB - tA;
            });
            setData(docs);
            setSelectedIndex(null);
        } catch (e) {
            console.error(e);
            alert('無法讀取資料');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (data.length === 0) return;
        
        const allKeys = new Set();
        data.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!key.startsWith('_') && key !== 'id') {
                    allKeys.add(key);
                }
            });
        });
        
        const headers = ['建立時間', ...Array.from(allKeys).map(translateField)];
        const csvRows = [];
        csvRows.push(headers.join(','));
        
        data.forEach(item => {
            const row = [];
            row.push(item._createdAt?.seconds ? `"${new Date(item._createdAt.seconds * 1000).toLocaleString()}"` : '"未知"');
            Array.from(allKeys).forEach(key => {
                let val = item[key];
                if (val === undefined || val === null) val = '';
                let valStr = String(val).replace(/"/g, '""');
                row.push(`"${valStr}"`);
            });
            csvRows.push(row.join(','));
        });
        
        const csvString = "\uFEFF" + csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `form_responses_${projectId}_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        fetchData();
    }, [projectId]);

    const handlePrev = () => {
        if (selectedIndex !== null && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        }
    };

    const handleNext = () => {
        if (selectedIndex !== null && selectedIndex < data.length - 1) {
            setSelectedIndex(selectedIndex + 1);
        }
    };

    const selectedItem = selectedIndex !== null ? data[selectedIndex] : null;

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6 flex items-center gap-4">
                    <button 
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-white rounded-full transition text-slate-400 hover:text-emerald-500 shadow-sm border border-transparent hover:border-slate-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">填寫資料瀏覽</h1>
                        <p className="text-slate-500 text-sm">專案 ID: {projectId}</p>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 animate-fade-in-up">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3 flex-wrap gap-2">
                        <h2 className="text-xl font-bold text-emerald-500">表單回覆列表</h2>
                        <div className="flex gap-2">
                            <button onClick={handleExportCSV} disabled={loading || data.length === 0} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50">
                                📥 匯出 CSV
                            </button>
                            <button onClick={fetchData} disabled={loading} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50">
                                🔄 重新整理
                            </button>
                        </div>
                    </div>
                    
                    {loading ? (
                        <div className="text-center py-12 text-slate-500">
                             <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                             載入中...
                        </div>
                    ) : data.length === 0 ? (
                        <div className="text-center py-20 bg-slate-50 border border-slate-100 rounded-lg text-slate-400 text-sm italic">
                            尚無使用者填寫的資料
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 border-b border-slate-200 font-bold text-slate-600 whitespace-nowrap hidden md:table-cell">🕒 提交時間</th>
                                        <th className="p-3 border-b border-slate-200 font-bold text-slate-600 whitespace-nowrap">預覽內容</th>
                                        <th className="p-3 border-b border-slate-200 font-bold text-slate-600 whitespace-nowrap text-right">操作</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {data.map((item, idx) => {
                                        const cleanData = Object.fromEntries(Object.entries(item).filter(([k]) => !k.startsWith('_') && k !== 'id'));
                                        const keys = Object.keys(cleanData);
                                        const previewKeys = keys.slice(0, 3);
                                        return (
                                            <tr key={item.id} onClick={() => setSelectedIndex(idx)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors group">
                                                <td className="p-3 text-slate-500 font-mono text-xs whitespace-nowrap hidden md:table-cell align-top">
                                                    {item._createdAt?.seconds ? new Date(item._createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                                                </td>
                                                <td className="p-3 align-top">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="text-xs text-slate-400 font-mono mb-1 md:hidden">
                                                            {item._createdAt?.seconds ? new Date(item._createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                                                        </div>
                                                        {previewKeys.map(k => (
                                                            <div key={k} className="flex gap-2 text-sm overflow-hidden text-ellipsis">
                                                                <span className="font-bold text-slate-600 shrink-0">{translateField(k)}:</span> 
                                                                <span className="text-slate-500 truncate">{String(cleanData[k])}</span>
                                                            </div>
                                                        ))}
                                                        {keys.length > 3 && (
                                                            <div className="text-xs font-bold text-emerald-500 mt-1">...及其他 {keys.length - 3} 個欄位</div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right text-emerald-600 font-bold align-middle whitespace-nowrap">
                                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">查看詳情 &rarr;</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {selectedItem && (
                        <div className="fixed inset-0 bg-slate-900/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedIndex(null)}>
                            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-md">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800">表單詳細內容</h3>
                                        <div className="text-xs text-slate-500 mt-1 font-mono">
                                            {selectedItem._createdAt?.seconds ? new Date(selectedItem._createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handlePrev} disabled={selectedIndex === 0} className="h-8 px-3 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition font-bold text-sm disabled:opacity-30">
                                            &larr; 上一筆
                                        </button>
                                        <button onClick={handleNext} disabled={selectedIndex === data.length - 1} className="h-8 px-3 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition font-bold text-sm disabled:opacity-30">
                                            下一筆 &rarr;
                                        </button>
                                        <div className="w-px h-8 bg-slate-200 mx-2"></div>
                                        <button onClick={() => setSelectedIndex(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-red-500 transition font-bold text-xl leading-none">&times;</button>
                                    </div>
                                </div>

                                <div className="p-6 overflow-y-auto flex-1 bg-white">
                                    <div className="space-y-4">
                                        {Object.entries(selectedItem)
                                            .filter(([k]) => !k.startsWith('_') && k !== 'id')
                                            .map(([k, v]) => (
                                                <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0 items-start">
                                                    <div className="col-span-1 text-sm font-bold text-slate-500 uppercase tracking-wider pt-1 flex items-center md:justify-end md:text-right">
                                                        {translateField(k)}
                                                    </div>
                                                    <div className="col-span-1 md:col-span-2">
                                                        {typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://')) ? (
                                                            v.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                                <a href={v} target="_blank" rel="noreferrer" className="block max-w-sm overflow-hidden rounded-lg border border-slate-200 mt-1 shadow-sm">
                                                                    <img src={v} alt={translateField(k)} className="w-full h-auto object-cover hover:scale-105 transition-transform" />
                                                                </a>
                                                            ) : (
                                                                <a href={v} target="_blank" rel="noreferrer" className="text-emerald-500 hover:text-emerald-600 font-medium hover:underline break-all text-sm inline-flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded">
                                                                    🔗 點擊開啟連結
                                                                </a>
                                                            )
                                                        ) : (
                                                            <div className="text-base text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                                {String(v)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>

                                <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                                    <button onClick={() => setSelectedIndex(null)} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm transition">
                                        關閉
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FormResponseViewer;
