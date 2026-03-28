import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { db } from '../../../firebase';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { useLiffInit } from '../hooks/useLiffInit';
import { INDUSTRIES, MONETIZATION_CHANNELS } from '../constants';

const FunnelCheckContext = createContext(null);

const STORAGE_KEY = 'funnel_checkup_draft_v1';
const SENT_KEY = 'funnel_checkup_sent_ids_v1';

const readSentSet = () => {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
};

const writeSentSet = (set) => {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
};

const initialState = {
  liffReady: false,
  initError: '',
  isMock: false,
  liffInClient: false,
  lineProfile: null,

  profileForm: {
    name: '',
    industry: '',
    monetization: '',
    industryDescription: '',
    brandName: '',
    offerOneLiner: '',
    audiencePortrait: '',
    contentPainOrGoal: '',
    personaTone: '',
    shortsPlatforms: [],
  },

  // { [questionId]: 'A'|'B'|'C' }
  answersByQuestionId: {},
  // 重新填寫時保留上次答案作參考（不直接帶入）
  previousAnswersByQuestionId: {},

  result: null,
  processing: false,
  processingError: '',

  messageSending: false,
  messageSendingError: '',
  isMessageSent: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_LIFF_STATE':
      return {
        ...state,
        liffReady: action.payload.liffReady,
        initError: action.payload.initError,
        isMock: action.payload.isMock,
        liffInClient: action.payload.liffInClient,
        lineProfile: action.payload.lineProfile,
      };
    case 'SET_PROFILE_FORM':
      return { ...state, profileForm: { ...state.profileForm, ...action.payload } };
    case 'SET_ANSWER':
      return {
        ...state,
        answersByQuestionId: {
          ...state.answersByQuestionId,
          [action.payload.questionId]: action.payload.choice,
        },
      };
    case 'SET_ALL_ANSWERS':
      return { ...state, answersByQuestionId: action.payload };
    case 'SET_PREVIOUS_ANSWERS':
      return { ...state, previousAnswersByQuestionId: action.payload || {} };
    case 'START_PROCESSING':
      return { ...state, processing: true, processingError: '' };
    case 'FINISH_PROCESSING':
      return { ...state, processing: false, result: action.payload };
    case 'PROCESSING_ERROR':
      return { ...state, processing: false, processingError: action.payload };
    case 'START_MESSAGE_SENDING':
      return { ...state, messageSending: true, messageSendingError: '' };
    case 'FINISH_MESSAGE_SENDING':
      return { ...state, messageSending: false, isMessageSent: true };
    case 'SET_MESSAGE_SENT_STATE':
      return { ...state, isMessageSent: !!action.payload };
    case 'MESSAGE_SENDING_ERROR':
      return { ...state, messageSending: false, messageSendingError: action.payload };
    case 'RESET_FOR_RETAKE':
      return {
        ...state,
        previousAnswersByQuestionId: state.answersByQuestionId || {},
        answersByQuestionId: {},
        result: null,
        processing: false,
        processingError: '',
        messageSending: false,
        messageSendingError: '',
        isMessageSent: false,
      };
    case 'RESET_ALL':
      return initialState;
    default:
      return state;
  }
}

