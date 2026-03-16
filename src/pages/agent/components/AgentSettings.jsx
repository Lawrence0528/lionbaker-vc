/**
 * 機器人基本設定分頁：名稱、LINE Token/Secret、Cloudflare 設定
 */
const AgentSettings = ({ currentAgent, setCurrentAgent }) => (
    <div className="flex flex-col gap-6">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
            <h2 className="text-xl font-bold mb-6 text-emerald-600 border-b pb-4 flex items-center gap-2">🛠️ 機器人資料</h2>
            <div className="flex flex-col gap-4">
                <div>
                    <label className="block text-sm font-bold text-slate-600 mb-2">機器人名稱</label>
                    <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none"
                        value={currentAgent.name}
                        onChange={(e) => setCurrentAgent({ ...currentAgent, name: e.target.value })}
                    />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-2">LINE Channel Access Token</label>
                        <input
                            type="password"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none"
                            value={currentAgent.lineToken || ''}
                            onChange={(e) => setCurrentAgent({ ...currentAgent, lineToken: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-600 mb-2">LINE Channel Secret</label>
                        <input
                            type="password"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none"
                            value={currentAgent.lineSecret || ''}
                            onChange={(e) => setCurrentAgent({ ...currentAgent, lineSecret: e.target.value })}
                        />
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100 border-l-4 border-l-blue-400">
            <h2 className="text-xl font-bold mb-6 text-blue-500 border-b pb-4 flex items-center gap-2">☁️ Cloudflare 端點設定</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                    <span className="inline-block bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded mb-2">步驟 1</span>
                    <h4 className="font-bold text-blue-900 mb-1">註冊帳號與啟用子網域</h4>
                    <p className="text-xs text-blue-700">
                        若無帳號請先至{' '}
                        <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-blue-900 transition-colors">
                            Cloudflare 註冊
                        </a>
                        。首次使用請務必進入「Workers & Pages」設定您的專屬 workers.dev 網域。
                    </p>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                    <span className="inline-block bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded mb-2">步驟 2</span>
                    <h4 className="font-bold text-blue-900 mb-1">取得 Token（無需手動建 Worker）</h4>
                    <p className="text-xs text-blue-700">前往「我的個人檔案 &gt; API令牌」，使用範本建立一把具備「編輯 Cloudflare Workers」權限的 Token 即可。</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                    <span className="inline-block bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded mb-2">步驟 3</span>
                    <h4 className="font-bold text-blue-900 mb-1">一鍵部署</h4>
                    <p className="text-xs text-blue-700">我們系統會自動幫您建立 Worker 並寫入程式碼！只需將 Account ID 與 Token 填入下方即可。</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-bold text-slate-600 mb-2">Account ID (帳戶ID)</label>
                    <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                        value={currentAgent.cfAccountId || ''}
                        placeholder="例如: 3b94..."
                        onChange={(e) => setCurrentAgent({ ...currentAgent, cfAccountId: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-600 mb-2">API Token</label>
                    <input
                        type="password"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                        value={currentAgent.cfApiToken || ''}
                        onChange={(e) => setCurrentAgent({ ...currentAgent, cfApiToken: e.target.value })}
                    />
                </div>
            </div>
        </div>
    </div>
);

export default AgentSettings;
