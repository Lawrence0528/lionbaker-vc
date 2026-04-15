# LionBaker VC — 模板與提示詞生成

> 本專案**未**內建 OpenAI／Anthropic API；提示詞皆在前端組字串，由使用者**複製到外部 LLM**，產出後再貼回（例如專案 HTML）。與 [系統架構](./SYSTEM_ARCHITECTURE.md) 搭配閱讀。

---

## 1. 總覽：提示詞在何處產生

| 功能 | 檔案 | 函式／機制 |
|------|------|------------|
| 專案需求單（名片／遊戲／表單等） | `src/pages/home/components/ProjectEditor/index.jsx` | `generatePrompt()` |
| 短影音腳本 | `src/pages/reels/ReelsContent.jsx` | `generatePrompt()` |
| 漏斗健檢 → 文字語境 | `src/utils/funnelReelsInsight.js` | `buildReelsInsightPayload`、`formatReelsInsightForPrompt` |

---

## 2. 專案編輯器提示詞（`ProjectEditor`）

### 2.1 流程摘要

1. **圖片對照表**：`[圖片1]`… 與上傳 URL 列表；最後以 regex 將佔位符替換為真實連結。
2. **LIFF 區塊**（當 `useLiff` 且具 `liffId`）：固定要求引入 LIFF SDK、5 秒初始化逾時、`liff.init` 成功後才渲染；依 `liffFeatures` 追加 `getProfile` / `sendMessages` / `shareTargetPicker` 與防呆說明。
3. **資料 API 區塊**（表單固定或 `enableDatabase`／`enableStorage`）：明令**禁止 Firebase SDK**，改以 `https://run.lionbaker.com/api/project/...` 的 GET／POST／PUT／DELETE 與 storage POST；並說明 `projectId` 從 `meta[name="x-project-id"]` 取得（與 `renderSandbox` 注入一致）。
4. **`baseInfo`**：專案類型、名稱、別名、技術棧（純 HTML/CSS/JS、SEO meta）、視覺（主色、風格、參考圖）。
5. **依 `projectType` 組標題與欄位**（見下節）。

### 2.2 各類型標題與資料來源

| `projectType` | 提示詞標題 | 主要 state |
|---------------|------------|------------|
| `namecard` | 【電子名片網站開發需求單】 | `cardData`（姓名、職稱、LINE、摺疊選單等） |
| `game` | 【Web 小遊戲開發需求單】 | `gameData`（方向、平台、玩法需求） |
| `interactive_tool` | 【互動式拓客工具開發需求單】 | `interactiveData` |
| `landingPage` | 【品牌/店家 Landing Page 開發需求單】 | `landingPageData` |
| `form` | 【電子表單開發需求單】 | `formData.requirements`；並指示 POST 至 `form_responses` |
| `website`（預設） | 【網站開發需求單】 | `commonData.requirements` |

### 2.3 UI 與外部工具的心智模型

- 編輯器介面引導使用者將產出貼回為 **HTML**（文案中常提及 Gemini 等），即 **human-in-the-loop**，非自動寫回 Firestore。

---

## 3. 「模板」常數實際位置（非獨立 JSON prompt 檔）

Repo **沒有**專用的 `prompts/*.json`；模板以 **JS 匯出物件／字串** 為主。

### 3.1 `src/pages/home/constants.js`

| 常數 | 用途 |
|------|------|
| `PROJECT_TYPES` | 建立專案時類型選項（value／label） |
| `PREMIUM_COLORS` | 主色選項；`value` 為給 LLM 的質感描述句 |
| `DESIGN_STYLES` | 風格描述句 |
| `INDUSTRY_TEMPLATES` | 電子名片產業懶人包：`label`, `award`, `services`, `photoUrl`, `selfIntro`, `tips[]` |
| `INTERACTIVE_TEMPLATES` | 互動式工具預填文案／需求 |
| `LANDING_PAGE_TEMPLATES` | Landing 頁預填 |
| `DEFAULT_AVATARS` | 預設頭像 URL 列表 |