export const FunnelCheckProvider = ({ children }) => {
  const { lineProfile, liffReady, initError, isMock, liffInClient } = useLiffInit();
  const [state, dispatch] = useReducer(reducer, initialState);
  const remoteHydratedRef = useRef(false);

  const normalizeSelectValue = (options, stored) => {
    if (!stored) return '';
    const asString = String(stored);
    if (options.some((o) => o.value === asString)) return asString;
    const byLabel = options.find((o) => o.label === asString);
    return byLabel?.value || '';
  };

  // LIFF 初始化結果同步到 Context
  useEffect(() => {
    dispatch({
      type: 'SET_LIFF_STATE',
      payload: { liffReady, initError, isMock, liffInClient, lineProfile },
    });
  }, [liffReady, initError, isMock, liffInClient, lineProfile]);

  // 初始化時從暫存讀草稿（避免使用者中斷後重選全部題目）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.profileForm) dispatch({ type: 'SET_PROFILE_FORM', payload: draft.profileForm });
      if (draft?.answersByQuestionId) dispatch({ type: 'SET_ALL_ANSWERS', payload: draft.answersByQuestionId });
      // result 與 message 狀態不直接恢復，避免資料過舊
    } catch (err) {
      // 忽略暫存讀取錯誤
      void err;
    }
  }, []);

  // 當 LIFF profile ready 後，如果尚未填姓名就自動帶入
  useEffect(() => {
    if (!state.lineProfile?.displayName) return;
    if (state.profileForm.name?.trim()) return;
    dispatch({ type: 'SET_PROFILE_FORM', payload: { name: state.lineProfile.displayName } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lineProfile]);

  // 若 sessionStorage 沒有草稿，則嘗試從 Firestore 載入「最新一次健檢的填寫記錄」
  // 讓使用者運作一陣子後回來，能直接帶入之前的答案繼續修改/重做。
  useEffect(() => {
    const run = async () => {
      if (!state.liffReady) return;
      const userId = state.lineProfile?.userId;
      if (!userId) return;

      if (remoteHydratedRef.current) return;

      // 如果目前已經有題目答案，就不覆蓋使用者當前進度
      if (Object.keys(state.answersByQuestionId || {}).length > 0) return;

      // 如果目前 sessionStorage 有草稿，也不再讀取 Firestore
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const draft = JSON.parse(raw);
          const hasDraft = !!draft?.answersByQuestionId && Object.keys(draft.answersByQuestionId).length > 0;
          if (hasDraft) return;
        }
      } catch (err) {
        // ignore
        void err;
      }

      try {
        const checkupsCol = collection(db, 'users', userId, 'checkups');
        const q = query(checkupsCol, orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        remoteHydratedRef.current = true;
        if (snap.empty) return;

        const latestDoc = snap.docs[0];
        const latest = latestDoc?.data() || {};
        const checkupId = String(latestDoc?.id || '');
        const profile = latest?.profile || {};
        const answers = latest?.answersByQuestionId || {};
        const scores = latest?.scores || null;
        const bottleneckLabel = latest?.bottleneck || null;
        const bottleneckKey = latest?.bottleneckKey ?? null;
        const bottleneckScore = typeof latest?.bottleneckScore === 'number' ? latest.bottleneckScore : null;
        const diagnosisTitle = latest?.diagnosisTitle || '';
        const strategies = Array.isArray(latest?.strategies) ? latest.strategies : [];

        if (profile && Object.keys(profile).length > 0) {
          const shortsFromRemote = Array.isArray(profile.shortsPlatforms)
            ? profile.shortsPlatforms
            : typeof profile.shortsPlatforms === 'string'
              ? profile.shortsPlatforms.split(',').map((s) => s.trim()).filter(Boolean)
              : state.profileForm.shortsPlatforms;

          const nextProfile = {
            name: profile.name || state.profileForm.name,
            industry: normalizeSelectValue(INDUSTRIES, profile.industry) || state.profileForm.industry,
            monetization: normalizeSelectValue(MONETIZATION_CHANNELS, profile.monetization) || state.profileForm.monetization,
            industryDescription: profile.industryDescription || state.profileForm.industryDescription,
            brandName: profile.brandName ?? state.profileForm.brandName,
            offerOneLiner: profile.offerOneLiner ?? state.profileForm.offerOneLiner,
            audiencePortrait: profile.audiencePortrait ?? state.profileForm.audiencePortrait,
            contentPainOrGoal: profile.contentPainOrGoal ?? state.profileForm.contentPainOrGoal,
            personaTone: profile.personaTone ?? state.profileForm.personaTone,
            shortsPlatforms: shortsFromRemote?.length ? shortsFromRemote : state.profileForm.shortsPlatforms,
          };

          const hasAnyChange =
            nextProfile.name !== state.profileForm.name ||
            nextProfile.industry !== state.profileForm.industry ||
            nextProfile.monetization !== state.profileForm.monetization ||
            nextProfile.industryDescription !== state.profileForm.industryDescription ||
            nextProfile.brandName !== state.profileForm.brandName ||
            nextProfile.offerOneLiner !== state.profileForm.offerOneLiner ||
            nextProfile.audiencePortrait !== state.profileForm.audiencePortrait ||
            nextProfile.contentPainOrGoal !== state.profileForm.contentPainOrGoal ||
            nextProfile.personaTone !== state.profileForm.personaTone ||
            JSON.stringify(nextProfile.shortsPlatforms || []) !== JSON.stringify(state.profileForm.shortsPlatforms || []);

          dispatch({
            type: 'SET_PROFILE_FORM',
            payload: hasAnyChange ? nextProfile : {},
          });
        }

        if (answers && Object.keys(answers).length > 0) {
          dispatch({ type: 'SET_ALL_ANSWERS', payload: answers });
        }

        // 進入 funnel-check 若已做過，就應該能直接看結果頁
        if (scores && checkupId) {
          dispatch({
            type: 'FINISH_PROCESSING',
            payload: {
              checkupId,
              profile: {
                name: profile?.name || state.profileForm.name,
                industry: normalizeSelectValue(INDUSTRIES, profile?.industry) || state.profileForm.industry,
                monetization: normalizeSelectValue(MONETIZATION_CHANNELS, profile?.monetization) || state.profileForm.monetization,
                industryDescription: profile?.industryDescription || state.profileForm.industryDescription,
                brandName: profile?.brandName ?? state.profileForm.brandName,
                offerOneLiner: profile?.offerOneLiner ?? state.profileForm.offerOneLiner,
                audiencePortrait: profile?.audiencePortrait ?? state.profileForm.audiencePortrait,
                contentPainOrGoal: profile?.contentPainOrGoal ?? state.profileForm.contentPainOrGoal,
                personaTone: profile?.personaTone ?? state.profileForm.personaTone,
                shortsPlatforms: Array.isArray(profile?.shortsPlatforms)
                  ? profile.shortsPlatforms
                  : state.profileForm.shortsPlatforms,
              },
              scores,
              bottleneck: {
                key: bottleneckKey || null,
                label: bottleneckLabel || '（未計算）',
                score: typeof bottleneckScore === 'number' ? bottleneckScore : 0,
              },
              bottleneckScore: typeof bottleneckScore === 'number' ? bottleneckScore : 0,
              diagnosisTitle,
              strategies,
            },
          });

          const sent = readSentSet().has(checkupId);
          dispatch({ type: 'SET_MESSAGE_SENT_STATE', payload: sent });
        }
      } catch (err) {
        console.error('載入最新健檢紀錄失敗：', err);
      }
    };

    run();
  }, [state.liffReady, state.lineProfile?.userId]);

  // 草稿暫存（只存 profile 與 answers）
  useEffect(() => {
    try {
      const draft = { profileForm: state.profileForm, answersByQuestionId: state.answersByQuestionId };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // 忽略暫存寫入錯誤
    }
  }, [state.profileForm, state.answersByQuestionId]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      setProfileForm: (payload) => dispatch({ type: 'SET_PROFILE_FORM', payload }),
      setAnswer: (questionId, choice) => dispatch({ type: 'SET_ANSWER', payload: { questionId, choice } }),
      startProcessing: () => dispatch({ type: 'START_PROCESSING' }),
      finishProcessing: (result) => dispatch({ type: 'FINISH_PROCESSING', payload: result }),
      setProcessingError: (err) => dispatch({ type: 'PROCESSING_ERROR', payload: err }),
      startMessageSending: () => dispatch({ type: 'START_MESSAGE_SENDING' }),
      finishMessageSending: (checkupId) => {
        if (checkupId) {
          const set = readSentSet();
          set.add(String(checkupId));
          writeSentSet(set);
        }
        dispatch({ type: 'FINISH_MESSAGE_SENDING' });
      },
      setMessageSendingError: (err) => dispatch({ type: 'MESSAGE_SENDING_ERROR', payload: err }),
      resetForRetake: () => dispatch({ type: 'RESET_FOR_RETAKE' }),
      resetAll: () => {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch (err) {
          // ignore
          void err;
        }
        dispatch({ type: 'RESET_ALL' });
      },
    }),
    [state]
  );

  return <FunnelCheckContext.Provider value={value}>{children}</FunnelCheckContext.Provider>;
};

export const useFunnelCheck = () => {
  const ctx = useContext(FunnelCheckContext);
  if (!ctx) throw new Error('useFunnelCheck 必須在 FunnelCheckProvider 內使用');
  return ctx;
};

