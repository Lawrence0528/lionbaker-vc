# LionBaker VC — 資料結構設計（Firestore／關聯）

> 與 [系統架構](./SYSTEM_ARCHITECTURE.md) 對照閱讀。欄位以「目前程式實際讀寫」為準，非正式 JSON Schema；大改版時可據此收斂為版控 schema。

---

## 1. 安全規則與存取策略（摘要）

來源：`firestore.rules`。

| 路徑樣式 | 客戶端讀 | 客戶端寫 |
|----------|----------|----------|
| `users/{userId}` | 已登入 | create、update（不可 delete） |
| `projects/{projectId}` | 已登入 | 讀寫刪 |
| `projects/.../form_responses/{id}` | 已登入 | **禁止** |
| `projects/.../{collectionId}/{docId}` | 已登入 | **禁止**（寫入走 Admin／`api`） |
| `users/.../checkups/{id}` | 已登入 | create、update（不可 delete） |
| `agents/{id}`、`skills/{id}` | 已登入 | read、write |
| `license_keys/{id}` | 已登入 | read、create、update（不可 delete） |
| `registrations_vibe/{id}` | **單筆 get 公開**；list 禁止 | create 有欄位驗證；不可 update/delete |
| 其餘 | **全封** | **全封** |

**注意**：`vibe_sessions` 僅能透過 Cloud Functions（Admin SDK）存取，**不在**上述客戶端白名單內。

---

## 2. 集合與文件模型

### 2.1 `users`（文件 ID = LINE `userId`）

**用途**：與 LIFF 同步的會員檔、條款同意、別名、VIP 狀態等。

**常見欄位**（分散於 `useLiffVipGate`、`UserManagement` 等）：

| 欄位 | 說明 |
|------|------|
| `displayName`, `pictureUrl` | LINE 顯示資訊 |
| `createdAt` | 建立時間 |
| `role` | 例：`user` |
| `status` | 例：`active` |
| `agreedToTerms` | 是否同意條款 |
| `alias` | 全站別名（唯一性以前端／管理流程檢查） |
| `isSvip`, `expiryDate` | VIP／到期 |

**子集合**：`users/{userId}/checkups/{checkupId}` — 漏斗健檢結果。

**健檢文件（典型）**：`profile`（產業、變現、品牌敘述等）、`scores`、`bottleneck`、`bottleneckKey`、`bottleneckScore`、`answersByQuestionId`、`diagnosisTitle`、`strategies`、`createdAt` 等（見 `ProcessingScreen.jsx`、`FunnelCheckContext.jsx`）。

---

### 2.2 `projects`（文件 ID = Firestore 自動或自訂）

**用途**：使用者建立的「武器庫」專案；核心承載 **`htmlCode`** 與預覽／短網址用 **`projectAlias`**、**`userId`**。

**建立時常見欄位**（`home/index.jsx`）：  
`name`, `type`, `userId`, `createdAt`, `updatedAt`, `mainColor`, `style`, `htmlCode`, `projectAlias`, `useLiff`, `liffId`

**編輯合併欄位**（`ProjectEditor/index.jsx` 之 `docData` 邏輯）：

- **共用 `commonData`**：`requirements`, `htmlCode`, `userAlias`, `projectAlias`, `enableDatabase`, `enableStorage`, `liffFeatures`, `useLiff`, `liffId`
- **一般**：`type`, `imageUrls`, `thumbnail`, `updatedAt`
- **依 `type` 分支**：名片 `namecard`、遊戲 `game`、`interactive_tool`、`landingPage`、`form`、`website` 各有專屬物件（如 `personName`, `phone`, `templateKey`…）
- **可選**：`htmlHistory` — 以 ISO 時間字串為 key 的 HTML 版本歷程

**唯一性**：同一 `userId` 下 `projectAlias` 不可重複（前端 `checkProjectAlias`）。

**子集合**：

1. **`form_responses`**  
   - 表單送出資料；欄位可為動態 key。  
   - 後台顯示可經 `FIELD_MAPPING` 對應中文標題（`FormResponseViewer.jsx`）。

2. **任意 `collectionName`（嵌入式 DB）**  
   - 路徑：`projects/{projectId}/{collectionName}/{docId}`  
   - REST：`api` 寫入時會加 `_createdAt`（POST）或 `_updatedAt`（PUT）；可傳 `_id` 做 upsert。

