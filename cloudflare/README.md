# Cloudflare 佈署（`*.u.lionbaker.com` 路由）

本專案的租戶公開頁面（不受信任 `htmlCode`）建議**統一由後端 `renderSandbox` 輸出 HTML**，並以 Cloudflare 做子網域路由：

- **子網域**：`{user}.u.lionbaker.com`
- **路徑**：`/{project}`
- **上游**：`https://run.lionbaker.com/u/{user}/{project}`

## Worker：`cloudflare/u-router-worker.js`

### 行為

- `https://{user}.u.lionbaker.com/{project}?t=...` 會被反代到 `https://run.lionbaker.com/u/{user}/{project}?t=...`
- 會保留 querystring（方便用 `?t=` 做快取 bust）

### 建議設定

- **Route**：`*.u.lionbaker.com/*` → 指到此 Worker
- **環境變數（可選）**：
  - `UPSTREAM_ORIGIN`：上游來源（預設 `https://run.lionbaker.com`）

## 為什麼不讓租戶頁面直連 Firestore

因為租戶頁面允許任意 `script`，若頁面可直接載入 Firebase Web SDK，等同讓不受信任程式碼在你的 Firebase 專案上執行；正確作法是：公開頁只拿到「渲染後的 HTML」，資料寫入改走受控 API（Cloud Functions）。

