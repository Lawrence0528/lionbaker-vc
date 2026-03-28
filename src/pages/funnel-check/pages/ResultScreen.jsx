import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { motion, AnimatePresence } from 'framer-motion';

import { FUNNEL_CTA_PATH, OFFICIAL_ACCOUNT_URL } from '../constants';
import { buildFunnelDiagnosisFlex } from '../utils/buildFlexMessage';
import { HealthRadarChart } from '../components/HealthRadarChart';
import { FunnelFlow } from '../components/FunnelFlow';
import { useFunnelCheck } from '../context/FunnelCheckContext';

const SENT_KEY = 'funnel_checkup_sent_ids_v1';
const SENT_KEY_SESSION = 'funnel_checkup_sent_ids_session_v1';
const hasSentForCheckup = (checkupId) => {
  if (!checkupId) return false;
  try {
    const raw = localStorage.getItem(SENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const localHit = Array.isArray(arr) && arr.map(String).includes(String(checkupId));
    if (localHit) return true;
  } catch {
    // ignore and continue checking sessionStorage
  }

  try {
    const raw = sessionStorage.getItem(SENT_KEY_SESSION);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.map(String).includes(String(checkupId));
  } catch {
    return false;
  }
};

const markSentForCheckup = (checkupId) => {
  if (!checkupId) return;
  const id = String(checkupId);

  try {
    const raw = sessionStorage.getItem(SENT_KEY_SESSION);
    const arr = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(arr) ? arr.map(String) : [];
    if (!next.includes(id)) next.push(id);
    sessionStorage.setItem(SENT_KEY_SESSION, JSON.stringify(next));
  } catch {
    // ignore
  }
};

const formatLiffError = (err, stage = 'unknown') => {
  const safeStringify = (value) => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const raw = err || {};
  const plainObject = typeof raw === 'object' ? { ...raw } : {};
  const detail = plainObject.details ?? plainObject.detail ?? null;
  const statusCode = plainObject.code ?? plainObject.statusCode ?? plainObject.status ?? 'N/A';
  const message = raw?.message || String(raw) || '未知錯誤';
  const stack = raw?.stack || '';

  return [
    `階段: ${stage}`,
    `code/status: ${statusCode}`,
    `message: ${message}`,
    detail ? `details: ${safeStringify(detail)}` : null,
    `raw: ${safeStringify(plainObject)}`,
    stack ? `stack: ${stack}` : null,
  ]
    .filter(Boolean)
    .join('\n');
};

export default function ResultScreen() {
  const navigate = useNavigate();
  const { state, startMessageSending, finishMessageSending, setMessageSendingError, resetForRetake } = useFunnelCheck();
  const resultCaptureRef = useRef(null);
  const sentOnceRef = useRef(false);
  const attemptedCheckupIdRef = useRef(null);

  const result = state.result;
  const lineUserId = state.lineProfile?.userId;

  const scores = result?.scores;
  const bottleneck = result?.bottleneck;
  const consultText = '我要諮詢';

  useEffect(() => {
    document.title = '結果 | 事業行銷漏斗健檢系統';
  }, []);

  useEffect(() => {
    if (!result || !lineUserId) return;
    if (state.isMessageSent) return;
    if (sentOnceRef.current) return;
    if (hasSentForCheckup(result.checkupId)) return;

    if (!liff?.isInClient?.() || !liff?.isLoggedIn?.()) {
      // 非 LINE / 未登入：只做 UI，避免送訊失敗造成干擾
      return;
    }

    const run = async () => {
      sentOnceRef.current = true;
      attemptedCheckupIdRef.current = result.checkupId;
      startMessageSending();
      try {
        const flex = buildFunnelDiagnosisFlex({
          userName: state.profileForm.name || state.lineProfile?.displayName || '朋友',
          bottleneckKey: bottleneck?.key,
          bottleneckLabel: bottleneck?.label || '（未計算）',
          scores: scores || {
            traffic: 0,
            leadCapture: 0,
            segmentation: 0,
            trustNurturing: 0,
            conversion: 0,
            fissionAscension: 0,
          },
          officialAccountUrl: (() => {
            // Flex 按鈕已改成 message，不再依賴 uri；保留欄位相容性
            try {
              return new URL(FUNNEL_CTA_PATH, window.location.origin).toString();
            } catch {
              return OFFICIAL_ACCOUNT_URL;
            }
          })(),
          screenshotUrl: null,
        });

        await liff.sendMessages([flex]);
        markSentForCheckup(result.checkupId);
        finishMessageSending(result.checkupId);
      } catch (err) {
        const firstErrorText = formatLiffError(err, 'send_flex');
        console.error('Flex send error:', firstErrorText, err);
        // 依需求：不再降級送出精簡版或文字版，避免傳出不想要的內容
        setMessageSendingError(['Flex 訊息送出失敗（未送出任何替代訊息）', '--- flex error ---', firstErrorText].join('\n'));
        // 失敗後保留錯誤並停止自動重試，避免畫面閃動與訊息被清掉
        sentOnceRef.current = true;
      }
    };

    run();
  }, [
    result,
    lineUserId,
    state.isMessageSent,
    state.profileForm.name,
    state.lineProfile?.displayName,
  ]);

  useEffect(() => {
    const checkupId = result?.checkupId || null;
    if (!checkupId) return;
    if (attemptedCheckupIdRef.current === checkupId) return;
    sentOnceRef.current = false;
    attemptedCheckupIdRef.current = null;
  }, [result?.checkupId]);

  const scoreSummary = useMemo(() => {
    if (!scores) return null;
    return [
      { key: 'traffic', label: '流量曝光', value: scores.traffic ?? 0 },
      { key: 'leadCapture', label: '名單留存', value: scores.leadCapture ?? 0 },
      { key: 'segmentation', label: '標籤分眾', value: scores.segmentation ?? 0 },
      { key: 'trustNurturing', label: '信任培育', value: scores.trustNurturing ?? 0 },
      { key: 'conversion', label: '轉換變現', value: scores.conversion ?? 0 },
      { key: 'fissionAscension', label: '裂變與升級', value: scores.fissionAscension ?? 0 },
    ];
  }, [scores]);

  if (!result) {
    return (
      <main className="min-h-screen bg-stone-50 text-slate-900 font-sans p-4">
        <header className="max-w-md mx-auto pt-6">
          <h1 className="text-xl font-black text-slate-900">結果尚未產生</h1>
          <p className="text-sm text-slate-600 mt-1">請先完成測驗。</p>
        </header>
        <section className="max-w-md mx-auto mt-8">
          <button
            onClick={() => navigate('/funnel-check')}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all active:scale-[0.99]"
          >
            回到基本資料
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900 font-sans p-4">
      <header className="max-w-md mx-auto pt-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-black text-slate-900">你的健檢報告</h1>
          <div className="text-right">
            <p className="text-xs text-slate-500">LINE 發送</p>
            <p className="text-xs font-bold text-emerald-700">{state.isMessageSent ? '已送出' : '準備中'}</p>
          </div>
        </div>
        {state.messageSendingError ? (
          <pre className="text-[11px] text-rose-700 mt-2 whitespace-pre-wrap break-words rounded-xl bg-rose-50 border border-rose-200 p-2 max-h-64 overflow-auto">
            {state.messageSendingError}
          </pre>
        ) : null}
      </header>

      <section className="max-w-md mx-auto mt-6 flex flex-col gap-6">
        <article className="bg-white rounded-2xl shadow-lg border border-slate-200 p-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              resetForRetake();
              navigate('/funnel-check', { replace: true });
            }}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all active:scale-[0.99]"
          >
            重新填寫（從基本資料開始）
          </button>
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            會回到產業、變現管道與短影音補充欄位；送出後再答題，完成後才會產生新一份報告。
          </p>
          <button
            type="button"
            onClick={() => {
              resetForRetake();
              navigate('/funnel-check/quiz', { replace: true });
            }}
            className="w-full text-sm font-semibold text-emerald-700 hover:text-emerald-800 py-2 rounded-xl border border-emerald-200 bg-emerald-50/80 transition-colors active:scale-[0.99]"
          >
            基本資料不變，直接從第 1 題重答
          </button>
        </article>

        <article
          ref={resultCaptureRef}
          id="funnel-result-capture"
          className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6"
        >
          <div className="flex flex-col gap-2 mb-5">
            <p className="text-xs font-semibold text-emerald-700">主要卡關點</p>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-black text-slate-900">
                {bottleneck?.label || '（未計算）'}
              </h2>
              {bottleneck?.key ? (
                <motion.div
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-red-50 border border-red-200 px-3 py-2"
                >
                  <span className="text-red-700 font-black" aria-hidden>⚠️</span>
                  <span className="text-red-700 font-bold text-sm">卡關層</span>
                </motion.div>
              ) : null}
            </div>
          </div>

          <FunnelFlow mode="result" bottleneckKey={bottleneck?.key} scores={scores} />
        </article>

          <HealthRadarChart scores={scores} />

        <article className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <h2 className="text-lg font-black text-slate-900">診斷標題</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{result.diagnosisTitle}</p>

          <div className="mt-5 flex flex-col gap-3">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-xs font-bold text-emerald-700 mb-2">破局策略 1</p>
              <p className="text-sm text-emerald-900 leading-relaxed">{result.strategies?.[0]}</p>
            </div>
            <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4">
              <p className="text-xs font-bold text-indigo-700 mb-2">破局策略 2</p>
              <p className="text-sm text-indigo-900 leading-relaxed">{result.strategies?.[1]}</p>
            </div>
          </div>

          {scoreSummary ? (
            <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-700 mb-2">你的維度分數（滿分 10）</p>
              <div className="flex flex-col gap-2">
                {scoreSummary.map((s) => (
                  <div key={s.key} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{s.label}</span>
                    <span className="text-sm font-black text-slate-900">{s.value} 分</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>

        <article className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5 shadow-sm">
          <p className="text-sm font-bold text-emerald-900">下一步建議</p>
          <p className="text-sm text-emerald-900/80 mt-1 leading-relaxed">
            我建議你安排一次好好來上課 1 對 1 健檢，把卡關點直接拆到可執行的行動表。
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={async () => {
                try {
                  if (liff?.isInClient?.() && liff?.isLoggedIn?.()) {
                    await liff.sendMessages([{ type: 'text', text: consultText }]);
                    return;
                  }
                } catch (err) {
                  console.warn('送出諮詢訊息失敗：', err);
                }
                // 非 LIFF 或送出失敗：退回開啟 OA（仍可手動複製文字）
                window.location.href = OFFICIAL_ACCOUNT_URL;
              }}
              className="w-full text-center bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all active:scale-[0.99]"
            >
              預約 1 對 1 健檢（送出「{consultText}」）
            </button>
            <p className="mt-2 text-xs text-emerald-900/70 text-center">
              若未在 LINE 內開啟，請手動複製文字：<span className="font-black select-all">{consultText}</span>
            </p>
          </div>
        </article>

        <AnimatePresence>
          {state.messageSending ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-slate-500 text-center"
            >
              正在把健檢報告回傳到 LINE...
            </motion.p>
          ) : null}
        </AnimatePresence>
      </section>
    </main>
  );
}

