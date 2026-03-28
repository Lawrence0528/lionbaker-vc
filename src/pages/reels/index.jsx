import React from 'react';
import { useLiffVipGate } from '../../hooks/useLiffVipGate';
import { TermsModal, SetupAliasScreen, ActivationScreen, BannedScreen } from '../home/components/gatekeepers';
import ReelsContent from './ReelsContent';

/**
 * 短影音流量密碼生成器 — 獨立 LIFF 路徑（/reels），與首頁共用 VIP／序號兌換流程。
 */
const Reels = () => {
    const {
        userProfile,
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

    if (isBanned) return <BannedScreen />;
    if (needsTerms) return <TermsModal onAgree={handleAgreeTerms} />;
    if (needsAlias) return <SetupAliasScreen onSave={handleSetAlias} />;
    if (needsActivation) return <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="activate" />;
    if (isExpired) return <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="expire" />;

    if (!userProfile) {
        return initError ? (
            <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center bg-slate-50">
                <div className="text-5xl">😢</div>
                <div className="text-slate-600 font-medium text-base max-w-xs">{initError}</div>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg transition"
                >
                    重新整理
                </button>
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-slate-50">
                <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-400 text-sm">正在驗證身份，請稍候...</p>
            </div>
        );
    }

    return <ReelsContent />;
};

export default Reels;
