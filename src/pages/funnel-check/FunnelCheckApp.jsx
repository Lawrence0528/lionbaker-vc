import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { FunnelCheckProvider, useFunnelCheck } from './context/FunnelCheckContext';
import FunnelErrorBoundary from './components/FunnelErrorBoundary';

const ProfileSetup = lazy(() => import('./pages/ProfileSetup'));
const QuizScreen = lazy(() => import('./pages/QuizScreen'));
const ProcessingScreen = lazy(() => import('./pages/ProcessingScreen'));
const ResultScreen = lazy(() => import('./pages/ResultScreen'));

const IndexRoute = () => {
  const { state } = useFunnelCheck();
  if (state.result?.checkupId) return <Navigate to="result" replace />;
  return <ProfileSetup />;
};

const LoadingFallback = () => (
  <main className="min-h-screen bg-stone-50 text-slate-900 font-sans flex items-center justify-center p-4">
    <section className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6 text-center">
      <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
      <p className="text-sm text-slate-600 mt-3">初始化中，請稍候...</p>
    </section>
  </main>
);

const FunnelCheckGate = () => {
  const { state } = useFunnelCheck();

  if (state.initError) {
    return (
      <main className="min-h-screen bg-stone-50 text-slate-900 font-sans flex items-center justify-center p-4">
        <section className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
          <h1 className="text-lg font-black text-slate-900">初始化失敗</h1>
          <p className="text-sm text-rose-700 mt-2 leading-relaxed">{state.initError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all active:scale-[0.99]"
          >
            重新整理
          </button>
        </section>
      </main>
    );
  }

  if (!state.liffReady) {
    return <LoadingFallback />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route index element={<IndexRoute />} />
        <Route path="quiz" element={<QuizScreen />} />
        <Route path="processing" element={<ProcessingScreen />} />
        <Route path="result" element={<ResultScreen />} />
        <Route path="*" element={<Navigate to="/funnel-check" replace />} />
      </Routes>
    </Suspense>
  );
};

export default function FunnelCheckApp() {
  return (
    <FunnelCheckProvider>
      <FunnelErrorBoundary>
        <FunnelCheckGate />
      </FunnelErrorBoundary>
    </FunnelCheckProvider>
  );
}

