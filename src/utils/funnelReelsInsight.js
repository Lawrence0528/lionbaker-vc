/**
 * 漏斗健檢「事業語境檔」：跨頁傳遞使用者背景（同裝置 localStorage），
 * 供短影音腳本、其他 AI 生成與提示詞組裝共用。完整健檢後會覆寫；僅填基本資料時寫入部分背景。
 */
import { INDUSTRIES, MONETIZATION_CHANNELS, SHORTS_PLATFORM_OPTIONS } from '../pages/funnel-check/constants';

export const FUNNEL_REELS_INSIGHT_KEY = 'lionbaker_funnel_reels_insight_v1';

const labelByValue = (list, value) => list.find((x) => x.value === value)?.label || value || '';

const platformLabelsFromValues = (values) => {
  if (!Array.isArray(values) || values.length === 0) return '';
  return values
    .map((v) => SHORTS_PLATFORM_OPTIONS.find((o) => o.value === v)?.label || v)
    .filter(Boolean)
    .join('、');
};

/**
 * @param {object} params
 * @param {object} params.profileForm — Context 內 profileForm
 * @param {{ diagnosisTitle?: string, bottleneck?: { label?: string }, strategies?: string[] } | null} params.funnelResult
 */
export function buildReelsInsightPayload({ profileForm, funnelResult = null }) {
  const industryLabel = labelByValue(INDUSTRIES, profileForm.industry);
  const monetizationLabel = labelByValue(MONETIZATION_CHANNELS, profileForm.monetization);

  return {
    version: 1,
    updatedAt: Date.now(),
    profile: {
      name: profileForm.name?.trim() || '',
      industry: industryLabel,
      monetization: monetizationLabel,
      industryDescription: (profileForm.industryDescription || '').trim(),
      brandName: (profileForm.brandName || '').trim(),
      offerOneLiner: (profileForm.offerOneLiner || '').trim(),
      audiencePortrait: (profileForm.audiencePortrait || '').trim(),
      contentPainOrGoal: (profileForm.contentPainOrGoal || '').trim(),
      personaTone: profileForm.personaTone || '',
      shortsPlatforms: Array.isArray(profileForm.shortsPlatforms) ? profileForm.shortsPlatforms : [],
      shortsPlatformLabels: platformLabelsFromValues(
        Array.isArray(profileForm.shortsPlatforms) ? profileForm.shortsPlatforms : [],
      ),
    },
    funnel: funnelResult
      ? {
          diagnosisTitle: funnelResult.diagnosisTitle || '',
          bottleneckLabel: funnelResult.bottleneck?.label || '',
          strategies: Array.isArray(funnelResult.strategies) ? funnelResult.strategies : [],
        }
      : null,
  };
}

export function writeFunnelReelsInsight(payload) {
  try {
    localStorage.setItem(FUNNEL_REELS_INSIGHT_KEY, JSON.stringify(payload));
  } catch {
    // 略過（隱私模式或配額）
  }
}

export function readFunnelReelsInsight() {
  try {
    const raw = localStorage.getItem(FUNNEL_REELS_INSIGHT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.profile) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearFunnelReelsInsight() {
  try {
    localStorage.removeItem(FUNNEL_REELS_INSIGHT_KEY);
  } catch {
    // ignore
  }
}

/** 組成給 AI 的繁中背景段落（不含使用者本次在表單填的 additionalInfo） */
export function formatReelsInsightForPrompt(insight) {
  if (!insight?.profile) return '';
  const p = insight.profile;
  const lines = [];

  lines.push(
    '（以下為使用者在健檢中提供的「事業語境」，請自然融入各類生成內容——腳本、文案、企劃皆可——不要像唸問卷）',
  );
  if (p.name) lines.push(`- 使用者稱呼：${p.name}`);
  if (p.industry) lines.push(`- 所屬產業：${p.industry}`);
  if (p.monetization) lines.push(`- 主要變現方式：${p.monetization}`);
  if (p.brandName) lines.push(`- 品牌／專案名稱：${p.brandName}`);
  if (p.offerOneLiner) lines.push(`- 核心產品／服務（一句話）：${p.offerOneLiner}`);
  if (p.audiencePortrait) lines.push(`- 理想客戶輪廓：${p.audiencePortrait}`);
  if (p.contentPainOrGoal) lines.push(`- 行銷／內容想突破的卡點或目標：${p.contentPainOrGoal}`);
  if (p.industryDescription) lines.push(`- 事業現況與目標補充：${p.industryDescription}`);
  if (p.personaTone) lines.push(`- 偏好人設語氣：${p.personaTone}`);
  if (p.shortsPlatformLabels) lines.push(`- 主要經營內容或短影音的平台：${p.shortsPlatformLabels}`);

  const f = insight.funnel;
  if (f && (f.diagnosisTitle || f.bottleneckLabel || (f.strategies && f.strategies.length))) {
    lines.push('');
    lines.push('【漏斗健檢摘要（供內容、腳本與行銷方向參考）】');
    if (f.diagnosisTitle) lines.push(`- 診斷標題：${f.diagnosisTitle}`);
    if (f.bottleneckLabel) lines.push(`- 目前較弱的環節：${f.bottleneckLabel}`);
    if (f.strategies?.length) {
      lines.push('- 建議策略方向：');
      f.strategies.slice(0, 5).forEach((s, i) => {
        lines.push(`  ${i + 1}. ${s}`);
      });
    }
  }

  return lines.join('\n');
}

/** 由健檢 profile 拼出預填「補充說明」區塊（僅在表單該欄為空時使用） */
export function buildPrefillAdditionalFromProfile(profile) {
  if (!profile) return '';
  const parts = [];
  if (profile.brandName) parts.push(`【品牌／專案】${profile.brandName}`);
  if (profile.offerOneLiner) parts.push(`【核心方案】${profile.offerOneLiner}`);
  if (profile.contentPainOrGoal) parts.push(`【內容目標／卡關】${profile.contentPainOrGoal}`);
  if (profile.industryDescription) parts.push(`【事業現況】${profile.industryDescription}`);
  return parts.join('\n');
}
