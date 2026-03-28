import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { FUNNEL_QUIZ_QUESTIONS } from '../utils/funnelQuizData';
import { CHOICE_SCORE_MAP } from '../constants';
import { FunnelFlow } from '../components/FunnelFlow';
import { useFunnelCheck } from '../context/FunnelCheckContext';

const OPTION_ORDER = ['A', 'B', 'C'];

export default function QuizScreen() {
  const navigate = useNavigate();
  const { state, setAnswer } = useFunnelCheck();

  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    document.title = '測驗 | 事業行銷漏斗健檢系統';
  }, []);

  const currentIndex = useMemo(() => {
    const answers = state.answersByQuestionId || {};
    const idx = FUNNEL_QUIZ_QUESTIONS.findIndex((q) => !answers[q.id]);
    if (idx === -1) return FUNNEL_QUIZ_QUESTIONS.length - 1;
    return idx;
  }, [state.answersByQuestionId]);

  const answeredCount = useMemo(() => Object.keys(state.answersByQuestionId || {}).length, [state.answersByQuestionId]);

  const currentQuestion = FUNNEL_QUIZ_QUESTIONS[currentIndex];
  const activeDimensionKey = currentQuestion?.dimension || 'traffic';

  const isCompleted = answeredCount >= FUNNEL_QUIZ_QUESTIONS.length;
  const previousAnswers = state.previousAnswersByQuestionId || {};

  const handlePick = async (choice) => {
    if (isTransitioning) return;
    if (!currentQuestion) return;

    const already = state.answersByQuestionId?.[currentQuestion.id];
    if (already && already === choice) return;

    setIsTransitioning(true);
    setAnswer(currentQuestion.id, choice);

    // 過場動畫節奏：選擇後短暫顯示，接著自動前進
    await new Promise((r) => setTimeout(r, 350));
    setIsTransitioning(false);
  };

  const progress = Math.min(100, Math.round((answeredCount / FUNNEL_QUIZ_QUESTIONS.length) * 100));

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900 font-sans p-4">
      <header className="max-w-md mx-auto pt-6">
        <h1 className="text-xl font-black text-slate-900">12 題情境測驗</h1>
        <p className="text-sm text-slate-600 mt-1">選項分數 A=1、B=3、C=5。</p>
      </header>

      <section className="max-w-md mx-auto mt-6 flex flex-col gap-6">
        <article className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500">進度</p>
              <p className="font-bold text-slate-900">
                {answeredCount}/{FUNNEL_QUIZ_QUESTIONS.length} 題
              </p>
            </div>
            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div className="h-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.35 }} />
            </div>
          </div>

          <FunnelFlow mode="quiz" activeDimensionKey={activeDimensionKey} />

          <div className="mt-6">
            {isCompleted ? (
              <div className="mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-sm font-bold text-emerald-900">你已完成 12 題</p>
                <p className="text-xs text-emerald-800 mt-1">
                  你可以修改任一題後再重新產生報告（不會自動跳轉）。
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/funnel-check/processing')}
                  className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-sm transition-all active:scale-[0.99]"
                >
                  重新產生健檢報告
                </button>
              </div>
            ) : null}
            <AnimatePresence mode="wait">
              {currentQuestion ? (
                <motion.div
                  key={currentQuestion.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">第 {currentIndex + 1} 題</p>
                    <h2 className="text-base sm:text-lg font-black text-slate-900 mt-2">{currentQuestion.prompt}</h2>
                  </div>

                  <div className="flex flex-col gap-3">
                    {OPTION_ORDER.map((letter) => {
                      const choiceScore = CHOICE_SCORE_MAP[letter];
                      const selected = state.answersByQuestionId?.[currentQuestion.id] === letter;
                      const wasSelectedBefore = previousAnswers?.[currentQuestion.id] === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => handlePick(letter)}
                          disabled={isTransitioning}
                          className={[
                            'text-left p-4 rounded-2xl border transition-all',
                            selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50',
                          ].join(' ')}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={[
                                  'shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center font-black',
                                  selected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-emerald-700 border border-slate-200',
                                ].join(' ')}
                              >
                                {letter}
                              </span>
                              <div className="flex flex-col gap-1">
                                <p className="text-slate-800 font-semibold">{currentQuestion.options[letter]}</p>
                                {wasSelectedBefore && !selected ? (
                                  <span className="inline-flex w-fit rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                    上次選擇
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-500">分數</p>
                              <p className="font-black text-slate-900">{choiceScore} 分</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </article>

        <div className="text-center text-xs text-slate-500">
          診斷完成後，我們會把結果寫入 Firestore，並在 LINE 回傳 Flex 訊息。
        </div>
      </section>
    </main>
  );
}

