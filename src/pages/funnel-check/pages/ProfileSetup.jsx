import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SEO from '../../../components/SEO';
import { buildReelsInsightPayload, writeFunnelReelsInsight } from '../../../utils/funnelReelsInsight';
import {
  FUNNEL_CTA_PATH,
  INDUSTRIES,
  MONETIZATION_CHANNELS,
  OFFICIAL_ACCOUNT_URL,
  PERSONA_TONE_OPTIONS,
  SHORTS_PLATFORM_OPTIONS,
} from '../constants';
import { useFunnelCheck } from '../context/FunnelCheckContext';
import { FUNNEL_QUIZ_QUESTIONS } from '../utils/funnelQuizData';

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { state, setProfileForm } = useFunnelCheck();

  const [error, setError] = useState('');

  useEffect(() => {
    document.title = '認識你，讓 AI 更懂你 | 事業行銷漏斗健檢系統';
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

    writeFunnelReelsInsight(buildReelsInsightPayload({ profileForm: state.profileForm, funnelResult: null }));

    navigate('/funnel-check/quiz');
  };

  const toggleShortsPlatform = (value) => {
    const cur = state.profileForm.shortsPlatforms || [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    setProfileForm({ shortsPlatforms: next });
  };

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900 font-sans p-4">
      <SEO
        title="認識你，讓 AI 更懂你 | 事業行銷漏斗健檢系統"
        description="留下你的事業語境：協助 AI 落地師與系統掌握細節，健檢、腳本與後續程式生成都能帶入更強提示詞。填得越清楚，AI 越懂你。"
        image={seoImage}
        url={typeof window !== 'undefined' ? window.location.href : ''}
        type="website"
        appName="事業行銷漏斗健檢系統"
      />

      <header className="max-w-md mx-auto pt-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-900">事業行銷漏斗健檢系統</h1>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              先讓系統與 AI 落地師認識你：背景越具體，健檢與後續各種生成越能對準你的情境。
            </p>
          </div>
        </div>
      </header>

      <section className="max-w-md mx-auto mt-6">
        <article className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
          {hasProfile ? (
            <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm font-bold text-emerald-900">你已建立事業語境，可直接微調</p>
              <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                {answeredCount > 0
                  ? '系統已載入先前測驗答案；更新基本資料後，也會讓後續 AI 生成沿用最新語境。'
                  : '修改後再開始診斷，診斷與之後的生成會更貼近你現在的說法。'}
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
                產業現況／目標簡述{' '}
                <span className="text-xs text-slate-500 font-normal">（建議填：健檢與 AI 生成都會參考）</span>
              </label>
              <textarea
                value={state.profileForm.industryDescription}
                onChange={(e) => setProfileForm({ industryDescription: e.target.value })}
                placeholder="例如：目前主要靠臉書社團接單，但轉換率不穩；希望用 LINE 做成可持續的名單與邀約流程。"
                className="min-h-[110px] w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors resize-none"
              />
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 flex flex-col gap-4">
              <p className="text-sm font-bold text-emerald-900">深化你的輪廓（選填，強烈建議）</p>
              <p className="text-xs text-emerald-800/90 leading-relaxed">
                品牌、客群、卡點與語氣會寫進你的「事業語境檔」：落地師與系統能更懂你；短影音腳本、其他 AI
                生成與提示詞也都能沿用，輸出更一致、更有力。
              </p>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">品牌／專案名稱</label>
                <input
                  value={state.profileForm.brandName}
                  onChange={(e) => setProfileForm({ brandName: e.target.value })}
                  placeholder="例：○○烘焙工作室、個人品牌名稱"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
                  type="text"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">核心產品／服務（一句話）</label>
                <input
                  value={state.profileForm.offerOneLiner}
                  onChange={(e) => setProfileForm({ offerOneLiner: e.target.value })}
                  placeholder="例：一對一減重陪跑、企業簡報代製、手工餅乾團購"
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
                  type="text"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">理想客戶輪廓（誰最可能買單／諮詢你）</label>
                <textarea
                  value={state.profileForm.audiencePortrait}
                  onChange={(e) => setProfileForm({ audiencePortrait: e.target.value })}
                  placeholder="例：30–45 歲上班族媽媽、想副業但怕詐騙的上班族、開店 2 年內的餐飲老闆…"
                  className="min-h-[88px] w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">行銷／內容上想突破的卡點或目標</label>
                <textarea
                  value={state.profileForm.contentPainOrGoal}
                  onChange={(e) => setProfileForm({ contentPainOrGoal: e.target.value })}
                  placeholder="例：不知道開場怎麼下勾子、有流量沒私訊、想從娛樂流量轉成諮詢名單…"
                  className="min-h-[88px] w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors resize-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">偏好人設語氣（文案、口播與 AI 生成皆會參考）</label>
                <select
                  value={state.profileForm.personaTone}
                  onChange={(e) => setProfileForm({ personaTone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-colors"
                >
                  {PERSONA_TONE_OPTIONS.map((it) => (
                    <option key={it.value || 'none'} value={it.value}>
                      {it.label}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
                <legend className="text-sm font-semibold text-slate-700 mb-1">主要經營內容或短影音的平台（可複選）</legend>
                <div className="flex flex-col gap-2">
                  {SHORTS_PLATFORM_OPTIONS.map((it) => (
                    <label
                      key={it.value}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 cursor-pointer hover:border-emerald-300 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={(state.profileForm.shortsPlatforms || []).includes(it.value)}
                        onChange={() => toggleShortsPlatform(it.value)}
                        className="w-5 h-5 accent-emerald-600 shrink-0"
                      />
                      <span className="text-sm text-slate-800">{it.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
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

            <footer className="text-xs text-slate-500 pt-1 leading-relaxed">
              點擊開始後，將進行 {FUNNEL_QUIZ_QUESTIONS.length}{' '}
              題漏斗情境題；你在此頁留下的描述也會成為後續 AI 提示詞的養分，愈完整愈聰明。
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

