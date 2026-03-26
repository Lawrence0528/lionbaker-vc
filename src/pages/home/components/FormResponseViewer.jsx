/**
 * FormResponseViewer - 表單回覆瀏覽器（隸屬於 Home）
 * 讀取 projects/{projectId}/form_responses。
 * Firestore 欄位名稱可使用 Unicode（含中文），若寫入時已用中文 key，translateField 會原樣顯示；
 * FIELD_MAPPING 僅作為舊資料英文 key 的顯示名稱後援。
 */
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../firebase';
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
    if (typeof key !== 'string') return String(key);
    const lowerKey = key.toLowerCase();
    return FIELD_MAPPING[lowerKey] ?? key;
};

const normLabel = (s) => String(s).replace(/\s+/g, ' ').trim();

/** 從「表單欄位要求」類文字中擷取編號清單順序（支援 1. / 1、/ 3.無空格 等） */
const parseNumberedFieldLabelsFromRequirements = (text) => {
    if (!text || typeof text !== 'string') return [];
    const labels = [];
    const seen = new Set();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/^\d+\s*[.、．:：\)\）\]]\s*(.+)$/);
        if (!m) continue;
        const label = normLabel(m[1]);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        labels.push(label);
    }
    return labels;
};

const shareSignificantSubstring = (a, b, minLen) => {
    if (!a || !b || minLen < 1) return false;
    const short = a.length <= b.length ? a : b;
    const long = a.length > b.length ? a : b;
    const maxLen = Math.min(short.length, 14);
    for (let len = maxLen; len >= minLen; len--) {
        for (let i = 0; i <= short.length - len; i++) {
            if (long.includes(short.slice(i, i + len))) return true;
        }
    }
    return false;
};

/** 提示詞標題與實際欄位 key（及對照顯示名）的契合分數，供排序用 */
const matchHintScore = (hintLabel, dataKey, tf) => {
    const nl = normLabel(hintLabel);
    const nk = normLabel(dataKey);
    const nt = normLabel(tf(dataKey));
    if (!nl || !nk) return 0;
    if (nk === nl || (nt && nt === nl)) return 100;
    if (nt && nl.length >= 2 && nt.length >= 2) {
        if (nl.includes(nt) || nt.includes(nl)) return 90;
        if (shareSignificantSubstring(nl, nt, 2)) return 76;
    }
    if (nk.length >= 2 && nl.length >= 2) {
        if (nl.includes(nk) || nk.includes(nl)) return 88;
        if (shareSignificantSubstring(nl, nk, 2)) return 72;
    }
    return 0;
};

const ORDER_MATCH_MIN_SCORE = 65;

/** 依提示詞順序排列 [key, value]，未匹配的欄位排在後面 */
const orderEntriesByRequirementHints = (entries, hints, tf) => {
    if (!hints?.length) return entries;
    const unused = new Map(entries);
    const result = [];
    for (const hint of hints) {
        let best = null;
        let bestScore = 0;
        for (const [k, v] of unused) {
            const sc = matchHintScore(hint, k, tf);
            if (sc > bestScore) {
                bestScore = sc;
                best = [k, v];
            }
        }
        if (best && bestScore >= ORDER_MATCH_MIN_SCORE) {
            result.push(best);
            unused.delete(best[0]);
        }
    }
    const restKeys = [...unused.keys()].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    for (const k of restKeys) result.push([k, unused.get(k)]);
    return result;
};

const sortKeysByRequirementHints = (keys, hints, tf) => {
    if (!hints?.length) return [...keys].sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    const entries = keys.map((k) => [k, null]);
    const ordered = orderEntriesByRequirementHints(entries, hints, tf);
    return ordered.map(([k]) => k);
};