---

### 2.3 `agents`

**用途**：LINE 機器人实例設定與掛載技能。

**常見欄位**（`useAgentData.js`）：  
`id`, `name`, `userId`, `cfAccountId`, `cfApiToken`, `lineToken`, `lineSecret`, `mountedSkills`, `scripts`（如 `replyTexts`, `replyImages`）, `createdAt`, `updatedAt`

**查詢**：`where('userId', '==', uid)`。

---

### 2.4 `skills`

**用途**：可重用技能包；可公開分享。

**常見欄位**：  
`id`, `name`, `description`, `userId`, `isPublic`, `shareCode`, `scripts`, `createdAt`, `updatedAt`

**查詢**：`isPublic == true` 或 `shareCode` 等。

---

### 2.5 `license_keys`

**用途**：序號產生與兌換。

**常見欄位**：  
`code`, `type`（如 VIP 等級）, `days`, `status`（`active` / `redeemed`）, `createdBy`, `createdAt`, 可選 `validUntil`；兌換後可能含 `redeemedUsers`, `lastRedeemedAt`。

---

### 2.6 `registrations_vibe`

**用途**：培訓班線上報名（表單可直接寫入，受 rules 限制）。

**建立時典型欄位**（`Signup.jsx`）：  
`name`, `email`, `phone`, `source`, `lastFive`, `count`, `paymentMethod`, `isTimeNotAvailable`, `wishTime`, `wishLocation`, `sessionId`, `sessionTitle`, `sessionDate`, `sessionLocation`, `lineUserId`, `createdAt`, **`status: 'pending'`**

**關聯**：`sessionId` 應對應 **`vibe_sessions` 的文件 ID**（後台註解與 Callable 邏輯一致）。

---

### 2.7 `vibe_sessions`（僅後端）

**用途**：場次 CRUD；客戶端不可直接讀寫。

**Callable  payload 典型欄位**（`createVibeSession` 等）：  
`title`, `date`, `endDate`, `endTime`, `location`, `address`, `note`, `status`, `price`, `originalPrice`, `maxCapacity`, `currentCount`, `createdAt`, `updatedAt`

---

## 3. 實體關係（文字 ERD）

```
LINE userId ─┬─ users/{userId}
             ├─ projects (userId) ─┬─ form_responses
             │                     └─ {任意 collection}  ← REST api 寫入
             ├─ agents (userId)
             └─ skills (userId) ←─ mountedSkills 引用

registrations_vibe.sessionId ──→ vibe_sessions/{docId}

license_keys ──兌換──→ users (expiryDate / isSvip)
```

---

## 4. Storage（概念）

- 上傳 API 將檔案置於 bucket 路徑如 `user_uploads/{projectId}/{timestamp}_{fileName}` 並設為公開 URL（見 `functions/index.js`）。
- 實際 bucket 名稱與 `storage.rules` 需與部署環境一致。

---

## 5. 大改版建議方向（資料層）

1. **明確主鍵**：是否以 Firebase Auth UID 為主、LINE 為 secondary link table，避免 rules 僅能表達「已登入」。
2. **子集合命名規範**：嵌入式 `collectionName` 目前任意字串，可訂命名空間或索引策略。
3. **`vibe_sessions` 與 rules**：若未來要前台讀場次，需新增規則或改走只讀 API。
4. **Schema 版控**：將 `projects` 依 `type` 的欄位差異收斂為 Zod／JSON Schema，利於遷移與表單驗證。

---

## 6. 程式索引（Firestore 路徑）

| 區域 | 主要檔案 |
|------|----------|
| 專案 CRUD | `src/pages/home/index.jsx`, `ProjectEditor/index.jsx`, `CreateProjectModal.jsx` |
| 表單回覆 | `FormResponseViewer.jsx` |
| VIP／使用者 | `useLiffVipGate.js`, `UserSettings.jsx` |
| 健檢 | `funnel-check/context/FunnelCheckContext.jsx`, `ProcessingScreen.jsx` |
| Agent | `pages/agent/hooks/useAgentData.js` |
| 報名 | `pages/signup/Signup.jsx`, `CheckIn.jsx` |
| 後端寫入 | `functions/index.js` |
