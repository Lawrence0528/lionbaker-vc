import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import VibeAdmin from './pages/VibeAdmin';
import SuperAdmin from './pages/SuperAdmin';
import VibeViewer from './pages/VibeViewer';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<VibeAdmin />} />
        <Route path="/admin" element={<SuperAdmin />} />
        <Route path="/u/:userId/:projectId" element={<VibeViewer />} />
        {/* 預設重新導向 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