/** 辨識可當圖片顯示的網址（含附檔名在 query 前的連結、Firebase Storage、data URL） */
const looksLikeImageUrl = (value) => {
    if (typeof value !== 'string') return false;
    const t = value.trim();
    if (t.startsWith('data:image/')) return true;
    if (!t.startsWith('http://') && !t.startsWith('https://')) return false;
    if (/\.(jpe?g|gif|png|webp|bmp|svg|avif)(\?|#|$)/i.test(t)) return true;
    if (/firebasestorage\.googleapis\.com/i.test(t)) return true;
    return false;
};

/**
 * @param {{ fieldKey: string; value: unknown; compact?: boolean; stopLinkPropagation?: boolean }} props
 */
const FieldValueDisplay = ({ fieldKey, value, compact = false, stopLinkPropagation = false }) => {
    const v = value;
    const label = translateField(fieldKey);

    if (typeof v === 'string' && looksLikeImageUrl(v)) {
        const linkCls = compact
            ? 'inline-block max-w-full rounded-lg border border-slate-200 shadow-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-400'
            : 'block max-w-sm overflow-hidden rounded-lg border border-slate-200 mt-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400';
        const imgCls = compact
            ? 'max-h-32 w-auto max-w-full object-contain bg-slate-50'
            : 'w-full h-auto object-cover hover:scale-105 transition-transform';
        return (
            <a
                href={v}
                target="_blank"
                rel="noreferrer"
                className={linkCls}
                onClick={stopLinkPropagation ? (e) => e.stopPropagation() : undefined}
            >
                <img src={v} alt={`${label}（附件預覽）`} className={imgCls} loading="lazy" />
            </a>
        );
    }

    if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) {
        return (
            <a
                href={v}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-500 hover:text-emerald-600 font-medium hover:underline break-all text-sm inline-flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg"
                onClick={stopLinkPropagation ? (e) => e.stopPropagation() : undefined}
            >
                🔗 點擊開啟連結
            </a>
        );
    }

    const textCls = compact
        ? 'text-sm text-slate-800 leading-relaxed line-clamp-3 break-words'
        : 'text-base text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100';
    return <p className={textCls}>{String(v)}</p>;
};

/**
 * @param {{ projectId: string; onBack?: () => void; projectName?: string; formRequirements?: string }} props
 */
const FormResponseViewer = ({ projectId, onBack, projectName = '', formRequirements = '' }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(null);

    const fieldOrderHints = useMemo(() => parseNumberedFieldLabelsFromRequirements(formRequirements), [formRequirements]);

    const fetchData = async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const q = query(collection(db, `projects/${projectId}/form_responses`));
            const snap = await getDocs(q);
            const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
        data.forEach((item) => {
            Object.keys(item).forEach((key) => {
                if (!key.startsWith('_') && key !== 'id') {
                    allKeys.add(key);
                }
            });
        });

        const orderedKeys = sortKeysByRequirementHints([...allKeys], fieldOrderHints, translateField);
        const headers = ['建立時間', ...orderedKeys.map(translateField)];
        const csvRows = [];
        csvRows.push(headers.join(','));

        data.forEach((item) => {
            const row = [];
            row.push(item._createdAt?.seconds ? `"${new Date(item._createdAt.seconds * 1000).toLocaleString()}"` : '"未知"');
            orderedKeys.forEach((key) => {
                let val = item[key];
                if (val === undefined || val === null) val = '';
                const valStr = String(val).replace(/"/g, '""');
                row.push(`"${valStr}"`);
            });
            csvRows.push(row.join(','));
        });

        const csvString = '\uFEFF' + csvRows.join('\n');
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

    const selectedOrderedEntries = useMemo(() => {
        if (!selectedItem) return [];
        const ent = Object.entries(selectedItem).filter(([k]) => !k.startsWith('_') && k !== 'id');
        return orderEntriesByRequirementHints(ent, fieldOrderHints, translateField);
    }, [selectedItem, fieldOrderHints]);

    return (
        <div className="w-full min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-6xl mx-auto w-full">
                <div className="mb-6 flex items-center gap-4">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-white rounded-full transition text-slate-400 hover:text-emerald-500 shadow-sm border border-transparent hover:border-slate-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">填寫資料瀏覽</h1>
                        <p className="text-slate-500 text-sm">{projectName || `專案 ID: ${projectId}`}</p>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 animate-fade-in-up">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3 flex-wrap gap-2">
                        <h2 className="text-xl font-bold text-emerald-500">表單回覆列表</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={handleExportCSV}
                                disabled={loading || data.length === 0}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50"
                            >
                                📥 匯出 CSV
                            </button>
                            <button
                                onClick={fetchData}
                                disabled={loading}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50"
                            >
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
                        <div className="text-center py-16 md:py-20 bg-slate-50 border border-slate-200 rounded-xl">
                            <div className="text-4xl mb-4 opacity-60">📋</div>
                            <p className="text-slate-500 font-medium mb-1">尚無使用者填寫的資料</p>
                            <p className="text-slate-400 text-sm">有人透過表單填寫後，資料會顯示於此</p>
                        </div>
                    ) : (
                        <section
                            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
                            aria-label="表單回覆卡片列表"
                        >
                            {data.map((item, idx) => {
                                const cleanData = Object.fromEntries(
                                    Object.entries(item).filter(([k]) => !k.startsWith('_') && k !== 'id')
                                );
                                const entries = orderEntriesByRequirementHints(Object.entries(cleanData), fieldOrderHints, translateField);
                                const previewEntries = entries.slice(0, 4);
                                const submittedAt = item._createdAt?.seconds
                                    ? new Date(item._createdAt.seconds * 1000).toLocaleString()
                                    : '未知時間';
                                const moreCount = Math.max(0, entries.length - previewEntries.length);

                                return (
                                    <article
                                        key={item.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedIndex(idx)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setSelectedIndex(idx);
                                            }
                                        }}
                                        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg hover:shadow-xl hover:border-emerald-200/70 transition-all cursor-pointer flex flex-col gap-4 text-left focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
                                    >
                                        <header className="flex flex-col gap-1 border-b border-slate-100 pb-4">
                                            <div className="flex justify-between items-start gap-3">
                                                <span className="text-xs font-bold text-slate-400 tracking-wide">提交時間</span>
                                                <span className="shrink-0 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                                                    #{idx + 1}
                                                </span>
                                            </div>
                                            <p className="text-sm font-mono text-slate-700">{submittedAt}</p>
                                        </header>

                                        <div className="flex flex-col gap-4 flex-1 min-h-0">
                                            {previewEntries.length === 0 ? (
                                                <p className="text-sm text-slate-400">（無額外表單欄位）</p>
                                            ) : (
                                                previewEntries.map(([k, v]) => (
                                                    <div key={k} className="flex flex-col gap-1.5">
                                                        <span className="text-xs font-bold text-slate-500">{translateField(k)}</span>
                                                        <FieldValueDisplay
                                                            fieldKey={k}
                                                            value={v}
                                                            compact
                                                            stopLinkPropagation
                                                        />
                                                    </div>
                                                ))
                                            )}
                                            {moreCount > 0 && (
                                                <p className="text-xs font-bold text-emerald-600 pt-1">
                                                    另 {moreCount} 個欄位 · 點卡片查看完整內容
                                                </p>
                                            )}
                                        </div>

                                        <footer className="pt-1 border-t border-slate-50">
                                            <span className="text-sm font-bold text-emerald-600">查看完整內容 →</span>
                                        </footer>
                                    </article>
                                );
                            })}
                        </section>
                    )}

                    {selectedItem && (
                        <div
                            className="fixed inset-0 bg-slate-900/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
                            onClick={() => setSelectedIndex(null)}
                        >
                            <div
                                className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-md">
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-800">表單詳細內容</h3>
                                        <div className="text-xs text-slate-500 mt-1 font-mono">
                                            {selectedItem._createdAt?.seconds ? new Date(selectedItem._createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handlePrev}
                                            disabled={selectedIndex === 0}
                                            className="h-8 px-3 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition font-bold text-sm disabled:opacity-30"
                                        >
                                            ← 上一筆
                                        </button>
                                        <button
                                            onClick={handleNext}
                                            disabled={selectedIndex === data.length - 1}
                                            className="h-8 px-3 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition font-bold text-sm disabled:opacity-30"
                                        >
                                            下一筆 →
                                        </button>
                                        <div className="w-px h-8 bg-slate-200 mx-2"></div>
                                        <button
                                            onClick={() => setSelectedIndex(null)}
                                            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-red-500 transition font-bold text-xl leading-none"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6 overflow-y-auto flex-1 bg-white">
                                    <div className="space-y-4">
                                        {selectedOrderedEntries.map(([k, v]) => (
                                                <div
                                                    key={k}
                                                    className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0 items-start"
                                                >
                                                    <div className="col-span-1 text-sm font-bold text-slate-500 pt-1 flex items-center md:justify-end md:text-right">
                                                        {translateField(k)}
                                                    </div>
                                                    <div className="col-span-1 md:col-span-2">
                                                        <FieldValueDisplay fieldKey={k} value={v} />
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>

                                <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                                    <button
                                        onClick={() => setSelectedIndex(null)}
                                        className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm transition"
                                    >
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
