import React, { useState, useEffect } from 'react';
import liff from '@line/liff';
import { db, signIn } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import UserManagement from './UserManagement';
import LicenseManagement from './LicenseManagement';

const LIFF_ID = '2008893070-nnNXBPod';
const DEV_SUPERADMIN_USER_ID = 'Ue17ac074742b4f21da6f6b41307a246a'; // localhost 開發用，需在 Firestore 設為 role: SuperAdmin

const SuperAdmin = () => {
    const [userProfile, setUserProfile] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [initError, setInitError] = useState(null);
    const [activeTab, setActiveTab] = useState('users'); // users | licenses

    const verifySuperAdmin = async (profile) => {
        if (!profile?.userId) return false;
        const userRef = doc(db, 'users', profile.userId);
        const userSnap = await getDoc(userRef);
        return userSnap.exists() && userSnap.data()?.role === 'SuperAdmin';
    };

    useEffect(() => {
        const init = async () => {
            try {
                await signIn();
            } catch (e) {
                console.error('Firebase 登入失敗', e);
            }

            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                const profile = {
                    userId: DEV_SUPERADMIN_USER_ID,
                    displayName: 'Local SuperAdmin',
                    pictureUrl: 'https://placehold.co/150',
                };
                const ok = await verifySuperAdmin(profile);
                setUserProfile(profile);
                setIsAdmin(ok);
                setAuthLoading(false);
                return;
            }

            try {
                await liff.init({ liffId: LIFF_ID });
                if (!liff.isLoggedIn()) {
                    liff.login();
                    return;
                }
                const profile = await liff.getProfile();
                const ok = await verifySuperAdmin(profile);
                setUserProfile({ userId: profile.userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl });
                setIsAdmin(ok);
            } catch (err) {
                console.error('LIFF / SuperAdmin init error', err);
                setInitError(err.message || '初始化失敗，請透過 LINE 開啟此頁面後重試。');
            } finally {
                setAuthLoading(false);
            }
        };
        init();
    }, []);

    const handleLogin = () => {
        liff.login();
    };

    if (authLoading) {
        return (
            <div className="p-10 text-center text-white flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
            </div>
        );
    }

    if (!userProfile) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans">
                <div className="bg-[#111] p-8 rounded-xl shadow-2xl text-center max-w-sm w-full border border-gray-800">
                    <h1 className="text-2xl font-bold text-red-500 mb-6">🛡️ Vibe SuperAdmin</h1>
                    <p className="text-gray-400 mb-8 text-sm">{initError || '此頁面僅限高級管理員登入，請透過 LINE 驗證身份。'}</p>
                    <button onClick={handleLogin} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded transition-colors flex items-center justify-center gap-2">
                        透過 LINE 登入
                    </button>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 font-sans">
                <div className="text-center text-red-500 font-bold mb-4 text-2xl">⛔ 權限不足 (Access Denied)</div>
                <div className="text-gray-400 mb-8 text-lg">此帳號 (userId: {userProfile.userId}) 無 SuperAdmin 權限，無法存取此頁面</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-gray-200 font-sans p-6">
            <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
                <div className="flex gap-4 items-center">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 rounded ${activeTab === 'users' ? 'bg-red-900 text-white' : 'bg-gray-800'}`}
                    >
                        使用者管理
                    </button>
                    <button
                        onClick={() => setActiveTab('licenses')}
                        className={`px-4 py-2 rounded ${activeTab === 'licenses' ? 'bg-red-900 text-white' : 'bg-gray-800'}`}
                    >
                        金鑰管理
                    </button>
                </div>
            </header>

            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'licenses' && <LicenseManagement userProfile={userProfile} />}
        </div>
    );
};

export default SuperAdmin;
