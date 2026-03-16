import AgentSettings from './AgentSettings';
import AgentSkillsTab from './AgentSkillsTab';
import ScriptEditor from './ScriptEditor';

/**
 * 機器人編輯視圖：分頁（基本設定、技能掛載、私有腳本）+ 儲存與部署
 */
const AgentEdit = ({
    currentAgent,
    setCurrentAgent,
    editTab,
    setEditTab,
    setViewMode,
    skills,
    publicSkills,
    setPublicSkills,
    shareCodeInput,
    setShareCodeInput,
    onAddByShareCode,
    onToggleMount,
    onSave,
    handleImageUpload,
    handleRemoveImage,
    uploadingImageIndex,
    isDeploying,
    deployStatus,
    runDeploy,
}) => {
    const setScripts = (newScripts) => setCurrentAgent((prev) => ({ ...prev, scripts: newScripts }));
    const scripts = currentAgent?.scripts || [];

    const onImageUpload = (index, file) => handleImageUpload(index, file, scripts, setScripts);
    const onRemoveImage = (scriptIndex, imageIndex) => handleRemoveImage(scriptIndex, imageIndex, scripts, setScripts);

    const handleAddScript = () => {
        const newScript = { id: Date.now().toString(), title: '新腳本', trigger: '', replyTexts: [''], replyImages: [] };
        setCurrentAgent((prev) => ({ ...prev, scripts: [...prev.scripts, newScript] }));
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex gap-4">
                <button
                    onClick={() => setViewMode('list')}
                    className="text-slate-500 font-bold text-sm bg-white border border-slate-200 px-6 py-3 rounded-xl hover:bg-slate-100 shadow-sm flex items-center gap-2"
                >
                    ← 返回機器人列表
                </button>
            </div>

            <div className="flex bg-slate-200/60 p-1.5 rounded-2xl w-fit overflow-x-auto whitespace-nowrap">
                <button
                    onClick={() => setEditTab('settings')}
                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${editTab === 'settings' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    ⚙️ 基本設定
                </button>
                <button
                    onClick={() => setEditTab('skills')}
                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${editTab === 'skills' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    🧩 擴充技能(Skill)
                </button>
                <button
                    onClick={() => setEditTab('scripts')}
                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${editTab === 'scripts' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    💬 私有腳本
                </button>
            </div>

            {editTab === 'settings' && (
                <AgentSettings currentAgent={currentAgent} setCurrentAgent={setCurrentAgent} />
            )}

            {editTab === 'skills' && (
                <AgentSkillsTab
                    currentAgent={currentAgent}
                    setCurrentAgent={setCurrentAgent}
                    skills={skills}
                    publicSkills={publicSkills}
                    setPublicSkills={setPublicSkills}
                    shareCodeInput={shareCodeInput}
                    setShareCodeInput={setShareCodeInput}
                    onAddByShareCode={onAddByShareCode}
                    onToggleMount={onToggleMount}
                />
            )}

            {editTab === 'scripts' && (
                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                        <div>
                            <h2 className="text-xl font-bold text-emerald-600 flex items-center gap-2">💬 私有腳本 (不公開)</h2>
                            <p className="text-sm text-slate-500 mt-1">
                                只針對這台機器人專屬設定的關鍵字與回覆，優先級等同於擴充技能。
                            </p>
                        </div>
                        <button
                            onClick={handleAddScript}
                            className="bg-emerald-100 text-emerald-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-emerald-200"
                        >
                            + 新增專屬腳本
                        </button>
                    </div>
                    <ScriptEditor
                        scripts={scripts}
                        setScripts={setScripts}
                        onImageUpload={onImageUpload}
                        onRemoveImage={onRemoveImage}
                        uploadingImageIndex={uploadingImageIndex}
                        variant="agent"
                    />
                </div>
            )}

            {/* 控制與部署區域 */}
            <div className="mt-4 flex flex-col md:flex-row gap-4 mb-10">
                <button
                    onClick={() => onSave(currentAgent)}
                    className="w-full md:w-1/3 text-white font-bold text-lg bg-emerald-600 px-6 py-5 rounded-3xl hover:bg-emerald-700 shadow-md transition-all"
                >
                    💾 儲存設定
                </button>
                <button
                    onClick={runDeploy}
                    disabled={isDeploying}
                    className={`w-full md:w-2/3 py-5 px-8 rounded-3xl font-bold text-xl shadow-lg transition-all ${isDeploying ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-teal-500 to-blue-500 text-white hover:shadow-xl hover:-translate-y-1'}`}
                >
                    {isDeploying ? '發射部署中...' : '🚀 將全部組合並一鍵部署 Edge'}
                </button>
            </div>

            {deployStatus && (
                <div className="p-4 bg-slate-800 text-green-400 rounded-2xl text-left font-mono text-sm whitespace-pre-wrap shadow-inner -mt-6">
                    {deployStatus}
                </div>
            )}
        </div>
    );
};

export default AgentEdit;
