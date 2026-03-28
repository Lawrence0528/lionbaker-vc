const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();
const db = admin.firestore();

const ADMIN_EMAIL = "charge0528@gmail.com";

async function assertAdmin(context) {
    if (!context?.auth?.uid) {
        throw new HttpsError("unauthenticated", "請先登入管理員帳號。");
    }
    const user = await admin.auth().getUser(context.auth.uid);
    if (user?.email !== ADMIN_EMAIL) {
        throw new HttpsError("permission-denied", "僅限管理員存取。");
    }
    return user;
}

function assertAuthenticated(context) {
    if (!context?.auth?.uid) {
        throw new HttpsError("unauthenticated", "請先登入。");
    }
}

function toIso(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (value.toDate) return value.toDate().toISOString(); // Firestore Timestamp
    try {
        return new Date(value).toISOString();
    } catch {
        return null;
    }
}

// API App
const apiApp = express();
apiApp.use(cors({ origin: true }));
apiApp.use(express.json());

// 簡單驗證專案ID是否存在
const verifyProject = async (req, res, next) => {
    const { projectId } = req.params;
    if (!projectId) return res.status(400).json({ error: "Missing projectId" });
    next();
};

apiApp.get("/api/project/:projectId/db/:collectionName", verifyProject, async (req, res) => {
    try {
        const { projectId, collectionName } = req.params;
        // 將資料限制於特定專案的子集合中，避免互相干擾
        const colRef = db.collection(`projects/${projectId}/${collectionName}`);
        const snap = await colRef.orderBy('_createdAt', 'desc').get().catch(async (e) => {
            // 如果沒有 _createdAt index 或報錯，退回到一般取得
            console.warn("API GET Fallback (no index):", e);
            return await colRef.get();
        });
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, data });
    } catch (error) {
        console.error("API GET Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

apiApp.post("/api/project/:projectId/db/:collectionName", verifyProject, async (req, res) => {
    try {
        const { projectId, collectionName } = req.params;
        const bodyData = req.body;

        if (!bodyData || typeof bodyData !== 'object') {
            return res.status(400).json({ error: "Invalid document data" });
        }

        const colRef = db.collection(`projects/${projectId}/${collectionName}`);

        // 擷取 _id 作為自訂 Key (如果不傳則維持 undefined)
        const customId = bodyData._id;
        // 將 _id 從實際存入的資料中剔除 (可保留也可剔除，這裡選擇剔除以保持乾淨)
        const { _id, ...restData } = bodyData;

        const docData = {
            ...restData,
            _createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (customId) {
            // 使用自訂 ID 進行 Upsert (新增或更新)
            await colRef.doc(customId).set(docData, { merge: true });
            res.json({ success: true, id: customId, action: 'upsert' });
        } else {
            // 沒有自訂 ID，一般新增 (由 Firestore 產生亂數 ID)
            const docRef = await colRef.add(docData);
            res.json({ success: true, id: docRef.id, action: 'create' });
        }
    } catch (error) {
        console.error("API POST Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 更新特定文件
apiApp.put("/api/project/:projectId/db/:collectionName/:docId", verifyProject, async (req, res) => {
    try {
        const { projectId, collectionName, docId } = req.params;
        const bodyData = req.body;

        if (!bodyData || typeof bodyData !== 'object') {
            return res.status(400).json({ error: "Invalid document data" });
        }

        const docRef = db.collection(`projects/${projectId}/${collectionName}`).doc(docId);

        const { _id, _createdAt, ...updateData } = bodyData; // 防呆，避免外部竄改 _id 或建立時間

        await docRef.set({
            ...updateData,
            _updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({ success: true, id: docId });
    } catch (error) {
        console.error("API PUT Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 刪除特定文件
apiApp.delete("/api/project/:projectId/db/:collectionName/:docId", verifyProject, async (req, res) => {
    try {
        const { projectId, collectionName, docId } = req.params;
        const docRef = db.collection(`projects/${projectId}/${collectionName}`).doc(docId);

        await docRef.delete();

        res.json({ success: true, id: docId });
    } catch (error) {
        console.error("API DELETE Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 處理 Base64 上傳到 Storage
apiApp.post("/api/project/:projectId/storage", verifyProject, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { fileName, fileBase64, contentType } = req.body;

        if (!fileName || !fileBase64) {
            return res.status(400).json({ error: "Missing fileName or fileBase64" });
        }

        // 移除 Data URI header e.g., "data:image/jpeg;base64,"
        const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        const bucket = admin.storage().bucket("lionbaker-vc.firebasestorage.app"); // 或使用預設 bucket
        const filePath = `user_uploads/${projectId}/${Date.now()}_${fileName}`;
        const file = bucket.file(filePath);

        await file.save(buffer, {
            metadata: {
                contentType: contentType || 'application/octet-stream',
            },
        });

        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        res.json({ success: true, url: publicUrl });
    } catch (error) {
        console.error("API Storage POST Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const axios = require("axios");

apiApp.post('/api/deploy', async (req, res) => {
    try {
        const { agentId, config } = req.body;

        if (!config || !config.cfAccountId || !config.cfApiToken || !config.lineToken || !config.lineSecret) {
            return res.status(400).json({ success: false, error: '缺少必要的設定參數 (Account ID, Token 或 LINE 憑證)' });
        }

        // 確保 Worker Name 符合 Cloudflare 規範 (小寫、英數、連結號)
        const workerName = `lionbaker-agent-${agentId}`.toLowerCase();

        // 1. 取得 Cloudflare Subdomain
        let subdomain = "";
        try {
            const subRes = await axios.get(
                `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/workers/subdomain`,
                {
                    headers: {
                        'Authorization': `Bearer ${config.cfApiToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            if (subRes.data.success) {
                subdomain = subRes.data.result.subdomain;
            }
        } catch (subErr) {
            console.error("無法取得 Cloudflare Subdomain:", subErr?.response?.data || subErr.message);
            // 如果拿不到 subdomain，可能是使用者還沒在 Cloudflare 設定過 workers.dev 網域
            return res.status(400).json({
                success: false,
                error: '無法取得您的 Cloudflare 子網域。請確保您已在 Cloudflare 控制台的 Workers & Pages 設定中啟用了 workers.dev 網域。'
            });
        }

        if (!subdomain) {
            return res.status(400).json({ success: false, error: '尚未設定 Cloudflare 子網域 (workers.dev subdomain)。' });
        }

        // 建立 Worker 腳本 (含 0ms 冷啟動與 Signature 驗證)
        const workerScript = `
        const LINE_TOKEN = "${config.lineToken}";
        const LINE_SECRET = "${config.lineSecret}";
        const SCRIPTS = ${JSON.stringify(config.scripts || [])};

        // 驗證 LINE Signature
        async function verifySignature(body, signature) {
            if (!signature || !body) return false;
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(LINE_SECRET),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const signatureBuffer = await crypto.subtle.sign(
                'HMAC',
                key,
                encoder.encode(body)
            );
            
            // Cloudflare Worker 的標準 btoa 實作
            const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
            
            return base64Signature === signature;
        }

        addEventListener('fetch', event => {
            event.respondWith(handleRequest(event.request));
        });

        async function handleRequest(request) {
            // LINE Verify 會發送 POST 請求，但有時我們需要檢查 GET 做為存活確認
            if (request.method === 'GET') {
                return new Response('LINE Bot is running! [Edge Mode]', { 
                    status: 200, 
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }

            if (request.method !== 'POST') {
                return new Response('Method Not Allowed', { status: 405 });
            }

            try {
                const signature = request.headers.get('x-line-signature');
                const bodyText = await request.text();
                
                // 如果是 LINE 的測試 Verify 請求，但簽章校驗失敗，仍應檢查是否為空事件
                // 但為了安全性，我們維持目前的校驗。通常 LINE Verify 會帶正確簽章。
                const isValid = await verifySignature(bodyText, signature);
                if (!isValid) {
                    return new Response('Invalid Signature', { status: 401 });
                }

                const data = JSON.parse(bodyText);
                const events = data.events || [];

                // 如果是空事件 (例如 LINE Webhook Verify)，直接回傳 200 OK
                if (events.length === 0) {
                    return new Response('OK', { status: 200 });
                }

                console.log("目前載入腳本總數: " + SCRIPTS.length);

                for (const event of events) {
                    if (event.type === 'message' && event.message.type === 'text') {
                        let userText = event.message.text.trim();
                        // 標準化：將全形中括號轉為半形，方便比對
                        const normalizedUserText = userText.replace(/［/g, '[').replace(/］/g, ']');
                        console.log("收到使用者訊息:", userText);
                        
                        // 尋找符合的腳本
                        const matchedScript = SCRIPTS.find(s => {
                            if (!s.trigger) return false;
                            // 同時支援全形與半形逗號分割
                            const triggers = s.trigger.split(/[，,]/).map(t => t.trim()).filter(Boolean);
                            return triggers.some(t => {
                                // 強化比對：檢查原始文字或標準化後的文字是否包含關鍵字
                                return userText.includes(t) || normalizedUserText.includes(t);
                            });
                        });
                        
                        console.log("比對結果:", matchedScript ? "有找到對應腳本 [" + matchedScript.title + "]" : "無設定腳本");
                        
                        if (matchedScript) {
                            let replyMessages = [];
                            
                            // 支援多組文字
                            if (Array.isArray(matchedScript.replyTexts) && matchedScript.replyTexts.length > 0) {
                                matchedScript.replyTexts.forEach(text => {
                                    if (text.trim()) replyMessages.push({ type: 'text', text: text.trim() });
                                });
                            } else if (matchedScript.reply) {
                                replyMessages.push({ type: 'text', text: matchedScript.reply });
                            }
                            
                            // 支援多張圖片
                            if (Array.isArray(matchedScript.replyImages) && matchedScript.replyImages.length > 0) {
                                matchedScript.replyImages.forEach(url => {
                                    if (url.trim()) replyMessages.push({
                                        type: 'image',
                                        originalContentUrl: url,
                                        previewImageUrl: url
                                    });
                                });
                            } else if (matchedScript.imageUrl) {
                                replyMessages.push({
                                    type: 'image',
                                    originalContentUrl: matchedScript.imageUrl,
                                    previewImageUrl: matchedScript.imageUrl
                                });
                            }

                            // LINE 限制每次最多 5 個對話泡泡
                            replyMessages = replyMessages.slice(0, 5);

                            if (replyMessages.length > 0) {
                                console.log("準備發送的訊息內容:", JSON.stringify(replyMessages));
                                const lineResponse = await fetch('https://api.line.me/v2/bot/message/reply', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': 'Bearer ' + LINE_TOKEN
                                    },
                                    body: JSON.stringify({
                                        replyToken: event.replyToken,
                                        messages: replyMessages
                                    })
                                });
                                
                                if (!lineResponse.ok) {
                                    const errorText = await lineResponse.text();
                                    console.error("LINE API 請求失敗:", lineResponse.status, errorText);
                                } else {
                                    console.log("LINE API 請求成功！");
                                }
                            }
                        }
                    }
                }

                return new Response('OK', { status: 200 });
            } catch (err) {
                console.error("Worker Error:", err);
                return new Response('Internal Error', { status: 200 }); // 強制回 200 避免 LINE 判定 Webhook 失效
            }
        }
        `;

        // 呼叫 Cloudflare API 部署 Worker
        const cfResponse = await axios.put(
            `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/workers/scripts/${workerName}`,
            workerScript,
            {
                headers: {
                    'Authorization': `Bearer ${config.cfApiToken}`,
                    'Content-Type': 'application/javascript'
                }
            }
        );

        if (cfResponse.data.success) {
            // 啟用 workers.dev 子網域路由 (初次部署時必須顯式開啟)
            try {
                await axios.post(
                    `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/workers/scripts/${workerName}/subdomain`,
                    { enabled: true },
                    {
                        headers: {
                            'Authorization': `Bearer ${config.cfApiToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
            } catch (envErr) {
                console.warn("無法啟用 Subdomain (可能已經啟用過):", envErr?.response?.data || envErr.message);
            }

            res.json({
                success: true,
                webhookUrl: `https://${workerName}.${subdomain}.workers.dev`
            });
        } else {
            res.json({ success: false, error: cfResponse.data.errors?.[0]?.message || '部署到 Cloudflare 失敗' });
        }

    } catch (error) {
        console.error('部署發生錯誤:', error?.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error?.response?.data?.errors?.[0]?.message || error.message
        });
    }
});

exports.api = onRequest(apiApp);

// -----------------------------
// AI落地師培訓班 報名系統（Callable Functions）
// -----------------------------

const VIBE_SESSIONS_COL = "vibe_sessions";
const VIBE_REGISTRATIONS_COL = "registrations_vibe";

exports.getVibeSessions = onCall(async (request) => {
    const { data, auth } = request;
    const isAuthed = !!auth?.uid;

    // 管理員：回傳全部場次（含關閉/額滿）
    // 一般使用者：只回傳 open 場次
    let isAdmin = false;
    if (isAuthed) {
        try {
            const u = await admin.auth().getUser(auth.uid);
            isAdmin = u?.email === ADMIN_EMAIL;
        } catch {
            isAdmin = false;
        }
    }

    const qs = db.collection(VIBE_SESSIONS_COL);
    // 注意：Firestore 的 where + orderBy 經常需要 Composite Index。
    // 一般使用者只需要 open 場次，因此避免在查詢層使用 orderBy（改由程式端排序），
    // 以免在「未登入 / 無痕」情境下因缺索引導致 500 進而前端抓不到場次。
    const snap = await (isAdmin
        ? qs.orderBy("date", "desc").get()
        : qs.where("status", "==", "open").get()
    );

    let sessions = snap.docs.map((d) => {
        const s = d.data() || {};
        return {
            ...s,
            // 注意：舊資料可能在文件內也有存 `id` 欄位，會覆蓋掉文件 ID。
            // 後台/前台必須以「文件 ID」當作 sessionId 才能正確關聯 registrations_vibe。
            id: d.id,
            date: toIso(s.date),
            endDate: toIso(s.endDate),
            createdAt: toIso(s.createdAt),
            updatedAt: toIso(s.updatedAt),
            // 防呆：確保數字欄位
            price: typeof s.price === "number" ? s.price : Number(s.price || 0),
            originalPrice: typeof s.originalPrice === "number" ? s.originalPrice : Number(s.originalPrice || 0),
            maxCapacity: typeof s.maxCapacity === "number" ? s.maxCapacity : Number(s.maxCapacity || 0),
            currentCount: typeof s.currentCount === "number" ? s.currentCount : Number(s.currentCount || 0),
        };
    });

    // 一般使用者：程式端依日期由近到遠排序（用 toIso 後的字串即可比較）
    if (!isAdmin) {
        sessions = sessions
            .filter((s) => (s.status || "open") === "open")
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    }

    // SignupAdmin 會傳 userId，但我們不依賴它，避免被偽造
    void data;
    return { sessions };
});

exports.createVibeSession = onCall(async (request) => {
    await assertAdmin(request);
    const data = request.data || {};

    if (!data.title || !data.date) {
        throw new HttpsError("invalid-argument", "缺少必要欄位（title、date）。");
    }

    const payload = {
        title: String(data.title),
        date: String(data.date),
        endDate: data.endDate ? String(data.endDate) : null,
        endTime: data.endTime ? String(data.endTime) : "",
        location: data.location ? String(data.location) : "",
        address: data.address ? String(data.address) : "",
        note: data.note ? String(data.note) : "",
        status: data.status ? String(data.status) : "open",
        price: Number(data.price || 0),
        originalPrice: Number(data.originalPrice || 0),
        maxCapacity: Number(data.maxCapacity || 0),
        currentCount: Number(data.currentCount || 0),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection(VIBE_SESSIONS_COL).add(payload);
    return { id: ref.id };
});

exports.updateVibeSession = onCall(async (request) => {
    await assertAdmin(request);
    const { sessionId, updates } = request.data || {};
    if (!sessionId || !updates || typeof updates !== "object") {
        throw new HttpsError("invalid-argument", "缺少 sessionId 或 updates。");
    }

    const safeUpdates = { ...updates };
    // 避免外部竄改 server timestamp 欄位
    delete safeUpdates.createdAt;
    safeUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    // 常用數字欄位做型別收斂
    if (safeUpdates.price != null) safeUpdates.price = Number(safeUpdates.price);
    if (safeUpdates.originalPrice != null) safeUpdates.originalPrice = Number(safeUpdates.originalPrice);
    if (safeUpdates.maxCapacity != null) safeUpdates.maxCapacity = Number(safeUpdates.maxCapacity);
    if (safeUpdates.currentCount != null) safeUpdates.currentCount = Number(safeUpdates.currentCount);

    await db.collection(VIBE_SESSIONS_COL).doc(String(sessionId)).set(safeUpdates, { merge: true });
    return { success: true };
});

exports.getVibeRegistrations = onCall(async (request) => {
    assertAuthenticated(request);
    const { sessionId, fallbackToAll } = request.data || {};
    if (!sessionId) throw new HttpsError("invalid-argument", "缺少 sessionId。");

    const q = db
        .collection(VIBE_REGISTRATIONS_COL)
        .where("sessionId", "==", String(sessionId))
        .orderBy("createdAt", "desc");

    const snap = await q.get().catch(async () => {
        // 若缺 index，退回不排序（避免整頁掛掉）
        return await db.collection(VIBE_REGISTRATIONS_COL).where("sessionId", "==", String(sessionId)).get();
    });

    let registrations = snap.docs.map((d) => {
        const r = d.data() || {};
        return {
            id: d.id,
            ...r,
            createdAt: toIso(r.createdAt),
            updatedAt: toIso(r.updatedAt),
            count: typeof r.count === "number" ? r.count : Number(r.count || 1),
            receivedAmount: typeof r.receivedAmount === "number" ? r.receivedAmount : Number(r.receivedAmount || 0),
        };
    });

    // 舊資料可能沒有 sessionId，後台會「看得到資料但查不到」。
    // 當明確指定 fallbackToAll=true 且查不到任何資料時，先回傳最近 N 筆，避免管理頁空白。
    let mode = "by_session";
    if (registrations.length === 0 && fallbackToAll === true) {
        mode = "fallback_all_recent";
        const limitN = 300;
        const allSnap = await db
            .collection(VIBE_REGISTRATIONS_COL)
            .orderBy("createdAt", "desc")
            .limit(limitN)
            .get()
            .catch(async () => {
                return await db.collection(VIBE_REGISTRATIONS_COL).limit(limitN).get();
            });

        registrations = allSnap.docs.map((d) => {
            const r = d.data() || {};
            return {
                id: d.id,
                ...r,
                createdAt: toIso(r.createdAt),
                updatedAt: toIso(r.updatedAt),
                count: typeof r.count === "number" ? r.count : Number(r.count || 1),
                receivedAmount: typeof r.receivedAmount === "number" ? r.receivedAmount : Number(r.receivedAmount || 0),
            };
        });
    }

    return { registrations, mode };
});

exports.updateVibeRegistration = onCall(async (request) => {
    assertAuthenticated(request);
    const { registrationId, updates } = request.data || {};
    if (!registrationId || !updates || typeof updates !== "object") {
        throw new HttpsError("invalid-argument", "缺少 registrationId 或 updates。");
    }

    const safeUpdates = { ...updates };
    delete safeUpdates.createdAt;
    safeUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    if (safeUpdates.count != null) safeUpdates.count = Number(safeUpdates.count);
    if (safeUpdates.receivedAmount != null) safeUpdates.receivedAmount = Number(safeUpdates.receivedAmount);

    await db.collection(VIBE_REGISTRATIONS_COL).doc(String(registrationId)).set(safeUpdates, { merge: true });
    return { success: true };
});

exports.deleteVibeRegistration = onCall(async (request) => {
    await assertAdmin(request);
    const { registrationId } = request.data || {};
    if (!registrationId) throw new HttpsError("invalid-argument", "缺少 registrationId。");
    await db.collection(VIBE_REGISTRATIONS_COL).doc(String(registrationId)).delete();
    return { success: true };
});

exports.renderSandbox = onRequest(async (req, res) => {
    try {
        // e.g., /u/lawrence/my-project
        const pathParts = req.path.split('/').filter(Boolean);

        // Ensure path starts with 'u' and has at least userId and projectId
        if (pathParts[0] !== 'u' || pathParts.length < 3) {
            return res.status(404).send("<h1>無效的連結</h1><p>請檢查您的專案網址格式是否正確。</p>");
        }

        const userId = pathParts[1];
        const projectId = pathParts[2];

        let projectData = null;
        let refProjectId = projectId; // 記錄真實的 document ID，傳給 meta tag

        // 1. Try fetching by ID first
        const docRef = db.collection('projects').doc(projectId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            projectData = docSnap.data();
            refProjectId = docSnap.id;
        } else {
            // 2. Fallback to querying by projectAlias
            const pQuery = await db.collection('projects').where('projectAlias', '==', projectId).get();
            if (!pQuery.empty) {
                // find the one that matches userId or userAlias
                const docSnap = pQuery.docs.find(d => d.data().userId === userId || d.data().userAlias === userId) || pQuery.docs[0];
                projectData = docSnap.data();
                refProjectId = docSnap.id;
            }
        }

        if (!projectData || !projectData.htmlCode) {
            return res.status(404).send("<h1>找不到專案</h1><p>專案可能已被移除，或尚未生成程式碼。</p>");
        }

        // 瀏覽器短快取；CDN 邊緣較長（同一網址＋同一 ?t= 才命中）。更新內容請改 ?t= 時間戳 bust。
        res.set("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=86400");

        let htmlResponse = projectData.htmlCode;

        // 移除 AI 產生的舊 meta tag (避免 querySelector 取到錯誤的假資料)
        htmlResponse = htmlResponse.replace(/<meta\s+name=["']x-project-id["'].*?>/gi, '');

        // 修正大型圖片被 Facebook 放棄抓取的問題
        // 順便注入 projectId 給前端 javascript 調用 API
        if (htmlResponse.includes('<meta property="og:image"')) {
            htmlResponse = htmlResponse.replace('</head>', `
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:type" content="website" />
    <meta name="x-project-id" content="${refProjectId}" />
</head>`);
        } else {
            // 若沒有 og:image，也強制注入 meta id
            htmlResponse = htmlResponse.replace('</head>', `
    <meta name="x-project-id" content="${refProjectId}" />
</head>`);
        }

        // Return full HTML string
        res.status(200).send(htmlResponse);
    } catch (e) {
        console.error("renderSandbox Error", e);
        res.status(500).send("<h1>系統發生錯誤</h1><p>無法載入此專案，請稍後再試。</p>");
    }
});
