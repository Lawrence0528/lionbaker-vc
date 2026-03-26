import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

const Signup = lazy(() => import('./Signup'));
const SignupAdmin = lazy(() => import('./SignupAdmin'));
const CheckIn = lazy(() => import('./CheckIn'));
const CheckInProcess = lazy(() => import('./CheckInProcess'));

const SignupApp = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 text-emerald-600">
          <div className="flex flex-col items-center gap-4 p-6">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="font-medium">載入中...</span>
          </div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Signup />} />
        <Route path="/admin" element={<SignupAdmin />} />
        <Route path="/checkin/:uid" element={<CheckIn />} />
        <Route path="/checkin-process" element={<CheckInProcess />} />
        <Route path="*" element={<Navigate to="/signup" replace />} />
      </Routes>
    </Suspense>
  );
};

export default SignupApp;

