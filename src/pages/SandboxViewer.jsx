import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

/** 專案沙盒預覽 - 於 iframe 中顯示專案 HTML 程式碼 */
const SandboxViewer = () => {
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
                title={`Sandbox Project ${projectId}`}
                srcDoc={project.htmlCode}
                style={{ width: '100%', height: '100%', border: 'none' }}
                sandbox="allow-scripts allow-same-origin"
            />
        </div>
    );
};

export default SandboxViewer;
