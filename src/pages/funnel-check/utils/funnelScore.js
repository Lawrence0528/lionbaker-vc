import { DIMENSIONS, CHOICE_SCORE_MAP } from '../constants';
import { DIMENSION_ORDER } from './funnelQuizData';

const DIMENSION_LABEL_BY_KEY = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.label]));

export const computeScoresFromQuestions = (questions, answersByQuestionId) => {
  const totals = Object.fromEntries(DIMENSIONS.map((d) => [d.key, 0]));

  for (const q of questions) {
    const choice = answersByQuestionId?.[q.id];
    const score = CHOICE_SCORE_MAP[choice];
    if (!score) continue;
    totals[q.dimension] += score;
  }

  return totals;
};

export const pickBottleneck = (scores) => {
  const ordered = DIMENSION_ORDER;
  let minKey = ordered[0];
  let minVal = scores[minKey];
  let maxKey = ordered[0];
  let maxVal = scores[maxKey];

  for (const key of ordered) {
    const v = scores[key];
    if (v > maxVal) {
      maxVal = v;
      maxKey = key;
    }
    if (v < minVal) {
      minVal = v;
      minKey = key;
    }
  }

  return {
    key: minKey,
    label: DIMENSION_LABEL_BY_KEY[minKey] || minKey,
    score: minVal,
    maxKey,
    maxLabel: DIMENSION_LABEL_BY_KEY[maxKey] || maxKey,
    maxScore: maxVal,
  };
};

const diagnosisByBottleneck = {
  traffic: {
    title: '流量曝光不足，是你漏斗的第一個斷點',
    strategies: [
      '把內容/投放拆成「痛點 → 承諾 → 行動」三段式，並用同一套 CTA 帶到名單頁，讓曝光更準時轉換。',
      '建立「觸及數據 → 點擊/加好友 → 名單量」的追蹤節奏，每週只優化 1 個關鍵素材（標題或封面）。'
    ],
  },
  leadCapture: {
    title: '名單留存不穩定，你的努力還沒被有效承接',
    strategies: [
      '導入「加好友後 5 分鐘內回覆 → 需求確認 → 分眾 → 下一步邀約」的標準流程，讓每個名單都有去向。',
      '用分眾標籤把內容節奏對齊需求，讓你不必同一套訊息打所有人。'
    ],
  },
  segmentation: {
    title: '標籤分眾不足，導致你在「對的人」身上花不夠力',
    strategies: [
      '先定 3 個最關鍵標籤（來源/需求/階段），把每位名單都放進對應路徑，降低溝通成本、提高命中率。',
      '把每一次互動都設計成「觸發 → 貼標 → 下一步」：看了什麼內容、問了什麼問題，就自然導向對應的邀約/內容。'
    ],
  },
  trustNurturing: {
    title: '信任培育不足，導致名單理解後還是不敢行動',
    strategies: [
      '用「故事（我為什麼做）→ 方法（你怎麼做）→ 案例（別人怎麼成）→ 反對意見處理」四段式建立可信度。',
      '每次內容都要有下一步（領取/預約/提問），避免名單看完就停在原地。'
    ],
  },
  conversion: {
    title: '轉換變現流程不夠清楚，所以興趣止步在私訊',
    strategies: [
      '建立標準成交路徑：篩選 → 需求盤點 → 方案對齊 → 跟進節點 → 成交條件，讓每次跟進更有一致性。',
      '用可衡量的邀約目標（例如：邀約率、成交率），每週只針對一個節點做 A/B 優化。'
    ],
  },
  fissionAscension: {
    title: '裂變與升級不足，導致你一直在用同樣力氣重複拉新',
    strategies: [
      '先做一個「可被轉介紹」的引導腳本：客戶分享要講什麼、貼什麼、要帶到哪一個入口，並給明確誘因（名額/折扣/加值）。',
      '設計升級路徑（加購/續約/高階方案）與觸發時機：完成某步或達到某結果就引導升級，讓 LTV 成長而不是只拼新單。'
    ],
  },
};

export const buildDiagnosis = ({ bottleneckKey }) => {
  const base = diagnosisByBottleneck[bottleneckKey] || diagnosisByBottleneck.traffic;
  return base;
};

export const buildDiagnosisSmart = ({ scores, bottleneck }) => {
  const minScore = bottleneck?.score ?? 0;
  const maxScore = bottleneck?.maxScore ?? 0;
  const spread = maxScore - minScore;

  // 若整體接近滿分，避免硬套「卡關」模板（你看到的滿分建議偏瞎就是這裡）
  if (minScore >= 9 && spread <= 1) {
    return {
      title: '整體表現很強，建議改成「微優化 + 複製擴張」',
      kind: 'overallStrong',
      strategies: [
        '把目前最穩定的那條漏斗路徑做「標準化 SOP」：從流量入口到加好友、到邀約成交全部固定節奏，讓你能複製成同樣的成果。',
        '用小步 A/B 優化（每週只改一個變因：標題/封面/CTA/邀約節點），追蹤數據讓轉換率持續上升，而不是大幅推倒重來。'
      ],
    };
  }

  const base = buildDiagnosis({ bottleneckKey: bottleneck?.key });
  return { ...base, kind: 'bottleneck' };
};

