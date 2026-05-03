const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { defineSecret, defineString } = require("firebase-functions/params");
const { Resend } = require("resend");

admin.initializeApp();
const db = admin.firestore();

const ADMIN_EMAIL = "charge0528@gmail.com";

/** Resend API Key（部署後請設定 secrets） */
const resendApiKey = defineSecret("RESEND_API_KEY");
/** 用於「確認出席」連結 HMAC，請勿外洩 */
const attendanceConfirmSecret = defineSecret("ATTENDANCE_CONFIRM_SECRET");
// Resend：from 必須為 ASCII；需為已在 Resend 驗證過的網域（見 defineString 預設）
const resendFromEmail = defineString("RESEND_FROM_EMAIL", {
    default: "LionBaker <noreply@mail.lionbaker.com>",
});
const vibePublicOrigin = defineString("VIBE_PUBLIC_ORIGIN", {
    default: "https://ai.lionbaker.com",
});

/** Resend API 免費／測試檔常為每秒 2 封；批次循環須間隔以免 429 */
const RESEND_BATCH_MIN_INTERVAL_MS = 550;

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

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

/** 與公開報名頁 `signupLandingShared` 之母親節活動 slug 對齊 */
const VIBE_ACTIVITY_LUCKY_DRAW_ENTRIES_COL = "vibe_activity_lucky_draw_entries";
/** 由 Callable 原子寫入，避免並發重複；客戶端不可寫 */
const VIBE_ACTIVITY_LUCKY_DRAW_DEDUPE_COL = "vibe_activity_lucky_draw_dedupe";
const MOTHERS_DAY_2026_CAMPAIGN_ID = "mothers_day_2026";
/** 抽獎登記日起算，折扣碼有效天數（Firestore 寫入 discountExpiresAt） */
const MOTHERS_DAY_DISCOUNT_VALID_MS = 30 * 24 * 60 * 60 * 1000;
/** 母親節抽獎折扣碼用於正課報名折抵（須與前台 Signup 顯示一致） */
const MOTHERS_DAY_COURSE_DISCOUNT_NTD = 100;

function mothersDayDiscountExpiresAtFromRegistration(registrationTimeMs) {
    return admin.firestore.Timestamp.fromMillis(Number(registrationTimeMs) + MOTHERS_DAY_DISCOUNT_VALID_MS);
}

async function findExistingMothersDay2026Entry(phoneNorm, emailNorm) {
    const col = db.collection(VIBE_ACTIVITY_LUCKY_DRAW_ENTRIES_COL);
    const camp = MOTHERS_DAY_2026_CAMPAIGN_ID;
    const qPhone = await col.where("campaign", "==", camp).where("phone", "==", phoneNorm).limit(1).get();
    if (!qPhone.empty) return qPhone.docs[0];
    const qEmail = await col.where("campaign", "==", camp).where("emailNormalized", "==", emailNorm).limit(1).get();
    if (!qEmail.empty) return qEmail.docs[0];
    return null;
}

/**
 * 舊資料可能無 discountCode／discountExpiresAt：補寫入並確保 dedupe 鎖。
 */
async function ensureMothersDayEntryDiscountAndExpiry(entryDoc) {
    const ref = entryDoc.ref;
    let snap = await ref.get();
    let data = snap.data() || {};
    const createdMs = data.createdAt?.toMillis?.() ?? Date.now();
    const defaultExpiry = mothersDayDiscountExpiresAtFromRegistration(createdMs);

    if (data.discountCode && data.discountExpiresAt) {
        return snap;
    }

    if (data.discountCode && !data.discountExpiresAt) {
        await ref.update({ discountExpiresAt: defaultExpiry });
        return ref.get();
    }

    const dedupeCol = db.collection(VIBE_ACTIVITY_LUCKY_DRAW_DEDUPE_COL);
    const entryId = ref.id;

    for (let attempt = 0; attempt < 16; attempt++) {
        const candidateCode = randomAlphanumericDiscountCode8();
        const discountLockRef = dedupeCol.doc(`${MOTHERS_DAY_2026_CAMPAIGN_ID}__discount__${candidateCode}`);
        try {
            await db.runTransaction(async (tx) => {
                const fresh = await tx.get(ref);
                const fd = fresh.data() || {};
                if (fd.discountCode) {
                    return;
                }
                const ls = await tx.get(discountLockRef);
                if (ls.exists) {
                    throw new Error("discount_collision");
                }
                const exp =
                    fd.discountExpiresAt ||
                    mothersDayDiscountExpiresAtFromRegistration(fd.createdAt?.toMillis?.() ?? createdMs);
                tx.set(discountLockRef, {
                    campaign: MOTHERS_DAY_2026_CAMPAIGN_ID,
                    entryId,
                    discountCode: candidateCode,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                tx.update(ref, {
                    discountCode: candidateCode,
                    discountExpiresAt: exp,
                });
            });
            const after = await ref.get();
            const ad = after.data() || {};
            if (ad.discountCode) return after;
        } catch (e) {
            if (e instanceof Error && e.message === "discount_collision") {
                continue;
            }
            throw e;
        }
    }
    throw new HttpsError("unknown", "系統忙碌，請稍後再試。");
}

function discountExpiresIsoFromDoc(data) {
    const ts = data?.discountExpiresAt;
    if (ts?.toDate) return ts.toDate().toISOString();
    const createdMs = data?.createdAt?.toMillis?.() ?? Date.now();
    return new Date(createdMs + MOTHERS_DAY_DISCOUNT_VALID_MS).toISOString();
}

/** 台灣時區：折扣碼截止時間文字（登記日起算 30 日） */
function formatMothersDayDiscountExpiryZhTWFromIso(isoOrMillis) {
    const ms =
        typeof isoOrMillis === "string"
            ? Date.parse(isoOrMillis)
            : Number(isoOrMillis);
    const d = new Date(Number.isFinite(ms) ? ms : Date.now());
    return d.toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

/**
 * 依 Firestore 登記文件寄送母親節抽獎確認／重寄信（variant：resend | already_registered）。
 */
async function sendMothersDayLuckyDrawEmailFromDocData(resendApiKeyVal, d, emailDisp, phoneNorm, variant) {
    const discountCode = String(d.discountCode || "");
    if (!discountCode) {
        return;
    }
    const discountExpiresAtIso = discountExpiresIsoFromDoc(d);
    const origin = vibePublicOrigin.value().replace(/\/$/, "");
    const from = resendFromEmail.value();
    const isResend = variant === "resend";
    const html = buildMothersDayLuckyDrawConfirmationEmailHtml({
        origin,
        name: String(d.name || "").trim() || "—",
        email: emailDisp,
        phone: phoneNorm,
        referralCode: String(d.referralCode || ""),
        referrerSnapshot: String(d.referrerSnapshot || "").trim().slice(0, 80),
        prizeSummary: String(d.prizeSummary || ""),
        drawAnnouncementNote: String(d.drawAnnouncementNote || ""),
        discountCode,
        discountExpiryLabel: formatMothersDayDiscountExpiryZhTWFromIso(discountExpiresAtIso),
        emailHeadline: isResend ? "確認信重寄" : "您已登記母親節抽獎",
        emailBadgeLabel: isResend ? "母親節限定｜抽獎確認信" : "母親節限定｜抽獎登記提醒",
        emailLeadParagraph: isResend
            ? "您申請重寄本信。以下為您先前登記的抽獎資料與專屬折扣碼（折扣碼限登記日起 30 日內使用）。"
            : "您先前已完成抽獎登記。以下再次附上折扣碼與登記摘要（折扣碼限登記日起 30 日內使用）。",
    });
    const subject = isResend
        ? `【母親節抽獎】確認信重寄｜您的專屬折扣碼 ${discountCode}`
        : `【母親節抽獎】登記紀錄提醒｜您的專屬折扣碼 ${discountCode}`;
    const resend = new Resend(resendApiKeyVal);
    const { error } = await resend.emails.send({
        from,
        to: emailDisp,
        subject,
        html,
    });
    if (error) {
        throw new Error(error.message || "Resend 寄送失敗");
    }
}

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
            refresherMaxCapacity:
                typeof s.refresherMaxCapacity === "number" ? s.refresherMaxCapacity : Number(s.refresherMaxCapacity || 0),
            refresherCurrentCount:
                typeof s.refresherCurrentCount === "number" ? s.refresherCurrentCount : Number(s.refresherCurrentCount || 0),
        };
    });

    // 一般使用者：程式端依日期由近到遠排序（用 toIso 後的字串即可比較）
    if (!isAdmin) {
        sessions = sessions
            .filter((s) => (s.status || "open") === "open" && s.isSignupOpen !== false)
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    }

    // SignupAdmin 會傳 userId，但我們不依賴它，避免被偽造
    void data;
    return { sessions };
});

