import React from 'react';
import { useParams } from 'react-router-dom';

/** 專案沙盒預覽 - 於 iframe 中顯示專案 HTML（由後端 renderSandbox 輸出） */
const SandboxViewer = () => {
    const { userId, projectId } = useParams();
    if (!userId || !projectId) {
        return <div className="flex items-center justify-center h-screen bg-gray-100 text-red-600">無效的專案連結</div>;
    }

    const src = `/u/${encodeURIComponent(userId)}/${encodeURIComponent(projectId)}`;

    return (
        <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <iframe
                title={`Sandbox Project ${projectId}`}
                src={src}
                style={{ width: '100%', height: '100%', border: 'none' }}
                // 移除 allow-same-origin，避免租戶 HTML（不受信任 JS）取得同源能力
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
        </div>
    );
};

export default SandboxViewer;
