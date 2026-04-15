# LionBaker VC — 系統架構說明

> 本文件依目前程式庫狀態整理，供大改版／重新設計時對照。相關文件：[資料結構設計](./DATA_SCHEMA.md)、[模板與提示詞](./TEMPLATES_AND_PROMPTS.md)。

---

## 1. 技術棧總覽

| 層級 | 技術 |
|------|------|
| 前端 | React 19、Vite、`react-router-dom` 7、Tailwind CSS |
| 後端（BaaS） | Firebase Auth、Firestore、Storage、Cloud Functions v2 |
| LINE | `@line/liff`（多個 LIFF ID，依頁面／產品分流） |
| Cloud Functions | Express（`onRequest`）、Callable（`onCall`）、`firebase-admin` |
| 靜態託管 | Firebase Hosting **雙 target**：`app`（主站 `dist`）、`sandbox`（沙盒靜態目錄） |
| 邊緣 | Cloudflare Worker（`*.u.lionbaker.com` → 上游 `/u/...` 反代） |

**重要設計決策**：公開專案 HTML **不**透過客戶端 Firestore 規則開放讀取；預覽與對外網址改由 **`renderSandbox`（Admin SDK）** 讀取 `projects.htmlCode` 後直接輸出 HTML，降低被爬取與規則複雜度。

---

## 2. 目錄與責任邊界

```
lionbaker-vc/
├── src/                    # 主 React 應用
│   ├── App.jsx             # 路由表
│   ├── firebase.js         # 前端 Firebase 初始化
│   ├── pages/
│   │   ├── home/           # 專案武器庫（專案 CRUD、編輯器、表單回覆檢視）
│   │   ├── agent/          # LINE Agent／技能／部署（與 LLM 無直接 API 串接）
│   │   ├── signup/         # 培訓報名 SPA
│   │   ├── funnel-check/   # 事業漏斗健檢 SPA
│   │   ├── reels/          # 短影音腳本提示詞產生器（複製貼到外部 LLM）
│   │   ├── super-admin/    # 超管
│   │   └── ...
│   ├── hooks/              # 例：useLiffVipGate
│   └── utils/              # 例：funnelReelsInsight（localStorage 語境）
├── functions/              # Cloud Functions（api、renderSandbox、Vibe Callable、部署 Worker 等）
├── sandbox/                # Hosting target `sandbox` 的靜態資源
├── cloudflare/             # u-router-worker.js
├── firestore.rules
├── storage.rules
└── firebase.json
```

---

## 3. 前端路由（`src/App.jsx`）

| 路徑 | 用途 |
|------|------|
| `/` | 首頁：專案列表與編輯（需 LINE／VIP gate） |
| `/admin` | 超級管理後台 |
| `/u/:userId/:projectId` | 沙盒預覽頁（iframe 載入同源或對應網域之 HTML） |
| `/lineAgent` | LINE Agent 設定後台 |
| `/signup/*` | 培訓班報名與相關子頁 |
| `/funnel-check/*` | 漏斗健檢 |
| `/reels` | 短影音腳本生成（提示詞輸出） |
| `/menu` | LINE 圖片選單 |
| `*` | 導向 `/` |

---

## 4. Firebase Hosting 與 Functions 對應（`firebase.json`）

### Target：`app`（主站）

- `public`: `dist`
- `/api/**` → Cloud Function **`api`**（Express）
- 其餘 → SPA `index.html`

### Target：`sandbox`

- `public`: `sandbox/`
- `/api/**` → **`api`**
- `/u/**` → **`renderSandbox`**（輸出專案 HTML）
- 其餘 → `sandbox/index.html`

**實務含義**：對外「短網址／子網域」若指向 sandbox 或經 Worker 轉到 `run.lionbaker.com`，則 `/u/...` 由 **`renderSandbox`** 提供內容；主站 build 若未 rewrite `/u`，則預覽路徑需與實際部署網域一致。

---

## 5. Cloudflare Worker（`cloudflare/u-router-worker.js`）

- 僅處理 `*.u.lionbaker.com`。
- 將 `https://{user}.u.lionbaker.com/{project}/...` 轉成上游（預設 `https://run.lionbaker.com`）路徑 `/u/{user}/{project}/...`，並保留 query string（例如快取 bust `?t=`）。
- 上游可由環境變數 `UPSTREAM_ORIGIN` 覆蓋。

