/**
 * 機器人列表視圖
 */
const AgentList = ({ agents, onCreate, onEdit, onDelete }) => (
    <div className="w-full">
        <button
            onClick={onCreate}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-6 rounded-2xl shadow-lg border-b-4 border-emerald-700 transition-all mb-8 text-xl"
        >
            ＋ 建立新的 LINE 機器人
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map((ag) => (
                <div key={ag.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 hover:shadow-md transition">
                    <h3 className="font-bold text-xl text-slate-700">{ag.name}</h3>
                    <p className="text-sm text-slate-500">
                        專屬腳本: {ag.scripts?.length || 0} 組 |
                        掛載技能: {ag.mountedSkills?.length || 0} 個
                    </p>
                    <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                        <button
                            onClick={() => onEdit(ag)}
                            className="flex-1 bg-slate-100 text-emerald-600 font-bold py-2 rounded-xl hover:bg-emerald-50 transition"
                        >
                            進入管理
                        </button>
                        <button
                            onClick={() => onDelete(ag.id)}
                            className="px-4 bg-red-50 text-red-500 font-bold py-2 rounded-xl border border-red-100 hover:bg-red-100 transition"
                        >
                            刪除
                        </button>
                    </div>
                </div>
            ))}
            {agents.length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    尚未建立任何機器人
                </div>
            )}
        </div>
    </div>
);

export default AgentList;