這些內容進入表單 state 後，會一併進入 `generatePrompt()` 的對應分支。

### 3.2 `src/pages/agent/constants.js`

- `PRESET_SCRIPTS`：**LINE 關鍵字回覆腳本**預設，與 LLM system prompt **無關**。

### 3.3 `src/pages/funnel-check/utils/funnelQuizData.js`

- 題目物件上的 `prompt` 等：**測驗／問卷文案**，不是給 ChatGPT 的指令檔。

---

## 4. 短影音提示詞（`ReelsContent.jsx`）

### 4.1 固定角色與結構

- 開頭角色句：「你現在是一位精通短影音演算法的腳本大師。」
- 內嵌 **`courseKnowledge`**：黃金三秒、朋友對話感、視覺節奏、情緒價值、留言互動等條列規則。

### 4.2 依表單動態組裝

- **CTA**：依 `ctaType` 產生 `ctaInstruction`（留言領資源／Link in Bio／互動提問／收藏）。
- **平台**：`platformCaptionReq` 分支 — Instagram、TikTok、YouTube Shorts、Facebook 各自的「同場加映」文案要求。
- **漏斗語境**：若使用者勾選且 `readFunnelReelsInsight()` 有值，插入  
  `【事業語境與漏斗健檢…】` + `formatReelsInsightForPrompt(funnelInsight)`。

### 4.3 輸出格式要求

- 腳本以 **Markdown 表格**（秒數／畫面／口播／備註）。
- 另含 **ManyChat** 公開回覆與私訊回覆的生成指示（與 `ctaKeyword` 連動）。

---

## 5. 漏斗語境檔（`funnelReelsInsight.js`）

- **Storage key**：`lionbaker_funnel_reels_insight_v1`（`localStorage`）。
- **`buildReelsInsightPayload`**：組出 `version`, `profile`（產業、變現、人設、短影音平台等）, `funnel`（診斷標題、瓶頸、策略陣列）。
- **`formatReelsInsightForPrompt`**：將上述 JSON 轉成多行繁體中文段落，供 Reels（或其他未來功能）拼入提示詞。

**設計意義**：跨頁傳遞「使用者背景」而不經後端；大改版時可改為帳號綁定雲端設定檔。

---

## 6. 與後端／Agent 的邊界

- **`SandboxViewer`**：只負責 iframe 載入，不組 prompt。
- **`useAgentData`**：Firestore 與 Storage，無 LLM。
- **`functions/index.js`**：LINE webhook 為關鍵字腳本，**無**聊天補全模型。

---

## 7. 大改版時可考量的產品／技術方向

1. **提示詞即程式碼**：將 `generatePrompt` 改為宣告式模板（Handlebars、Mustache 或自訂 JSON schema），便於非工程編修與 A/B。
2. **集中設定**：API base URL、LIFF SDK 版本說明、禁止 Firebase 等段落改為單一 `promptFragments` 模組，避免與 `renderSandbox`／Worker 網域漂移。
3. **內建 LLM**：若改為後端代理呼叫，需新增串流、金鑰管理、用量與內容審核；前端可保留「複製提示詞」作為 fallback。
4. **版本化輸出**：對 `projects` 產出的 HTML 可記錄「產生時使用的 prompt 版本 hash」，利於除錯與重產。

---

## 8. 快速檔案索引

```
src/pages/home/components/ProjectEditor/index.jsx  → generatePrompt()
src/pages/home/constants.js                        → 產業／Landing／互動模板與色票
src/pages/reels/ReelsContent.jsx                  → 短影音 generatePrompt()
src/utils/funnelReelsInsight.js                   → 健檢語境 JSON ↔ 提示詞段落
src/pages/agent/constants.js                      → LINE 腳本預設（非 LLM）
```
