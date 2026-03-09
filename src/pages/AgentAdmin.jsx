import React, { useState, useEffect } from 'react';
import { db, signIn, storage } from '../firebase';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import liff from '@line/liff';

const PRESET_SCRIPTS = [
    { title: '打招呼', trigger: '你好', reply: '哈囉！有什麼我可以幫忙的嗎？' },
    { title: '詢價', trigger: '多少錢', reply: '詳細報價請參考我們的官網或是直接留言詢問唷！' },
    { title: '營業時間', trigger: '時間', reply: '我們的營業時間為周一至周五 09:00~18:00' },
];

const generateShareCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const AgentAdmin = () => {
    const [userProfile, setUserProfile] = useState(null);
    const [mainView, setMainView] = useState('agents'); // 'agents' 或 'skills'

    // Agents 狀態
    const [agents, setAgents] = useState([]);
    const [currentAgent, setCurrentAgent] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // list 或 edit
    const [editTab, setEditTab] = useState('scripts'); // settings, skills, 或 scripts

    // Skills 狀態
    const [skills, setSkills] = useState([]);
    const [publicSkills, setPublicSkills] = useState([]);
    const [currentSkill, setCurrentSkill] = useState(null);
    const [skillViewMode, setSkillViewMode] = useState('list');
    const [shareCodeInput, setShareCodeInput] = useState('');

    const [isDeploying, setIsDeploying] = useState(false);
    const [deployStatus, setDeployStatus] = useState('');
    const [uploadingImageIndex, setUploadingImageIndex] = useState(null);

    useEffect(() => {
        const init = async () => {
            try {
                await signIn();
                if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                    await liff.init({ liffId: "2008893070-nnNXBPod" });
                    if (liff.isLoggedIn()) {
                        const profile = await liff.getProfile();
                        setUserProfile(profile);
                        fetchData(profile.userId);
                    } else {
                        liff.login();
                    }
                } else {
                    const localUser = { userId: 'Ue17ac074742b4f21da6f6b41307a246a', displayName: 'Local User' };
                    setUserProfile(localUser);
                    fetchData(localUser.userId);
                }
            } catch (err) {
                console.error('初始化失敗:', err);
            }
        };
        init();
    }, []);

    const fetchData = (userId) => {
        fetchAgents(userId);
        fetchSkills(userId);
        fetchPublicSkills();
    };

    // ========== Agents 邏輯 ==========
    const fetchAgents = async (userId) => {
        try {
            const q = query(collection(db, 'agents'), where('userId', '==', userId));
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => b.updatedAt?.seconds - a.updatedAt?.seconds);
            setAgents(data);
        } catch (e) {
            console.error('Fetch agents error', e);
        }
    };

    const handleCreateAgent = async () => {
        if (!userProfile) return;
        const newRef = doc(collection(db, 'agents'));
        const newDoc = {
            id: newRef.id,
            name: `我的機器人 ${agents.length + 1}`,
            userId: userProfile.userId,
            cfAccountId: '',
            cfApiToken: '',
            lineToken: '',
            lineSecret: '',
            mountedSkills: [],
            scripts: [{ ...PRESET_SCRIPTS[0], replyTexts: [PRESET_SCRIPTS[0].reply], replyImages: [], id: Date.now().toString() }],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        try {
            await setDoc(newRef, newDoc);
            setAgents([newDoc, ...agents]);
            setCurrentAgent(newDoc);
            setViewMode('edit');
            setEditTab('settings');
        } catch (e) {
            alert('新增失敗');
        }
    };

    const handleSaveAgent = async (agent) => {
        try {
            const agentRef = doc(db, 'agents', agent.id);
            const updateData = { ...agent, updatedAt: serverTimestamp() };
            await setDoc(agentRef, updateData, { merge: true });
            setAgents(agents.map(a => a.id === agent.id ? updateData : a));
            alert('機器人設定儲存成功！');
        } catch (e) {
            alert('儲存失敗');
        }
    };

    const handleDeleteAgent = async (id) => {
        if (!window.confirm('確定要刪除這個機器人嗎？')) return;
        try {
            await deleteDoc(doc(db, 'agents', id));
            setAgents(agents.filter(a => a.id !== id));
            if (currentAgent?.id === id) setViewMode('list');
        } catch (e) {
            alert('刪除失敗');
        }
    };

    const toggleMountSkill = (skillId) => {
        const prevMounted = currentAgent.mountedSkills || [];
        const newMounted = prevMounted.includes(skillId)
            ? prevMounted.filter(id => id !== skillId)
            : [...prevMounted, skillId];
        setCurrentAgent({ ...currentAgent, mountedSkills: newMounted });
    };

    const handleAddByShareCode = async () => {
        if (!shareCodeInput.trim()) return;
        try {
            const q = query(collection(db, 'skills'), where('shareCode', '==', shareCodeInput.trim().toUpperCase()));
            const snap = await getDocs(q);
            if (snap.empty) {
                alert('查無此分享代碼！');
                return;
            }
            const skillDoc = snap.docs[0];
            const skillId = skillDoc.id;

            const prevMounted = currentAgent.mountedSkills || [];
            if (!prevMounted.includes(skillId)) {
                setCurrentAgent({ ...currentAgent, mountedSkills: [...prevMounted, skillId] });

                // 動態加入到 publicSkills 讓它能顯示在畫面上，如果原本畫面沒有的話
                if (!publicSkills.some(s => s.id === skillId) && !skills.some(s => s.id === skillId)) {
                    setPublicSkills([...publicSkills, { id: skillId, ...skillDoc.data() }]);
                }

                alert(`已成功掛載技能：${skillDoc.data().name}`);
            } else {
                alert('這個技能已經掛載囉！');
            }
            setShareCodeInput('');
        } catch (e) {
            alert('查詢失敗');
        }
    };

    const runDeploy = async () => {
        if (!currentAgent.cfAccountId || !currentAgent.cfApiToken) {
            return alert('請先填寫 Cloudflare Account ID 與 API Token');
        }
        if (!currentAgent.lineToken || !currentAgent.lineSecret) {
            return alert('請填寫 LINE Channel Access Token 與 Secret');
        }

        setIsDeploying(true);
        setDeployStatus('連線中...');

        try {
            // 預設讓本機測試也指向遠端 Cloud Functions
            const backendUrl = 'https://us-central1-lionbaker-vc.cloudfunctions.net/api/deploy';

            setDeployStatus('正在讀取掛載的技能...');
            let mergedScripts = [...(currentAgent.scripts || [])];
            const mountedSkills = currentAgent.mountedSkills || [];
            let skillScriptsCount = 0;

            if (mountedSkills.length > 0) {
                for (const sid of mountedSkills) {
                    const skillSnap = await getDoc(doc(db, 'skills', sid));
                    if (skillSnap.exists()) {
                        const sData = skillSnap.data();
                        if (sData.scripts && sData.scripts.length > 0) {
                            mergedScripts.push(...sData.scripts);
                            skillScriptsCount += sData.scripts.length;
                        }
                    }
                }
            }

            setDeployStatus(`已合併 ${mergedScripts.length} 組腳本 (私有: ${currentAgent.scripts?.length || 0}, 技能: ${skillScriptsCount})\n正在傳送至 Cloudflare Edge...`);
            const finalConfig = { ...currentAgent, scripts: mergedScripts };
            const res = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId: currentAgent.id, config: finalConfig })
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
    };

    // ========== Skills 邏輯 ==========
    const fetchSkills = async (userId) => {
        try {
            const q = query(collection(db, 'skills'), where('userId', '==', userId));
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => b.updatedAt?.seconds - a.updatedAt?.seconds);
            setSkills(data);
        } catch (e) {
            console.error('Fetch skills error', e);
        }
    };

    const fetchPublicSkills = async () => {
        try {
            const q = query(collection(db, 'skills'), where('isPublic', '==', true));
            const snap = await getDocs(q);
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPublicSkills(data);
        } catch (e) {
            console.error('Fetch public skills error', e);
        }
    };

    const handleCreateSkill = async () => {
        if (!userProfile) return;
        const newRef = doc(collection(db, 'skills'));
        const newDoc = {
            id: newRef.id,
            name: `新擴充技能 ${skills.length + 1}`,
            description: '描述你的擴充套件，這會幫助其他人了解。',
            userId: userProfile.userId,
            isPublic: false,
            shareCode: generateShareCode(),
            scripts: [{ ...PRESET_SCRIPTS[0], replyTexts: [PRESET_SCRIPTS[0].reply], replyImages: [], id: Date.now().toString() }],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        try {
            await setDoc(newRef, newDoc);
            setSkills([newDoc, ...skills]);
            setCurrentSkill(newDoc);
            setSkillViewMode('edit');
        } catch (e) {
            alert('新增技能失敗');
        }
    };

    const handleSaveSkill = async (skill) => {
        try {
            const skillRef = doc(db, 'skills', skill.id);
            const updateData = { ...skill, updatedAt: serverTimestamp() };
            await setDoc(skillRef, updateData, { merge: true });
            setSkills(skills.map(s => s.id === skill.id ? updateData : s));
            alert('技能儲存成功！');
        } catch (e) {
            alert('儲存失敗');
        }
    };

    const handleDeleteSkill = async (id) => {
        if (!window.confirm('確定要刪除這個擴充技能嗎？使用該代碼的使用者將失效')) return;
        try {
            await deleteDoc(doc(db, 'skills', id));
            setSkills(skills.filter(s => s.id !== id));
            if (currentSkill?.id === id) setSkillViewMode('list');
        } catch (e) {
            alert('刪除失敗');
        }
    };

    const handleImageUpload = async (index, file, isSkill = false) => {
        if (!file || !userProfile) return;
        setUploadingImageIndex(index);
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const fileRef = ref(storage, `agent_images/${userProfile.userId}/${fileName}`);
            await uploadBytes(fileRef, file);
            const url = await getDownloadURL(fileRef);

            const updateTarget = isSkill ? currentSkill : currentAgent;
            const newScripts = [...updateTarget.scripts];
            if (!newScripts[index].replyImages) newScripts[index].replyImages = [];

            // 向下兼容：如果有舊的 imageUrl 且尚未移入陣列，順便納入
            if (newScripts[index].imageUrl && newScripts[index].replyImages.length === 0) {
                newScripts[index].replyImages.push(newScripts[index].imageUrl);
                newScripts[index].imageUrl = null;
            }

            newScripts[index].replyImages.push(url);
            isSkill ? setCurrentSkill({ ...updateTarget, scripts: newScripts }) : setCurrentAgent({ ...updateTarget, scripts: newScripts });
        } catch (e) {
            console.error('上傳圖片失敗', e);
            alert('上傳圖片失敗，請確定您登入正常的開發者帳號。');
        } finally {
            setUploadingImageIndex(null);
        }
    };

    const handleRemoveImage = async (scriptIndex, imageIndex, isSkill = false) => {
        const updateTarget = isSkill ? currentSkill : currentAgent;
        const newScripts = [...updateTarget.scripts];
        const imageUrlToRemove = newScripts[scriptIndex].replyImages[imageIndex];

        // 1. 從畫面狀態中移除
        newScripts[scriptIndex].replyImages.splice(imageIndex, 1);
        isSkill ? setCurrentSkill({ ...updateTarget, scripts: newScripts }) : setCurrentAgent({ ...updateTarget, scripts: newScripts });

        // 2. 限自己上傳的圖片才刪除 Storage 實體 (以網址是否包含自身 userId 判斷)
        if (userProfile && imageUrlToRemove.includes(userProfile.userId)) {
            try {
                await deleteObject(ref(storage, imageUrlToRemove));
            } catch (error) {
                console.warn('檔案在雲端已不存在或無權刪除', error);
            }
        } else {
            console.log('此圖片非本人上傳，僅從陣列移除而不從原始雲端刪除');
        }
    };

    return (
        <div className="w-full flex flex-col items-center">

            {/* 導航切換 */}
            {(viewMode === 'list' && skillViewMode === 'list') && (
                <div className="flex bg-slate-200/60 p-1.5 rounded-2xl w-fit mx-auto mb-8 relative z-10 w-[90%] md:w-auto overflow-x-auto whitespace-nowrap shadow-sm">
                    <button
                        onClick={() => setMainView('agents')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainView === 'agents' ? 'bg-white text-emerald-600 shadow-md transform scale-100' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        🤖 機器人管理
                    </button>
                    <button
                        onClick={() => setMainView('skills')}
                        className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mainView === 'skills' ? 'bg-white text-emerald-600 shadow-md transform scale-100' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        🧩 技能市集＆工作坊
                    </button>
                </div>
            )}

            {/* ================== Agents 視圖 ================== */}
            {mainView === 'agents' && (
                <div className="w-full max-w-4xl mx-auto">
                    {viewMode === 'list' && (
                        <div className="w-full">
                            <button
                                onClick={handleCreateAgent}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-6 rounded-2xl shadow-lg border-b-4 border-emerald-700 transition-all mb-8 text-xl"
                            >
                                ＋ 建立新的 LINE 機器人
                            </button>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {agents.map(ag => (
                                    <div key={ag.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 hover:shadow-md transition">
                                        <h3 className="font-bold text-xl text-slate-700">{ag.name}</h3>
                                        <p className="text-sm text-slate-500">
                                            專屬腳本: {ag.scripts?.length || 0} 組 |
                                            掛載技能: {ag.mountedSkills?.length || 0} 個
                                        </p>
                                        <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                                            <button
                                                onClick={() => {
                                                    setCurrentAgent(ag);
                                                    setViewMode('edit');
                                                    if (!ag.lineToken || !ag.cfAccountId) {
                                                        setEditTab('settings');
                                                    } else {
                                                        setEditTab('skills');
                                                    }
                                                }}
                                                className="flex-1 bg-slate-100 text-emerald-600 font-bold py-2 rounded-xl hover:bg-emerald-50 transition"
                                            >進入管理</button>
                                            <button
                                                onClick={() => handleDeleteAgent(ag.id)}
                                                className="px-4 bg-red-50 text-red-500 font-bold py-2 rounded-xl border border-red-100 hover:bg-red-100 transition"
                                            >刪除</button>
                                        </div>
                                    </div>
                                ))}
                                {agents.length === 0 && (
                                    <div className="col-span-full py-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        尚未建立任何機器人
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {viewMode === 'edit' && currentAgent && (
                        <div className="flex flex-col gap-6">
                            <div className="flex gap-4">
                                <button onClick={() => setViewMode('list')} className="text-slate-500 font-bold text-sm bg-white border border-slate-200 px-6 py-3 rounded-xl hover:bg-slate-100 shadow-sm flex items-center gap-2">
                                    ← 返回機器人列表
                                </button>
                            </div>

                            <div className="flex bg-slate-200/60 p-1.5 rounded-2xl w-fit overflow-x-auto whitespace-nowrap">
                                <button
                                    onClick={() => setEditTab('settings')}
                                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${editTab === 'settings' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >⚙️ 基本設定</button>
                                <button
                                    onClick={() => setEditTab('skills')}
                                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${editTab === 'skills' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >🧩 擴充技能(Skill)</button>
                                <button
                                    onClick={() => setEditTab('scripts')}
                                    className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${editTab === 'scripts' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >💬 私有腳本</button>
                            </div>

                            {editTab === 'settings' && (
                                <div className="flex flex-col gap-6">
                                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
                                        <h2 className="text-xl font-bold mb-6 text-emerald-600 border-b pb-4 flex items-center gap-2">🛠️ 機器人資料</h2>
                                        <div className="flex flex-col gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-600 mb-2">機器人名稱</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none"
                                                    value={currentAgent.name}
                                                    onChange={e => setCurrentAgent({ ...currentAgent, name: e.target.value })}
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-600 mb-2">LINE Channel Access Token</label>
                                                    <input
                                                        type="password"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none"
                                                        value={currentAgent.lineToken}
                                                        onChange={e => setCurrentAgent({ ...currentAgent, lineToken: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-600 mb-2">LINE Channel Secret</label>
                                                    <input
                                                        type="password"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 outline-none"
                                                        value={currentAgent.lineSecret}
                                                        onChange={e => setCurrentAgent({ ...currentAgent, lineSecret: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100 border-l-4 border-l-blue-400">
                                        <h2 className="text-xl font-bold mb-6 text-blue-500 border-b pb-4 flex items-center gap-2">☁️ Cloudflare 端點設定</h2>

                                        {/* 步驟小卡 */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                                                <span className="inline-block bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded mb-2">步驟 1</span>
                                                <h4 className="font-bold text-blue-900 mb-1">註冊帳號與啟用子網域</h4>
                                                <p className="text-xs text-blue-700">若無帳號請先至 <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-blue-900 transition-colors">Cloudflare 註冊</a>。首次使用請務必進入「Workers & Pages」設定您的專屬 workers.dev 網域。</p>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                                                <span className="inline-block bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded mb-2">步驟 2</span>
                                                <h4 className="font-bold text-blue-900 mb-1">取得 Token（無需手動建 Worker）</h4>
                                                <p className="text-xs text-blue-700">前往「我的個人檔案 &gt; API令牌」，使用範本建立一把具備「編輯 Cloudflare Workers」權限的 Token 即可。</p>
                                            </div>
                                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl">
                                                <span className="inline-block bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded mb-2">步驟 3</span>
                                                <h4 className="font-bold text-blue-900 mb-1">一鍵部署</h4>
                                                <p className="text-xs text-blue-700">我們系統會自動幫您建立 Worker 並寫入程式碼！只需將 Account ID 與 Token 填入下方即可。</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-600 mb-2">Account ID (帳戶ID)</label>
                                                <input
                                                    type="text"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                                                    value={currentAgent.cfAccountId}
                                                    placeholder="例如: 3b94..."
                                                    onChange={e => setCurrentAgent({ ...currentAgent, cfAccountId: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-600 mb-2">API Token</label>
                                                <input
                                                    type="password"
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                                                    value={currentAgent.cfApiToken}
                                                    onChange={e => setCurrentAgent({ ...currentAgent, cfApiToken: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {editTab === 'skills' && (
                                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col gap-6">
                                    <h2 className="text-xl font-bold text-emerald-600 border-b pb-4 flex items-center gap-2">🧩 掛載擴充技能 (Skill)</h2>

                                    <div className="bg-slate-50/80 p-5 border border-slate-200 rounded-2xl flex flex-col md:flex-row items-center gap-4 shadow-sm">
                                        <div className="flex-1 w-full">
                                            <input
                                                type="text"
                                                placeholder="輸入 6 碼私有技能分享代碼..."
                                                className="w-full p-4 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-emerald-400 font-mono uppercase tracking-widest text-lg"
                                                value={shareCodeInput}
                                                onChange={e => setShareCodeInput(e.target.value)}
                                            />
                                        </div>
                                        <button onClick={handleAddByShareCode} className="w-full md:w-auto bg-emerald-500 text-white px-8 py-4 rounded-xl font-bold text-lg shadow hover:bg-emerald-600 hover:shadow-lg transition">
                                            解鎖代碼
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        {Array.from(new Map([...skills, ...publicSkills].map(s => [s.id, s])).values()).map(sk => {
                                            const mounted = (currentAgent.mountedSkills || []).includes(sk.id);
                                            return (
                                                <div key={sk.id} className={`p-5 border-2 rounded-2xl transition duration-300 relative overflow-hidden ${mounted ? 'border-emerald-500 bg-emerald-50 shadow-md' : 'border-slate-100 bg-white hover:border-slate-300'}`}>
                                                    {mounted && <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">已掛載</div>}
                                                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                        <span>{sk.name}</span>
                                                        {sk.isPublic ? <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full whitespace-nowrap">公開市集</span> : <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full whitespace-nowrap">私有授權</span>}
                                                    </h3>
                                                    <p className="text-sm mt-2 text-slate-500 line-clamp-2 h-10">{sk.description}</p>
                                                    <div className="mt-5 flex justify-between items-center border-t border-slate-200/50 pt-4">
                                                        <span className="text-xs font-medium text-slate-400">內含腳本數: <span className="text-slate-700 font-bold">{sk.scripts?.length || 0}</span></span>
                                                        <button
                                                            onClick={() => toggleMountSkill(sk.id)}
                                                            className={`px-5 py-2 font-bold text-sm rounded-xl transition ${mounted ? 'bg-red-50 text-red-500 hover:bg-red-100 border border-red-100' : 'bg-slate-100 text-emerald-600 hover:bg-emerald-100 border border-transparent'}`}
                                                        >
                                                            {mounted ? '移除' : '＋掛載'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {Array.from(new Map([...skills, ...publicSkills].map(s => [s.id, s])).values()).length === 0 && (
                                            <div className="col-span-full py-10 text-center text-slate-400">目前沒有公開的技能，也沒有專屬技能，可以前往「技能市集工作坊」建立！</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {editTab === 'scripts' && (
                                <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
                                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                                        <div>
                                            <h2 className="text-xl font-bold text-emerald-600 flex items-center gap-2">💬 私有腳本 (不公開)</h2>
                                            <p className="text-sm text-slate-500 mt-1">只針對這台機器人專屬設定的關鍵字與回覆，優先級等同於擴充技能。</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newScript = { id: Date.now().toString(), title: '新腳本', trigger: '', replyTexts: [''], replyImages: [] };
                                                setCurrentAgent(prev => ({ ...prev, scripts: [...prev.scripts, newScript] }));
                                            }}
                                            className="bg-emerald-100 text-emerald-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-emerald-200"
                                        >
                                            + 新增專屬腳本
                                        </button>
                                    </div>

                                    <div className="flex flex-col gap-4">
                                        {currentAgent.scripts?.map((script, index) => (
                                            <div key={script.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 relative group">
                                                <button
                                                    onClick={() => {
                                                        const newScripts = currentAgent.scripts.filter(s => s.id !== script.id);
                                                        setCurrentAgent(prev => ({ ...prev, scripts: newScripts }));
                                                    }}
                                                    className="absolute right-4 top-4 text-slate-400 hover:text-red-500 bg-white shadow-sm rounded-full w-8 h-8 flex items-center justify-center border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                >✕</button>

                                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                                    <div className="md:col-span-4 flex flex-col gap-2">
                                                        <input
                                                            type="text" placeholder="標題" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-1 outline-none"
                                                            value={script.title}
                                                            onChange={e => {
                                                                const newS = [...currentAgent.scripts]; newS[index].title = e.target.value; setCurrentAgent({ ...currentAgent, scripts: newS });
                                                            }}
                                                        />
                                                        <textarea
                                                            placeholder="關鍵字 (逗號分隔)&#10;只要句子中包含任何一個關鍵字就會觸發" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-1 outline-none font-bold text-emerald-700 mt-1 h-20 resize-none"
                                                            value={script.trigger}
                                                            onChange={e => {
                                                                const newS = [...currentAgent.scripts]; newS[index].trigger = e.target.value; setCurrentAgent({ ...currentAgent, scripts: newS });
                                                            }}
                                                        />
                                                        <div className="text-xs text-slate-400 font-bold mt-1">💡 可輸入多組關鍵字，用半形逗號分隔，符合其中一個即會觸發</div>
                                                    </div>
                                                    <div className="md:col-span-8 flex flex-col gap-3 md:border-l md:border-slate-200 md:pl-4">
                                                        <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg">
                                                            <span className="text-sm font-bold text-slate-600 px-1">💬 回覆文字區塊</span>
                                                            <button onClick={() => {
                                                                const newS = [...currentAgent.scripts];
                                                                if (!newS[index].replyTexts) newS[index].replyTexts = [newS[index].reply || ''];
                                                                newS[index].replyTexts.push('');
                                                                setCurrentAgent({ ...currentAgent, scripts: newS });
                                                            }} className="text-xs text-emerald-600 bg-white px-3 py-1.5 shadow-sm rounded-md font-bold hover:text-emerald-700">+ 新增一行</button>
                                                        </div>

                                                        {(script.replyTexts || [script.reply || '']).map((text, tIndex) => (
                                                            <div key={tIndex} className="flex gap-2 relative group/text">
                                                                <textarea
                                                                    placeholder="輸入當此關鍵字觸發時機器人要回覆的訊息" className="flex-1 w-full bg-white border border-slate-300 rounded-lg p-2 text-sm h-16 resize-none focus:ring-1 focus:ring-emerald-400 outline-none"
                                                                    value={text}
                                                                    onChange={e => {
                                                                        const newS = [...currentAgent.scripts];
                                                                        if (!newS[index].replyTexts) newS[index].replyTexts = [newS[index].reply || ''];
                                                                        newS[index].replyTexts[tIndex] = e.target.value;
                                                                        setCurrentAgent({ ...currentAgent, scripts: newS });
                                                                    }}
                                                                />
                                                                {(script.replyTexts || []).length > 1 && (
                                                                    <button onClick={() => {
                                                                        const newS = [...currentAgent.scripts];
                                                                        newS[index].replyTexts.splice(tIndex, 1);
                                                                        setCurrentAgent({ ...currentAgent, scripts: newS });
                                                                    }} className="absolute right-2 top-2 text-slate-400 hover:text-red-500 bg-white shadow-sm rounded-full w-6 h-6 flex items-center justify-center border border-slate-200 opacity-0 group-hover/text:opacity-100 transition-opacity">✕</button>
                                                                )}
                                                            </div>
                                                        ))}

                                                        <div className="flex items-center gap-3 mt-1 pt-3 border-t border-slate-200/50">
                                                            <div className="text-sm font-bold text-slate-600 shrink-0">🖼️ 回覆圖片</div>
                                                            <div className="flex-1 flex gap-2 overflow-x-auto items-center pb-2">
                                                                {(() => {
                                                                    const images = script.replyImages || (script.imageUrl ? [script.imageUrl] : []);
                                                                    return images.map((imgUrl, iIndex) => (
                                                                        <div key={iIndex} className="relative group/img shrink-0 mt-2">
                                                                            <img src={imgUrl} className="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-sm" alt="預覽" />
                                                                            <button onClick={() => handleRemoveImage(index, iIndex, false)} className="absolute -top-2 -right-2 bg-red-500 text-white shadow-md border border-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover/img:opacity-100 transition-opacity">✕</button>
                                                                        </div>
                                                                    ));
                                                                })()}
                                                                <label className="bg-white mt-2 text-slate-500 text-xs px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer whitespace-nowrap hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition font-bold shadow-sm">
                                                                    {uploadingImageIndex === index ? '🚀 上傳中...' : '＋ 加入圖片'}
                                                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(index, e.target.files[0], false)} disabled={uploadingImageIndex === index} />
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {(() => {
                                                            const totalItems = (script.replyTexts?.length || 1) + (script.replyImages?.length || (script.imageUrl ? 1 : 0));
                                                            if (totalItems > 5) {
                                                                return (
                                                                    <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-xl font-bold flex items-center gap-2 mt-2">
                                                                        <span>⚠️ 注意：目前設定了 {totalItems} 項回覆內容，已超過 LINE 單次傳送 5 個訊息的限制。前 5 項以外的訊息將不會被發出。</span>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 控制與部署區域 */}
                            <div className="mt-4 flex flex-col md:flex-row gap-4 mb-10">
                                <button onClick={() => handleSaveAgent(currentAgent)} className="w-full md:w-1/3 text-white font-bold text-lg bg-emerald-600 px-6 py-5 rounded-3xl hover:bg-emerald-700 shadow-md transition-all">
                                    💾 儲存設定
                                </button>
                                <button
                                    onClick={runDeploy}
                                    disabled={isDeploying}
                                    className={`w-full md:w-2/3 py-5 px-8 rounded-3xl font-bold text-xl shadow-lg transition-all ${isDeploying ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-teal-500 to-blue-500 text-white hover:shadow-xl hover:-translate-y-1'}`}
                                >
                                    {isDeploying ? '發射部署中...' : '🚀 將全部組合並一鍵部署 Edge'}
                                </button>
                            </div>

                            {deployStatus && (
                                <div className="p-4 bg-slate-800 text-green-400 rounded-2xl text-left font-mono text-sm whitespace-pre-wrap shadow-inner -mt-6">
                                    {deployStatus}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ================== Skills 視圖 ================== */}
            {mainView === 'skills' && (
                <div className="w-full max-w-4xl mx-auto">
                    {skillViewMode === 'list' && (
                        <div className="w-full">
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl p-8 mb-8 text-white shadow-xl">
                                <h1 className="text-3xl font-bold mb-2">🧩 技能工作坊</h1>
                                <p className="text-blue-100">建立功能強大且可共用的關鍵字技能，分享給其他機器人掛載使用。</p>
                                <button
                                    onClick={handleCreateSkill}
                                    className="mt-6 bg-white text-indigo-600 font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition shadow"
                                >
                                    ＋ 建立新擴充技能
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {skills.map(sk => (
                                    <div key={sk.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-bold text-xl text-slate-700">{sk.name}</h3>
                                            {sk.isPublic ? <span className="bg-emerald-100 text-emerald-600 text-xs px-2 py-1 rounded font-bold">公開</span> : <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-bold">私有</span>}
                                        </div>
                                        <p className="text-sm text-slate-500">{sk.description}</p>
                                        <p className="text-xs bg-slate-50 p-2 rounded text-slate-600 font-mono">傳送代碼: <span className="font-bold uppercase select-all">{sk.shareCode}</span></p>
                                        <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                                            <button
                                                onClick={() => {
                                                    setCurrentSkill(sk);
                                                    setSkillViewMode('edit');
                                                }}
                                                className="flex-1 bg-slate-100 text-indigo-600 font-bold py-2 rounded-xl hover:bg-indigo-50 transition"
                                            >進入編輯</button>
                                            <button
                                                onClick={() => handleDeleteSkill(sk.id)}
                                                className="px-4 bg-red-50 text-red-500 font-bold py-2 rounded-xl border border-red-100 hover:bg-red-100 transition"
                                            >刪除</button>
                                        </div>
                                    </div>
                                ))}
                                {skills.length === 0 && (
                                    <div className="col-span-full py-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        尚未開發任何技能套件
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {skillViewMode === 'edit' && currentSkill && (
                        <div className="flex flex-col gap-6">
                            <div className="flex gap-4">
                                <button onClick={() => setSkillViewMode('list')} className="text-slate-500 font-bold text-sm bg-white border border-slate-200 px-6 py-3 rounded-xl hover:bg-slate-100 shadow-sm flex items-center gap-2">
                                    ← 返回工作坊
                                </button>
                            </div>

                            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
                                <div className="flex justify-between border-b pb-4 mb-6">
                                    <h2 className="text-xl font-bold text-indigo-600 flex items-center gap-2">📦 技能外掛資訊設定</h2>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-slate-600">公開至市集？</span>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={currentSkill.isPublic} onChange={e => setCurrentSkill({ ...currentSkill, isPublic: e.target.checked })} />
                                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                        </label>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-600 mb-2">技能名稱</label>
                                        <input
                                            type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                                            value={currentSkill.name} onChange={e => setCurrentSkill({ ...currentSkill, name: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-600 mb-2">描述 (介紹用途)</label>
                                        <textarea
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none h-20"
                                            value={currentSkill.description} onChange={e => setCurrentSkill({ ...currentSkill, description: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-600 mb-2 flex justify-between">
                                            <span>分享代碼 (Share Code)</span>
                                            <button onClick={() => setCurrentSkill({ ...currentSkill, shareCode: generateShareCode() })} className="text-indigo-500 text-xs">重新產生</button>
                                        </label>
                                        <input
                                            type="text" className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 font-mono font-bold text-emerald-600 outline-none select-all"
                                            value={currentSkill.shareCode} readOnly
                                        />
                                        <p className="text-xs text-slate-400 mt-2">若是私有技能，別人可以透過輸入此代碼將其掛載至他的機器人中。</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-lg border border-slate-100">
                                <div className="flex justify-between items-center mb-6 border-b pb-4">
                                    <h2 className="text-xl font-bold text-indigo-600 flex items-center gap-2">💬 包含的腳本規則</h2>
                                    <button
                                        onClick={() => {
                                            const newScript = { id: Date.now().toString(), title: '新腳本', trigger: '', replyTexts: [''], replyImages: [] };
                                            setCurrentSkill(prev => ({ ...prev, scripts: [...prev.scripts, newScript] }));
                                        }}
                                        className="bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-indigo-200"
                                    >+ 新增腳本</button>
                                </div>
                                <div className="flex flex-col gap-4">
                                    {currentSkill.scripts?.map((script, index) => (
                                        <div key={script.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 relative group">
                                            <button
                                                onClick={() => {
                                                    const newScripts = currentSkill.scripts.filter(s => s.id !== script.id);
                                                    setCurrentSkill(prev => ({ ...prev, scripts: newScripts }));
                                                }}
                                                className="absolute right-4 top-4 text-slate-400 hover:text-red-500 bg-white shadow-sm rounded-full w-8 h-8 flex items-center justify-center border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            >✕</button>

                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                                <div className="md:col-span-4 flex flex-col gap-2">
                                                    <input
                                                        type="text" placeholder="標題" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-400 outline-none"
                                                        value={script.title} onChange={e => {
                                                            const newS = [...currentSkill.scripts]; newS[index].title = e.target.value; setCurrentSkill({ ...currentSkill, scripts: newS });
                                                        }}
                                                    />
                                                    <textarea
                                                        placeholder="關鍵字 (逗號分隔)&#10;只要句子中包含任何一個關鍵字就會觸發" className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-1 focus:ring-indigo-400 outline-none font-bold text-indigo-700 mt-1 h-20 resize-none"
                                                        value={script.trigger} onChange={e => {
                                                            const newS = [...currentSkill.scripts]; newS[index].trigger = e.target.value; setCurrentSkill({ ...currentSkill, scripts: newS });
                                                        }}
                                                    />
                                                    <div className="text-xs text-slate-400 font-bold mt-1">💡 可輸入多組關鍵字，用半形逗號分隔，符合其一即觸發</div>
                                                </div>
                                                <div className="md:col-span-8 flex flex-col gap-3 md:border-l md:border-slate-200 md:pl-4">
                                                    <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg">
                                                        <span className="text-sm font-bold text-slate-600 px-1">💬 回覆文字區塊</span>
                                                        <button onClick={() => {
                                                            const newS = [...currentSkill.scripts];
                                                            if (!newS[index].replyTexts) newS[index].replyTexts = [newS[index].reply || ''];
                                                            newS[index].replyTexts.push('');
                                                            setCurrentSkill({ ...currentSkill, scripts: newS });
                                                        }} className="text-xs text-indigo-600 bg-white px-3 py-1.5 shadow-sm rounded-md font-bold hover:text-indigo-700">+ 新增一行</button>
                                                    </div>

                                                    {(script.replyTexts || [script.reply || '']).map((text, tIndex) => (
                                                        <div key={tIndex} className="flex gap-2 relative group/text">
                                                            <textarea
                                                                placeholder="輸入當此關鍵字觸發時回覆的訊息" className="flex-1 w-full bg-white border border-slate-300 rounded-lg p-2 text-sm h-16 resize-none focus:ring-1 focus:ring-indigo-400 outline-none"
                                                                value={text} onChange={e => {
                                                                    const newS = [...currentSkill.scripts];
                                                                    if (!newS[index].replyTexts) newS[index].replyTexts = [newS[index].reply || ''];
                                                                    newS[index].replyTexts[tIndex] = e.target.value;
                                                                    setCurrentSkill({ ...currentSkill, scripts: newS });
                                                                }}
                                                            />
                                                            {(script.replyTexts || []).length > 1 && (
                                                                <button onClick={() => {
                                                                    const newS = [...currentSkill.scripts];
                                                                    newS[index].replyTexts.splice(tIndex, 1);
                                                                    setCurrentSkill({ ...currentSkill, scripts: newS });
                                                                }} className="absolute right-2 top-2 text-slate-400 hover:text-red-500 bg-white shadow-sm rounded-full w-6 h-6 flex items-center justify-center border border-slate-200 opacity-0 group-hover/text:opacity-100 transition-opacity">✕</button>
                                                            )}
                                                        </div>
                                                    ))}

                                                    <div className="flex items-center gap-3 mt-1 pt-3 border-t border-slate-200/50">
                                                        <div className="text-sm font-bold text-slate-600 shrink-0">🖼️ 回覆圖片</div>
                                                        <div className="flex-1 flex gap-2 overflow-x-auto items-center pb-2">
                                                            {(() => {
                                                                const images = script.replyImages || (script.imageUrl ? [script.imageUrl] : []);
                                                                return images.map((imgUrl, iIndex) => (
                                                                    <div key={iIndex} className="relative group/img shrink-0 mt-2">
                                                                        <img src={imgUrl} className="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-sm" alt="預覽" />
                                                                        <button onClick={() => handleRemoveImage(index, iIndex, true)} className="absolute -top-2 -right-2 bg-red-500 text-white shadow-md border border-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover/img:opacity-100 transition-opacity">✕</button>
                                                                    </div>
                                                                ));
                                                            })()}
                                                            <label className="bg-white mt-2 text-slate-500 text-xs px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer whitespace-nowrap hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition font-bold shadow-sm">
                                                                {uploadingImageIndex === index ? '🚀 上傳中...' : '＋ 加入圖片'}
                                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(index, e.target.files[0], true)} disabled={uploadingImageIndex === index} />
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const totalItems = (script.replyTexts?.length || 1) + (script.replyImages?.length || (script.imageUrl ? 1 : 0));
                                                        if (totalItems > 5) {
                                                            return (
                                                                <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-xl font-bold flex items-center gap-2 mt-2">
                                                                    <span>⚠️ 注意：目前設定了 {totalItems} 項回覆內容，已超過 LINE 單次傳送 5 個訊息的限制。前 5 項以外的訊息將不會被發出。</span>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {currentSkill.scripts?.length === 0 && <div className="text-center py-8 text-slate-400">目前技能內容為空。</div>}
                                </div>
                            </div>

                            <div className="mt-4 pb-12">
                                <button onClick={() => handleSaveSkill(currentSkill)} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xl px-12 py-5 rounded-3xl shadow-lg transition transform hover:-translate-y-1 mx-auto block">
                                    💾 儲存技能配置
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AgentAdmin;
