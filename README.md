# AI落地師武器庫 Lion Baker VC

AI落地師武器庫為一整合式平台，結合靈感專案管理、LINE Bot 機器人管理、AI落地師培訓班 報名系統，以及 Firebase 後端服務。主要於 LINE LIFF (WebView) 環境運行，支援行動裝置與 RWD。

---

## 目錄結構（細至每一支程式）

```
lionbaker-vc/
├── src/
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx
│   ├── index.css
│   ├── firebase.js
│   │
│   ├── components/
│   │   ├── SEO.jsx
│   │   └── MatrixRain.jsx
│   │
│   ├── utils/
│   │   ├── clipboard.js
│   │   └── security.js
│   │
│   └── pages/
│       ├── home/
│       │   ├── index.jsx
│       │   ├── constants.js
│       │   └── components/
│       │       ├── CreateProjectModal.jsx
│       │       ├── ProjectList.jsx
│       │       ├── ProjectCard.jsx
│       │       ├── ProjectEditor/
│       │       │   ├── index.jsx
│       │       │   └── panels/
│       │       │       ├── index.js
│       │       │       ├── FormPanel.jsx
│       │       │       ├── GamePanel.jsx
│       │       │       ├── InteractiveToolPanel.jsx
│       │       │       ├── LandingPagePanel.jsx
│       │       │       ├── NamecardPanel.jsx
│       │       │       └── WebsitePanel.jsx
│       │       ├── UserSettings.jsx
│       │       ├── FormInput.jsx
│       │       ├── FormSelect.jsx
│       │       ├── FormTextarea.jsx
│       │       ├── FormFields.jsx
│       │       └── gatekeepers/
│       │           ├── index.js
│       │           ├── TermsModal.jsx
│       │           ├── SetupAliasScreen.jsx
│       │           ├── ActivationScreen.jsx
│       │           └── BannedScreen.jsx
│       │
│       ├── agent/
│       │   ├── index.jsx
│       │   ├── constants.js
│       │   ├── components/
│       │   │   ├── AgentNav.jsx
│       │   │   ├── AgentList.jsx
│       │   │   ├── AgentEdit.jsx
│       │   │   ├── AgentSettings.jsx
│       │   │   ├── AgentSkillsTab.jsx
│       │   │   ├── SkillList.jsx
│       │   │   ├── SkillEdit.jsx
│       │   │   └── ScriptEditor.jsx
│       │   └── hooks/
│       │       ├── useAgentData.js
│       │       └── useDeploy.js
│       │
│       ├── signup/
│       │   ├── Signup.jsx
│       │   └── SignupAdmin.jsx
│       │
│       ├── vibecoding/
│       │   ├── AdminBackend.jsx
│       │   └── RegistrationForm.jsx
│       │
│       ├── SuperAdmin.jsx
│       ├── SandboxViewer.jsx
│       └── FormResponseViewer.jsx
│
├── functions/
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── public/
│   ├── index.html
│   └── 404.html
│
├── index.html
├── firebase.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── package.json
├── package-lock.json
├── check.js
├── replace_styles.js
└── test-fb.js
```

---

## 路由總覽

| 路徑 | 頁面 | 說明 |
|------|------|------|
| `/` | Home | AI落地師武器庫首頁，專案列表與建立 |
| `/admin` | SuperAdmin | 超級管理員（使用者與授權金鑰管理） |
| `/u/:userId/:projectId` | SandboxViewer | 專案沙盒預覽（iframe 顯示 HTML） |
| `/lineAgent` | LineAgent | LINE Bot 機器人與技能管理 |
| `/form-responses/:projectId` | FormResponseViewer | 專案表單回應檢視 |
| `/signup` | Signup | AI落地師培訓班 學員報名表單 |
| `/signup/admin` | SignupAdmin | AI落地師培訓班 報名後台 |

---

## 完整檔案對照表（每一支程式）

以下為所有程式檔案的完整路徑與用途一覽。

