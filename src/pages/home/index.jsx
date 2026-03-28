/**
 * Home - 系統首頁（原 VibeAdmin）
 * AI落地師武器庫 V1 主要入口，包含專案列表、建立、編輯
 */
import React, { lazy, Suspense, useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { PREMIUM_COLORS } from './constants';
import { TermsModal, SetupAliasScreen, ActivationScreen, BannedScreen } from './components/gatekeepers';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectList from './components/ProjectList';
import { useLiffVipGate } from '../../hooks/useLiffVipGate';

const ProjectEditor = lazy(() => import('./components/ProjectEditor'));
const FormResponseViewer = lazy(() => import('./components/FormResponseViewer'));
const UserSettings = lazy(() => import('./components/UserSettings'));
const SuperAdmin = lazy(() => import('../super-admin'));

const Home = () => {
    const {
        userProfile,
        setUserProfile,
        initError,
        needsTerms,
        needsAlias,
        needsActivation,
        isBanned,
        isExpired,
        handleAgreeTerms,
        handleSetAlias,
        handleRedeemCode,
    } = useLiffVipGate();

    const [viewMode, setViewMode] = useState('list');
    const [projects, setProjects] = useState([]);
    const [currentProject, setCurrentProject] = useState(null);
    const [themeColor, setThemeColor] = useState('#00ffff');
    const [showSettings, setShowSettings] = useState(false);
    const [activeTab, setActiveTab] = useState('projects');
    const [showCreateModal, setShowCreateModal] = useState(false);

    const renderChunkFallback = (text = '載入中...') => (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
            <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">{text}</p>
        </div>
    );

    const fetchProjects = async (userId) => {
        try {
            const q = query(collection(db, 'projects'), where('userId', '==', userId));
            const querySnapshot = await getDocs(q);
            const docs = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => {
                const tA = a.updatedAt?.seconds || 0;
                const tB = b.updatedAt?.seconds || 0;
                return tB - tA;
            });
            setProjects(docs);
        } catch (err) {
            console.error('Fetch error:', err);
        }
    };

    useEffect(() => {
        if (!userProfile?.userId || needsTerms || needsAlias || needsActivation || isBanned) return;
        fetchProjects(userProfile.userId);
    }, [userProfile, needsTerms, needsAlias, needsActivation, isBanned]);

    useEffect(() => {
        if (!userProfile) return;
        const preloadHeavyViews = () => {
            import('./components/ProjectEditor');
            import('./components/FormResponseViewer');
            import('./components/UserSettings');
            if (userProfile.role === 'SuperAdmin') import('../super-admin');
        };

        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(preloadHeavyViews, { timeout: 1800 });
            return () => window.cancelIdleCallback(idleId);
        }

        const timeoutId = setTimeout(preloadHeavyViews, 1200);
        return () => clearTimeout(timeoutId);
    }, [userProfile]);

    const handleCreateProject = async ({ name, projectAlias, projectType }) => {
        if (!userProfile) return;
        const newDoc = {
            name,
            type: projectType,
            userId: userProfile.userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            mainColor: '高科技黑',
            style: '現代簡約，卡片式設計，帶有質感',
            htmlCode: '',
            projectAlias,
            useLiff: false,
            liffId: '',
        };
        try {
            const docRef = await addDoc(collection(db, 'projects'), newDoc);
            const projectData = { id: docRef.id, ...newDoc };
            setProjects((prev) => [projectData, ...prev]);
            setCurrentProject(projectData);
            setShowCreateModal(false);
            setViewMode('edit');
        } catch (e) {
            console.error('Create error', e);
            alert('建立專案失敗');
        }
    };

    const handleEditProject = (project) => {
        setCurrentProject(project);
        setViewMode('edit');
        const color = PREMIUM_COLORS.find((c) => c.value === project.mainColor)?.hex || '#00ffff';
        setThemeColor(color);
    };

    const handleViewFormResponses = (project) => {
        setCurrentProject(project);
        setViewMode('formResponses');
    };

    const handleDeleteProject = async (id) => {
        try {
            await deleteDoc(doc(db, 'projects', id));
            const listRef = ref(storage, `project_assets/${id}`);
            const res = await listAll(listRef);
            await Promise.all(res.items.map((item) => deleteObject(item)));
            setProjects((prev) => prev.filter((p) => p.id !== id));
            alert('專案與關聯圖片已刪除');
        } catch (e) {
            console.error('Delete error', e);
            alert('刪除失敗');
        }
    };

    if (isBanned) return <BannedScreen />;
    if (needsTerms) return <TermsModal onAgree={handleAgreeTerms} />;
    if (needsAlias) return <SetupAliasScreen onSave={handleSetAlias} />;
    if (needsActivation) return <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="activate" />;
    if (isExpired && viewMode !== 'list') return <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="expire" />;

    return (
        <div className="min-h-screen font-sans flex flex-col items-center px-2 py-3 transition-all duration-700 ease-in-out text-slate-700">
            {viewMode !== 'formResponses' && (
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-6 mt-4">
                    <h1 className="text-3xl font-bold text-emerald-500 drop-shadow-sm">AI落地師武器庫 V2</h1>
                </div>
            )}

            {!userProfile ? (
                initError ? (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
                        <div className="text-5xl">😢</div>
                        <div className="text-slate-600 font-medium text-base max-w-xs">{initError}</div>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg transition"
                        >
                            🔄 重新整理
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                        <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-400 text-sm">正在驗證身份，請稍候...</p>
                    </div>
                )
            ) : viewMode === 'list' ? (
                <>
                    <div className="w-full max-w-5xl flex justify-between mb-4 px-2 items-center">
                        <div className="flex gap-2 items-center flex-wrap">
                            {userProfile.isSvip ? (
                                <span className="text-yellow-400 font-bold border border-yellow-500/50 bg-yellow-500/10 px-2 py-1 rounded text-xs">♾️ SVIP</span>
                            ) : userProfile.expiryDate ? (
                                <span
                                    className={`font-bold border px-2 py-1 rounded text-xs ${
                                        isExpired ? 'text-red-400 border-red-500 bg-red-500/10' : 'text-green-400 border-green-500 bg-green-500/10'
                                    }`}
                                >
                                    {isExpired ? '已過期 ' : 'VIP '}(到期日:{' '}
                                    {new Date(
                                        userProfile.expiryDate?.seconds ? userProfile.expiryDate.seconds * 1000 : userProfile.expiryDate
                                    ).toISOString().split('T')[0]}
                                    )
                                </span>
                            ) : null}
                            <button
                                onClick={() => setViewMode('expire_renew')}
                                className="ml-2 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/50 px-3 py-1 rounded text-xs transition-all shadow-md"
                            >
                                + 輸入金鑰
                            </button>
                        </div>
                    </div>
                    {userProfile?.role === 'SuperAdmin' && (
                        <div className="w-full max-w-5xl mb-8 px-2">
                            <div className="grid grid-cols-2 items-center gap-2 bg-white/50 backdrop-blur-sm p-2 rounded-2xl border border-slate-200/60 shadow-sm">
                                <button
                                    onClick={() => setActiveTab('projects')}
                                    className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                                        activeTab === 'projects' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                                    }`}
                                >
                                    <span className="text-base shrink-0" aria-hidden>📁</span>
                                    <span className="truncate">專案列表</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('admin')}
                                    className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                                        activeTab === 'admin' ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                                    }`}
                                >
                                    <span className="text-base shrink-0" aria-hidden>🛡️</span>
                                    <span className="truncate">後台</span>
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab !== 'admin' ? (
                        <>
                            {isExpired && (
                                <div className="w-full max-w-5xl mb-4 p-3 bg-red-900/10 border border-red-200/50 rounded-xl text-red-500 text-sm flex justify-between items-center backdrop-blur-sm">
                                    <span>⚠️ 您的服務已到期，目前為唯讀模式。</span>
                                    <button
                                        onClick={() => setViewMode('expire_renew')}
                                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md shadow-red-500/20"
                                    >
                                        立即續約
                                    </button>
                                </div>
                            )}
                            <ProjectList
                                projects={projects}
                                onCreate={() => {
                                    if (isExpired) {
                                        alert('服務已到期，請先輸入序號續約。');
                                        setViewMode('expire_renew');
                                    } else {
                                        setShowCreateModal(true);
                                    }
                                }}
                                onEdit={(p) => {
                                    if (isExpired) alert('服務已到期，僅供瀏覽。');
                                    else handleEditProject(p);
                                }}
                                onDelete={handleDeleteProject}
                                onViewFormResponses={(p) => {
                                    setCurrentProject(p);
                                    setViewMode('formResponses');
                                }}
                                userProfile={userProfile}
                            />
                        </>
                    ) : (
                        <div className="w-full">
                            <Suspense fallback={renderChunkFallback('正在載入後台...')}>
                                <SuperAdmin />
                            </Suspense>
                        </div>
                    )}
                    {showCreateModal && (
                        <CreateProjectModal
                            userProfile={userProfile}
                            defaultName={`專案名稱 ${projects.length + 1}`}
                            onClose={() => setShowCreateModal(false)}
                            onCreate={handleCreateProject}
                        />
                    )}
                </>
            ) : viewMode === 'expire_renew' ? (
                <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="expire" />
            ) : viewMode === 'formResponses' && currentProject ? (
                <Suspense fallback={renderChunkFallback('正在載入表單回覆...')}>
                    <FormResponseViewer
                        projectId={currentProject.id}
                        projectName={currentProject.name}
                        formRequirements={currentProject.requirements || ''}
                        onBack={() => setViewMode('list')}
                    />
                </Suspense>
            ) : (
                <Suspense fallback={renderChunkFallback('正在載入編輯器...')}>
                    <ProjectEditor
                        project={currentProject}
                        onSave={() => {
                            setViewMode('list');
                            fetchProjects(userProfile.userId);
                        }}
                        onBack={() => setViewMode('list')}
                        userProfile={userProfile}
                    />
                </Suspense>
            )}
            {showSettings && userProfile && (
                <Suspense fallback={renderChunkFallback('正在載入設定...')}>
                    <UserSettings user={userProfile} onClose={() => setShowSettings(false)} onUpdate={(updated) => setUserProfile(updated)} />
                </Suspense>
            )}
        </div>
    );
};

export default Home;
