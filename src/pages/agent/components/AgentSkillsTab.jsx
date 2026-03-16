/**
 * 機器人擴充技能掛載分頁
 */
const AgentSkillsTab = ({ currentAgent, setCurrentAgent, skills, publicSkills, setPublicSkills, shareCodeInput, setShareCodeInput, onAddByShareCode, onToggleMount }) => {
    const allSkills = Array.from(new Map([...skills, ...publicSkills].map((s) => [s.id, s])).values());

    return (
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col gap-6">
            <h2 className="text-xl font-bold text-emerald-600 border-b pb-4 flex items-center gap-2">🧩 掛載擴充技能 (Skill)</h2>
            <div className="bg-slate-50/80 p-5 border border-slate-200 rounded-2xl flex flex-col md:flex-row items-center gap-4 shadow-sm">
                <div className="flex-1 w-full">
                    <input
                        type="text"
                        placeholder="輸入 6 碼私有技能分享代碼..."
                        className="w-full p-4 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-emerald-400 font-mono uppercase tracking-widest text-lg"
                        value={shareCodeInput}
                        onChange={(e) => setShareCodeInput(e.target.value)}
                    />
                </div>
                <button
                    onClick={onAddByShareCode}
                    className="w-full md:w-auto bg-emerald-500 text-white px-8 py-4 rounded-xl font-bold text-lg shadow hover:bg-emerald-600 hover:shadow-lg transition"
                >
                    解鎖代碼
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {allSkills.map((sk) => {
                    const mounted = (currentAgent.mountedSkills || []).includes(sk.id);
                    return (
                        <div
                            key={sk.id}
                            className={`p-5 border-2 rounded-2xl transition duration-300 relative overflow-hidden ${mounted ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-100 bg-white hover:border-slate-300'}`}
                        >
                            {mounted && (
                                <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">已掛載</div>
                            )}
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                <span>{sk.name}</span>
                                {sk.isPublic ? (
                                    <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full whitespace-nowrap">公開市集</span>
                                ) : (
                                    <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full whitespace-nowrap">私有授權</span>
                                )}
                            </h3>
                            <p className="text-sm mt-2 text-slate-500 line-clamp-2 h-10">{sk.description}</p>
                            <div className="mt-5 flex justify-between items-center border-t border-slate-200/50 pt-4">
                                <span className="text-xs font-medium text-slate-400">
                                    內含腳本數: <span className="text-slate-700 font-bold">{sk.scripts?.length || 0}</span>
                                </span>
                                <button
                                    onClick={() => onToggleMount(sk.id)}
                                    className={`px-5 py-2 font-bold text-sm rounded-xl transition ${mounted ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-100' : 'bg-slate-100 text-emerald-600 hover:bg-emerald-100 border border-transparent'}`}
                                >
                                    {mounted ? '移除' : '＋掛載'}
                                </button>
                            </div>
                        </div>
                    );
                })}
                {allSkills.length === 0 && (
                    <div className="col-span-full py-10 text-center text-slate-400">目前沒有公開的技能，也沒有專屬技能，可以前往「技能市集工作坊」建立！</div>
                )}
            </div>
        </div>
    );
};

export default AgentSkillsTab;
