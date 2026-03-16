import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// 使用 Lazy Loading
const Home = lazy(() => import('./pages/home'));
const SuperAdmin = lazy(() => import('./pages/super-admin'));
const SandboxViewer = lazy(() => import('./pages/SandboxViewer'));
const AgentAdmin = lazy(() => import('./pages/agent'));

const FormResponseViewer = lazy(() => import('./pages/FormResponseViewer'));

// Vibe Coding 報名系統與後台（獨立於主站）
const Signup = lazy(() => import('./pages/singup/Signup'));
const SignupAdmin = lazy(() => import('./pages/singup/SignupAdmin'));

function App() {
  return (
    <Router>
      <Suspense fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-emerald-600">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="font-medium">載入中...</span>
          </div>
        </div>
      }>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<SuperAdmin />} />
          <Route path="/u/:userId/:projectId" element={<SandboxViewer />} />
          <Route path="/agents" element={<AgentAdmin />} />
          <Route path="/form-responses/:projectId" element={<FormResponseViewer />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signup/admin" element={<SignupAdmin />} />
          {/* 預設重新導向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