| 完整路徑 | 作用 |
|----------|------|
| `src/main.jsx` | React 掛載入口 |
| `src/App.jsx` | 根路由、Lazy Loading、全域 Suspense |
| `src/App.css` | App 專用樣式 |
| `src/index.css` | 全域樣式 |
| `src/firebase.js` | Firebase 初始化；匿名/Google 登入 |
| `src/components/SEO.jsx` | 動態 SEO、Open Graph Meta 標籤 |
| `src/components/MatrixRain.jsx` | Matrix 風格背景動畫（Canvas） |
| `src/utils/clipboard.js` | 跨環境剪貼簿複製（LIFF、iOS 相容） |
| `src/utils/security.js` | HTML 程式碼安全檢查（阻擋 eval、cookie 等） |
| `src/pages/home/index.jsx` | AI落地師武器庫主入口：專案列表、建立、編輯、LIFF、Gatekeepers |
| `src/pages/home/constants.js` | 常數（PREMIUM_COLORS 等） |
| `src/pages/home/components/CreateProjectModal.jsx` | 建立專案彈窗 |
| `src/pages/home/components/ProjectList.jsx` | 專案列表呈現與操作 |
| `src/pages/home/components/ProjectCard.jsx` | 單一專案卡片 |
| `src/pages/home/components/ProjectEditor/index.jsx` | 專案編輯器主體，切換六種面板 |
| `src/pages/home/components/ProjectEditor/panels/index.js` | 匯出各面板 |
| `src/pages/home/components/ProjectEditor/panels/FormPanel.jsx` | 表單類型專案編輯 |
| `src/pages/home/components/ProjectEditor/panels/GamePanel.jsx` | 遊戲類型專案編輯 |
| `src/pages/home/components/ProjectEditor/panels/InteractiveToolPanel.jsx` | 互動工具專案編輯 |
| `src/pages/home/components/ProjectEditor/panels/LandingPagePanel.jsx` | 著陸頁專案編輯 |
| `src/pages/home/components/ProjectEditor/panels/NamecardPanel.jsx` | 名片專案編輯 |
| `src/pages/home/components/ProjectEditor/panels/WebsitePanel.jsx` | 網頁類型專案編輯 |
| `src/pages/home/components/UserSettings.jsx` | 使用者設定（主題、別名等） |
| `src/pages/home/components/FormInput.jsx` | 表單輸入欄位 |
| `src/pages/home/components/FormSelect.jsx` | 下拉選單 |
| `src/pages/home/components/FormTextarea.jsx` | 多行文字欄位 |
| `src/pages/home/components/FormFields.jsx` | 表單欄位組合與邏輯 |
| `src/pages/home/components/gatekeepers/index.js` | 匯出 Gatekeeper 組件 |
| `src/pages/home/components/gatekeepers/TermsModal.jsx` | 條款同意彈窗 |
| `src/pages/home/components/gatekeepers/SetupAliasScreen.jsx` | 設定使用者別名畫面 |
| `src/pages/home/components/gatekeepers/ActivationScreen.jsx` | 授權啟動／到期提示 |
| `src/pages/home/components/gatekeepers/BannedScreen.jsx` | 帳號被封鎖提示 |
| `src/pages/agent/index.jsx` | LINE Bot Agent 後台主入口 |
| `src/pages/agent/constants.js` | Agent 相關常數 |
| `src/pages/agent/components/AgentNav.jsx` | Agent 後台導覽列 |
| `src/pages/agent/components/AgentList.jsx` | 機器人列表 |
| `src/pages/agent/components/AgentEdit.jsx` | 機器人編輯（設定 + 技能） |
| `src/pages/agent/components/AgentSettings.jsx` | 機器人基本設定（LINE、Cloudflare） |
| `src/pages/agent/components/AgentSkillsTab.jsx` | 技能掛載與管理分頁 |
| `src/pages/agent/components/SkillList.jsx` | 技能列表 |
| `src/pages/agent/components/SkillEdit.jsx` | 技能編輯 |
| `src/pages/agent/components/ScriptEditor.jsx` | 腳本編輯器 |
| `src/pages/agent/hooks/useAgentData.js` | Agent、Skill CRUD、圖片上傳、分享碼 |
| `src/pages/agent/hooks/useDeploy.js` | 部署至 Cloudflare Workers |
| `src/pages/signup/Signup.jsx` | AI落地師培訓班 學員報名表單 |
| `src/pages/signup/SignupAdmin.jsx` | 報名後台：場次、名單管理 |
| `src/pages/vibecoding/AdminBackend.jsx` | AI落地師培訓班 舊版後台 |
| `src/pages/vibecoding/RegistrationForm.jsx` | 舊版報名表單 |
| `src/pages/SuperAdmin.jsx` | 超級管理員：使用者、授權金鑰管理 |
| `src/pages/SandboxViewer.jsx` | 專案沙盒預覽（iframe） |
| `src/pages/FormResponseViewer.jsx` | 表單回應檢視（中英對照） |
| `functions/index.js` | Cloud Functions：API、報名、授權邏輯 |
| `vite.config.js` | Vite 建置、多站部署 |
| `tailwind.config.js` | Tailwind 主題與 RWD |
| `postcss.config.js` | PostCSS、Autoprefixer |
| `eslint.config.js` | ESLint 規則 |
| `check.js` | 專案內建檢查腳本 |
| `replace_styles.js` | 樣式替換腳本 |
| `test-fb.js` | Firebase 連線測試 |

