import React from 'react';
import { generateShareCode } from '../constants';
import ScriptEditor from './ScriptEditor';

/**
 * 技能編輯視圖：技能資訊設定 ＋ 腳本規則編輯
 */
const SkillEdit = ({
    currentSkill,
    setCurrentSkill,
    onBack,
    onSave,
    handleImageUpload,
    handleRemoveImage,
    uploadingImageIndex,
}) => {
    const setScripts = (newScripts) => setCurrentSkill((prev) => ({ ...prev, scripts: newScripts }));

    return (
        <div className="flex flex-col gap-6">
            <div className="flex gap-4">
                <button
                    onClick={onBack}
                    className="text-slate-500 font-bold text-sm bg-white border border-slate-200 px-6 py-3 rounded-xl hover:bg-slate-100 shadow-sm flex items-center gap-2"
                >
                    ← 返回工作坊
                </button>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
                <div className="flex justify-between border-b pb-4 mb-6">
                    <h2 className="text-xl font-bold text-indigo-600 flex items-center gap-2">📦 技能外掛資訊設定</h2>
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-600">公開至市集？</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={currentSkill.isPublic}
                                onChange={(e) => setCurrentSkill({ ...currentSkill, isPublic: e.target.checked })}
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                        </label>
                    </div>
                </div>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-2">技能名稱</label>
                        <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                            value={currentSkill.name}
                            onChange={(e) => setCurrentSkill({ ...currentSkill, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-2">描述 (介紹用途)</label>
                        <textarea
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none h-20"
                            value={currentSkill.description}
                            onChange={(e) => setCurrentSkill({ ...currentSkill, description: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-2 flex justify-between">
                            <span>分享代碼 (Share Code)</span>
                            <button
                                onClick={() => setCurrentSkill({ ...currentSkill, shareCode: generateShareCode() })}
                                className="text-indigo-500 text-xs"
                            >
                                重新產生
                            </button>
                        </label>
                        <input
                            type="text"
                            className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 font-mono font-bold text-emerald-600 outline-none select-all"
                            value={currentSkill.shareCode}
                            readOnly
                        />
                        <p className="text-xs text-slate-400 mt-2">若是私有技能，別人可以透過輸入此代碼將其掛載至他的機器人中。</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h2 className="text-xl font-bold text-indigo-600 flex items-center gap-2">💬 包含的腳本規則</h2>
                    <button
                        onClick={() => {
                            const newScript = {
                                id: Date.now().toString(),
                                title: '新腳本',
                                trigger: '',
                                replyTexts: [''],
                                replyImages: [],
                            };
                            setCurrentSkill((prev) => ({ ...prev, scripts: [...(prev.scripts || []), newScript] }));
                        }}
                        className="bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-indigo-200"
                    >
                        + 新增腳本
                    </button>
                </div>
                <div className="flex flex-col gap-4">
                    {currentSkill.scripts?.length > 0 ? (
                        <ScriptEditor
                            scripts={currentSkill.scripts}
                            setScripts={setScripts}
                            onImageUpload={(idx, file) =>
                                handleImageUpload(idx, file, currentSkill.scripts, setScripts)
                            }
                            onRemoveImage={(scriptIdx, imgIdx) =>
                                handleRemoveImage(scriptIdx, imgIdx, currentSkill.scripts, setScripts)
                            }
                            uploadingImageIndex={uploadingImageIndex}
                            variant="skill"
                        />
                    ) : (
                        <div className="text-center py-8 text-slate-400">目前技能內容為空。</div>
                    )}
                </div>
            </div>

            <div className="mt-4 pb-12">
                <button
                    onClick={() => onSave(currentSkill)}
                    className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xl px-12 py-5 rounded-3xl shadow-lg transition transform hover:-translate-y-1 mx-auto block"
                >
                    💾 儲存技能配置
                </button>
            </div>
        </div>
    );
};

export default SkillEdit;
