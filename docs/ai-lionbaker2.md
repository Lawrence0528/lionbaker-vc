# 系統設計文件 (System Design Document)
**專案名稱:** 烘焙工程獅 AI 平台系統 2.0
**文件版本:** v1.0
**架構負責人:** Lawrence (陳嘉吉)
**最後更新時間:** 2026-04-02

---

## 1. 系統概述 (System Overview)

### 1.1 產品定位
「烘焙工程獅 AI 平台系統 2.0」是一個賦能型的 SaaS 平台。結合 AI 程式碼生成能力（Gemini）與一鍵佈署基礎設施，幫助無技術背景的創業者（如在地商家、微商、個人品牌）快速建立高轉換率的數位業務系統。

### 1.2 核心商業價值：數據主權 (Data Sovereignty)
有別於傳統 SaaS 將所有客戶資料鎖在平台端，本系統主打「資料庫與應用程式皆建立於客戶自有的 Cloudflare 帳號中」。平台僅作為「生成引擎」與「管理控制台」，客戶擁有 100% 的名單與數據掌控權。

---

## 2. 核心架構決策 (Architecture Decisions)

* **前端與後台核心框架:** Next.js + TypeScript
* **基礎設施服務商:** All-in Cloudflare (Pages, Workers, D1, KV, R2)
* **AI 整合:** Google Gemini (用於 Canvas 生成 HTML/React 單檔及提示詞解析)
* **佈署策略:** 跨帳號自動化建置 (Cross-Account Provisioning via CF API)
* **開發工具鏈:** Cursor Agent (主架構與邏輯) + Manus (獨立腳本與單檔模版)

---

## 3. 系統拓撲與模組劃分 (System Topology)

系統分為兩大運行域：**母平台（平台管理端）**與**子系統（客戶運行端）**。

### 3.1 母平台 (Mother Platform - `ai.lionbaker.com`)
平台端不儲存終端消費者的業務數據，僅儲存系統運作所需的元資料 (Metadata)。
* **Auth (身分驗證):** 透過 NextAuth.js 整合 Google OAuth。
* **租戶配置管理 (Tenant Provisioning Engine):** 負責安全儲存學員的 Cloudflare API Token。
* **AI 生成引擎:** 介接 Gemini API，提供版型提示詞引導，產出特定場景的靜態網頁或程式碼。
* **中央管理控制台 (Admin UI):** 以 Next.js 共用模板打造。透過學員的 API Token，即時向學員的子系統 (D1/KV) 發送 Fetch 請求，讀取並渲染活動報到、對帳明細、Bot 流量等數據。

### 3.2 子系統 (Tenant Systems - `[id].u.lionbaker.com` 或是 客戶自訂網域)
所有的基礎設施皆透過母平台 API 自動建立於學員的 Cloudflare 帳號內。
* **靜態展示層 (Cloudflare Pages):**
    * Landing Page
    * 電子名片 (`/card/[id]`)
    * 電子表單 (`/forms/[id]`)
    * 活動報名頁 (`/event/[id]`)
* **動態邏輯層 (Cloudflare Workers):**
    * **Bot Webhook Receiver:** 負責接收 LINE / Meta 的訊息，並根據 KV 內的設定進行自動回覆。
    * **Event API:** 處理報名寫入、金流介接、以及寄送課前通知 (透過 CF Cron Triggers)。
* **儲存層:**
    * **Cloudflare D1 (SQL):** 儲存活動報名名單、表單紀錄、對帳狀態。
    * **Cloudflare Workers KV:** 儲存讀取頻率極高的 Bot 自動回覆規則、LIFF 設定檔。
    * **Cloudflare R2 / Images:** 儲存客戶上傳的圖檔及靜態資源。

---

## 4. 關鍵資料流與自動化流程 (Data Flow & Automation)

### 4.1 自動建置流程 (Provisioning Flow)
1. 學員在母平台綁定 Cloudflare API Token。
2. 學員選擇「建立活動系統」。
3. 母平台後端觸發 Provisioning Engine：
   - `POST /d1/database` 建立專屬 D1。
   - `POST /d1/database/.../query` 執行 Schema 初始化 (建立 Table)。
   - `POST /pages/projects` 建立 Pages 專案並綁定 D1。
   - 上傳 Gemini 產生的前端靜態檔至該 Pages。
4. 系統回傳完成狀態與可用網址。

### 4.2 Bot 設定寫入流程 (Manychat-like UI)
1. 學員在母平台視覺化拖拉/設定自動回覆流程。
2. 母平台將流程轉換為 JSON 格式。
3. 母平台呼叫 CF API，將 JSON 寫入學員帳號內的 **Workers KV**。
4. 學員的 Line/Meta Webhook 觸發時，由子系統的 Worker 讀取 KV 並執行回覆（若未命中規則，可選擇呼叫 Gemini 進行 AI 回覆或轉接真人）。

---

## 5. 安全性考量 (Security Considerations)

1.  **API Token 儲存:** 母平台資料庫中的 Cloudflare API Token 必須進行對稱式加密 (AES-256) 儲存，避免資料庫外洩時導致學員 CF 帳號被挾持。
2.  **XSS 防護:** Gemini 產生的 HTML/React 程式碼在推送到客戶 Pages 之前，需經過基本的 Sanitization（消毒），防止惡意腳本注入。
3.  **無狀態架構 (Stateless Admin):** 母平台管理後台**絕對不**快取或備份學員的業務數據。每次查看報名名單，皆為即時透過 Token 向學員 D1 發起的 Request。

---

## 6. 開發與演進策略 (Development Strategy)

### 6.1 階段一：打穿基礎設施命脈 (Proof of Concept)
* **目標:** 驗證跨帳號部署 (Cross-Account Provisioning)。
* **行動:** 使用 Cursor 建立 Next.js 母平台骨架。實作 Token 儲存機制，並寫出能成功透過 API 幫子帳號建立 D1 與 Pages 的引擎。

### 6.2 階段二：單點突破與 1.0 經驗移植
* **目標:** 實作最具價值的單一模組（推薦：電子名片/表單 或 Bot 回覆系統）。
* **行動:** 將過去 1.0 的業務邏輯轉換為 Cloudflare Workers / Pages 架構，透過第一階段的引擎推送到測試用子帳號。

### 6.3 階段三：資料庫版控機制 (Schema Migration System)
* **目標:** 解決多個獨立 D1 資料庫的升級問題。
* **行動:** 開發「版本控制檢查器」。當子系統需要新增欄位時，能在母平台透過一鍵更新，批次或單獨對學員的 D1 執行 `ALTER TABLE`。

---

## 7. 結論
本架構極大化了 Cloudflare 的 Serverless 生態系優勢，以最低的維運成本實現了高度客製化的 SaaS 服務。透過將「資料與基礎設施」下放至客戶端，不僅消除了傳統 SaaS 的資安信任疑慮，更為課程賦能提供了強而有力的商業護城河。