---

## 各程式說明（依模組）

### 根目錄與設定

| 檔案 | 作用 |
|------|------|
| `src/main.jsx` | React 掛載入口 |
| `src/App.jsx` | 路由設定、Lazy Loading、全域 Suspense |
| `src/firebase.js` | Firebase App、Auth、Firestore、Storage、Functions 初始化；`signIn` 匿名/Google 登入 |
| `vite.config.js` | Vite 建置、多站部署 (hosting) |
| `tailwind.config.js` | Tailwind 主題、顏色、RWD |
| `postcss.config.js` | PostCSS、Autoprefixer |
| `eslint.config.js` | ESLint 規則 |
| `check.js` | 專案內建檢查腳本 |
| `replace_styles.js` | 樣式替換腳本 |
| `test-fb.js` | Firebase 連線/測試腳本 |

---

### 全域組件 (`src/components/`)

| 檔案 | 作用 |
|------|------|
| `SEO.jsx` | 動態設定 `document.title`、`og:title`、`og:description`、`og:image` 等 Meta |
| `MatrixRain.jsx` | Canvas 版 Matrix 風格背景動畫（二進位與假名字元） |

---

### 工具函式 (`src/utils/`)

| 檔案 | 作用 |
|------|------|
| `clipboard.js` | 跨環境複製文字（`execCommand` + Clipboard API，支援 LIFF、iOS） |
| `security.js` | 驗證專案 `htmlCode`，阻擋 `eval`、cookie、localStorage 等危險關鍵字 |

---

### 首頁模組 (`src/pages/home/`)

| 檔案 | 作用 |
|------|------|
| `index.jsx` | AI落地師武器庫主入口：專案列表、建立、編輯、LINE 機器人管家；整合 LIFF、Gatekeepers |
| `constants.js` | 常數（如 `PREMIUM_COLORS`） |

#### `home/components/`

| 檔案 | 作用 |
|------|------|
| `CreateProjectModal.jsx` | 建立專案彈窗 |
| `ProjectList.jsx` | 專案列表呈現與操作 |
| `ProjectCard.jsx` | 單一專案卡片 |
| `ProjectEditor/index.jsx` | 專案編輯器主體，切換不同類型面板 |
| `UserSettings.jsx` | 使用者設定（主題、別名等） |
| `FormInput.jsx` | 表單輸入欄位 |
| `FormSelect.jsx` | 下拉選單 |
| `FormTextarea.jsx` | 多行文字欄位 |
| `FormFields.jsx` | 表單欄位組合與邏輯 |

#### `home/components/ProjectEditor/panels/`

