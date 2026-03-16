/**
 * 主要導航切換：機器人管理 / 技能市集＆工作坊
 */
const AgentNav = ({ mainView, setMainView }) => (
    <div className="flex bg-slate-200/60 p-1.5 rounded-2xl w-fit mx-auto mb-8 relative z-10 w-[90%] md:w-auto overflow-x-auto whitespace-nowrap shadow-sm">
        <button
            onClick={() => setMainView('agents')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainView === 'agents' ? 'bg-white text-emerald-600 shadow-md transform scale-100' : 'text-slate-500 hover:text-slate-700'}`}
        >
            🤖 機器人管理
        </button>
        <button
            onClick={() => setMainView('skills')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainView === 'skills' ? 'bg-white text-emerald-600 shadow-md transform scale-100' : 'text-slate-500 hover:text-slate-700'}`}
        >
            🧩 技能市集＆工作坊
        </button>
    </div>
);

export default AgentNav;
