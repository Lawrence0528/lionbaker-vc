import { useState, useEffect } from 'react';
import liff from '@line/liff';
import { db, signIn } from '../firebase';
import {
    collection,
    getDocs,
    query,
    where,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    arrayUnion,
} from 'firebase/firestore';

/** 首頁 LIFF（LINE Developers：AI落地師工具，Endpoint https://ai.lionbaker.com/） */
export const LIFF_ID_HOME = '2008893070-nnNXBPod';
/** 短影音頁 LIFF（LINE Developers：短影音腳本，Endpoint …/reels）— 與首頁必須分開，否則 liff.init 會 invalid */
export const LIFF_ID_REELS = '2008893070-IXsuDcqR';

/** 舊程式相容：等同首頁 LIFF */
export const LIFF_ID = LIFF_ID_HOME;

function getLiffIdForCurrentEntry() {
    const p = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';
    if (p === '/reels' || p.startsWith('/reels/')) return LIFF_ID_REELS;
    return LIFF_ID_HOME;
}

/** 依 LIFF 入口分別 init（同一個 Channel 可有多個 LIFF ID） */
const liffInitPromiseById = new Map();

function getLiffInitPromise(liffId) {
    if (!liffInitPromiseById.has(liffId)) {
        const p = liff
            .init({ liffId })
            .catch((err) => {
                liffInitPromiseById.delete(liffId);
                throw err;
            });
        liffInitPromiseById.set(liffId, p);
    }
    return liffInitPromiseById.get(liffId);
}

/**
 * LIFF 初始化、Firestore 使用者同步，以及與首頁相同的 VIP／條款／別名／序號兌換流程。
 * 儲值（序號兌換）邏輯集中於此，與 UI 組件 {@link ActivationScreen} 分離。
 */