/**
 * 公開：複訓「前次參加場次」專用——僅回傳 isSignupOpen === false 的歷史場次（關閉報名＝可視為已結束受理）。
 * 不須登入。若舊文件未帶 isSignupOpen，視同開放報名，不會出現在此列表。
 */
const mapVibeSessionDoc = (d) => {
    const s = d.data() || {};
    return {
        ...s,
        id: d.id,
        date: toIso(s.date),
        endDate: toIso(s.endDate),
        createdAt: toIso(s.createdAt),
        updatedAt: toIso(s.updatedAt),
        price: typeof s.price === "number" ? s.price : Number(s.price || 0),
        originalPrice: typeof s.originalPrice === "number" ? s.originalPrice : Number(s.originalPrice || 0),
        maxCapacity: typeof s.maxCapacity === "number" ? s.maxCapacity : Number(s.maxCapacity || 0),
        currentCount: typeof s.currentCount === "number" ? s.currentCount : Number(s.currentCount || 0),
        refresherMaxCapacity:
            typeof s.refresherMaxCapacity === "number" ? s.refresherMaxCapacity : Number(s.refresherMaxCapacity || 0),
        refresherCurrentCount:
            typeof s.refresherCurrentCount === "number" ? s.refresherCurrentCount : Number(s.refresherCurrentCount || 0),
    };
};

exports.getVibeClosedSessionsForRefresher = onCall(async (request) => {
    void request;
    const maxDocs = 500;
    const snap = await db.collection(VIBE_SESSIONS_COL).limit(maxDocs).get();
    const closed = snap.docs
        .map((d) => mapVibeSessionDoc(d))
        .filter((s) => s.isSignupOpen === false);
    closed.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return { sessions: closed };
});

/**
 * 報名頁專用：同場次內，若 Email 或手機任其一與「非已取消」的既有報名相同，則不可再送出一筆。
 * 不須登入。客戶端無法 list 查重，改由此 Callable 讀取 Admin 權限。
 */
exports.checkVibeRegistrationDuplicate = onCall(async (request) => {
    const { sessionId, email, phone } = request.data || {};
    if (sessionId == null || String(sessionId).length === 0) {
        throw new HttpsError("invalid-argument", "缺少 sessionId。");
    }
    if (email == null || phone == null) {
        throw new HttpsError("invalid-argument", "缺少 email 或 phone。");
    }
    const emailNorm = String(email).trim().toLowerCase();
    const phoneNorm = String(phone).replace(/\D/g, "");
    if (!emailNorm || !/^09\d{8}$/.test(phoneNorm)) {
        throw new HttpsError("invalid-argument", "參數格式不正確。");
    }

    const sid = String(sessionId);
    const snap = await db.collection(VIBE_REGISTRATIONS_COL).where("sessionId", "==", sid).get();

    for (const d of snap.docs) {
        const r = d.data() || {};
        if (String(r.status || "pending") === "cancelled") {
            continue;
        }
        const re = String(r.email || "")
            .trim()
            .toLowerCase();
        const rp = String(r.phone || "").replace(/\D/g, "");
        if (re === emailNorm || rp === phoneNorm) {
            return { duplicate: true };
        }
    }
    return { duplicate: false };
});

/**
 * 母親節抽獎：每人限乙次；同一 Campaign 下同手機或同 Email（不分大小寫）即視為重複，
 * 不論來自哪一組推薦碼。以交易寫入本體紀錄 + 去鎖鑰以避免並發。
 * 成功後系統產生 8 碼英數字折扣碼、寄送確認信（含海報圖與登記資料）。
 * 折扣碼於登記日起 30 日內有效（discountExpiresAt）。
 * 若已登記：回傳 alreadyRegistered（不拋錯），並可透過 resendMothersDay2026LuckyDrawEmail 重寄信。
 */
