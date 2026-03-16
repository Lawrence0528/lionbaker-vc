/**
 * 技能列表視圖
 */
const SkillList = ({ skills, onCreate, onEdit, onDelete }) => (
    <div className="w-full">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl p-8 mb-8 text-white shadow-xl">
            <h1 className="text-3xl font-bold mb-2">🧩 技能工作坊</h1>
            <p className="text-blue-100">建立功能強大且可共用的關鍵字技能，分享給其他機器人掛載使用。</p>
            <button
                onClick={onCreate}
                className="mt-6 bg-white text-indigo-600 font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition shadow"
            >
                ＋ 建立新擴充技能
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skills.map((sk) => (
                <div key={sk.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-xl text-slate-700">{sk.name}</h3>
                        {sk.isPublic ? (
                            <span className="bg-emerald-100 text-emerald-600 text-xs px-2 py-1 rounded font-bold">公開</span>
                        ) : (
                            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-bold">私有</span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500">{sk.description}</p>
                    <p className="text-xs bg-slate-50 p-2 rounded text-slate-600 font-mono">
                        傳送代碼: <span className="font-bold uppercase select-all">{sk.shareCode}</span>
                    </p>
                    <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                        <button
                            onClick={() => onEdit(sk)}
                            className="flex-1 bg-slate-100 text-indigo-600 font-bold py-2 rounded-xl hover:bg-indigo-50 transition"
                        >
                            進入編輯
                        </button>
                        <button
                            onClick={() => onDelete(sk.id)}
                            className="px-4 bg-red-50 text-red-500 font-bold py-2 rounded-xl border border-red-100 hover:bg-red-100 transition"
                        >
                            刪除
                        </button>
                    </div>
                </div>
            ))}
            {skills.length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    尚未開發任何技能套件
                </div>
            )}
        </div>
    </div>
);

export default SkillList;
