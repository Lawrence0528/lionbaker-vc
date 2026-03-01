import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase'; // 假設 Firebase 設定檔匯出自 ../firebase
import { doc, getDoc } from 'firebase/firestore';

const VibeViewer = () => {
    const { userId, projectId } = useParams();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchProject = async () => {
            if (!projectId) return;

            try {
                const docRef = doc(db, 'projects', projectId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // 簡單驗證 userId 是否匹配 (如果需要嚴格權限控制，應在 Firestore Rules 設定)
                    if (data.userId && data.userId !== userId) {
                        console.warn('User ID mismatch, providing warning but displaying content anyway for demo');
                    }
                    setProject(data);
                } else {
                    setError('找不到此專案');
                }
            } catch (err) {
                console.error('Error fetching project:', err);
                setError('讀取專案發生錯誤');
            } finally {
                setLoading(false);
            }
        };

        fetchProject();
    }, [userId, projectId]);

    if (loading) return <div className="flex items-center justify-center h-screen bg-gray-100">載入中...</div>;
    if (error) return <div className="flex items-center justify-center h-screen bg-gray-100 text-red-600">{error}</div>;
    if (!project || !project.htmlCode) return <div className="flex items-center justify-center h-screen bg-gray-100">此專案沒有內容</div>;

    return (
        <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <iframe
                title={`Vibe Project ${projectId}`}
                srcDoc={project.htmlCode}
                style={{ width: '100%', height: '100%', border: 'none' }}
                // 安全性關鍵設定：
                // allow-scripts: 允許執行 JS
                // allow-same-origin: 允許存取同源資源 (注意：若 srcDoc 內容有惡意腳本，這可能有風險，但在 srcDoc 模式下相對安全)
                // 絕對不加: allow-modals (禁止彈窗), allow-top-navigation (禁止跳轉頂層)
                sandbox="allow-scripts allow-same-origin"
            />
        </div>
    );
};

export default VibeViewer;