| 檔案 | 作用 |
|------|------|
| `index.js` | 匯出各面板 |
| `FormPanel.jsx` | 表單類型專案編輯 |
| `GamePanel.jsx` | 遊戲類型專案編輯 |
| `InteractiveToolPanel.jsx` | 互動工具專案編輯 |
| `LandingPagePanel.jsx` | 著陸頁專案編輯 |
| `NamecardPanel.jsx` | 名片專案編輯 |
| `WebsitePanel.jsx` | 網頁類型專案編輯 |

#### `home/components/gatekeepers/`

| 檔案 | 作用 |
|------|------|
| `index.js` | 匯出 Gatekeeper 組件 |
| `TermsModal.jsx` | 條款同意彈窗 |
| `SetupAliasScreen.jsx` | 設定使用者別名畫面 |
| `ActivationScreen.jsx` | 授權啟動／到期提示 |
| `BannedScreen.jsx` | 帳號被封鎖提示 |

---

### Agent 模組 (`src/pages/agent/`)

| 檔案 | 作用 |
|------|------|
| `index.jsx` | LINE Bot Agent 後台主入口（機器人列表、技能市集、工作坊） |
| `constants.js` | Agent 相關常數 |

#### `agent/components/`

| 檔案 | 作用 |
|------|------|
| `AgentNav.jsx` | Agent 後台導覽列 |
| `AgentList.jsx` | 機器人列表 |
| `AgentEdit.jsx` | 機器人編輯（設定 + 技能） |
| `AgentSettings.jsx` | 機器人基本設定（LINE、Cloudflare 等） |
| `AgentSkillsTab.jsx` | 技能掛載與管理分頁 |
| `SkillList.jsx` | 技能列表 |
| `SkillEdit.jsx` | 技能編輯 |
| `ScriptEditor.jsx` | 腳本編輯器 |

#### `agent/hooks/`

| 檔案 | 作用 |
|------|------|
| `useAgentData.js` | Agent、Skill CRUD、圖片上傳、分享碼 |
| `useDeploy.js` | 部署至 Cloudflare Workers 流程 |

---

### Signup 模組 (`src/pages/signup/`)

| 檔案 | 作用 |
|------|------|
| `Signup.jsx` | AI落地師培訓班 學員報名表單（LIFF 登入、場次選擇、表單送出） |
| `SignupAdmin.jsx` | 報名後台：場次 CRUD、報名名單管理、Google 登入驗證 |

---

### Vibecoding 模組 (`src/pages/vibecoding/`)

| 檔案 | 作用 |
|------|------|
| `AdminBackend.jsx` | AI落地師培訓班 舊版後台（LIFF 版本） |
| `RegistrationForm.jsx` | 舊版報名表單 |

> 此模組為備援或舊版實作，主流程已遷移至 `signup/`。

---

### 獨立頁面 (`src/pages/`)

| 檔案 | 作用 |
|------|------|
| `SuperAdmin.jsx` | 超級管理員：使用者列表、授權金鑰產生與管理；僅限特定 Email |
| `SandboxViewer.jsx` | 專案沙盒預覽：以 iframe 顯示 `projects/{id}.htmlCode` |
| `FormResponseViewer.jsx` | 表單回應檢視：讀取 `projects/{id}/form_responses` 並顯示中英對照 |

---

### 後端 (`functions/`)

| 檔案 | 作用 |
|------|------|
| `index.js` | Cloud Functions：專案 DB API（GET/POST/PUT）、報名 Cloud Function、授權金鑰產生等 |

---

## 技術棧

- **前端**：React 19、Vite 7、React Router 7、Tailwind CSS
- **後端**：Firebase (Auth、Firestore、Storage、Cloud Functions)
- **整合**：LINE LIFF、Cloudflare Workers（Agent 部署）

---

## 常用指令

```bash
npm run dev          # 開發模式
npm run build        # 建置
npm run preview      # 預覽建置結果
npm run deploy:app   # 部署 hosting:app
npm run deploy:sandbox # 部署 functions + hosting:sandbox
npm run deploy:all   # 全站部署
```
