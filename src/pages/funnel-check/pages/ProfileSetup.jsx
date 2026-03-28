import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../../components/SEO';
import { FUNNEL_CTA_PATH, INDUSTRIES, MONETIZATION_CHANNELS, OFFICIAL_ACCOUNT_URL } from '../constants';
import { useFunnelCheck } from '../context/FunnelCheckContext';

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { state, setProfileForm } = useFunnelCheck();

  const [error, setError] = useState('');

  useEffect(() => {
    const pageTitle = '基本資料收集 | 事業行銷漏斗健檢系統';
    document.title = pageTitle;
  }, []);

  const displayName = state.profileForm.name || state.lineProfile?.displayName || '';

  const seoImage = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return origin ? `${origin}/funnel-checkup-og.png` : '/funnel-checkup-og.png';
  }, []);

  const hasProfile = !!state.profileForm.industry && !!state.profileForm.monetization;
  const answeredCount = Object.keys(state.answersByQuestionId || {}).length;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const { name, industry, monetization } = state.profileForm;
    if (!name.trim()) return setError('請填寫姓名/暱稱。');
    if (!industry) return setError('請選擇所屬產業。');
    if (!monetization) return setError('請選擇主要變現管道。');

    navigate('/funnel-check/quiz');
  };

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900 font-sans p-4">
      <SEO
        title="基本資料收集 | 事業行銷漏斗健檢系統"
        description="填寫你的背景，讓漏斗健檢更精準。"
        image={seoImage}
        url={typeof window !== 'undefined' ? window.location.href : ''}
        type="website"
        appName="事業行銷漏斗健檢系統"
      />

      <header className="max-w-md mx-auto pt-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center">
            <span className="text-2xl" aria-hidden>🧭</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">事業行銷漏斗健檢系統</h1>
            <p className="text-sm text-slate-600 mt-1">先收集背景，診斷會更對症。</p>
          </div>
        </div>
      </header>

      <section className="max-w-md mx-auto mt-6">
        <article className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
          {hasProfile ? (
            <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm font-bold text-emerald-900">你已完成背景資料，可直接修改</p>
              <p className="text-xs text-emerald-800 mt-1">
                {answeredCount > 0 ? '系統也已載入你之前的測驗答案，你可以回到測驗繼續作答。' : '你可以修改後重新開始診斷。'}
              </p>
              {answeredCount > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate('/funnel-check/quiz')}
                  className="mt-3 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm transition-all active:scale-[0.99]"
                >
                  回到測驗（已載入先前答案）
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-3 mb-5">
            {state.lineProfile?.pictureUrl ? (
              <img
                src={state.lineProfile.pictureUrl}
                alt="LINE 用戶頭像"
                className="w-12 h-12 rounded-2xl border border-slate-200"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200" aria-hidden />
            )}
            <div>
              <p className="text-xs text-slate-500">目前用戶</p>
              <p className="font-bold text-slate-900">{displayName || '未取得 LINE 資料'}</p>
              {state.isMock ? <p className="text-xs text-amber-700 mt-1">目前為本地 Mock 模式（不會發送 LINE 訊息）</p> : null}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">姓名/暱稱</label>
              <input
                value={state.profileForm.name}
                onChange={(e) => setProfileForm({ name: e.target.value })}
                placeholder="請輸入你的姓名或暱稱"
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
                type="text"
                inputMode="text"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">所屬產業</label>
              <select
                value={state.profileForm.industry}
                onChange={(e) => setProfileForm({ industry: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
              >
                <option value="">請選擇產業</option>
                {INDUSTRIES.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">主要變現管道</label>
              <select
                value={state.profileForm.monetization}
                onChange={(e) => setProfileForm({ monetization: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
              >
                <option value="">請選擇變現管道</option>
                {MONETIZATION_CHANNELS.map((it) => (
                  <option key={it.value} value={it.value}>
                    {it.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">
                產業現況/目標簡述 <span className="text-xs text-slate-500">(可填，讓診斷更貼近你)</span>
              </label>
              <textarea
                value={state.profileForm.industryDescription}
                onChange={(e) => setProfileForm({ industryDescription: e.target.value })}
                placeholder="例如：目前主要靠臉書社團接單，但轉換率不穩；希望用 LINE 做成可持續的名單與邀約流程。"
                className="min-h-[110px] w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors resize-none"
              />
            </div>

            {error ? (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl text-center">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all active:scale-[0.99]"
            >
              {hasProfile ? '修改並開始診斷' : '儲存並開始診斷'}
            </button>

            <footer className="text-xs text-slate-500 pt-1">
              點擊開始後，我們會引導你完成 8 題漏斗情境題。
            </footer>
          </form>
        </article>

        <div className="mt-4 text-center text-xs text-slate-500">
          報名連結：<a href={FUNNEL_CTA_PATH} className="text-emerald-700 underline" target="_blank" rel="noreferrer">{FUNNEL_CTA_PATH}</a>
        </div>
      </section>
    </main>
  );
}

