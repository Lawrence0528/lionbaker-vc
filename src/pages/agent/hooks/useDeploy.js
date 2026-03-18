import { useState, useCallback } from 'react';
import { db } from '../../../firebase';
import { getDoc, doc } from 'firebase/firestore';

// 透過 Firebase Hosting rewrite 走同網域，避免跨網域觸發 CORS
const DEPLOY_URL = '/api/deploy';

/**
 * 機器人部署至 Cloudflare Edge 邏輯
 */
export const useDeploy = (currentAgent, setCurrentAgent) => {
    const [isDeploying, setIsDeploying] = useState(false);
    const [deployStatus, setDeployStatus] = useState('');

    const runDeploy = useCallback(async () => {
        if (!currentAgent?.cfAccountId || !currentAgent?.cfApiToken) {
            return alert('請先填寫 Cloudflare Account ID 與 API Token');
        }
        if (!currentAgent?.lineToken || !currentAgent?.lineSecret) {
            return alert('請填寫 LINE Channel Access Token 與 Secret');
        }

        setIsDeploying(true);
        setDeployStatus('連線中...');

        try {
            setDeployStatus('正在讀取掛載的技能...');
            let mergedScripts = [...(currentAgent.scripts || [])];
            const mountedSkills = currentAgent.mountedSkills || [];
            let skillScriptsCount = 0;

            if (mountedSkills.length > 0) {
                for (const sid of mountedSkills) {
                    const skillSnap = await getDoc(doc(db, 'skills', sid));
                    if (skillSnap.exists()) {
                        const sData = skillSnap.data();
                        if (sData.scripts?.length > 0) {
                            mergedScripts.push(...sData.scripts);
                            skillScriptsCount += sData.scripts.length;
                        }
                    }
                }
            }

            setDeployStatus(`已合併 ${mergedScripts.length} 組腳本 (私有: ${currentAgent.scripts?.length || 0}, 技能: ${skillScriptsCount})\n正在傳送至 Cloudflare Edge...`);
            const finalConfig = { ...currentAgent, scripts: mergedScripts };
            const res = await fetch(DEPLOY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId: currentAgent.id, config: finalConfig }),
            });

            const data = await res.json();
            if (data.success) {
                setDeployStatus(`部署成功！\nWebhook URL: ${data.webhookUrl}`);
            } else {
                setDeployStatus(`部署失敗: ${data.error}`);
            }
        } catch (error) {
            setDeployStatus(`發生錯誤: ${error.message}`);
        } finally {
            setIsDeploying(false);
        }
    }, [currentAgent]);

    return { isDeploying, deployStatus, runDeploy };
};