exports.submitMothersDay2026LuckyDrawEntry = onCall(
    { secrets: [resendApiKey] },
    async (request) => {
        const raw = request.data || {};
        const name = String(raw.name || "").trim();
        const emailDisp = String(raw.email || "").trim();
        const emailNorm = emailDisp.toLowerCase();
        const phoneNorm = String(raw.phone || "").replace(/\D/g, "");
        const referralCode = String(raw.referralCode || "").trim();
        const referrerSnapshot = String(raw.referrerSnapshot || "").trim().slice(0, 80);
        const prizeSummary = String(raw.prizeSummary || "").trim().slice(0, 500);
        const drawAnnouncementNote = String(raw.drawAnnouncementNote || "").trim().slice(0, 200);
        const lineUserIdRaw = raw.lineUserId != null ? String(raw.lineUserId).trim().slice(0, 128) : "";
        /** LIFF profile.userId：僅長度／不可見字元過濾，避免過度限制格式 */
        let lineUserIdOut = "";
        if (lineUserIdRaw.length > 0 && lineUserIdRaw.length <= 128 && !/[\x00-\x08\x0b\f\r\x0e-\x1f\n]/.test(lineUserIdRaw)) {
            lineUserIdOut = lineUserIdRaw;
        }

        if (!name || name.length > 80) {
            throw new HttpsError("invalid-argument", "請填寫姓名（至多 80 字）。");
        }
        if (emailDisp.length < 5 || emailDisp.length > 120 || emailNorm.length < 5) {
            throw new HttpsError("invalid-argument", "請填寫有效的 Email。");
        }
        if (!/^09\d{8}$/.test(phoneNorm)) {
            throw new HttpsError("invalid-argument", "請填寫 09 開頭的 10 碼手機。");
        }
        if (!/^[A-Za-z0-9]{8}$/.test(referralCode)) {
            throw new HttpsError("invalid-argument", "推薦代碼格式不正確（須為 8 碼英數字）。");
        }

        const dupMsg =
            "此手機號碼或 Email 已成功登記過母親節抽獎，每人限乙次（不分推薦連結）。";

        const existingEarly = await findExistingMothersDay2026Entry(phoneNorm, emailNorm);
        if (existingEarly) {
            const snap = await ensureMothersDayEntryDiscountAndExpiry(existingEarly);
            const d = snap.data() || {};
            try {
                await sendMothersDayLuckyDrawEmailFromDocData(
                    resendApiKey.value(),
                    d,
                    emailDisp,
                    phoneNorm,
                    "already_registered"
                );
            } catch (mailErr) {
                console.error("submitMothersDay2026LuckyDrawEntry alreadyRegistered email", mailErr);
            }
            return {
                ok: false,
                alreadyRegistered: true,
                discountCode: String(d.discountCode || ""),
                discountExpiresAt: discountExpiresIsoFromDoc(d),
                message: "您已參加過母親節抽獎活動",
            };
        }

        const entriesCol = db.collection(VIBE_ACTIVITY_LUCKY_DRAW_ENTRIES_COL);
        const dedupeCol = db.collection(VIBE_ACTIVITY_LUCKY_DRAW_DEDUPE_COL);
        const lockPhoneRef = dedupeCol.doc(`${MOTHERS_DAY_2026_CAMPAIGN_ID}__phone__${phoneNorm}`);
        const lockEmailRef = dedupeCol.doc(
            `${MOTHERS_DAY_2026_CAMPAIGN_ID}__email__${crypto.createHash("sha256").update(emailNorm, "utf8").digest("hex")}`
        );

        const lockFieldsBase = {
            campaign: MOTHERS_DAY_2026_CAMPAIGN_ID,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        let entryId = "";
        let discountCode = "";
        const registeredAtApproxMs = Date.now();

        /** 不在 transaction 回呼內拋 HttpsError（避免部分環境吞錯） */
        try {
            const maxDiscountAttempts = 16;
            let committed = false;
            for (let attempt = 0; attempt < maxDiscountAttempts && !committed; attempt++) {
                const candidateCode = randomAlphanumericDiscountCode8();
                const entryRef = entriesCol.doc();
                const eid = entryRef.id;
                const discountLockRef = dedupeCol.doc(`${MOTHERS_DAY_2026_CAMPAIGN_ID}__discount__${candidateCode}`);

                const payload = {
                    campaign: MOTHERS_DAY_2026_CAMPAIGN_ID,
                    name,
                    email: emailDisp,
                    emailNormalized: emailNorm,
                    phone: phoneNorm,
                    referralCode,
                    referrerSnapshot,
                    prizeSummary,
                    drawAnnouncementNote,
                    commentOnPostRequired: raw.commentOnPostRequired !== false,
                    lineUserId: lineUserIdOut,
                    discountCode: candidateCode,
                    discountExpiresAt: mothersDayDiscountExpiresAtFromRegistration(registeredAtApproxMs),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: "submitted",
                };

                const lockFields = { ...lockFieldsBase, entryId: eid };

                const txOutcome = await db.runTransaction(async (tx) => {
                    const [lsP, lsE, lsD] = await Promise.all([
                        tx.get(lockPhoneRef),
                        tx.get(lockEmailRef),
                        tx.get(discountLockRef),
                    ]);
                    if (lsP.exists || lsE.exists) {
                        return "duplicate_lock";
                    }
                    if (lsD.exists) {
                        return "discount_collision";
                    }
                    tx.set(lockPhoneRef, { ...lockFields, phone: phoneNorm });
                    tx.set(lockEmailRef, { ...lockFields, emailNormalized: emailNorm });
                    tx.set(discountLockRef, { ...lockFields, discountCode: candidateCode });
                    tx.set(entryRef, payload);
                    return "ok";
                });

                if (txOutcome === "duplicate_lock") {
                    const ex = await findExistingMothersDay2026Entry(phoneNorm, emailNorm);
                    if (ex) {
                        const snap = await ensureMothersDayEntryDiscountAndExpiry(ex);
                        const d = snap.data() || {};
                        try {
                            await sendMothersDayLuckyDrawEmailFromDocData(
                                resendApiKey.value(),
                                d,
                                emailDisp,
                                phoneNorm,
                                "already_registered"
                            );
                        } catch (mailErr) {
                            console.error("submitMothersDay2026LuckyDrawEntry duplicateLock email", mailErr);
                        }
                        return {
                            ok: false,
                            alreadyRegistered: true,
                            discountCode: String(d.discountCode || ""),
                            discountExpiresAt: discountExpiresIsoFromDoc(d),
                            message: "您已參加過母親節抽獎活動",
                        };
                    }
                    throw new HttpsError("already-exists", dupMsg);
                }
                if (txOutcome === "discount_collision") {
                    continue;
                }
                if (txOutcome === "ok") {
                    entryId = eid;
                    discountCode = candidateCode;
                    committed = true;
                }
            }
            if (!committed || !discountCode) {
                throw new HttpsError("unknown", "系統忙碌，請稍後再試。");
            }
        } catch (e) {
            if (e instanceof HttpsError) {
                throw e;
            }
            console.error("submitMothersDay2026LuckyDrawEntry txn", e);
            throw new HttpsError("unknown", "系統忙碌，請稍後再試。");
        }

        const discountExpiresAtIso = new Date(
            registeredAtApproxMs + MOTHERS_DAY_DISCOUNT_VALID_MS
        ).toISOString();
        const origin = vibePublicOrigin.value().replace(/\/$/, "");
        const from = resendFromEmail.value();
        const html = buildMothersDayLuckyDrawConfirmationEmailHtml({
            origin,
            name,
            email: emailDisp,
            phone: phoneNorm,
            referralCode,
            referrerSnapshot,
            prizeSummary,
            drawAnnouncementNote,
            discountCode,
            discountExpiryLabel: formatMothersDayDiscountExpiryZhTWFromIso(discountExpiresAtIso),
            emailHeadline: "登記已成功",
            emailBadgeLabel: "母親節限定｜抽獎登記成功",
        });
        const subject = `【母親節抽獎】登記成功｜您的專屬折扣碼 ${discountCode}`;

        try {
            const resend = new Resend(resendApiKey.value());
            const { error } = await resend.emails.send({
                from,
                to: emailDisp,
                subject,
                html,
            });
            if (error) {
                console.error("submitMothersDay2026LuckyDrawEntry resend", error);
            }
        } catch (mailErr) {
            console.error("submitMothersDay2026LuckyDrawEntry email", mailErr);
        }

        return {
            ok: true,
            id: entryId,
            discountCode,
            discountExpiresAt: discountExpiresAtIso,
        };
    }
);

/**
 * 公開：依登記時相同的手機 + Email 重寄母親節抽獎確認信（含海報與折扣碼）。
 */
exports.resendMothersDay2026LuckyDrawEmail = onCall(
    { secrets: [resendApiKey] },
    async (request) => {
        const raw = request.data || {};
        const emailDisp = String(raw.email || "").trim();
        const emailNorm = emailDisp.toLowerCase();
        const phoneNorm = String(raw.phone || "").replace(/\D/g, "");

        if (emailDisp.length < 5 || emailDisp.length > 120 || emailNorm.length < 5) {
            throw new HttpsError("invalid-argument", "請填寫有效的 Email。");
        }
        if (!/^09\d{8}$/.test(phoneNorm)) {
            throw new HttpsError("invalid-argument", "請填寫 09 開頭的 10 碼手機。");
        }

        const doc = await findExistingMothersDay2026Entry(phoneNorm, emailNorm);
        if (!doc) {
            throw new HttpsError(
                "not-found",
                "查無符合的抽獎登記，請確認手機與 Email 與當初登記時一致。"
            );
        }

        const snap = await ensureMothersDayEntryDiscountAndExpiry(doc);
        const d = snap.data() || {};
        const pNorm = String(d.phone || "").replace(/\D/g, "");
        const em = String(d.email || "").trim().toLowerCase();
        if (pNorm !== phoneNorm || em !== emailNorm) {
            throw new HttpsError("permission-denied", "手機或 Email 與登記資料不符。");
        }

        const discountCode = String(d.discountCode || "");
        if (!discountCode) {
            throw new HttpsError("failed-precondition", "無法取得折扣碼，請稍後再試。");
        }

        const discountExpiresAtIso = discountExpiresIsoFromDoc(d);

        try {
            await sendMothersDayLuckyDrawEmailFromDocData(
                resendApiKey.value(),
                d,
                emailDisp,
                phoneNorm,
                "resend"
            );
        } catch (e) {
            console.error("resendMothersDay2026LuckyDrawEmail", e);
            throw new HttpsError("internal", e.message || String(e));
        }

        return { ok: true, discountExpiresAt: discountExpiresAtIso };
    }
);

/** 報名頁 `signup_page_settings/default` 海報 → 絕對網址（與前台 resolvePoster 行為一致） */
async function getSignupPosterAbsoluteUrl() {
    const origin = vibePublicOrigin.value().replace(/\/$/, "");
    const snap = await db.collection("signup_page_settings").doc("default").get();
    const raw = snap.exists ? String(snap.data()?.posterImageUrl || "").trim() : "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return raw;
    }
    const p = raw.startsWith("/") ? raw : `/${raw || "S__158801977.jpg"}`;
    return `${origin}${p}`;
}

