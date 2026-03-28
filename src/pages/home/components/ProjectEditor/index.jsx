import React, { useState, useEffect, useRef } from 'react';
import liff from '@line/liff';
import { db, storage, signIn } from '../../../../firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { validateHtmlCode } from '../../../../utils/security';
import { copyToClipboard } from '../../../../utils/clipboard';
import {
    PREMIUM_COLORS,
    DESIGN_STYLES,
    DEFAULT_AVATARS,
    INDUSTRY_TEMPLATES,
    INTERACTIVE_TEMPLATES,
    LANDING_PAGE_TEMPLATES,
    PROJECT_TYPES,
} from '../../constants';

/** 當 project.templateKey 未儲存時，從 cardData 推斷電子名片的模版 key（支援舊專案） */
const inferNamecardTemplateKey = (proj) => {
    if (proj.type !== 'namecard') return proj.templateKey || 'insurance';
    if (proj.templateKey && INDUSTRY_TEMPLATES[proj.templateKey]) return proj.templateKey;
    const txt = (proj.title || '') + (proj.services || '') + (proj.honor || '') + (proj.introContent || '');
    if (/美睫|材料行/.test(txt)) return 'eyelashBeauty';
    if (/房仲|不動產/.test(txt)) return 'realEstate';
    if (/團購|微商/.test(txt)) return 'groupBuy';
    if (/身心靈|療癒/.test(txt)) return 'wellnessSpirit';
    if (/占星|塔羅/.test(txt)) return 'tarotAstrology';
    if (/健康|體態|代謝/.test(txt)) return 'wellness';
    return 'insurance';
};
import { FormInput, FormTextarea, FormSelect } from '../FormFields';
import {
    NamecardPanel,
    GamePanel,
    FormPanel,
    WebsitePanel,
    InteractiveToolPanel,
    LandingPagePanel,
} from './panels';

