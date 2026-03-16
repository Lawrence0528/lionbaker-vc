import React, { useState } from 'react';

const TermsModal = ({ onAgree }) => {
    const [checked, setChecked] = useState(false);
    return (
        <div className="fixed inset-0 bg-slate-50 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white max-w-lg w-full rounded-2xl p-6 border border-slate-200 shadow-2xl relative my-8">
                <h2 className="text-2xl font-bold text-emerald-500 mb-6 tracking-wide border-b border-slate-200 pb-4">服務條款與使用規範</h2>
                <div className="text-sm text-slate-700 leading-relaxed space-y-4 mb-6 max-h-[60vh] overflow-y-auto bg-slate-50 p-4 rounded-lg">
                    <p className="font-bold">歡迎使用 Vibe AI 專案工廠。使用本服務前，請務必同意以下條款：</p>
                    <ul className="list-disc pl-5 space-y-3">
                        <li><strong className="text-red-400">嚴禁非法內容：</strong>禁止利用本平台製作、散佈任何色情、詐騙、賭博、暴力或違反法律之內容。</li>
                        <li><strong className="text-red-400">詐騙零容忍：</strong>若發現涉及詐騙行為，我們將立即停權並配合執法機關調查。</li>
                        <li><strong>帳號責任：</strong>您需對您帳號下的所有活動負責，請妥善保管您的帳號。</li>
                        <li><strong>服務終止：</strong>若違反上述規範，我們保留隨時終止服務且不予退費的權利。</li>
                    </ul>
                </div>

                <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg bg-slate-100 hover:bg-slate-200 transition mb-4 select-none border border-slate-200">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                        className="w-5 h-5 accent-emerald-500"
                    />
                    <span className="text-base text-slate-900 font-bold">我已詳細閱讀並同意上述條款</span>
                </label>

                <button
                    onClick={onAgree}
                    disabled={!checked}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition tracking-wide ${checked ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:brightness-110 shadow-lg shadow-emerald-500/30' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                    同意並繼續
                </button>
            </div>
        </div>
    );
};

export default TermsModal;
