# 系統設計文件 (System Design Document)
**專案名稱:** 烘焙工程獅 AI 平台系統 2.0 (LionBaker AI Platform)
**文件版本:** v2.0 (整合 1.0 既有業務模組)
**架構負責人:** Lawrence (陳嘉吉)

---

## 1. 系統概述與演進策略 (System Overview & Evolution)

### 1.1 產品定位
本系統為賦能型 SaaS 平台，主打「不用懂技術，教你快速做出系統」。
2.0 架構繼承了 1.0 已驗證的業務模組（名片、表單、活動報名、自動回覆、漏斗健檢），並將底層從 Firebase 全面遷移至 **All-in Cloudflare**。

### 1.2 核心商業價值：數據主權 (Data Sovereignty) 
將資料庫 (D1) 與前端應用 (Pages) 透過自動化 API，建立於學員自有的 Cloudflare 帳號中。平台端僅作為「AI 生成引擎」與「中央控制台」，徹底解除學員對「名單被平台綁架」的疑慮。

---

## 2. 核心架構決策 (Architecture Decisions)

* **母平台核心 (Mother Platform):** Next.js 15+ (App Router), TypeScript, Tailwind CSS。
* **基礎設施服務商:** 全面採用 Cloudflare (Pages, Workers, D1, KV, R2)。
* **AI 整合:** 從 1.0 的「Human-in-the-loop (手動複製貼上)」升級為「母平台直接串接 Gemini API (Canvas/Text)」，實現一鍵生成與佈署。
* **身份認證:** 棄用 Firebase Auth，改採 NextAuth.js，並統一 LINE `userId` 與系統帳號的綁定邏輯。

---

## 3. 系統拓撲與資料邊界 (System Topology & Data Boundary)

系統將嚴格劃分「母平台 (平台方)」與「子系統 (學員方)」。

### 3.1 母平台 (Mother Platform - `ai.lionbaker.com`)
只儲存系統運作所需的元資料 (Metadata) 與學員配置，**不儲存學員的業務數據 (如報名名單、表單回覆)**。

* **D1 資料表 (`core_db`):**
    * `users`: 學員基本資料、VIP 狀態 (`isSvip`, `expiryDate`)、LINE Profile。
    * `tenant_configs`: 安全儲存學員的 Cloudflare API Token、Account ID。
    * `license_keys`: 序號產生與兌換紀錄。
    * `funnel_checkups`: 繼承 1.0 漏斗健檢結果，供後續生成 Reels 腳本或 AI 語境使用。
* **模組引擎:**
    * **Provisioning API:** 拿著學員 Token 去 CF 建立 D1/KV/Pages 的自動化腳本。
    * **AI Prompt Engine:** 將 1.0 的 `generatePrompt()` 移至後端，結合學員的健檢語境，直接呼叫 Gemini API。
    * **Admin UI (中央控制台):** 讀取學員 Token，即時向學員子系統的 D1/KV 發起 `fetch`，渲染 `vibe_sessions` (活動對帳)、`form_responses` (表單回覆)、`agents` (機器人狀態)。

### 3.2 學員子系統 (Tenant Systems - `[id].u.lionbaker.com` 於學員 CF 帳號)
繼承 1.0 的 `projects` 概念，所有的實體網頁與業務數據皆在此運行。

* **Cloudflare Pages (靜態展示層):**
    接收由母平台 Gemini 產出的單檔 HTML+React。包含：
    * `namecard` (電子名片)
    * `form` (電子表單)
    * `landingPage` (一頁式銷售頁)
    * `event` (培訓班報名頁，對應 1.0 `registrations_vibe`)
    * `interactive_tool` (拓客工具/小遊戲)
* **Cloudflare D1 (業務資料庫 - `tenant_db`):**
    * `form_responses`: 儲存客製化表單的收集資料。
    * `vibe_sessions` & `registrations_vibe`: 儲存活動場次、報名名單、對帳與簽到狀態。
