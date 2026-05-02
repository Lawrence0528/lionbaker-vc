import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
    SIGNUP_LANDING_COLLECTION,
    SIGNUP_LANDING_DOC_ID,
    DEFAULT_SIGNUP_LANDING,
    normalizeSignupLandingData,
} from './signupLandingShared';

/**
 * 訂閱報名頁公開設定（影片列表、海報 URL）；失敗或未建立文件時回退預設值。
 */
export function useSignupLandingSettings() {
    const [loading, setLoading] = useState(true);
    const [youtubeVideos, setYoutubeVideos] = useState(DEFAULT_SIGNUP_LANDING.youtubeVideos);
    const [posterImageUrl, setPosterImageUrl] = useState(DEFAULT_SIGNUP_LANDING.posterImageUrl);

    useEffect(() => {
        const ref = doc(db, SIGNUP_LANDING_COLLECTION, SIGNUP_LANDING_DOC_ID);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const normalized = snap.exists()
                    ? normalizeSignupLandingData(snap.data())
                    : { ...DEFAULT_SIGNUP_LANDING };
                setYoutubeVideos(normalized.youtubeVideos);
                setPosterImageUrl(normalized.posterImageUrl);
                setLoading(false);
            },
            () => {
                setYoutubeVideos(DEFAULT_SIGNUP_LANDING.youtubeVideos);
                setPosterImageUrl(DEFAULT_SIGNUP_LANDING.posterImageUrl);
                setLoading(false);
            }
        );
        return () => unsub();
    }, []);

    return { loading, youtubeVideos, posterImageUrl };
}