---

## 6. Cloud Functions 功能分塊（`functions/index.js`）

### 6.1 HTTP：`api`（Express）

- **嵌入式 DB**（Admin 寫入，繞過客戶端 rules）  
  - `GET/POST` `/api/project/:projectId/db/:collectionName`  
  - `PUT/DELETE` `/api/project/:projectId/db/:collectionName/:docId`  
- **Storage**：`POST` `/api/project/:projectId/storage`（Base64 上傳、公開 URL）
- **部署**：`POST` `/api/deploy`（Cloudflare Workers + LINE 等整合，與 Agent 設定連動）

### 6.2 HTTP：`renderSandbox`

- 路徑形如 `/u/{userId}/{projectId}`。
- 先以 `projectId` 當文件 ID 讀取；失敗則以 `projectAlias` 查詢並比對 `userId` 或 `userAlias`。
- 回傳 `htmlCode`，並注入 `<meta name="x-project-id" content="...">`（供沙盒內 JS 呼叫 API）、必要時補強 `og:image` 尺寸等 meta。

### 6.3 Callable：Vibe 培訓場次與報名

- `getVibeSessions`、`createVibeSession`、`updateVibeSession`
- `getVibeRegistrations`、`updateVibeRegistration`、`deleteVibeRegistration`  
- 集合 `vibe_sessions` **未**在 `firestore.rules` 開放客戶端，僅能經由此類 Callable（Admin）操作。

### 6.4 其他

- 檔案後段尚含 LINE Webhook、關鍵字腳本回覆等（關鍵字比對，非 OpenAI／Anthropic）。

---

## 7. 核心使用者流程（簡述）

### 7.1 首頁／專案

1. LIFF 初始化與 LINE Profile（`useLiffVipGate`）。
2. Firestore `users/{lineUserId}` 同步與 VIP／條款／別名等 gate。
3. `projects` 依 `userId` 查詢列表；`ProjectEditor` 更新文件（含 `htmlCode`、`projectAlias`、各類型欄位）。

### 7.2 沙盒預覽

1. 前端 `SandboxViewer` 以 iframe 載入 `/u/{userId}/{projectId}`（或對外網域等同路徑）。
2. 實際 HTML 由 **`renderSandbox`** 從 Firestore 組出。

### 7.3 LINE Agent（`/lineAgent`）

1. Firebase 匿名或既有 session；非本機則再經 LIFF。
2. `agents`、`skills` 的 CRUD 與圖片上傳；`mountedSkills` 等存在 agent 文件。

### 7.4 嵌入式資料與表單

- 沙盒內 HTML 透過 **固定網域**（程式中常寫 `https://run.lionbaker.com`）呼叫 REST，寫入 `projects/{projectId}/{collection}/...`。
- `form_responses` 由後端規則禁止客戶端寫入，實務上應與表單送出 API 設計一致（見 `ProjectEditor` 提示詞說明）。

---

## 8. 大改版時可優先檢視的耦合點

1. **雙重身份模型**：LINE `userId` 與 Firebase Auth **未**一對一綁定；rules 僅要求「已登入」，與「資料歸屬」邏輯分散在前端與 Functions。
2. **硬編碼網域**：沙盒 API 與 OG／部署說明多處寫死 `run.lionbaker.com`，改版時建議集中設定（環境變數／設定檔）。
3. **Hosting 分離**：主站與 sandbox 的 rewrite 不同，預覽與正式短網址需文件化單一「真相來源」。
4. **無內建 LLM**：AI 生成皆為「複製提示詞 → 外部工具」，若升級為內嵌 API，需在架構層新增後端代理與用量控管。

---

## 9. 文件索引（程式碼）

| 項目 | 路徑 |
|------|------|
| 路由 | `src/App.jsx` |
| Firebase 初始化 | `src/firebase.js` |
| Hosting／Functions 對應 | `firebase.json` |
| REST／renderSandbox／Callable | `functions/index.js` |
| Worker | `cloudflare/u-router-worker.js` |
| 安全規則 | `firestore.rules`、`storage.rules` |
