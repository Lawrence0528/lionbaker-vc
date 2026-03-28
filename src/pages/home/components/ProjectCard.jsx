import React, { useState, useMemo } from 'react';
import liff from '@line/liff';

const getSeoData = (html) => {
    if (!html) return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return {
        title: doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || '無標題',
        desc: doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '無描述',
        image: doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    };
};

const ProjectCard = ({ project, onEdit, onDelete, onViewFormResponses, userProfile }) => {
    const seo = useMemo(() => (project.htmlCode ? getSeoData(project.htmlCode) : null), [project.htmlCode]);
    const userParam = userProfile?.alias || project.userAlias || project.userId;
    const projectParam = project.projectAlias || project.id;
    const [timestamp] = useState(() => project.updatedAt?.seconds ?? Math.floor(Date.now() / 1000));
    const [copyLinkMsg, setCopyLinkMsg] = useState('');

    const projectUrl = `https://run.lionbaker.com/u/${userParam}/${projectParam}?t=${timestamp}`;

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(projectUrl);
            setCopyLinkMsg('✓ 已複製');
            setTimeout(() => setCopyLinkMsg(''), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
            alert('複製失敗');
        }
    };

    const handleOpenUrl = () => {
        try {
            if (typeof liff !== 'undefined' && liff.isInClient()) {
                liff.openWindow({ url: projectUrl, external: true });
            } else {
                window.open(projectUrl, '_blank', 'noreferrer');
            }
        } catch {
            window.open(projectUrl, '_blank', 'noreferrer');
        }
    };

    const typeLabels = {
        game: { cls: 'border-pink-500 text-pink-500', label: '🎮 Web 小遊戲' },
        namecard: { cls: 'border-blue-500 text-blue-500', label: '📇 電子名片' },
        form: { cls: 'border-amber-500 text-amber-500', label: '📝 電子表單' },
        interactive_tool: { cls: 'border-purple-500 text-purple-500', label: '🎯 互動式工具' },
        landingPage: { cls: 'border-indigo-500 text-indigo-500', label: '🚀 Landing Page' },
    };
    const { cls: typeCls, label: typeLabel } = typeLabels[project.type] || { cls: 'border-green-500 text-green-500', label: '🌐 一般網站' };

    return (
        <div className="bg-white border border-slate-200 shadow-xl p-5 rounded-xl hover:bg-slate-50 transition group relative flex flex-col h-full">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border mb-2 inline-block ${typeCls}`}>{typeLabel}</span>
                    <h3 className="font-bold text-lg leading-tight text-slate-900 mb-1">{project.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => onEdit(project)} className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-sm transition text-slate-700">編輯</button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('確定刪除此專案與所有關聯圖片嗎？')) onDelete(project.id);
                        }}
                        className="px-3 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-sm transition"
                    >
                        刪除
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-[#2b2b2b] rounded-lg overflow-hidden border border-slate-200 mb-4 min-h-[200px] flex flex-col">
                {project.htmlCode && seo ? (
                    <>
                        {seo.image ? (
                            <img src={seo.image} alt="og" className="w-full h-32 object-cover" />
                        ) : (
                            <div className="w-full h-32 bg-slate-200 flex items-center justify-center text-slate-500 text-xs">No Image</div>
                        )}
                        <div className="p-3 bg-[#1a1a1a] flex-1">
                            <div className="font-bold text-sm truncate mb-1 text-slate-700 text-left">{seo.title}</div>
                            <div className="text-xs text-slate-400 line-clamp-2 text-left">{seo.desc}</div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex-1 flex flex-col items-center justify-center p-6 text-slate-400 text-sm italic bg-slate-50">
                        <span className="mb-2 text-2xl">📝</span>
                        <span>{project.htmlCode ? '尚無 SEO 預覽' : '尚無程式碼'}</span>
                        {!project.htmlCode && <div className="mt-2 text-xs opacity-50 text-center">編輯並儲存後即可預覽</div>}
                    </div>
                )}
            </div>

            {project.htmlCode && (
                <div className="space-y-2">
                    <button onClick={handleOpenUrl} className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-[#10b981]/20 rounded-lg text-center text-sm transition flex items-center justify-center gap-2">
                        🔗 開啟網頁
                    </button>
                    <button onClick={handleCopyLink} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg text-center text-sm transition flex items-center justify-center gap-2">
                        {copyLinkMsg ? <span className="text-emerald-600 font-bold">{copyLinkMsg}</span> : <>📋 複製連結</>}
                    </button>
                    {project.type === 'form' && onViewFormResponses && (
                        <button
                            onClick={() => onViewFormResponses(project)}
                            className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 rounded-lg text-center text-sm transition flex items-center justify-center gap-2"
                        >
                            📊 填寫資料瀏覽
                        </button>
                    )}
                </div>
            )}

            <div className="mt-3 text-[10px] text-slate-400 text-right">
                {project.updatedAt?.seconds ? new Date(project.updatedAt.seconds * 1000).toLocaleDateString() : ''}
            </div>
        </div>
    );
};

export default ProjectCard;
