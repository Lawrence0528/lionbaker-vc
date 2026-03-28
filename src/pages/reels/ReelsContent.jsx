import React, { useState, useEffect } from 'react';
import { Copy, Video, CheckCircle2, Sparkles, LayoutTemplate, MessageSquare, ArrowRight, X, Target, MousePointer2, HelpCircle, Info, PenLine, BookOpen } from 'lucide-react';
import SEO from '../../components/SEO';
import {
    readFunnelReelsInsight,
    formatReelsInsightForPrompt,
    buildPrefillAdditionalFromProfile,
    clearFunnelReelsInsight,
} from '../../utils/funnelReelsInsight';

const REELS_PLATFORM_BY_FUNNEL = {
    instagram_reels: 'Instagram Reels (美感/節奏)',
    tiktok: 'TikTok (快節奏/娛樂)',
    youtube_shorts: 'YouTube Shorts (資訊量/長尾)',
    facebook_reels: 'Facebook Reels (觸及較廣/長輩)',
};

function mapSingleShortsPlatform(profile) {
    const arr = profile?.shortsPlatforms;
    if (!Array.isArray(arr) || arr.length !== 1) return null;
    return REELS_PLATFORM_BY_FUNNEL[arr[0]] || null;
}

const ReelsContent = () => {
    const [step, setStep] = useState(1);
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [formData, setFormData] = useState({
        platform: 'Instagram Reels (美感/節奏)',
        purpose: '吸粉曝光 (Traffic)',
        topic: '',
        targetAudience: '',
        style: '專業乾貨',
        emotion: '正向激勵',
        structure: '痛點解決法',
        duration: '30-60秒',
        ctaType: '留言領取資源',
        ctaKeyword: '想知道',
        additionalInfo: ''
    });

    const [generatedPrompt, setGeneratedPrompt] = useState('');
    const [isCopied, setIsCopied] = useState(false);

    const [funnelInsight, setFunnelInsight] = useState(() => readFunnelReelsInsight());
    const [includeFunnelInsight, setIncludeFunnelInsight] = useState(() => !!readFunnelReelsInsight());

    useEffect(() => {
        const insight = readFunnelReelsInsight();
        if (!insight?.profile) return;
        setFormData((prev) => {
            const prefill = buildPrefillAdditionalFromProfile(insight.profile);
            const nextPlatform = mapSingleShortsPlatform(insight.profile);
            return {
                ...prev,
                targetAudience: prev.targetAudience.trim()
                    ? prev.targetAudience
                    : insight.profile.audiencePortrait || prev.targetAudience,
                additionalInfo: prev.additionalInfo.trim() ? prev.additionalInfo : prefill || prev.additionalInfo,
                platform: nextPlatform || prev.platform,
            };
        });
    }, []);

    const handleClearFunnelInsight = () => {
        clearFunnelReelsInsight();
        setFunnelInsight(null);
        setIncludeFunnelInsight(false);
    };

    // 結構庫與說明
    const structures = {
        '痛點解決法': {
            desc: '先戳痛點 -> 再給解方。適合賣產品或知識型內容。',
            flow: '開頭戳痛點 -> 錯誤示範 -> 獨家解決方案 -> 成果展示 -> CTA'
        },
        '反差驚喜法': {
            desc: '打破大眾認知。適合吸眼球、做爆款流量。',
            flow: '意想不到的結果 -> 揭露反直覺過程 -> 解釋邏輯 -> 恍然大悟 -> CTA'
        },
        '情緒共鳴法': {
            desc: '講出觀眾心裡話。適合建立信任感、個人品牌。',
            flow: '扎心場景 -> 表達理解 -> 說出金句 -> 結尾昇華 -> CTA'
        },
        '清單盤點法': {
            desc: '提供高價值資訊。適合讓觀眾「收藏」與「截圖」。',
            flow: '數字開頭承諾 -> 快速列舉 -> 最後一個最重要 -> 截圖保存 -> CTA'
        },
        '爭議提問法': {
            desc: '故意拋出不同觀點。適合騙留言、增加互動率。',
            flow: '爭議觀點 -> 解釋視角 -> 詢問觀眾看法 -> 引發論戰'
        },
        '故事敘述法': {
            desc: '用故事包裝內容。適合生活類、Vlog或軟性置入。',
            flow: '懸疑開頭 -> 衝突升級 -> 轉折點 -> 結局與啟示'
        }
    };

    const purposeInstructions = {
        '吸粉曝光 (Traffic)': '重點在於「完播率」與「分享」。設計極具視覺衝擊或認知反差的開頭 (Hook)。內容淺顯易懂，適合大眾傳播。',
        '建立信任 (Trust)': '重點在於「專業度」與「真實感」。展現「同理心」或是「專家視角」。不要說教，像朋友一樣分享經驗。',
        '引導變現 (Conversion)': '重點在於「痛點挖掘」與「解決方案」。不直接賣產品，而是賣「解決問題後的美好生活」。強調不改變的後果。',
        '高互動 (Engagement)': '重點在於「評論區蓋樓」。故意留有討論空間，或設計簡單門檻 (猜猜看、選A或B)。'
    };

    const definitions = {
        purpose: "決定這支影片的「任務」。是為了讓陌生人看到你(吸粉)？還是為了讓粉絲買單(變現)？不同的目的，AI 寫的語氣會完全不同。",
        structure: "影片的「骨架」。就像寫作文有起承轉合，短影音也有特定的爆款公式，選對公式能大幅提升續看率。",
        cta: "CTA (Call to Action) 叫做「行動呼籲」。如果不告訴觀眾看完要幹嘛，他們滑走就忘了。一定要給一個明確指令，例如「留言+1」。",
        additional: "這裡可以填入你的產品特色、特殊要求，或是你想強調的重點。例如：「強調是無糖的」、「語氣要像屁孩一點」。"
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const toggleTooltip = (key) => {
        if (activeTooltip === key) {
            setActiveTooltip(null);
        } else {
            setActiveTooltip(key);
        }
    };

    const generatePrompt = () => {
        let ctaInstruction = '';
        if (formData.ctaType === '留言領取資源') {
            ctaInstruction = `引導觀眾在評論區留言關鍵字「${formData.ctaKeyword}」，以領取相關資料或教學（這是啟動演算法的關鍵）。`;
        } else if (formData.ctaType === '引導主頁連結') {
            ctaInstruction = `引導觀眾點擊主頁連結 (Link in Bio)，強調「限時」或「限量」的急迫感。`;
        } else if (formData.ctaType === '互動提問') {
            ctaInstruction = `引導觀眾回答問題或標記朋友。例如：「你身邊也有這樣的人嗎？標記他」或「你覺得是A還是B？留言告訴我」。`;
        } else {
            ctaInstruction = `引導觀眾關注收藏，強調「之後用得到，先存起來」。`;
        }

        // 將課程心法轉化為通用邏輯，移除特定課程名稱
        const courseKnowledge = `
【短影音爆款核心邏輯】
1. **黃金三秒 (Hook)**：開頭必須「下結論」、「講反話」或「用數字」，前3秒沒抓住眼球=失敗。
2. **朋友對話感**：嚴禁說教。語氣要像「跟朋友聊天」，多用「你」這個字，拉近距離，不要像念說明書。
3. **視覺節奏**：每 3-5 秒必須有畫面變化（縮放、換圖、特效、B-roll），避免觀眾視覺疲勞滑走。
4. **情緒與價值**：內容必須「有用」（乾貨）或「有趣」（共鳴/反差），解決特定痛點。
5. **演算法秘密**：引導「留言」互動是推流關鍵。CTA 必須明確（例：留言+1領取...），讓觀眾有動力互動。
`;

        let platformCaptionReq = '';
        const p = formData.platform;

        if (p.includes('Instagram') || p.includes('IG')) {
            platformCaptionReq = `
【同場加映：Instagram Reels 貼文文案】
請撰寫一篇適合 IG 風格的貼文：
- **首圖標題**：吸引點擊的封面文字。
- **內文第一行**：一句話 Hook (勾子)。
- **內文重點**：簡易條列 (3-5點)，適度使用 Emoji 增加易讀性。
- **互動結尾**：提問引導留言。
- **Hashtags**：15-20 個相關且高流量的標籤，包含大類與小眾。`;
        } else if (p.includes('TikTok')) {
            platformCaptionReq = `
【同場加映：TikTok 貼文文案】
請撰寫一篇適合 TikTok 生態的文案：
- **標題**：無，直接給內文。
- **內文**：極簡短，重點在於引導觀眾看影片或留言。
- **關鍵字**：埋入 SEO 關鍵字。
- **Hashtags**：5-8 個精準標籤 (包含 #fyp #foryou 等熱門標籤)。`;
        } else if (p.includes('YouTube')) {
            platformCaptionReq = `
【同場加映：YouTube Shorts 標題與資訊欄】
請撰寫適合 YouTube 搜尋的優化內容 (SEO)：
- **影片標題**：包含關鍵字，具吸引力 (限制 60 字內)。
- **資訊欄 (Description)**：
  - 前兩行：重點摘要 (SEO 權重高)。
  - 詳細說明：條列影片重點。
  - 相關 Hashtags：3-5 個 (放在說明欄最後)。`;
        } else { // Facebook
            platformCaptionReq = `
【同場加映：Facebook Reels 貼文文案】
請撰寫適合 FB 用戶(年齡層較廣)的文案：
- **標題**：清楚直白。
- **內文**：口語化，像在跟朋友分享好康。內容可以稍長一點，解釋影片脈絡。
- **引導分享**：請特別加入「分享給你的朋友」這類呼籲。
- **Hashtags**：3-5 個重點標籤即可。`;
        }

        const funnelSection =
            includeFunnelInsight && funnelInsight
                ? `【事業語境與漏斗健檢（請融入腳本與口播，勿逐條唸稿；此語境亦可用於其他行銷／企劃生成）】\n${formatReelsInsightForPrompt(funnelInsight)}\n\n`
                : '';

        const prompt = `你現在是一位精通短影音演算法的腳本大師。
請內化以下【核心邏輯】來撰寫腳本，這些是經過驗證的流量法則：

${courseKnowledge}

${funnelSection}請幫我為 ${formData.platform} 撰寫一支關於「${formData.topic}」的爆款短影音腳本。

【影片策略核心】
- **影片目的**：${formData.purpose}
  *策略重點*：${purposeInstructions[formData.purpose]}
- **目標受眾 (TA)**：${formData.targetAudience}
- **影片時長**：${formData.duration} (嚴格遵守視覺節奏變化)
- **結構模型**：${formData.structure} (${structures[formData.structure].flow})

【補充資訊與限制 (Context)】
${formData.additionalInfo ? formData.additionalInfo : "無特別補充，請發揮創意。"}

【腳本格式要求 (請以表格呈現)】
| 秒數 | 畫面描述 (Visual) | 口播/文案 (Audio) | 備註/音效 |
|:---:|:---|:---|:---|
| 0-3s | (黃金三秒：強烈視覺或反差，務必抓住眼球) | (一句話勾子：數字/反直覺/下結論) | 音效：重音/轉場聲 |
| ... | ... | ... | ... |

【流量密碼特別指令】
1. **開頭 (Hook)**：前 3 秒決勝負。請使用「數字佐證」、「反直覺結論」或「痛點直擊」。
2. **中間內容**：去除冗詞贅字，一句話只講一個重點。口語要像「跟朋友聊天」一樣自然。
3. **結尾 CTA**：${ctaInstruction}
4. **語言風格**：台灣繁體中文口語，親切自然。

---

${platformCaptionReq}

---

【同場加映：ManyChat 自動回覆設定】
若觀眾留言關鍵字「${formData.ctaKeyword}」，請提供以下設定內容：

1. **公開回覆留言 (Public Auto-Reply)**
   *請給我 3 個不同版本的簡短回覆 (避免被判定垃圾訊息)*
   (例如：私訊你囉！ / 這裡領取👉 / 沒問題，請看私訊～)

2. **私訊自動回覆 (DM Reply)**
   *當觀眾收到私訊時的內容*
   - 一句親切的問候
   - 再次確認他們要領取的資源
   - **附上領取連結/按鈕** (請標示 [按鈕：點我領取])

請開始撰寫：`;

        setGeneratedPrompt(prompt);
        setStep(2);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedPrompt);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <>
            <SEO
                title="短影音流量密碼生成器 | 馬上實現您的靈感"
                description="輸入主題，一鍵生成符合演算法邏輯的爆款短影音腳本。包含黃金三秒、朋友對話感、視覺節奏等流量密碼。"
                appName="流量密碼"
            />
            <main className="min-h-screen bg-slate-50 text-slate-800 p-4 font-sans">
                <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">

                    {/* Header */}
                    <div className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Sparkles className="w-32 h-32" />
                        </div>
                        <div className="flex items-center gap-2 mb-2 relative z-10">
                            <Video className="w-6 h-6" />
                            <span className="font-bold tracking-wider text-sm opacity-80">CREATOR TOOLS PRO</span>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold mb-2 relative z-10">短影音流量密碼生成器 v2.3</h1>
                        <p className="opacity-90 text-sm md:text-base relative z-10">通用的演算法邏輯，任何 AI 都能秒懂你的需求。</p>
                    </div>
                    <div className="p-6 md:p-8">
                        {step === 1 ? (
                            <div className="space-y-8 animate-fade-in">
                                {funnelInsight ? (
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 flex flex-col gap-3">
                                        <p className="text-sm font-bold text-emerald-900">
                                            已載入你在健檢留下的事業語境：產生指令時會一併餵給 AI，讓腳本更貼近你的真實情境。
                                        </p>
                                        <label className="flex items-start gap-3 text-sm text-emerald-900 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={includeFunnelInsight}
                                                onChange={(e) => setIncludeFunnelInsight(e.target.checked)}
                                                className="mt-0.5 w-5 h-5 accent-emerald-600 shrink-0"
                                            />
                                            <span>本次生成帶入健檢基本資料與診斷摘要（與其他工具共用同一份語境）</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleClearFunnelInsight}
                                            className="text-xs text-emerald-800 underline self-start hover:text-emerald-950"
                                        >
                                            清除已儲存的事業語境
                                        </button>
                                    </div>
                                ) : null}

                                {/* Section 1: 目的 (Why) */}
                                <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 space-y-4 relative">
                                    <div className="flex items-center justify-between">
                                        <h3 className="flex items-center gap-2 font-bold text-blue-800 text-lg">
                                            <Target className="w-5 h-5" /> 第一步：這次拍片是為了什麼？
                                        </h3>
                                        <button onClick={() => toggleTooltip('purpose')} className="text-blue-400 hover:text-blue-600 transition-colors">
                                            <HelpCircle className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {activeTooltip === 'purpose' && (
                                        <div className="bg-white p-3 rounded-lg border border-blue-200 text-sm text-slate-600 mb-2 shadow-sm animate-fade-in">
                                            💡 <strong>小幫手：</strong> {definitions.purpose}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-600 mb-2">主要目標</label>
                                            <select
                                                name="purpose"
                                                value={formData.purpose}
                                                onChange={handleInputChange}
                                                className="w-full p-3 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-slate-700"
                                            >
                                                <option value="吸粉曝光 (Traffic)">吸粉曝光 (Traffic) - 讓更多人看到</option>
                                                <option value="建立信任 (Trust)">建立信任 (Trust) - 展現專業/親切</option>
                                                <option value="引導變現 (Conversion)">引導變現 (Conversion) - 賣課程/產品</option>
                                                <option value="高互動 (Engagement)">高互動 (Engagement) - 騙留言/討論</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-600 mb-2">誰會看這支影片？(TA)</label>
                                            <input
                                                type="text"
                                                name="targetAudience"
                                                placeholder="例：想減肥的上班族、新手爸媽"
                                                value={formData.targetAudience}
                                                onChange={handleInputChange}
                                                className="w-full p-3 bg-white border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: 內容 (Content) */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1">
                                                <LayoutTemplate className="w-4 h-4" /> 發布平台
                                            </label>
                                            <select
                                                name="platform"
                                                value={formData.platform}
                                                onChange={handleInputChange}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all"
                                            >
                                                <option value="Instagram Reels (美感/節奏)">Instagram Reels (美感/節奏)</option>
                                                <option value="TikTok (快節奏/娛樂)">TikTok (快節奏/娛樂)</option>
                                                <option value="YouTube Shorts (資訊量/長尾)">YouTube Shorts (資訊量/長尾)</option>
                                                <option value="Facebook Reels (觸及較廣/長輩)">Facebook Reels (觸及較廣/長輩)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1">
                                                <MessageSquare className="w-4 h-4" /> 影片主題
                                            </label>
                                            <input
                                                type="text"
                                                name="topic"
                                                placeholder="例：3分鐘快速出門妝容、無痛存錢法"
                                                value={formData.topic}
                                                onChange={handleInputChange}
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 relative">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="block text-sm font-bold text-indigo-800 flex items-center gap-2">
                                                <Sparkles className="w-4 h-4" /> 選擇腳本結構 (怎麼演？)
                                            </label>
                                            <button onClick={() => toggleTooltip('structure')} className="text-indigo-400 hover:text-indigo-600 transition-colors">
                                                <HelpCircle className="w-5 h-5" />
                                            </button>
                                        </div>

                                        {activeTooltip === 'structure' && (
                                            <div className="bg-white p-3 rounded-lg border border-indigo-200 text-sm text-slate-600 mb-3 shadow-sm animate-fade-in">
                                                💡 <strong>小幫手：</strong> {definitions.structure}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {Object.keys(structures).map((key) => (
                                                <label key={key} className={`relative flex flex-col p-3 rounded-lg border-2 cursor-pointer transition-all hover:bg-white/60 ${formData.structure === key ? 'border-violet-500 bg-white shadow-md' : 'border-transparent'}`}>
                                                    <div className="flex items-center mb-1">
                                                        <input
                                                            type="radio"
                                                            name="structure"
                                                            value={key}
                                                            checked={formData.structure === key}
                                                            onChange={handleInputChange}
                                                            className="w-4 h-4 text-violet-600 focus:ring-violet-500 mr-2"
                                                        />
                                                        <span className="font-bold text-slate-800">{key}</span>
                                                    </div>
                                                    <span className="text-xs text-slate-500 ml-6 leading-relaxed">
                                                        {structures[key].desc}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: 補充說明 (Additional Info) - NEW */}
                                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-semibold text-slate-700 flex items-center gap-2">
                                            <PenLine className="w-4 h-4" /> 補充說明 (選填)
                                        </label>
                                        <button onClick={() => toggleTooltip('additional')} className="text-slate-400 hover:text-slate-600 transition-colors">
                                            <HelpCircle className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {activeTooltip === 'additional' && (
                                        <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm text-slate-600 mb-2 shadow-sm animate-fade-in">
                                            💡 <strong>小幫手：</strong> {definitions.additional}
                                        </div>
                                    )}

                                    <textarea
                                        name="additionalInfo"
                                        rows="3"
                                        placeholder="還有什麼要告訴 AI 的？例如：我的產品是保養品，強調純天然；或者希望影片語氣要很幽默、加上很多表情符號..."
                                        value={formData.additionalInfo}
                                        onChange={handleInputChange}
                                        className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-400 focus:outline-none transition-all text-sm"
                                    ></textarea>
                                </div>


                                {/* Section 4: CTA (Call to Action) */}
                                <div className="bg-yellow-50 p-5 rounded-2xl border border-yellow-100 space-y-4 relative">
                                    <div className="flex items-center justify-between">
                                        <h3 className="flex items-center gap-2 font-bold text-yellow-800 text-lg">
                                            <MousePointer2 className="w-5 h-5" /> 最後一步：希望觀眾看完做什麼？(CTA)
                                        </h3>
                                        <button onClick={() => toggleTooltip('cta')} className="text-yellow-600 hover:text-yellow-800 transition-colors">
                                            <HelpCircle className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {activeTooltip === 'cta' && (
                                        <div className="bg-white p-3 rounded-lg border border-yellow-200 text-sm text-slate-600 mb-2 shadow-sm animate-fade-in">
                                            💡 <strong>小幫手：</strong> {definitions.cta}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-600 mb-2">引導方式</label>
                                            <select
                                                name="ctaType"
                                                value={formData.ctaType}
                                                onChange={handleInputChange}
                                                className="w-full p-3 bg-white border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all text-slate-700"
                                            >
                                                <option value="留言領取資源">留言領取資源 (最推薦 - 騙留言)</option>
                                                <option value="互動提問">互動提問 (增加討論 - 騙留言)</option>
                                                <option value="引導主頁連結">引導主頁連結 (直接導流 - 賣東西)</option>
                                                <option value="關注收藏">關注收藏 (增加粉絲 - 長期經營)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-600 mb-2">
                                                {formData.ctaType.includes('留言') ? '設定留言關鍵字' :
                                                    formData.ctaType.includes('提問') ? '設定問題方向' :
                                                        '補充說明'}
                                            </label>
                                            <input
                                                type="text"
                                                name="ctaKeyword"
                                                placeholder={
                                                    formData.ctaType.includes('留言') ? '例：想知道、+1、領取' :
                                                        formData.ctaType.includes('提問') ? '例：你覺得呢？' : '例：點擊主頁連結購買'
                                                }
                                                value={formData.ctaKeyword}
                                                onChange={handleInputChange}
                                                className="w-full p-3 bg-white border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={generatePrompt}
                                    disabled={!formData.topic}
                                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] ${!formData.topic ? 'bg-slate-300 cursor-not-allowed text-slate-500' : 'bg-violet-600 text-white hover:bg-violet-700 shadow-violet-200'}`}
                                >
                                    {!formData.topic ? '請先輸入影片主題' : '✨ 沒問題了！幫我生成指令'}
                                    {formData.topic && <ArrowRight className="w-5 h-5" />}
                                </button>

                            </div>
                        ) : (
                            <div className="space-y-6 animate-fade-in-up">
                                {/* Step 2: Result */}
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-yellow-500" />
                                        你的專屬 AI 指令
                                    </h2>
                                    <button
                                        onClick={() => setStep(1)}
                                        className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1 px-3 py-1 rounded-full hover:bg-slate-100 transition-colors"
                                    >
                                        <X className="w-4 h-4" /> 修改設定
                                    </button>
                                </div>

                                <div className="bg-white p-4 rounded-xl border border-blue-100 mb-4 flex gap-3 items-start">
                                    <div className="bg-blue-100 p-2 rounded-full shrink-0">
                                        <BookOpen className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div className="text-sm text-slate-700">
                                        <strong className="block text-blue-800 mb-1">已嵌入「通用大師腦」：</strong>
                                        這段指令現在包含了：<span className="bg-yellow-100 px-1 rounded">黃金3秒法則</span>、<span className="bg-yellow-100 px-1 rounded">朋友對話語氣</span>、<span className="bg-yellow-100 px-1 rounded">視覺節奏控制</span>。即使 AI 沒讀過特定課程，也能直接執行爆款邏輯！
                                    </div>
                                </div>

                                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-200 relative group">
                                    <pre className="whitespace-pre-wrap font-sans text-sm md:text-base text-slate-700 leading-relaxed break-words">
                                        {generatedPrompt}
                                    </pre>

                                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={copyToClipboard}
                                            className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-600"
                                            title="複製內容"
                                        >
                                            {isCopied ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-indigo-900 flex flex-col gap-3">
                                    <div className="flex items-center gap-2 font-bold text-lg">
                                        <Info className="w-5 h-5" /> 接下來怎麼做？
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                        <div className="bg-white p-3 rounded-lg shadow-sm">
                                            <div className="font-bold text-indigo-600 mb-1">Step 1</div>
                                            點擊下方按鈕複製這段指令。
                                        </div>
                                        <div className="bg-white p-3 rounded-lg shadow-sm">
                                            <div className="font-bold text-indigo-600 mb-1">Step 2</div>
                                            貼給 ChatGPT / Gemini / Claude。
                                        </div>
                                        <div className="bg-white p-3 rounded-lg shadow-sm">
                                            <div className="font-bold text-indigo-600 mb-1">Step 3</div>
                                            AI 會給你分鏡表，你照著拍就好！
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={copyToClipboard}
                                    className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 ${isCopied ? 'bg-green-600 text-white' : 'bg-violet-600 text-white hover:bg-violet-700 shadow-violet-200'}`}
                                >
                                    {isCopied ? (
                                        <>
                                            <CheckCircle2 className="w-5 h-5" /> 已複製！去貼給 AI 吧
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-5 h-5" /> 複製完整指令 (Copy Prompt)
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
};

export default ReelsContent;