/** ProjectEditor 主組件 - 專案編輯器 */
const ProjectEditor = ({ project, onSave, onBack, userProfile }) => {
    // Basic State
    const [projectType, setProjectType] = useState(project.type || 'namecard');
    const [templateKey, setTemplateKey] = useState(() => inferNamecardTemplateKey(project));
    const [statusMsg, setStatusMsg] = useState('');
    const fileInputRef = useRef(null);
    const avatarFileInputRef = useRef(null);
    const [saveWarning, setSaveWarning] = useState(null);

    // Shared Fields
    const [commonData, setCommonData] = useState({
        name: project.name || `專案 ${new Date().toISOString().slice(0, 10)}`,
        id: project.id,
        mainColor: project.mainColor || '高科技黑',
        style: project.style || '現代簡約，卡片式設計，帶有質感',
        requirements: project.requirements || '',
        htmlCode: project.htmlCode || '',
        userAlias: userProfile.alias || '',
        projectAlias: project.projectAlias || '',
        useLiff: project.useLiff || false,
        liffId: project.liffId || '',
        liffFeatures: project.liffFeatures || [],
        enableDatabase: project.enableDatabase || false,
        enableStorage: project.enableStorage || false,
    });

    const checkProjectAlias = async (val) => {
        if (!val || val === project.projectAlias) return true;
        const q = query(
            collection(db, 'projects'),
            where('userId', '==', userProfile.userId),
            where('projectAlias', '==', val)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            const exists = snap.docs.some((d) => d.id !== project.id);
            if (exists) return false;
        }
        return true;
    };

    // NameCard State
    const [cardData, setCardData] = useState({
        personName: project.personName || '陳嘉吉',
        title: project.title || '保險經紀人',
        honor: project.honor || '2025 IFPA 亞太保險精英獎',
        phone: project.phone || '0931631725',
        lineId: project.lineId || 'lawrence_chen',
        lineLink: project.lineLink || 'https://line.me/ti/p/RMrbUVJJ9l',
        avatar: project.avatar || (project.imageUrls?.[0] || ''),
        introContent: project.introContent || '在這個瞬息萬變的時代，您需要的不是一份保單，而是一份對未來的承諾。',
        services: project.services || '保險保障、資產傳承、財務規劃',
        item1Title: project.item1Title || '【住院要注意什麼才能理賠？】',
        item1Content: project.item1Content || '診斷證明書、醫療收據...',
        item2Title: project.item2Title || '【車禍標準處理程序 SOP】',
        item2Content: project.item2Content || '報警、保持現場、蒐證...',
        item3Title: project.item3Title || '【新生兒投保黃金期】',
        item3Content: project.item3Content || '出生7-10天內...',
    });

    // Game State
    const [gameData, setGameData] = useState({
        orientation: project.orientation || 'auto',
        platform: project.platform || 'mobile',
        requirements: project.requirements || '',
    });

    // Interactive Tool State
    const [interactiveData, setInteractiveData] = useState({
        templateKey: project.templateKey || 'insurance_retirement',
        expertName: project.expertName || '',
        expertAvatar: project.expertAvatar || DEFAULT_AVATARS[0].url,
        ctaLink: project.ctaLink || 'https://line.me/ti/p/your_id',
        requirements: project.requirements || INTERACTIVE_TEMPLATES['insurance_retirement'].requirements,
    });

    // Landing Page State
    const [landingPageData, setLandingPageData] = useState({
        templateKey: project.templateKey || 'cafe',
        storeName: project.storeName || '星塵咖啡 Stardust Cafe',
        logoUrl: project.logoUrl || DEFAULT_AVATARS[0].url,
        brandStory: project.brandStory || '創立於2024年，志在為每位旅人提供一杯能讓人沈澱心靈的精品咖啡。',
        businessHours: project.businessHours || '週一至週日 08:00 - 20:00',
        contactInfo: project.contactInfo || '地址：台北市大安區光復南路999號 | 電話：02-23456789',
        features: project.features || '1. 自家烘焙單品豆\n2. 手工限定輕食早午餐\n3. 舒適的插座沙發區',
        requirements: project.requirements || LANDING_PAGE_TEMPLATES['cafe'].requirements,
    });

    // Form State
    const [formData, setFormData] = useState({
        requirements: project.requirements || '表單欄位要求：\n1. 姓名\n2. 電話\n3. Email\n4. 留言內容',
    });

    // Images
    const [uploadedImages, setUploadedImages] = useState(
        project.imageUrls ? project.imageUrls.map((url) => ({ url, name: 'Image' })) : []
    );
    const [uploading, setUploading] = useState(false);

    // SEO
    const [ogData, setOgData] = useState({ title: '', description: '', image: '' });
    const isUpdatingRef = useRef(false);

    // htmlCode 歷史版本選擇
    const [selectedHistoryKey, setSelectedHistoryKey] = useState('');

    const currentAccentHex = PREMIUM_COLORS.find((c) => c.value === commonData.mainColor)?.hex || '#00ffff';

    // Init SEO preview
    useEffect(() => {
        if (!commonData.htmlCode) return;
        const parser = new DOMParser();
        const docEl = parser.parseFromString(commonData.htmlCode, 'text/html');
        const getMeta = (p) =>
            docEl.querySelector(`meta[property="${p}"]`)?.getAttribute('content') ||
            docEl.querySelector(`meta[name="${p}"]`)?.getAttribute('content') ||
            '';
        setOgData({
            title: getMeta('og:title') || docEl.title || '',
            description: getMeta('og:description') || getMeta('description') || '',
            image: getMeta('og:image') || '',
        });
    }, []);

    // SEO Sync with htmlCode
    useEffect(() => {
        if (isUpdatingRef.current) return;
        if (!commonData.htmlCode) {
            setOgData({ title: '', description: '', image: '' });
            return;
        }
        const parser = new DOMParser();
        const docEl = parser.parseFromString(commonData.htmlCode, 'text/html');
        const getMeta = (property) =>
            docEl.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ||
            docEl.querySelector(`meta[name="${property}"]`)?.getAttribute('content') ||
            '';
        const newOgData = {
            title: getMeta('og:title') || docEl.title || '',
            description: getMeta('og:description') || getMeta('description') || '',
            image: getMeta('og:image') || '',
        };
        if (JSON.stringify(newOgData) !== JSON.stringify(ogData)) {
            setOgData(newOgData);
        }
    }, [commonData.htmlCode]);

    const handleOgChange = (e) => {
        const { name, value } = e.target;
        const newOgData = { ...ogData, [name]: value };
        setOgData(newOgData);

        if (!commonData.htmlCode.trim()) return;

        isUpdatingRef.current = true;
        let newHtml = commonData.htmlCode;

        const replaceMeta = (key, val) => {
            const safeVal = val.replace(/"/g, '&quot;');
            const ogRegex = new RegExp(
                `(<meta\\s+(?:property|name)=["']og:${key}["']\\s+content=["'])([\\s\\S]*?)(["']\\s*/?>)`,
                'ig'
            );
            let ogMatchCount = 0;
            newHtml = newHtml.replace(ogRegex, (match, p1, p2, p3) => {
                ogMatchCount++;
                if (ogMatchCount === 1) return `${p1}${safeVal}${p3}`;
                return '';
            });
            if (ogMatchCount === 0) {
                const headRegex = /<head>/i;
                if (headRegex.test(newHtml)) {
                    newHtml = newHtml.replace(headRegex, `<head>\n    <meta property="og:${key}" content="${safeVal}" />`);
                }
            }

            if (key === 'description') {
                const nameRegex = new RegExp(
                    `(<meta\\s+name=["']description["']\\s+content=["'])([\\s\\S]*?)(["']\\s*/?>)`,
                    'ig'
                );
                let nameMatchCount = 0;
                newHtml = newHtml.replace(nameRegex, (match, p1, p2, p3) => {
                    nameMatchCount++;
                    if (nameMatchCount === 1) return `${p1}${safeVal}${p3}`;
                    return '';
                });
                if (nameMatchCount === 0) {
                    const headRegex = /<head>/i;
                    if (headRegex.test(newHtml)) {
                        newHtml = newHtml.replace(headRegex, `<head>\n    <meta name="description" content="${safeVal}" />`);
                    }
                }
            }

            if (key === 'title') {
                const titleTagRegex = /<title>([\s\S]*?)<\/title>/gi;
                let titleMatchCount = 0;
                newHtml = newHtml.replace(titleTagRegex, (match, p1) => {
                    titleMatchCount++;
                    if (titleMatchCount === 1) return `<title>${val}</title>`;
                    return '';
                });
                if (titleMatchCount === 0) {
                    const headRegex = /<head>/i;
                    if (headRegex.test(newHtml)) {
                        newHtml = newHtml.replace(headRegex, `<head>\n    <title>${val}</title>`);
                    }
                }
            }
        };

        replaceMeta('title', newOgData.title);
        replaceMeta('description', newOgData.description);
        replaceMeta('image', newOgData.image);

        setCommonData((prev) => ({ ...prev, htmlCode: newHtml }));
        setTimeout(() => {
            isUpdatingRef.current = false;
        }, 0);
    };

    const handleCommonChange = (e) => setCommonData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const handleFilesUpload = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploading(true);
        setStatusMsg('正在上傳圖片...');
        try {
            const files = Array.from(e.target.files);
            const newUploads = [];
            for (const file of files) {
                const storageRef = ref(storage, `project_assets/${project.id}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const url = await getDownloadURL(snapshot.ref);
                newUploads.push({ url, name: file.name });
            }
            const updatedImages = [...uploadedImages, ...newUploads];
            setUploadedImages(updatedImages);

            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, { imageUrls: updatedImages.map((img) => img.url) });

            // 電子名片：上傳完成即自動設為頭像
            if (projectType === 'namecard' && newUploads.length > 0) {
                setCardData((prev) => ({ ...prev, avatar: newUploads[0].url }));
            }

            setStatusMsg(`成功上傳 ${newUploads.length} 張圖片！`);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error) {
            console.error('Upload error:', error);
            setStatusMsg('上傳失敗: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    /** 頭像專用上傳：上傳完成即自動設為頭像，並加入圖片素材 */
    const handleAvatarUpload = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploading(true);
        setStatusMsg('正在上傳頭像...');
        try {
            const files = Array.from(e.target.files);
            const newUploads = [];
            for (const file of files) {
                const storageRef = ref(storage, `project_assets/${project.id}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const url = await getDownloadURL(snapshot.ref);
                newUploads.push({ url, name: file.name });
            }
            const updatedImages = [...uploadedImages, ...newUploads];
            setUploadedImages(updatedImages);
            setCardData((prev) => ({ ...prev, avatar: newUploads[0].url }));

            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, { imageUrls: updatedImages.map((img) => img.url) });

            setStatusMsg('頭像上傳成功！');
            if (avatarFileInputRef.current) avatarFileInputRef.current.value = '';
        } catch (error) {
            console.error('Avatar upload error:', error);
            setStatusMsg('上傳失敗: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const sendLineNotification = async () => {
        try {
            if (typeof liff === 'undefined' || !liff.isInClient()) return;
            const ctx = liff.getContext();
            const validTypes = ['utou', 'room', 'group'];
            if (!ctx || !validTypes.includes(ctx.type)) return;
            const userParam = userProfile?.alias || userProfile?.userId;
            const projectParam = commonData.projectAlias || project.id;
            const projectUrl = `https://run.lionbaker.com/u/${userParam}/${projectParam}`;
            await liff.sendMessages([
                {
                    type: 'flex',
                    altText: `✅ 已完成更新：${commonData.name}`,
                    contents: {
                        type: 'bubble',
                        size: 'mega',
                        styles: {
                            header: { backgroundColor: '#0F172A' },
                            body: { backgroundColor: '#F8FAFC' },
                            footer: { backgroundColor: '#F8FAFC' },
                        },
                        header: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                {
                                    type: 'text',
                                    text: '✅ 程式碼已更新',
                                    color: '#FFFFFF',
                                    weight: 'bold',
                                    size: 'xl',
                                    align: 'center',
                                },
                                {
                                    type: 'text',
                                    text: 'Build / Update Completed',
                                    color: '#94A3B8',
                                    size: 'xs',
                                    align: 'center',
                                    margin: 'sm',
                                },
                            ],
                        },
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'md',
                            contents: [
                                {
                                    type: 'text',
                                    text: `「${commonData.name}」`,
                                    weight: 'bold',
                                    size: 'lg',
                                    color: '#0F172A',
                                    wrap: true,
                                },
                                {
                                    type: 'text',
                                    text: '作品連結已生成，可直接開啟預覽分享。',
                                    size: 'sm',
                                    color: '#475569',
                                    wrap: true,
                                },
                                {
                                    type: 'box',
                                    layout: 'vertical',
                                    backgroundColor: '#EEF2FF',
                                    borderColor: '#E2E8F0',
                                    borderWidth: '1px',
                                    cornerRadius: '12px',
                                    paddingAll: '12px',
                                    contents: [
                                        {
                                            type: 'text',
                                            text: projectUrl,
                                            size: 'xs',
                                            color: '#1D4ED8',
                                            wrap: true,
                                        },
                                    ],
                                },
                            ],
                        },
                        footer: {
                            type: 'box',
                            layout: 'vertical',
                            spacing: 'md',
                            contents: [
                                {
                                    type: 'button',
                                    style: 'primary',
                                    color: '#2563EB',
                                    action: {
                                        type: 'uri',
                                        label: '立即開啟作品',
                                        uri: projectUrl,
                                    },
                                },
                                {
                                    type: 'text',
                                    text: 'Powered by LionBaker',
                                    size: 'xxs',
                                    color: '#94A3B8',
                                    align: 'center',
                                },
                            ],
                        },
                    },
                },
            ]);
        } catch (err) {
            console.warn('LINE 通知發送失敗:', err);
        }
    };

    const handleSave = async (shouldGoBack = true, ignoreWarning = false) => {
        if (commonData.projectAlias) {
            const isUnique = await checkProjectAlias(commonData.projectAlias);
            if (!isUnique) {
                alert('專案 ID (Alias) 重複，請更換一個。');
                return;
            }
        }

        const validation = validateHtmlCode(commonData.htmlCode);
        if (!validation.valid) {
            alert(`安全性攔截：${validation.error}`);
            return;
        }

        if (validation.hasWarning && !ignoreWarning) {
            setSaveWarning({ message: validation.warningMessage, shouldGoBack });
            return;
        }
        try {
            setStatusMsg('正在儲存...');
            const docData = {
                ...commonData,
                type: projectType,
                enableDatabase: projectType === 'form' ? true : commonData.enableDatabase,
                enableStorage: projectType === 'form' ? true : commonData.enableStorage,
                imageUrls: uploadedImages.map((img) => img.url),
                updatedAt: serverTimestamp(),
                thumbnail: uploadedImages.length > 0 ? uploadedImages[0].url : null,
                userAlias: commonData.userAlias || '',
                projectAlias: commonData.projectAlias || '',
            };
            if (projectType === 'namecard') Object.assign(docData, cardData, { templateKey });
            else if (projectType === 'game') Object.assign(docData, gameData);
            else if (projectType === 'interactive_tool') Object.assign(docData, interactiveData);
            else if (projectType === 'landingPage') Object.assign(docData, landingPageData);
            else if (projectType === 'form') Object.assign(docData, formData);

            // htmlCode 歷程紀錄：若本次內容與原始專案不同且不為空，則追加一筆歷程
            if (project.htmlCode !== commonData.htmlCode && commonData.htmlCode?.trim()) {
                const prevHistory = project.htmlHistory || {};
                const timestampKey = new Date().toISOString();
                docData.htmlHistory = {
                    ...prevHistory,
                    [timestampKey]: commonData.htmlCode,
                };
            }

            await updateDoc(doc(db, 'projects', project.id), docData);

            if (commonData.htmlCode?.trim()) {
                sendLineNotification();
            }

            if (shouldGoBack) {
                alert('儲存成功！');
                onSave();
            } else {
                setStatusMsg('已自動儲存專案');
            }
        } catch (error) {
            console.error(error);
            setStatusMsg('儲存失敗');
        }
    };

    const generatePrompt = () => {
        const imageListText =
            uploadedImages.length > 0
                ? uploadedImages.map((img, idx) => `[圖片${idx + 1}]: ${img.url}`).join('\n')
                : '無';

        let liffInstructions = '';
        if (commonData.useLiff && commonData.liffId) {
            const features = commonData.liffFeatures || [];
            let featureText = '';
            if (features.includes('profile')) featureText += '\n- 在初始化後呼叫 liff.getProfile() 取得用戶名稱、頭像等基本資料，並顯示於畫面上。';
            if (features.includes('sendMessages')) featureText += '\n- 實作按鈕觸發 liff.sendMessages()。⚠️ 錯誤防範：呼叫前務必檢查 `!liff.isInClient()`，並確認 `liff.getContext()?.type` 為 `"utou"`, `"room"`, 或 `"group"` 之一。';
            if (features.includes('shareTargetPicker')) featureText += '\n- 實作按鈕觸發 liff.shareTargetPicker()。⚠️ 錯誤防範：呼叫前務必以 `liff.isApiAvailable("shareTargetPicker")` 檢查。';

            liffInstructions = `
■ LINE LIFF 整合 (必做)
本專案為 LINE LIFF 應用程式，請務必嚴格執行以下要求：
1. 請在 HTML 的 <head> 標籤中引入 LIFF SDK：<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
2. 在主要的 JavaScript 區塊中，為了避免 iOS LIFF 網路延遲導致畫面卡死，請實作初始化與逾時防呆機制 (設定 5 秒)。範例：
   Promise.race([
       liff.init({ liffId: "${commonData.liffId}" }),
       new Promise((_, reject) => setTimeout(() => reject(new Error('LIFF_TIMEOUT')), 5000))
   ]).then(() => { /* 進入正式邏輯 */ }).catch(err => { /* 在畫面上顯示明顯的「載入逾時重試」按鈕 */ });
3. 所有的主要畫面渲染或操作邏輯，必須確保是在 \`liff.init()\` 成功解析之後才執行。${featureText}
`;
        }

        let apiInstructions = '';
        const isDbEnabled = projectType === 'form' || commonData.enableDatabase;
        const isStorageEnabled = projectType === 'form' || commonData.enableStorage;

        if (isDbEnabled || isStorageEnabled) {
            apiInstructions += '\n■ 資料存取規範 (非常重要)\n1. 嚴格禁止載入或使用 Firebase SDK。\n';
            if (isDbEnabled) {
                apiInstructions += `2. API 支援完整的 CRUD 操作：
   [新增/更新] POST: fetch('https://run.lionbaker.com/api/project/' + projectId + '/db/yourCollectionName', { method: 'POST', body: JSON.stringify({ _id: '...', ...data }) })
   [取得列表] GET: fetch('https://run.lionbaker.com/api/project/' + projectId + '/db/yourCollectionName')
   [修改] PUT: fetch('.../db/collection/docId', { method: 'PUT' })
   [刪除] DELETE: fetch('.../db/collection/docId', { method: 'DELETE' })\n`;
            }
            if (isStorageEnabled) {
                apiInstructions += `3. 圖片上傳：fetch('https://run.lionbaker.com/api/project/' + projectId + '/storage', { method: 'POST', body: JSON.stringify({ fileName, fileBase64, contentType }) })\n`;
            }
            apiInstructions += `4. projectId 可從 \`document.querySelector('meta[name="x-project-id"]')?.content\` 取得。\n`;
        }

        let prompt = '';
        const baseInfo = `
■ 專案目標
類型：${projectType}
專案名稱：${commonData.name}
${commonData.userAlias ? `用戶自訂網址 ID: ${commonData.userAlias}` : ''}
${commonData.projectAlias ? `專案自訂網址 ID: ${commonData.projectAlias}` : ''}

■ 技術要求
請使用純 HTML+CSS+JS。請優化觸控操作。
務必包含完整的 SEO Meta Tags (og:title, og:description, og:image)。
${liffInstructions}
${apiInstructions}

■ 視覺設計
1. 主色調：${commonData.mainColor}
2. 風格：${commonData.style}
3. 參考圖片資源：
${imageListText}
`;

        if (projectType === 'namecard') {
            prompt = `【電子名片網站開發需求單】
${baseInfo}
■ 核心個人資料
● 姓名：${cardData.personName}
● 職稱：${cardData.title}
● 殊榮：${cardData.honor}
● 電話：${cardData.phone}
● LINE ID：${cardData.lineId}
● LINE 連結：${cardData.lineLink}
● 主圖：${cardData.avatar}
■ 自我介紹與服務：${cardData.introContent} / ${cardData.services}
■ 摺疊選單 1：${cardData.item1Title} - ${cardData.item1Content}
■ 摺疊選單 2：${cardData.item2Title} - ${cardData.item2Content}
■ 摺疊選單 3：${cardData.item3Title} - ${cardData.item3Content}
請製作單頁式、RWD 手機優先的網頁，包含 SEO Meta Tags 與 PWA 設定。
`;
        } else if (projectType === 'game') {
            prompt = `【Web 小遊戲開發需求單】
${baseInfo}
■ 遊戲規格：螢幕方向 ${gameData.orientation}，平台 ${gameData.platform}
● 遊戲玩法/需求：${gameData.requirements}
`;
        } else if (projectType === 'interactive_tool') {
            prompt = `【互動式拓客工具開發需求單】
${baseInfo}
■ 核心設定：專家 ${interactiveData.expertName}，頭像 ${interactiveData.expertAvatar}，CTA 連結 ${interactiveData.ctaLink}
■ 工具邏輯與拓客機制：
${interactiveData.requirements}
`;
        } else if (projectType === 'landingPage') {
            prompt = `【品牌/店家 Landing Page 開發需求單】
${baseInfo}
■ 核心品牌：${landingPageData.storeName}，Logo ${landingPageData.logoUrl}
■ 品牌故事：${landingPageData.brandStory}
■ 營業時間：${landingPageData.businessHours}
■ 聯絡資訊：${landingPageData.contactInfo}
■ 主打特色：${landingPageData.features}
■ 頁面企劃：${landingPageData.requirements}
`;
        } else if (projectType === 'form') {
            prompt = `【電子表單開發需求單】
${baseInfo}
■ 表單與資料處理需求：
${formData.requirements}
表單提交時使用 POST API 寫入 form_responses collection。
`;
        } else {
            prompt = `【網站開發需求單】
${baseInfo}
■ 詳細需求：${commonData.requirements}
請製作單頁式、RWD 手機優先的網頁。
`;
        }

        let finalPrompt = prompt;
        uploadedImages.forEach((img, idx) => {
            const placeholder = `\\[圖片${idx + 1}\\]`;
            const regex = new RegExp(placeholder, 'g');
            finalPrompt = finalPrompt.replace(regex, img.url);
        });

        return finalPrompt;
    };

    const renderDetailPanel = () => {
        switch (projectType) {
            case 'namecard':
                return (
                    <NamecardPanel
                        cardData={cardData}
                        onChange={setCardData}
                        templateKey={templateKey}
                        onTemplateChange={setTemplateKey}
                        uploadedImages={uploadedImages}
                        onAvatarUploadClick={() => fileInputRef.current?.click()}
                    />
                );
            case 'game':
                return <GamePanel gameData={gameData} onChange={setGameData} />;
            case 'form':
                return <FormPanel formData={formData} onChange={setFormData} />;
            case 'website':
                return (
                    <WebsitePanel
                        requirements={commonData.requirements}
                        onChange={(e) => setCommonData((prev) => ({ ...prev, requirements: e.target.value }))}
                    />
                );
            case 'interactive_tool':
                return (
                    <InteractiveToolPanel
                        interactiveData={interactiveData}
                        onChange={setInteractiveData}
                        uploadedImages={uploadedImages}
                    />
                );
            case 'landingPage':
                return (
                    <LandingPagePanel
                        landingPageData={landingPageData}
                        onChange={setLandingPageData}
                        uploadedImages={uploadedImages}
                    />
                );
            default:
                return (
                    <WebsitePanel
                        requirements={commonData.requirements}
                        onChange={(e) => setCommonData((prev) => ({ ...prev, requirements: e.target.value }))}
                    />
                );
        }
    };

    return (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in-up">
            <div className="lg:col-span-2 flex items-center gap-4 mb-2">
                <button onClick={onBack} className="px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 transition">
                    ← 返回列表
                </button>
                <div className="ml-auto text-green-400 text-sm">{statusMsg}</div>
            </div>

            {/* Left Column */}
            <div className="space-y-6">
                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">1. 基本設定</h2>
                    <div className="space-y-4">
                        <FormSelect label="專案類型 (建立後不可修改)" value={projectType} onChange={(e) => setProjectType(e.target.value)} disabled={true}>
                            {PROJECT_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </FormSelect>
                        <FormInput label="專案名稱" name="name" value={commonData.name} onChange={handleCommonChange} />

                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">主色調</label>
                                <div className="flex gap-2">
                                    <input type="text" name="mainColor" value={commonData.mainColor} onChange={handleCommonChange} className="flex-1 rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200" />
                                    <select className="w-10 h-10 flex items-center justify-center rounded p-1 text-center bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer text-lg" onChange={(e) => setCommonData((prev) => ({ ...prev, mainColor: e.target.value }))} value="">
                                        <option value="" disabled>🎨</option>
                                        {PREMIUM_COLORS.map((c) => (
                                            <option key={c.name} value={c.value}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">設計風格</label>
                                <div className="flex gap-2">
                                    <input type="text" name="style" value={commonData.style} onChange={handleCommonChange} className="flex-1 rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200" />
                                    <select className="w-10 h-10 flex items-center justify-center rounded p-1 text-center bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer text-lg" onChange={(e) => setCommonData((prev) => ({ ...prev, style: e.target.value }))} value="">
                                        <option value="" disabled>✨</option>
                                        {DESIGN_STYLES.map((s) => (
                                            <option key={s.name} value={s.value}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* 電子名片專案不顯示 LIFF 整合選項 */}
                            {projectType !== 'namecard' && (
                                <>
                                    <hr className="border-slate-100 my-2" />
                                    <div>
                                        <label className="flex items-center gap-2 cursor-pointer mb-2 group select-none">
                                            <input type="checkbox" checked={commonData.useLiff} onChange={(e) => setCommonData((prev) => ({ ...prev, useLiff: e.target.checked }))} className="w-4 h-4 accent-emerald-500" />
                                            <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition">啟用 LINE LIFF 整合</span>
                                        </label>
                                        {commonData.useLiff && (
                                            <div className="ml-6 flex flex-col gap-3 animate-fade-in-up mt-2">
                                                <div>
                                                    <label className="text-xs text-slate-500 block mb-1">LINE LIFF ID</label>
                                                    <input type="text" name="liffId" value={commonData.liffId} onChange={handleCommonChange} placeholder="請填入從 LINE Developer 取回的 LIFF ID" className="w-full rounded p-2 text-sm outline-none bg-white border border-emerald-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200" />
                                                </div>
                                                <div className="flex flex-col gap-2 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                                    <span className="text-sm font-bold text-emerald-700 mb-1">希望 LINE LIFF 功能包含：</span>
                                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-emerald-800 p-1 hover:bg-emerald-100 rounded">
                                                        <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={commonData.liffFeatures?.includes('profile')} onChange={(e) => { const current = commonData.liffFeatures || []; const next = e.target.checked ? [...current, 'profile'] : current.filter((f) => f !== 'profile'); setCommonData((prev) => ({ ...prev, liffFeatures: next })); }} />
                                                        取得用戶基本資料 (Profile)
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-emerald-800 p-1 hover:bg-emerald-100 rounded">
                                                        <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={commonData.liffFeatures?.includes('sendMessages')} onChange={(e) => { const current = commonData.liffFeatures || []; const next = e.target.checked ? [...current, 'sendMessages'] : current.filter((f) => f !== 'sendMessages'); setCommonData((prev) => ({ ...prev, liffFeatures: next })); }} />
                                                        傳送訊息到聊天室 (Send Messages)
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-emerald-800 p-1 hover:bg-emerald-100 rounded">
                                                        <input type="checkbox" className="w-4 h-4 accent-emerald-500" checked={commonData.liffFeatures?.includes('shareTargetPicker')} onChange={(e) => { const current = commonData.liffFeatures || []; const next = e.target.checked ? [...current, 'shareTargetPicker'] : current.filter((f) => f !== 'shareTargetPicker'); setCommonData((prev) => ({ ...prev, liffFeatures: next })); }} />
                                                        分享訊息給好友 (Share Target Picker)
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">2. 圖片素材</h2>
                    <div className="mb-4">
                        <label className="block text-sm text-slate-500 mb-2">上傳圖片 (自動關聯至此專案)</label>
                        <div className="flex items-center gap-2">
                            <input ref={fileInputRef} type="file" multiple onChange={handleFilesUpload} disabled={uploading} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-emerald-500 file:text-white shadow-md shadow-emerald-500/20 hover:file:bg-white/80" />
                            {uploading && <span className="text-xs animate-pulse text-emerald-500">上傳中...</span>}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
                        {uploadedImages.map((img, idx) => (
                            <div key={idx} className="relative aspect-square bg-slate-50/30 rounded-lg overflow-hidden group border border-slate-200">
                                <div className="absolute top-1 left-1 bg-slate-50/70 text-emerald-500 text-[10px] px-2 py-0.5 rounded backdrop-blur z-10">[圖片{idx + 1}]</div>
                                <a href={img.url} target="_blank" rel="noreferrer" className="block w-full h-full cursor-pointer">
                                    <img src={img.url} alt={img.name} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                                </a>
                                <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button
                                        onClick={async () => {
                                            const success = await copyToClipboard(img.url);
                                            alert(success ? '圖片網址已複製！' : '複製失敗，請手動選取複製。');
                                        }}
                                        className="bg-white border border-emerald-100 text-emerald-600 text-[10px] px-2 py-1 rounded shadow-md hover:bg-emerald-50"
                                    >
                                        🔗 複製
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!confirm('確定要刪除此圖片嗎？')) return;
                                            const next = uploadedImages.filter((_, i) => i !== idx);
                                            setUploadedImages(next);
                                            const docRef = doc(db, 'projects', project.id);
                                            await updateDoc(docRef, { imageUrls: next.map((i) => i.url) });
                                            if (projectType === 'namecard' && cardData.avatar === img.url) {
                                                setCardData((prev) => ({ ...prev, avatar: next[0]?.url || '' }));
                                            }
                                            setStatusMsg('已刪除圖片');
                                        }}
                                        className="bg-white border border-red-200 text-red-600 text-[10px] px-2 py-1 rounded shadow-md hover:bg-red-50"
                                    >
                                        🗑 刪除
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">3. 詳細需求</h2>
                    {renderDetailPanel()}

                    <div className="mt-8 pt-6 border-t border-slate-200">
                        <label className="text-sm font-bold text-emerald-600 block mb-3">⚡ 進階功能 (自動加入相應的串接提示詞)</label>
                        <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input type="checkbox" checked={projectType === 'form' || commonData.enableDatabase} onChange={(e) => setCommonData((prev) => ({ ...prev, enableDatabase: e.target.checked }))} disabled={projectType === 'form'} className="w-5 h-5 accent-emerald-500 rounded border-gray-300 focus:ring-emerald-500 disabled:opacity-50" />
                                <span className="text-sm text-slate-700 font-medium">啟用資料庫存取 (Firestore API)</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input type="checkbox" checked={projectType === 'form' || commonData.enableStorage} onChange={(e) => setCommonData((prev) => ({ ...prev, enableStorage: e.target.checked }))} disabled={projectType === 'form'} className="w-5 h-5 accent-emerald-500 rounded border-gray-300 focus:ring-emerald-500 disabled:opacity-50" />
                                <span className="text-sm text-slate-700 font-medium">啟用檔案/圖片上傳 (Storage API)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 border-l-4 border-[#10b981]">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">4. 產生 Prompt</h2>
                    <button
                        onClick={() => {
                            const promptText = generatePrompt();
                            copyToClipboard(promptText).then((success) => {
                                alert(success ? '已複製 PROMPT 並自動儲存專案更新！' : '複製失敗，您的瀏覽器可能阻擋了剪貼簿存取。');
                            });
                            handleSave(false).catch((e) => console.error('自動儲存失敗', e));
                        }}
                        className="w-full py-4 text-lg font-bold uppercase tracking-widest bg-emerald-500 text-white shadow-md hover:bg-emerald-600 rounded-xl flex items-center justify-center gap-2 mb-2 hover:scale-[1.02] transition-transform"
                    >
                        📋 複製 PROMPT
                    </button>
                    <p className="text-[10px] text-slate-400 text-center">* 已自動將 Prompt 中的 [圖片N] 替換為真實連結</p>
                </div>

                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 flex flex-col gap-6">
                    <h2 className="text-xl font-bold text-emerald-500">5. 程式碼</h2>

                    {Object.keys(project.htmlHistory || {}).length > 1 && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-emerald-600">歷史版本記錄</span>
                                {selectedHistoryKey && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const history = project.htmlHistory || {};
                                                const nextHtml = history[selectedHistoryKey];
                                                if (!nextHtml) return;
                                                const win = window.open('', '_blank');
                                                if (!win) {
                                                    alert('無法開啟新視窗，請確認瀏覽器是否阻擋了彈出視窗。');
                                                    return;
                                                }
                                                win.document.open();
                                                win.document.write(nextHtml);
                                                win.document.close();
                                            }}
                                            className="px-3 py-1 rounded-lg bg-slate-800 text-white text-xs hover:bg-slate-900 transition"
                                        >
                                            預覽此版本
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const history = project.htmlHistory || {};
                                                const nextHtml = history[selectedHistoryKey];
                                                if (!nextHtml) return;
                                                if (
                                                    !window.confirm(
                                                        '確定要套用這個歷史版本的程式碼嗎？目前尚未儲存的變更將被覆蓋，需再按一次「儲存專案」才會生效。'
                                                    )
                                                )
                                                    return;
                                                setCommonData((prev) => ({ ...prev, htmlCode: nextHtml }));
                                            }}
                                            className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs hover:bg-emerald-600 transition"
                                        >
                                            套用此版本
                                        </button>
                                    </div>
                                )}
                            </div>
                            <select
                                className="w-full rounded-lg border border-slate-300 bg-white text-xs p-2 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                                value={selectedHistoryKey}
                                onChange={(e) => setSelectedHistoryKey(e.target.value)}
                            >
                                <option value="">請選擇要還原的版本</option>
                                {Object.entries(project.htmlHistory || {})
                                    .sort(([a], [b]) => (a < b ? 1 : -1)) // 新的在前面
                                    .map(([ts], idx, arr) => {
                                        let label = ts;
                                        try {
                                            const d = new Date(ts);
                                            if (!Number.isNaN(d.getTime())) {
                                                label = d.toLocaleString('zh-TW', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                    hour12: false,
                                                });
                                            }
                                        } catch (e) {
                                            // ignore parse error, fallback to raw ts
                                        }
                                        const versionNo = arr.length - idx;
                                        return (
                                            <option key={ts} value={ts}>
                                                版本 {versionNo} - {label}
                                            </option>
                                        );
                                    })}
                            </select>
                            <p className="text-[10px] text-slate-400">
                                選擇版本並點「套用此版本」後，下方程式碼會被覆蓋，請再按一次「儲存專案」才會真正寫入資料庫。
                            </p>
                        </div>
                    )}

                    <textarea
                        className="w-full h-64 rounded-xl p-4 font-mono text-xs bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none resize-none"
                        placeholder="請貼上 Gemini 產生的 <html>...</html>"
                        value={commonData.htmlCode}
                        onChange={(e) => setCommonData((prev) => ({ ...prev, htmlCode: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                    ></textarea>

                    {commonData.htmlCode && (
                        <div className="bg-[#00000060] border border-[#ffffff10] rounded-xl p-6 flex flex-col gap-6 animate-fade-in-up backdrop-blur-sm">
                            <div className="border-b border-[#ffffff10] pb-4">
                                <h3 className="text-[#ccc] font-bold mb-4 text-sm w-full uppercase tracking-wider">📱 SEO 預覽與編輯</h3>
                                <div className="w-full max-w-[320px] mx-auto bg-white rounded-lg overflow-hidden flex flex-col shadow-2xl border border-slate-200 hover:scale-[1.02] transition-transform duration-300">
                                    <div className="w-full h-[167px] bg-slate-200 relative overflow-hidden group">
                                        {ogData.image ? <img src={ogData.image} alt="OG" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" /> : <div className="flex items-center justify-center h-full text-slate-500 text-xs">無 OG 圖片</div>}
                                    </div>
                                    <div className="p-4 bg-[#f0f0f0] flex-1">
                                        <h4 className="text-white shadow-md shadow-emerald-500/20 font-bold text-sm line-clamp-2 leading-tight mb-2">{ogData.title || '無標題'}</h4>
                                        <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed h-[2.5em]">{ogData.description || '無描述'}</p>
                                        <div className="mt-3 text-[10px] text-slate-500 uppercase tracking-widest">ai.lionbaker.com</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4">
                                <FormInput label="標題 (Title)" name="title" value={ogData.title} onChange={handleOgChange} />
                                <FormTextarea label="描述 (Description)" name="description" value={ogData.description} onChange={handleOgChange} h="h-20" />
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">分享圖片 (Image URL)</label>
                                    <input type="text" name="image" value={ogData.image} onChange={handleOgChange} placeholder="https://..." className="rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full" />
                                    <select className="w-full p-2 rounded text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer mt-2" onChange={(e) => e.target.value && handleOgChange({ target: { name: 'image', value: e.target.value } })} value="">
                                        <option value="" disabled>🖼️ 從上傳圖片中選擇...</option>
                                        {uploadedImages.map((img, i) => (
                                            <option key={i} value={img.url}>[圖片{i + 1}] {img.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    <button type="button" onClick={() => handleSave(true)} className="w-full py-3 font-bold bg-green-600 hover:bg-green-500 rounded-xl text-slate-900 transition shadow-lg shadow-green-500/30">
                        💾 儲存專案
                    </button>
                </div>
            </div>

            {saveWarning && (
                <div className="fixed inset-0 bg-slate-50/80 flex items-center justify-center z-[200] backdrop-blur-sm p-4">
                    <div className="bg-white border border-slate-200 shadow-xl p-6 rounded-2xl w-full max-w-md text-center">
                        <div className="text-5xl mb-4">⚠️</div>
                        <h3 className="text-xl font-bold mb-2 text-slate-800">儲存警告</h3>
                        <p className="text-slate-500 mb-6">{saveWarning.message}<br />確定要繼續儲存嗎？</p>
                        <div className="flex gap-4">
                            <button type="button" onClick={() => setSaveWarning(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition">取消</button>
                            <button
                                type="button"
                                onClick={() => {
                                    const goBack = saveWarning.shouldGoBack;
                                    setSaveWarning(null);
                                    handleSave(goBack, true);
                                }}
                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition shadow-lg shadow-emerald-500/30"
                            >
                                確定儲存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectEditor;
