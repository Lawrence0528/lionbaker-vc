const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

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

        // 1. Try fetching by ID first
        const docRef = db.collection('projects').doc(projectId);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            projectData = docSnap.data();
        } else {
            // 2. Fallback to querying by projectAlias
            const pQuery = await db.collection('projects').where('projectAlias', '==', projectId).get();
            if (!pQuery.empty) {
                const docs = pQuery.docs.map(d => d.data());
                // find the one that matches userId or userAlias
                projectData = docs.find(d => d.userId === userId || d.userAlias === userId) || docs[0];
            }
        }

        if (!projectData || !projectData.htmlCode) {
            return res.status(404).send("<h1>找不到專案</h1><p>專案可能已被移除，或尚未生成程式碼。</p>");
        }

        // Setup cache headers for CDN (Fast loading and SEO sharing)
        // 快取降低為 60 秒，以便專案編輯後能立刻在社群平台生效
        res.set('Cache-Control', 'public, max-age=60, s-maxage=60');

        // 修正大型圖片被 Facebook 放棄抓取的問題
        // 在 <head> 中尋找 </head> 或 </title> 附近，補上 og:image:width 和 og:image:height
        let htmlResponse = projectData.htmlCode;
        if (htmlResponse.includes('<meta property="og:image"')) {
            htmlResponse = htmlResponse.replace('</head>', `
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:type" content="website" />
</head>`);
        }

        // Return full HTML string
        res.status(200).send(htmlResponse);
    } catch (e) {
        console.error("renderSandbox Error", e);
        res.status(500).send("<h1>系統發生錯誤</h1><p>無法載入此專案，請稍後再試。</p>");
    }
});