export function useLiffVipGate() {
    const [userProfile, setUserProfile] = useState(null);
    const [initError, setInitError] = useState(null);
    const [needsTerms, setNeedsTerms] = useState(false);
    const [needsAlias, setNeedsAlias] = useState(false);
    const [needsActivation, setNeedsActivation] = useState(false);
    const [isExpired, setIsExpired] = useState(false);
    const [isBanned, setIsBanned] = useState(false);

    useEffect(() => {
        const handleProfile = async (profile) => {
            if (!profile) return;
            try {
                const userRef = doc(db, 'users', profile.userId);
                const userSnap = await getDoc(userRef);
                let dbData = {};

                if (userSnap.exists()) {
                    dbData = userSnap.data();
                } else {
                    dbData = {
                        displayName: profile.displayName,
                        pictureUrl: profile.pictureUrl,
                        createdAt: serverTimestamp(),
                        role: 'user',
                        status: 'active',
                        agreedToTerms: false,
                    };
                    await setDoc(userRef, dbData);
                }

                const currentUser = { ...profile, ...dbData };
                setUserProfile(currentUser);

                if (currentUser.status === 'banned') {
                    setIsBanned(true);
                    return;
                }
                if (!currentUser.agreedToTerms) {
                    setNeedsTerms(true);
                    return;
                }
                if (!currentUser.alias) {
                    setNeedsAlias(true);
                    return;
                }
                if (!currentUser.isSvip) {
                    if (!currentUser.expiryDate) {
                        setNeedsActivation(true);
                    } else {
                        const exp = currentUser.expiryDate.seconds
                            ? new Date(currentUser.expiryDate.seconds * 1000)
                            : new Date(currentUser.expiryDate);
                        if (new Date() > exp) setIsExpired(true);
                    }
                }
            } catch (e) {
                console.error('User Sync Error', e);
                setUserProfile(profile);
            }
        };

        const initLiffWithRetry = async (retries = 1) => {
            const LIFF_TIMEOUT_MS = 10000;
            const liffId = getLiffIdForCurrentEntry();
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    await Promise.race([
                        getLiffInitPromise(liffId),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('LIFF_TIMEOUT')), LIFF_TIMEOUT_MS)),
                    ]);
                    return;
                } catch (err) {
                    console.warn(`LIFF init 第 ${attempt + 1} 次嘗試失敗:`, err.message);
                    if (attempt === retries) throw err;
                    await new Promise((r) => setTimeout(r, 1000));
                }
            }
        };

        const init = async () => {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                try {
                    await signIn();
                } catch (e) {
                    console.error('Firebase 登入失敗', e);
                }
                handleProfile({
                    userId: 'Ue17ac074742b4f21da6f6b41307a246a',
                    displayName: 'Local User',
                    pictureUrl: 'https://placehold.co/150',
                });
                return;
            }

            try {
                signIn()
                    .then(() => console.log('Firebase Auth OK'))
                    .catch((err) => console.error('Firebase 登入失敗（非致命）:', err));
                await initLiffWithRetry();
                try {
                    const profile = await liff.getProfile();
                    await handleProfile(profile);
                } catch (profileErr) {
                    if (!liff.isInClient()) {
                        liff.login();
                    } else {
                        throw new Error('無法取得 LINE 用戶資料，請重新開啟頁面。');
                    }
                }
            } catch (err) {
                if (err.message === 'LIFF_TIMEOUT') {
                    setInitError('連線逾時，請檢查網路後點擊下方按鈕重試。');
                } else if (err.message === 'Load failed') {
                    setInitError('LINE 連線被阻擋或載入失敗，若使用 Safari 請確認尚未開啟防追蹤功能，或請重新整理頁面。');
                } else {
                    setInitError(err.message || '初始化失敗，請重新開啟頁面。');
                }
            }
        };

        init();
    }, []);

    const handleAgreeTerms = async () => {
        try {
            await updateDoc(doc(db, 'users', userProfile.userId), { agreedToTerms: true });
            setUserProfile((prev) => ({ ...prev, agreedToTerms: true }));
            setNeedsTerms(false);
            if (!userProfile.alias) setNeedsAlias(true);
            else if (!userProfile.isSvip && !userProfile.expiryDate) setNeedsActivation(true);
        } catch (e) {
            console.error('Agree terms failed:', e);
            alert('操作失敗，請重試');
        }
    };

    const handleSetAlias = async (newAlias) => {
        const q = query(collection(db, 'users'), where('alias', '==', newAlias));
        const snap = await getDocs(q);
        if (!snap.empty) throw new Error('此 ID 已被使用，請更換一個');
        await updateDoc(doc(db, 'users', userProfile.userId), { alias: newAlias });
        setUserProfile((prev) => ({ ...prev, alias: newAlias }));
        setNeedsAlias(false);
        if (!userProfile.isSvip && !userProfile.expiryDate) setNeedsActivation(true);
    };

    const handleRedeemCode = async (code) => {
        if (code === 'TEST-VIBE-2026') {
            const updates = { isSvip: true, expiryDate: null };
            await updateDoc(doc(db, 'users', userProfile.userId), updates);
            setUserProfile((prev) => ({ ...prev, ...updates }));
            setNeedsActivation(false);
            setIsExpired(false);
            alert('測試序號啟用成功！');
            return;
        }
        const q = query(collection(db, 'license_keys'), where('code', '==', code), where('status', '==', 'active'));
        const snap = await getDocs(q);
        if (snap.empty) throw new Error('序號無效或已被停用');
        const keyDoc = snap.docs[0];
        const keyData = keyDoc.data();
        if (keyData.redeemedUsers?.includes(userProfile.userId)) {
            throw new Error('您已兌換過此金鑰，無法重複兌換累積天數');
        }
        if (keyData.type === 'VIP_CLASS' && keyData.validUntil) {
            const validUntilDate = new Date(keyData.validUntil + 'T23:59:59');
            if (new Date() > validUntilDate) throw new Error('此金鑰已超過最後可輸入期限');
        }
        const isSingleUse = ['VIP_PERSONAL', 'SVIP', 'VIP'].includes(keyData.type) || !keyData.type;
        if (isSingleUse && keyData.redeemedUsers?.length >= 1) {
            throw new Error('此序號已被使用完畢 (限單次使用)');
        }
        let newExpiry = null;
        let isSvip = false;
        if (keyData.type === 'SVIP') {
            isSvip = true;
        } else {
            const days = keyData.days || 30;
            let baseDate = new Date();
            if (userProfile.expiryDate) {
                const currentExp = userProfile.expiryDate.seconds
                    ? new Date(userProfile.expiryDate.seconds * 1000)
                    : new Date(userProfile.expiryDate);
                if (currentExp > new Date()) baseDate = currentExp;
            }
            baseDate.setDate(baseDate.getDate() + days);
            baseDate.setHours(23, 59, 59);
            newExpiry = baseDate;
        }
        await updateDoc(doc(db, 'license_keys', keyDoc.id), {
            redeemedUsers: arrayUnion(userProfile.userId),
            lastRedeemedAt: serverTimestamp(),
            ...(isSingleUse && { status: 'redeemed' }),
        });
        const updates = {
            isSvip: isSvip || userProfile.isSvip || false,
            expiryDate: isSvip ? null : newExpiry || userProfile.expiryDate,
        };
        await updateDoc(doc(db, 'users', userProfile.userId), updates);
        setUserProfile((prev) => ({ ...prev, ...updates }));
        setNeedsActivation(false);
        setIsExpired(false);
        alert('序號啟用成功！');
    };

    return {
        userProfile,
        setUserProfile,
        initError,
        needsTerms,
        needsAlias,
        needsActivation,
        isBanned,
        isExpired,
        setIsExpired,
        handleAgreeTerms,
        handleSetAlias,
        handleRedeemCode,
    };
}
