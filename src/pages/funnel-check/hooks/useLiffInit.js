import { useEffect, useState } from 'react';
import liff from '@line/liff';

import { signIn } from '../../../firebase';
import { LIFF_ID } from '../constants';

const mockProfile = {
  userId: 'mock_local_user',
  displayName: '本地測試用戶',
  pictureUrl: 'https://placehold.co/150',
};

let liffInitPromise = null;

const initLiffWithRetry = async (retries = 1) => {
  const LIFF_TIMEOUT_MS = 10000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (!liffInitPromise) {
        liffInitPromise = liff.init({ liffId: LIFF_ID }).catch((err) => {
          liffInitPromise = null;
          throw err;
        });
      }

      await Promise.race([
        liffInitPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('LIFF_TIMEOUT')), LIFF_TIMEOUT_MS)),
      ]);
      return;
    } catch (err) {
      // timeout 代表可能卡在 pending，必須清掉共享 promise 才能真正重試
      if (err?.message === 'LIFF_TIMEOUT') {
        liffInitPromise = null;
      }
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
};

export const useLiffInit = () => {
  const [lineProfile, setLineProfile] = useState(null);
  const [liffReady, setLiffReady] = useState(false);
  const [initError, setInitError] = useState('');
  const [isMock, setIsMock] = useState(false);
  const [liffInClient, setLiffInClient] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let watchdogTimer = null;

    const init = async () => {
      try {
        if (cancelled) return;
        setInitError('');
        setLiffReady(false);

        // 防止任何分支卡住造成無限轉圈
        watchdogTimer = setTimeout(() => {
          if (cancelled) return;
          setInitError('初始化逾時，請點重新整理或稍後再試。');
        }, 15000);

        const isLocal =
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        await signIn().catch(() => {
          // 非致命：後續只有 Firestore 寫入失敗時才會顯示
        });

        if (isLocal) {
          if (cancelled) return;
          setIsMock(true);
          setLiffInClient(false);
          setLineProfile(mockProfile);
          if (watchdogTimer) clearTimeout(watchdogTimer);
          setLiffReady(true);
          return;
        }

        await initLiffWithRetry(1);
        if (cancelled) return;
        setLiffInClient(liff.isInClient());

        if (!liff.isInClient()) {
          // 非 LINE WebView：保留可測試狀態（訊息發送會被跳過）
          if (cancelled) return;
          setIsMock(true);
          setLineProfile({
            userId: `mock_${Date.now()}`,
            displayName: '非 LINE 環境測試用戶',
            pictureUrl: 'https://placehold.co/150',
          });
          if (watchdogTimer) clearTimeout(watchdogTimer);
          setLiffReady(true);
          return;
        }

        if (!liff.isLoggedIn()) {
          // 若尚未設定正確 LIFF_ID（或你需要在非登入狀態下先跑 UI），就直接給 Mock 資料
          if (!LIFF_ID || LIFF_ID === 'YOUR_LIFF_ID_HERE') {
            if (cancelled) return;
            setIsMock(true);
            setLineProfile({
              userId: `mock_${Date.now()}`,
              displayName: '未登入 Mock 用戶',
              pictureUrl: 'https://placehold.co/150',
            });
            if (watchdogTimer) clearTimeout(watchdogTimer);
            setLiffReady(true);
            return;
          }

          // 若 login 沒有成功跳轉，避免永遠 loading
          try {
            const loginAttempts = Number(sessionStorage.getItem('funnel_liff_login_attempts') || 0);
            if (loginAttempts >= 1) {
              setInitError('LINE 登入流程未完成，請點重新整理後重試。');
              return;
            }
            sessionStorage.setItem('funnel_liff_login_attempts', String(loginAttempts + 1));
            liff.login({ redirectUri: window.location.href });
          } catch (loginErr) {
            throw loginErr;
          }
          return;
        }

        try {
          sessionStorage.removeItem('funnel_liff_login_attempts');
        } catch {
          // ignore
        }

        const profile = await liff.getProfile();
        if (cancelled) return;
        setLineProfile({
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });
        if (watchdogTimer) clearTimeout(watchdogTimer);
        setLiffReady(true);
      } catch (err) {
        console.error('LIFF init error:', err);
        if (cancelled) return;
        if (watchdogTimer) clearTimeout(watchdogTimer);
        setInitError(err.message === 'LIFF_TIMEOUT' ? 'LIFF 初始化逾時，請點重新整理重試。' : (err.message || 'LIFF 初始化失敗'));
      }
    };

    init();

    return () => {
      cancelled = true;
      if (watchdogTimer) clearTimeout(watchdogTimer);
    };
  }, []);

  return { lineProfile, liffReady, initError, isMock, liffInClient };
};