* **Cloudflare Workers KV (高頻讀取設定):**
    * `agents`: 儲存 LINE / Meta 機器人的設定檔與 `mountedSkills`。
    * `liff_configs`: 儲存各專案的 LIFF ID 與設定。
* **Cloudflare Workers (動態邏輯層):**
    * **Tenant API:** 負責接收前端 HTML 的資料寫入 (取代 1.0 Firebase 的 API)。
    * **Bot Webhook:** 負責接收 LINE/Meta 訊息，比對 KV 腳本，觸發自動回覆或呼叫 AI。

---

## 4. 關鍵機制移植與優化 (Mechanism Migration)

### 4.1 Prompt 引擎架構優化
1.0 依賴前端組裝字串。2.0 將模板抽離為後端配置，約束 Gemini 產出符合 Cloudflare 架構的程式碼：
* **API 寫入約束:** 提示詞內明確指示 Gemini **禁用 Firebase SDK**。所有資料存取皆須產生 `fetch` 呼叫子系統的 Worker API (例如：`POST /api/db/form_responses`)。
* **環境變數注入:** 透過 母平台佈署時，將 `tenant_id`、`liffId` 等參數注入 HTML `meta` 標籤，供前端程式碼讀取 (繼承 1.0 完美作法)。
* **LIFF 整合:** 若學員啟用 `useLiff`，Prompt 強制要求產出的程式碼必須包含 `liff.init()` 與逾時處理邏輯。

### 4.2 跨帳號自動建置流程 (Cross-Account Provisioning)
取代 1.0 的 `renderSandbox`。當學員點擊「生成並佈署」時：
1.  母平台呼叫 Gemini 產出 HTML/JS/CSS。
2.  母平台取出學員的 CF API Token。
3.  呼叫 CF API 確認學員端 D1 (`tenant_db`) 與 KV Namespace 是否存在，若無則建立。
4.  若為新專案，呼叫 CF API 建立 Pages 專案 (`POST /accounts/{id}/pages/projects`)。
5.  將產出的 HTML 打包上傳至學員的 CF Pages，回傳公開網址。

### 4.3 機器人與自動化 (Agents & Cron)
* **Manychat 替代方案:** 將 1.0 的 `agents` 與 `skills` 視覺化為拖拉介面。設定結果轉為 JSON 寫入學員的 KV。
* **排程通知 (Cron Triggers):** 子系統部署一支專屬 Worker，利用 CF Cron Triggers 每天檢查 `registrations_vibe` 的活動日期，自動發送「課前 3 天 / 1 天」的 Email 或 LINE 提醒。

---

## 5. 階段性開發路徑 (Development Roadmap)

1.  **Phase 1: 基礎設施命脈打通 (Infrastructure Proof of Concept)**
    * 建置 Next.js 母平台骨架。
    * 實作 CF API Token 儲存與加密。
    * 實作 Provisioning API：成功透過程式在測試子帳號建立 D1、KV、並丟一包 Hello World 到 Pages。
2.  **Phase 2: 1.0 模組無縫移植 (Module Migration)**
    * 優先移植 **電子名片 (`namecard`)** 與 **電子表單 (`form`)**。
    * 串接 Gemini API，測試「給定參數 ➔ 產出 HTML ➔ 透過 Phase 1 引擎佈署到子帳號」。
    * 實作子系統 Worker API，確保表單能正確寫入子帳號 D1 (`form_responses`)。
3.  **Phase 3: 重型業務落地 (Heavy Business Logic)**
    * 移植 `vibe_sessions` (活動報名系統) 與對帳管理員後台。
    * 移植 LINE Bot Webhook 與 KV 腳本對應機制。
4.  **Phase 4: D1 升級控制中心 (Schema Migration System)**
    * 開發母平台的批次管理工具，未來系統改版時，能自動對所有學員的 D1 執行 `ALTER TABLE` 升級。