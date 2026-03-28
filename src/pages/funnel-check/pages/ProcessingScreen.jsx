import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { db } from '../../../firebase';
import { INDUSTRIES, MONETIZATION_CHANNELS } from '../constants';
import { FUNNEL_QUIZ_QUESTIONS } from '../utils/funnelQuizData';
import { computeScoresFromQuestions, pickBottleneck, buildDiagnosisSmart } from '../utils/funnelScore';
import { useFunnelCheck } from '../context/FunnelCheckContext';
import { buildReelsInsightPayload, writeFunnelReelsInsight } from '../../../utils/funnelReelsInsight';

const labelByValue = (list, value) => list.find((x) => x.value === value)?.label || '';

export default function ProcessingScreen() {
  const navigate = useNavigate();
  const { state, startProcessing, finishProcessing, setProcessingError } = useFunnelCheck();

  const answeredCount = useMemo(() => Object.keys(state.answersByQuestionId || {}).length, [state.answersByQuestionId]);

  useEffect(() => {
    document.title = '系統運算中... | 事業行銷漏斗健檢系統';
  }, []);

  useEffect(() => {
    const readyToProcess = state.liffReady && !state.processing && !state.result && answeredCount >= FUNNEL_QUIZ_QUESTIONS.length;
    if (!readyToProcess) return;
    if (!state.lineProfile?.userId) return;

    const run = async () => {
      startProcessing();
      try {
        const answersByQuestionId = state.answersByQuestionId || {};
        const scores = computeScoresFromQuestions(FUNNEL_QUIZ_QUESTIONS, answersByQuestionId);
        const bottleneck = pickBottleneck(scores);
        const diagnosis = buildDiagnosisSmart({ scores, bottleneck });
        const showBottleneck = diagnosis?.kind !== 'overallStrong';

        const checkupId = String(Date.now());

        const profile = {
          name: state.profileForm.name,
          industry: labelByValue(INDUSTRIES, state.profileForm.industry) || state.profileForm.industry,
          monetization:
            labelByValue(MONETIZATION_CHANNELS, state.profileForm.monetization) || state.profileForm.monetization,
          industryDescription: state.profileForm.industryDescription || '',
          brandName: (state.profileForm.brandName || '').trim(),
          offerOneLiner: (state.profileForm.offerOneLiner || '').trim(),
          audiencePortrait: (state.profileForm.audiencePortrait || '').trim(),
          contentPainOrGoal: (state.profileForm.contentPainOrGoal || '').trim(),
          personaTone: (state.profileForm.personaTone || '').trim(),
          shortsPlatforms: Array.isArray(state.profileForm.shortsPlatforms) ? state.profileForm.shortsPlatforms : [],
        };

        await setDoc(
          doc(db, 'users', state.lineProfile.userId, 'checkups', checkupId),
          {
            profile,
            scores,
            bottleneck: showBottleneck ? bottleneck.label : '沒有明顯卡關',
            bottleneckKey: showBottleneck ? bottleneck.key : null,
            bottleneckScore: showBottleneck ? bottleneck.score : Math.min(bottleneck?.score ?? 0, 10),
            answersByQuestionId,
            diagnosisTitle: diagnosis.title,
            strategies: diagnosis.strategies,
            createdAt: serverTimestamp(),
          },
          { merge: false },
        );

        const resultPayload = {
          checkupId,
          profile,
          scores,
          bottleneck: showBottleneck ? bottleneck : { key: null, label: '沒有明顯卡關', score: bottleneck.score, maxScore: bottleneck.maxScore, maxKey: bottleneck.maxKey },
          bottleneckScore: showBottleneck ? bottleneck.score : bottleneck.score,
          diagnosisTitle: diagnosis.title,
          strategies: diagnosis.strategies,
        };

        finishProcessing(resultPayload);

        writeFunnelReelsInsight(
          buildReelsInsightPayload({
            profileForm: state.profileForm,
            funnelResult: {
              diagnosisTitle: diagnosis.title,
              bottleneck,
              strategies: diagnosis.strategies,
            },
          }),
        );

        navigate('/funnel-check/result', { replace: true });
      } catch (err) {
        console.error('Processing error:', err);
        setProcessingError(err?.message || '系統運算失敗，請稍後再試。');
      }
    };

    run();
  }, [
    state.liffReady,
    state.processing,
    state.result,
    answeredCount,
    state.lineProfile?.userId,
    state.answersByQuestionId,
    state.profileForm,
    startProcessing,
    finishProcessing,
    setProcessingError,
    navigate,
  ]);

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900 font-sans p-4">
      <header className="max-w-md mx-auto pt-6">
        <h1 className="text-xl font-black text-slate-900">系統運算中...</h1>
        <p className="text-sm text-slate-600 mt-1">正在計算你的漏斗分數並寫入 Firestore。</p>
      </header>

      <section className="max-w-md mx-auto mt-8">
        <article className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 flex flex-col gap-4 items-center text-center">
          <motion.div
            className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"
            aria-hidden
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, ease: 'linear', repeat: Infinity }}
          />
          <p className="text-sm text-slate-600 leading-relaxed">
            這段時間我們會：
            <br />
            1) 計算 6 面向總分
            <br />
            2) 找出最低分的「主要卡關點」
            <br />
            3) 寫入你的健檢紀錄
          </p>

          {state.processingError ? (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl w-full">
              {state.processingError}
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}

