const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();
const db = admin.firestore();

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

exports.api = onRequest(apiApp);

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

        // Setup cache headers for CDN (Fast loading and SEO sharing)
        res.set('Cache-Control', 'public, max-age=60, s-maxage=60');

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