function buildVibeRegistrationConfirmationEmailHtml(opts) {
    const esc = escapeHtml;
    const {
        posterSrc,
        participantName,
        sessionTitle,
        sessionWhenText,
        locationLine,
        sessionNote,
        feeLine,
        paymentBlockHtml,
        extraNote,
    } = opts;
    const noteBlock = sessionNote
        ? `<p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">${esc(sessionNote)}</p>`
        : "";
    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;">
<tr><td style="text-align:center;padding:0 0 16px;">
<span style="display:inline-block;border:1px solid rgba(34,211,238,0.4);background:rgba(14,165,233,0.12);color:#7dd3fc;font-size:11px;font-weight:800;letter-spacing:0.08em;padding:8px 16px;border-radius:999px;">AI落地師培訓班｜報名通知</span>
<h1 style="margin:16px 0 8px;font-size:22px;font-weight:900;color:#ffffff;line-height:1.35;">恭喜報名成功</h1>
<p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.65;">${esc(extraNote)}</p>
</td></tr>
<tr><td style="padding:0 0 16px;text-align:center;">
<img src="${esc(posterSrc)}" alt="課程海報" width="520" style="max-width:100%;height:auto;display:block;border-radius:16px;border:1px solid rgba(255,255,255,0.12);"/>
</td></tr>
<tr><td style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:20px;">
<h2 style="margin:0 0 12px;font-size:15px;font-weight:800;color:#38bdf8;">課程／場次</h2>
<p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#fff;">${esc(sessionTitle)}</p>
<p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.55;">${esc(sessionWhenText)}</p>
<p style="margin:10px 0 0;font-size:14px;color:#cbd5e1;line-height:1.55;">${esc(locationLine)}</p>
${noteBlock}
</td></tr>
<tr><td style="height:14px;"></td></tr>
<tr><td style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:20px;">
<h2 style="margin:0 0 12px;font-size:15px;font-weight:800;color:#a5b4fc;">報名資料</h2>
<p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.65;"><strong style="color:#94a3b8;">姓名</strong>　${esc(participantName)}</p>
<p style="margin:10px 0 0;font-size:14px;color:#e2e8f0;"><strong style="color:#94a3b8;">應繳費用</strong>　${esc(feeLine)}</p>
</td></tr>
<tr><td style="height:14px;"></td></tr>
<tr><td style="background:rgba(15,23,42,0.9);border:1px solid rgba(52,211,153,0.25);border-radius:18px;padding:20px;">
<h2 style="margin:0 0 12px;font-size:15px;font-weight:800;color:#6ee7b7;">付款說明</h2>
<div style="font-size:14px;color:#e2e8f0;line-height:1.65;">${paymentBlockHtml}</div>
</td></tr>
<tr><td style="padding:22px 8px 8px;text-align:center;font-size:11px;color:#64748b;line-height:1.55;">此信由系統自動發送。如有疑問請透過官方管道聯繫主辦。</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

/**
 * 公開：驗證母親節抽獎折扣碼（僅查詢，用於報名頁帶入資料與折價顯示）。
 */
exports.verifyMothersDayDiscountForCourseSignup = onCall(async (request) => {
    const raw = String(request.data?.discountCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (raw.length !== 8) {
        throw new HttpsError("invalid-argument", "折扣碼須為 8 碼英數字。");
    }
    const q = await db
        .collection(VIBE_ACTIVITY_LUCKY_DRAW_ENTRIES_COL)
        .where("campaign", "==", MOTHERS_DAY_2026_CAMPAIGN_ID)
        .where("discountCode", "==", raw)
        .limit(1)
        .get();
    if (q.empty) {
        throw new HttpsError("not-found", "查無此折扣碼，請確認母親節抽獎登記紀錄。");
    }
    const doc = q.docs[0];
    const d = doc.data() || {};
    const expMs = d.discountExpiresAt?.toMillis?.() ?? 0;
    if (expMs > 0 && expMs < Date.now()) {
        throw new HttpsError("failed-precondition", "此折扣碼已超過使用期限（登記日起算 30 日）。");
    }
    if (d.courseDiscountRedeemedAt != null) {
        throw new HttpsError("failed-precondition", "此折扣碼已用於課程報名。");
    }
    const phoneNorm = String(d.phone || "").replace(/\D/g, "");
    const emailDisp = String(d.email || "").trim();
    return {
        ok: true,
        lotteryEntryId: doc.id,
        discountCode: raw,
        discountAmountNtd: MOTHERS_DAY_COURSE_DISCOUNT_NTD,
        name: String(d.name || "").trim(),
        email: emailDisp,
        phone: phoneNorm,
    };
});

/**
 * 公開：正課報名建立後核銷母親節折扣碼（須與抽獎登記姓名／手機／Email 一致）。
 */
exports.redeemMothersDayCourseDiscount = onCall(async (request) => {
    const raw = request.data || {};
    const lotteryEntryId = String(raw.lotteryEntryId || "").trim();
    const discountCode = String(raw.discountCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const registrationId = String(raw.registrationId || "").trim();
    const emailDisp = String(raw.email || "").trim();
    const emailNorm = emailDisp.toLowerCase();
    const phoneNorm = String(raw.phone || "").replace(/\D/g, "");
    const sessionListPrice = Number(raw.sessionListPrice);

    if (!lotteryEntryId || !registrationId) {
        throw new HttpsError("invalid-argument", "缺少 lotteryEntryId 或 registrationId。");
    }
    if (discountCode.length !== 8) {
        throw new HttpsError("invalid-argument", "折扣碼格式不正確。");
    }
    if (!/^09\d{8}$/.test(phoneNorm)) {
        throw new HttpsError("invalid-argument", "手機格式不正確。");
    }
    if (!emailNorm || emailDisp.length < 5) {
        throw new HttpsError("invalid-argument", "Email 不正確。");
    }
    if (!Number.isFinite(sessionListPrice) || sessionListPrice <= 0) {
        throw new HttpsError("invalid-argument", "場次金額不正確。");
    }

    const expectedDiscounted = Math.max(0, sessionListPrice - MOTHERS_DAY_COURSE_DISCOUNT_NTD);
    const lotteryRef = db.collection(VIBE_ACTIVITY_LUCKY_DRAW_ENTRIES_COL).doc(lotteryEntryId);
    const regRef = db.collection(VIBE_REGISTRATIONS_COL).doc(registrationId);

    await db.runTransaction(async (tx) => {
        const [lotterySnap, regSnap] = await Promise.all([tx.get(lotteryRef), tx.get(regRef)]);
        if (!lotterySnap.exists) {
            throw new HttpsError("not-found", "折扣資料不存在。");
        }
        if (!regSnap.exists) {
            throw new HttpsError("not-found", "報名紀錄不存在。");
        }
        const L = lotterySnap.data() || {};
        const R = regSnap.data() || {};
        if (String(L.discountCode || "").toUpperCase() !== discountCode) {
            throw new HttpsError("permission-denied", "折扣碼不符。");
        }
        if (L.campaign !== MOTHERS_DAY_2026_CAMPAIGN_ID) {
            throw new HttpsError("permission-denied", "活動不符。");
        }
        const expMs = L.discountExpiresAt?.toMillis?.() ?? 0;
        if (expMs > 0 && expMs < Date.now()) {
            throw new HttpsError("failed-precondition", "折扣碼已過期。");
        }
        if (L.courseDiscountRedeemedAt != null) {
            throw new HttpsError("failed-precondition", "此折扣碼已核銷。");
        }
        const lPhone = String(L.phone || "").replace(/\D/g, "");
        const lEmail = String(L.email || "").trim().toLowerCase();
        const lName = String(L.name || "").trim();
        if (lPhone !== phoneNorm || lEmail !== emailNorm) {
            throw new HttpsError("permission-denied", "姓名／手機／Email 須與抽獎登記資料一致。");
        }
        if (String(R.email || "").trim().toLowerCase() !== emailNorm) {
            throw new HttpsError("permission-denied", "報名 Email 與折扣資料不一致。");
        }
        if (String(R.phone || "").replace(/\D/g, "") !== phoneNorm) {
            throw new HttpsError("permission-denied", "報名手機與折扣資料不一致。");
        }
        const normN = (x) => String(x || "").trim().replace(/\s+/g, " ");
        if (normN(R.name) !== normN(lName)) {
            throw new HttpsError("permission-denied", "報名姓名須與抽獎登記姓名一致。");
        }
        if (String(R.registrationKind || "") === "refresher" || R.isTimeNotAvailable === true) {
            throw new HttpsError("failed-precondition", "僅限正課報名可使用此折扣。");
        }
        const ef = Number(R.expectedFee);
        if (!Number.isFinite(ef) || ef !== expectedDiscounted) {
            throw new HttpsError(
                "failed-precondition",
                `應繳金額與折扣計算不符（預期 ${expectedDiscounted}）。請勿手動修改金額欄位。`
            );
        }
        if (String(R.mothersDayDiscountCode || "").toUpperCase() !== discountCode) {
            throw new HttpsError("permission-denied", "報名資料未正確帶入折扣碼。");
        }
        tx.update(lotteryRef, {
            courseDiscountRedeemedAt: admin.firestore.FieldValue.serverTimestamp(),
            courseDiscountRegistrationId: registrationId,
        });
    });

    return { ok: true, discountedFee: expectedDiscounted };
});

/**
 * 公開：報名送出後寄送「恭喜報名成功／請儘速匯款」通知（含課程資訊、後台設定海報、匯款資訊）。
 */
exports.sendVibeCourseRegistrationConfirmationEmail = onCall(
    { secrets: [resendApiKey] },
    async (request) => {
        const registrationId = String(request.data?.registrationId || "").trim();
        if (!registrationId) {
            throw new HttpsError("invalid-argument", "缺少 registrationId。");
        }
        const regSnap = await db.collection(VIBE_REGISTRATIONS_COL).doc(registrationId).get();
        if (!regSnap.exists) {
            throw new HttpsError("not-found", "找不到報名資料。");
        }
        const reg = regSnap.data() || {};
        const to = String(reg.email || "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            throw new HttpsError("failed-precondition", "報名資料缺少有效 Email。");
        }

        const posterSrc = await getSignupPosterAbsoluteUrl();
        const participantName = String(reg.name || "").trim() || "—";
        const isWish = reg.isTimeNotAvailable === true;
        const isRef = String(reg.registrationKind || "") === "refresher";
        const isMain = !isWish && !isRef;

        let sessionTitle = "—";
        let sessionWhenText = "—";
        let locationLine = "—";
        let sessionNote = "";
        const sid = String(reg.sessionId || "").trim();
        if (!isWish && sid) {
            const sessSnap = await db.collection(VIBE_SESSIONS_COL).doc(sid).get();
            if (sessSnap.exists) {
                const s = sessSnap.data() || {};
                sessionTitle = String(reg.sessionTitle || s.title || "AI落地師培訓班").trim();
                const dt = reg.sessionDate || s.date || "";
                sessionWhenText = dt ? `日期／時間：${String(dt)}` : "—";
                const loc = String(reg.sessionLocation || s.location || "").trim() || "—";
                const addr = String(reg.sessionAddress || s.address || "").trim();
                locationLine = addr ? `${loc}（${addr}）` : loc;
                sessionNote = String(s.note || "").trim();
            } else {
                sessionTitle = String(reg.sessionTitle || "場次").trim();
                sessionWhenText = reg.sessionDate ? `日期／時間：${String(reg.sessionDate)}` : "—";
                locationLine = [reg.sessionLocation, reg.sessionAddress].filter(Boolean).join(" ") || "—";
            }
        } else if (isWish) {
            sessionTitle = "以上場次時間無法配合（許願）";
            sessionWhenText = `許願時間：${String(reg.wishTime || "—")}`;
            locationLine = `許願地點：${String(reg.wishLocation || "—")}`;
        }

        const listPrice = Number(reg.sessionListPriceNtd ?? reg.expectedFee ?? 0);
        const expectedFee = Number(reg.expectedFee ?? 0);
        const discAmt = Number(reg.mothersDayDiscountAmountNtd || 0);
        let feeLine = `${expectedFee.toLocaleString()} 元`;
        if (isMain && discAmt > 0) {
            feeLine = `原價 ${listPrice.toLocaleString()} 元，母親節折扣 −${discAmt.toLocaleString()} 元，應繳 ${expectedFee.toLocaleString()} 元`;
        } else if (isRef) {
            feeLine = `複訓現場繳費 ${expectedFee.toLocaleString()} 元`;
        } else if (isWish) {
            feeLine = "許願登記（無須匯款）";
        }

        let paymentBlockHtml = "";
        let extraNote =
            "我們已收到您的報名資料。請依下列說明完成後續步驟。";

        if (isMain) {
            extraNote =
                "恭喜您完成報名登記！請儘速依下方匯款資訊完成轉帳，並保留匯款後五碼以利對帳。";
            paymentBlockHtml = `
<p style="margin:0 0 12px;font-weight:700;color:#fde047;">請於時限內完成匯款（依簡訊／官方公告為準）</p>
<table role="presentation" width="100%" style="font-size:14px;color:#e2e8f0;">
<tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:#94a3b8;">銀行</span>　國泰世華 (013) 敦化分行</td></tr>
<tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:#94a3b8;">戶名</span>　焙獅健康顧問有限公司</td></tr>
<tr><td style="padding:8px 0;"><span style="color:#94a3b8;">帳號</span>　<span style="font-size:18px;font-weight:900;color:#38bdf8;letter-spacing:0.06em;">212035012017</span></td></tr>
</table>
<p style="margin:14px 0 0;font-size:13px;color:#cbd5e1;">報名時填寫的匯款帳號<strong>後五碼</strong>將作為對帳依據，請務必正確填寫。</p>
`;
        } else if (isRef) {
            extraNote = "恭喜您完成複訓報名！請於上課當天依現場指示繳交複訓費用。";
            paymentBlockHtml =
                '<p style="margin:0;">複訓費用於<strong>上課當天現場繳交現金</strong>，無須事先匯款。</p>';
        } else {
            paymentBlockHtml =
                '<p style="margin:0;">本次為許願／登記用途，無須匯款；後續若有開課將另行通知。</p>';
        }

        const html = buildVibeRegistrationConfirmationEmailHtml({
            posterSrc,
            participantName,
            sessionTitle,
            sessionWhenText,
            locationLine,
            sessionNote,
            feeLine,
            paymentBlockHtml,
            extraNote,
        });

        const subject = `【AI落地師】報名成功｜請確認場次與繳費 — ${participantName}`;
        const from = resendFromEmail.value();
        try {
            const resend = new Resend(resendApiKey.value());
            const { error } = await resend.emails.send({
                from,
                to,
                subject,
                html,
            });
            if (error) {
                console.error("sendVibeCourseRegistrationConfirmationEmail resend", error);
                throw new HttpsError("internal", error.message || "寄送失敗。");
            }
        } catch (e) {
            if (e instanceof HttpsError) {
                throw e;
            }
            console.error("sendVibeCourseRegistrationConfirmationEmail", e);
            throw new HttpsError("internal", e.message || String(e));
        }

        return { ok: true };
    }
);

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
        isSignupOpen: data.isSignupOpen !== false,
        price: Number(data.price || 0),
        originalPrice: Number(data.originalPrice || 0),
        maxCapacity: Number(data.maxCapacity || 0),
        currentCount: Number(data.currentCount || 0),
        refresherMaxCapacity: Number(data.refresherMaxCapacity ?? 10),
        refresherCurrentCount: Number(data.refresherCurrentCount || 0),
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
    if (safeUpdates.refresherMaxCapacity != null) {
        safeUpdates.refresherMaxCapacity = Number(safeUpdates.refresherMaxCapacity);
    }
    if (safeUpdates.refresherCurrentCount != null) {
        safeUpdates.refresherCurrentCount = Number(safeUpdates.refresherCurrentCount);
    }
    if (safeUpdates.isSignupOpen != null) safeUpdates.isSignupOpen = safeUpdates.isSignupOpen !== false;

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

// -----------------------------
// 報到通知信（Resend）與「確認出席」公開連結
// -----------------------------

function signAttendanceLink(registrationId, secret) {
    return crypto.createHmac("sha256", String(secret)).update(String(registrationId)).digest("hex");
}

function safeTimingEqualHex(expectedHex, providedSig) {
    try {
        const a = Buffer.from(String(expectedHex), "hex");
        const b = Buffer.from(String(providedSig), "hex");
        if (a.length !== b.length || a.length === 0) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function parseRegistrationDate(value) {
    if (!value) return null;
    if (typeof value === "string") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (value && typeof value.toDate === "function") {
        return value.toDate();
    }
    return null;
}

/** 與前台報到頁一致：固定在台灣時區（Functions 預設為 UTC，若不指定 timeZone 會少 8 小時） */
const DISPLAY_TIME_ZONE = "Asia/Taipei";

function formatTwDateTime(d) {
    if (!d) return "-";
    return d.toLocaleString("zh-TW", {
        timeZone: DISPLAY_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function paymentBadgeLabel(status) {
    if (status === "confirmed") return "已完成付款";
    if (status === "cancelled") return "已取消";
    return "未完成付款";
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 母親節抽獎登記成功通知：含海報圖、登記資料、專屬折扣碼 */
function buildMothersDayLuckyDrawConfirmationEmailHtml(opts) {
    const {
        origin,
        name,
        email,
        phone,
        referralCode,
        referrerSnapshot,
        prizeSummary,
        drawAnnouncementNote,
        discountCode,
        discountExpiryLabel = "",
        emailHeadline = "登記已成功",
        emailBadgeLabel = "母親節限定｜抽獎登記成功",
        emailLeadParagraph,
    } = opts;
    const esc = escapeHtml;
    const posterUrl = `${String(origin).replace(/\/$/, "")}/mother.png`;
    const refLine =
        referrerSnapshot && String(referrerSnapshot).trim()
            ? `${esc(referrerSnapshot)}（推薦碼 ${esc(referralCode)}）`
            : `推薦碼 ${esc(referralCode)}`;

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#0a0a0a;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0a;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;">
<tr><td style="text-align:center;padding:0 0 16px;">
<span style="display:inline-block;border:1px solid rgba(185,28,28,0.55);background:rgba(127,29,29,0.35);color:#fecaca;font-size:11px;font-weight:800;letter-spacing:0.08em;padding:8px 16px;border-radius:999px;">${esc(emailBadgeLabel)}</span>
<h1 style="margin:16px 0 8px;font-size:22px;font-weight:900;color:#ffffff;line-height:1.35;">${esc(emailHeadline)}</h1>
<p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.6;">${esc(
        emailLeadParagraph ||
            "感謝您完成母親節抽獎登記。以下為您的登記摘要與專屬折扣碼（請妥善保存）。折扣碼限登記日起 30 日內使用。"
    )}</p>
</td></tr>
<tr><td style="padding:0 0 16px;text-align:center;">
<img src="${esc(posterUrl)}" alt="母親節抽獎活動海報" width="480" style="max-width:100%;height:auto;display:block;border-radius:16px;border:1px solid rgba(185,28,28,0.35);"/>
</td></tr>
<tr><td style="background:rgba(250,204,21,0.08);border:1px solid rgba(212,175,55,0.55);border-radius:18px;padding:18px 20px;margin-bottom:16px;">
<p style="margin:0 0 10px;font-size:13px;font-weight:800;color:#fde047;letter-spacing:0.04em;">您的折扣碼（8 碼英數字）</p>
<p style="margin:0;font-size:28px;font-weight:900;letter-spacing:0.18em;color:#ffffff;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${esc(discountCode)}</p>
${discountExpiryLabel ? `<p style="margin:14px 0 0;font-size:13px;color:#fde68a;line-height:1.55;text-align:center;">使用期限：${esc(discountExpiryLabel)} 前有效<br/><span style="font-size:11px;color:#a1a1aa;">（自登記完成時刻起算 30 日）</span></p>` : ""}
</td></tr>
<tr><td style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:20px;">
<h2 style="margin:0 0 14px;font-size:15px;font-weight:800;color:#fda4af;">登記資料</h2>
<table role="presentation" width="100%" style="font-size:14px;color:#e4e4e7;line-height:1.55;">
<tr><td style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);margin-bottom:8px;display:block;"><strong style="color:#a1a1aa;">姓名</strong>　${esc(name)}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);display:block;"><strong style="color:#a1a1aa;">Email</strong>　${esc(email)}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);display:block;"><strong style="color:#a1a1aa;">手機</strong>　${esc(phone)}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);display:block;"><strong style="color:#a1a1aa;">推薦來源</strong>　${refLine}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);display:block;"><strong style="color:#a1a1aa;">獎項摘要</strong>　${esc(prizeSummary || "—")}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25);display:block;"><strong style="color:#a1a1aa;">開獎／備註</strong>　${esc(drawAnnouncementNote || "—")}</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 8px 8px;text-align:center;font-size:11px;color:#71717a;line-height:1.55;">貼文留言為抽獎資格必要條件，請依活動貼文說明完成留言。<br/>此信由系統自動發送，回信不一定即時回覆；如需協助請透過主辦管道聯繫。</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

/** 8 碼英數字折扣碼（大寫字母 + 數字） */
function randomAlphanumericDiscountCode8() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (let i = 0; i < 8; i++) {
        out += chars[crypto.randomInt(0, chars.length)];
    }
    return out;
}

function buildLocationLine(reg) {
    const loc = String(reg.sessionLocation || "").trim() || "—";
    const addr = String(reg.sessionAddress || "").trim();
    return addr ? `${loc}（${addr}）` : loc;
}

function buildCheckInPassEmailHtml(opts) {
    const {
        name,
        phone,
        sessionTitle,
        sessionDateFormatted,
        checkInOpenClock,
        locationLine,
        uid,
        qrImgUrl,
        checkInUrl,
        confirmUrl,
        paymentLabel,
        isRefresher = false,
    } = opts;

    const esc = escapeHtml;
    const kindLabel = isRefresher ? "複訓" : "正課";
    /** 僅 QR 卡標題旁一顆標籤：複訓紫、正課亮橘黃 */
    const kindPillStyle = isRefresher
        ? "font-weight:900;color:#ede9fe;border:1px solid rgba(167,139,250,0.85);background:rgba(109,40,217,0.4);padding:4px 14px;border-radius:999px;font-size:12px;letter-spacing:0.06em;"
        : "font-weight:900;color:#422006;border:1px solid #f59e0b;background:linear-gradient(180deg,#fde047,#fbbf24);padding:4px 14px;border-radius:999px;font-size:12px;letter-spacing:0.06em;box-shadow:0 0 14px rgba(251,191,36,0.65);";

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:440px;">
<tr><td style="padding:0 0 20px 0;text-align:center;">
<a href="${esc(confirmUrl)}" style="display:inline-block;background:linear-gradient(180deg,#059669,#047857);color:#ffffff;text-decoration:none;font-weight:800;font-size:17px;padding:16px 36px;border-radius:14px;box-shadow:0 8px 24px rgba(5,150,105,0.35);">確認出席</a>
<p style="margin:14px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">請點擊上方按鈕，我們將記錄您已確認將出席本場次。<br/>若無法點擊，請複製連結至瀏覽器開啟：<br/><span style="word-break:break-all;color:#cbd5e1;">${esc(confirmUrl)}</span></p>
</td></tr>
<tr><td style="text-align:center;padding:4px 0 16px;">
<span style="display:inline-block;border:1px solid rgba(34,211,238,0.35);background:rgba(34,211,238,0.12);color:#a5f3fc;font-size:11px;font-weight:700;letter-spacing:0.12em;padding:6px 14px;border-radius:999px;">CHECK-IN PASS</span>
<h1 style="margin:14px 0 8px;font-size:26px;font-weight:900;color:#ffffff;">報到 QR 碼</h1>
<p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.55;">現場請出示報到頁面，由工作人員掃描完成報到。</p>
</td></tr>
<tr><td style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:22px;padding:20px;">
<table role="presentation" width="100%"><tr>
<td style="font-size:11px;font-weight:800;color:#cbd5e1;letter-spacing:0.08em;">AI 落地師通行證 AI-PASS　<span style="${kindPillStyle}">${esc(kindLabel)}</span></td>
<td align="right"><span style="display:inline-block;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800;border:1px solid rgba(52,211,153,0.45);background:rgba(16,185,129,0.12);color:#6ee7b7;">${esc(paymentLabel)}</span></td>
</tr></table>
<div style="text-align:center;margin:18px 0 10px;">
<a href="${esc(checkInUrl)}" style="display:inline-block;background:#ffffff;padding:12px;border-radius:16px;border:1px solid rgba(255,255,255,0.15);">
<img src="${esc(qrImgUrl)}" alt="報到 QR 碼" width="260" height="260" style="display:block;border-radius:10px;"/>
</a>
</div>
<p style="margin:0;text-align:center;font-size:11px;color:#94a3b8;word-break:break-all;">UID：${esc(uid)}</p>
<p style="margin:14px 0 0;text-align:center;font-size:12px;"><a href="${esc(checkInUrl)}" style="color:#22d3ee;">開啟報到頁面（含 QR）</a></p>
</td></tr>
<tr><td style="height:16px;"></td></tr>
<tr><td style="background:rgba(15,23,42,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:22px;padding:20px;">
<h2 style="margin:0 0 14px;font-size:16px;font-weight:800;color:#67e8f9;">報到資訊</h2>
<table role="presentation" width="100%" style="font-size:14px;color:#e2e8f0;">
<tr><td style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);margin-bottom:8px;display:block;"><strong style="color:#94a3b8;">姓名</strong>　${esc(name)}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);display:block;"><strong style="color:#94a3b8;">電話</strong>　${esc(phone)}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);display:block;"><strong style="color:#94a3b8;">場次</strong>　${esc(sessionTitle)}</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);display:block;"><strong style="color:#94a3b8;">上課時間</strong>　${esc(sessionDateFormatted)}（${esc(checkInOpenClock)}開放報到）</td></tr>
<tr><td style="height:8px;"></td></tr>
<tr><td style="padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);display:block;"><strong style="color:#94a3b8;">地點</strong>　${esc(locationLine)}</td></tr>
</table>
</td></tr>
<tr><td style="height:16px;"></td></tr>
<tr><td style="background:rgba(6,182,212,0.12);border:1px solid rgba(34,211,238,0.25);border-radius:22px;padding:20px;">
<h2 style="margin:0 0 12px;font-size:16px;font-weight:800;color:#cffafe;">行前提醒</h2>
<ul style="margin:0;padding-left:20px;font-size:14px;color:#e2e8f0;line-height:1.65;">
<li>建議提早 15 分鐘到場，方便現場簽到與入座。</li>
<li>請先將手機充飽電，並攜帶行動電源。</li>
<li>請先安裝 Gemini App，現場可直接操作。</li>
<li>課程長達 3.5 小時，建議攜帶個人水杯隨時補充水分。</li>
</ul>
</td></tr>
<tr><td style="padding:24px 8px 8px;text-align:center;font-size:11px;color:#64748b;line-height:1.5;">此信由系統自動發送。如需協助請回信或聯絡主辦單位。</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function isValidEmail(email) {
    const s = String(email || "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** 寄出一封報到通行證 HTML（與批次／單筆共用） */
async function sendCheckInPassEmailOnce(resend, from, origin, secret, reg) {
    const sessionDateObj = parseRegistrationDate(reg.sessionDate);
    const sessionDateFormatted = formatTwDateTime(sessionDateObj);
    let checkInOpenClock = "-";
    if (sessionDateObj) {
        const open = new Date(sessionDateObj.getTime() - 30 * 60 * 1000);
        checkInOpenClock = formatTwDateTime(open).split(" ").pop() || "-";
    }

    const locationLine = buildLocationLine(reg);
    const checkInUrl = `${origin}/signup/checkin/${encodeURIComponent(reg.id)}`;
    const confirmUrl = `${origin}/signup/confirm-attendance?rid=${encodeURIComponent(reg.id)}&sig=${encodeURIComponent(signAttendanceLink(reg.id, secret))}`;
    const qrPayload = encodeURIComponent(reg.id);
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=20&data=${qrPayload}`;

    const html = buildCheckInPassEmailHtml({
        name: reg.name || "-",
        phone: reg.phone || "-",
        sessionTitle: reg.sessionTitle || "-",
        sessionDateFormatted,
        checkInOpenClock,
        locationLine,
        uid: reg.id,
        qrImgUrl,
        checkInUrl,
        confirmUrl,
        paymentLabel: paymentBadgeLabel(reg.status),
        isRefresher: reg.registrationKind === "refresher",
    });

    const kindBracket = reg.registrationKind === "refresher" ? "〔複訓〕" : "〔正課〕";
    const subject = `【AI落地師培訓班】${kindBracket}報到 QR 與行前提醒（${String(reg.name || "").trim() || "學員"}）`;

    return await resend.emails.send({
        from,
        to: String(reg.email).trim(),
        subject,
        html,
    });
}

/**
 * 管理員：單筆寄送報到通行證（HTML）。data: { registrationId }
 */
exports.sendVibeCheckInEmailSingle = onCall(
    {
        secrets: [resendApiKey, attendanceConfirmSecret],
    },
    async (request) => {
        await assertAdmin(request);
        const { registrationId } = request.data || {};
        if (!registrationId) {
            throw new HttpsError("invalid-argument", "缺少 registrationId。");
        }

        const snap = await db.collection(VIBE_REGISTRATIONS_COL).doc(String(registrationId)).get();
        if (!snap.exists) {
            throw new HttpsError("not-found", "找不到報名資料。");
        }

        const reg = { id: snap.id, ...(snap.data() || {}) };
        if (String(reg.status || "") === "cancelled") {
            throw new HttpsError("failed-precondition", "已取消的報名無法寄送通知信。");
        }
        if (!isValidEmail(reg.email)) {
            throw new HttpsError("invalid-argument", "此筆報名沒有有效的 Email。");
        }

        const origin = vibePublicOrigin.value().replace(/\/$/, "");
        const secret = attendanceConfirmSecret.value();
        const from = resendFromEmail.value();
        const resend = new Resend(resendApiKey.value());

        try {
            const { error } = await sendCheckInPassEmailOnce(resend, from, origin, secret, reg);
            if (error) {
                throw new HttpsError("internal", error.message || "Resend 寄送失敗。");
            }
        } catch (e) {
            if (e instanceof HttpsError) throw e;
            throw new HttpsError("internal", e.message || String(e));
        }

        return { success: true };
    }
);

/**
 * 管理員：批次寄送報到通行證（HTML）。
 * data: { sessionId, listKind?: 'main' | 'refresher' }
 */
exports.sendVibeCheckInEmailsBatch = onCall(
    {
        secrets: [resendApiKey, attendanceConfirmSecret],
        timeoutSeconds: 360,
    },
    async (request) => {
        await assertAdmin(request);
        const { sessionId, listKind } = request.data || {};
        if (!sessionId) throw new HttpsError("invalid-argument", "缺少 sessionId。");
        const kind = listKind === "refresher" ? "refresher" : "main";

        const snap = await db.collection(VIBE_REGISTRATIONS_COL).where("sessionId", "==", String(sessionId)).get();

        const regs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })).filter((r) => {
            if (String(r.status || "") === "cancelled") return false;
            if (!isValidEmail(r.email)) return false;
            const rk = r.registrationKind || "main";
            if (kind === "main") return rk === "main";
            return rk === "refresher";
        });

        if (regs.length === 0) {
            return { sent: 0, skipped: 0, failures: [], message: "沒有符合條件的信箱可寄送（已排除已取消與無 Email）。" };
        }

        const origin = vibePublicOrigin.value().replace(/\/$/, "");
        const secret = attendanceConfirmSecret.value();
        const from = resendFromEmail.value();
        const resend = new Resend(resendApiKey.value());

        const failures = [];
        let sent = 0;

        for (let i = 0; i < regs.length; i++) {
            const reg = regs[i];
            if (i > 0) {
                await sleep(RESEND_BATCH_MIN_INTERVAL_MS);
            }
            try {
                const { error } = await sendCheckInPassEmailOnce(resend, from, origin, secret, reg);
                if (error) {
                    failures.push({ id: reg.id, email: reg.email, error: error.message || String(error) });
                } else {
                    sent += 1;
                }
            } catch (e) {
                failures.push({ id: reg.id, email: reg.email, error: e.message || String(e) });
            }
        }

        const warnings = [];
        const errBlob = failures.map((f) => String(f.error || "")).join("\n");
        if (/verify a domain|your own email address|onboarding@resend\.dev|testing emails/i.test(errBlob)) {
            warnings.push(
                "【Resend 網域】測試寄件只能寄到 Resend 登入帳號信箱。若要寄給學員：請至 https://resend.com/domains 驗證網域，並將 Firebase 參數 RESEND_FROM_EMAIL 設為該網域地址（純英文寄件顯示名），例如 LionBaker <notify@你的網域>。"
            );
        }
        if (/Too many requests|2 requests per second|rate limit/i.test(errBlob)) {
            warnings.push(
                "【Resend 頻率】系統已自動節流；若仍失敗請稍後分批重試或向 Resend 申請提高限制。"
            );
        }

        return {
            sent,
            failures,
            totalCandidates: regs.length,
            warnings,
        };
    }
);

/** 學員由信件連結點選「確認出席」：寫入 attendanceConfirmedAt 後導向報到頁 */
exports.confirmVibeAttendanceLink = onRequest(
    {
        secrets: [attendanceConfirmSecret],
    },
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        if (req.method === "OPTIONS") {
            res.status(204).send("");
            return;
        }
        const rid = String(req.query.rid || "").trim();
        const sig = String(req.query.sig || "").trim();
        const secret = attendanceConfirmSecret.value();
        const origin = vibePublicOrigin.value().replace(/\/$/, "");

        if (!rid || !sig || !secret) {
            res.status(400).type("html").send("<!DOCTYPE html><html lang=\"zh-Hant\"><meta charset=\"utf-8\"/><body style=\"font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;\">參數不完整。</body></html>");
            return;
        }

        const expected = signAttendanceLink(rid, secret);
        if (!safeTimingEqualHex(expected, sig)) {
            res.status(403).type("html").send("<!DOCTYPE html><html lang=\"zh-Hant\"><meta charset=\"utf-8\"/><body style=\"font-family:sans-serif;background:#0f172a;color:#e2e8f8;padding:24px;\">連結無效，請改由最新信件重新開啟。</body></html>");
            return;
        }

        const ref = db.collection(VIBE_REGISTRATIONS_COL).doc(rid);
        const doc = await ref.get();
        if (!doc.exists) {
            res.status(404).type("html").send("<!DOCTYPE html><html lang=\"zh-Hant\"><meta charset=\"utf-8\"/><body style=\"font-family:sans-serif;background:#0f172a;color:#e2e8f8;padding:24px;\">找不到報名資料。</body></html>");
            return;
        }

        await ref.set(
            {
                attendanceConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        res.redirect(302, `${origin}/signup/checkin/${encodeURIComponent(rid)}?attendance=confirmed`);
    }
);

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
