import React, { useState, useEffect, useRef, useMemo } from 'react';
import liff from '@line/liff';
import { db, storage, signIn } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, updateDoc, deleteDoc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { validateHtmlCode } from '../utils/security';
import { copyToClipboard } from '../utils/clipboard';
import AgentAdmin from './AgentAdmin';

// 用於確保全域只有一個 LIFF 初始化正在進行，避免重複呼叫導致 Load failed
let liffInitPromise = null;

// --- Constants ---
const PREMIUM_COLORS = [
    { name: '高科技黑', hex: '#00ffff', value: '高科技黑：深邃神秘的黑色基調，搭配螢光藍或霓虹光感，展現未來科技感' },
    { name: '深空藍', hex: '#007bff', value: '深空藍：沉穩內斂的深藍色，象徵專業與信任，適合商務專業人士' },
    { name: '香檳金', hex: '#d4af37', value: '香檳金：優雅奢華的淡金色，展現高端與精緻的品味' },
    { name: '莫蘭迪灰', hex: '#aab7b8', value: '莫蘭迪灰：低飽和度的灰色調，帶有寧靜與高級的視覺享受' },
    { name: '勃根地紅', hex: '#c0392b', value: '勃根地紅：濃郁深沉的酒紅色，散發成熟與貴氣的魅力' },
    { name: '森林綠', hex: '#2ecc71', value: '森林綠：深邃自然的綠色，給人穩重且舒適的療癒感' },
    { name: '愛馬仕橘', hex: '#e67e22', value: '愛馬仕橘：鮮明充滿活力的橘色，象徵時尚、熱情與創意' },
    { name: '珍珠白', hex: '#ecf0f1', value: '珍珠白：純淨溫潤的白色，帶有微微光澤，呈現極簡潔淨之美' },
    { name: '曜石黑', hex: '#95a5a6', value: '曜石黑：純粹極致的黑，無雜質的重磅質感，強調權威與力量' },
    { name: '海軍藍', hex: '#34495e', value: '海軍藍：經典且權威的藍色，傳遞可靠、忠誠的專業形象' },
    { name: '玫瑰金', hex: '#e0aaff', value: '玫瑰金：溫柔且現代的金屬粉色，兼具時尚與親和力' },
    { name: '水泥灰', hex: '#7f8c8d', value: '水泥灰：粗獷中帶有細膩的工業風灰色，展現現代建築美學' },
    { name: '橄欖綠', hex: '#bada55', value: '橄欖綠：帶有大地氣息的黃綠色，象徵和平、智慧與成長' },
    { name: '丁香紫', hex: '#9b59b6', value: '丁香紫：淡雅清新的紫色，帶有藝術氣息與獨特氣質' },
    { name: '奶茶色', hex: '#d6bfa2', value: '奶茶色：溫暖柔和的大地色系，給人親切、放鬆的舒適感' },
    { name: '靜謐藍', hex: '#5dade2', value: '靜謐藍：平靜柔和的淺藍色，帶來清爽與安定的心理感受' },
    { name: '珊瑚紅', hex: '#ff6b6b', value: '珊瑚紅：介於粉與橘之間的活潑色彩，溫暖且充滿生命力' },
    { name: '象牙白', hex: '#fdfefe', value: '象牙白：帶有微黃暖意的白色，比純白更具溫度與復古感' },
    { name: '經典藍', hex: '#2980b9', value: '經典藍：永恆不朽的藍色，簡約優雅，適合各類專業場景' },
    { name: '極致灰', hex: '#bdc3c7', value: '極致灰：中性且堅定的灰色，象徵實用與穩固的基礎' }
];

const DESIGN_STYLES = [
    { name: '現代簡約 (預設)', value: '現代簡約，卡片式設計，帶有質感' },
    { name: '奢華黑金', value: '低調奢華，黑金配色，流體光影，頂級尊榮感' },
    { name: '科技未來', value: '賽博龐克風格，霓虹光暈，玻璃擬態，高科技感' },
    { name: '清新自然', value: '森林系配色，柔和圓角，植物紋理，療癒氛圍' },
    { name: '專業商務', value: '經典海軍藍，幾何切分，權威穩重，信賴感' },
    { name: '人文藝術', value: '莫蘭迪色系，留白排版，襯線字體，藝廊氣息' },
    { name: '活潑親和', value: '明亮高飽和配色，塗鴉元素，動態微互動，親切感' },
    { name: '極簡主義', value: '極致灰階，無印風格，細線條，理性冷靜' },
    { name: '時尚雜誌', value: '雜誌封面排版，大圖壓字，Bold 字體，視覺衝擊' },
    { name: '溫暖手作', value: '奶茶色調，紙質紋理，手繪圖示，溫馨感' }
];

const INDUSTRY_TEMPLATES = {
    insurance: {
        label: "保險與理財顧問",
        award: "2025 IFPA 亞太保險精英獎",
        services: "保險保障、資產傳承、財務規劃",
        photoUrl: "https://i.postimg.cc/cJKX7BGf/保險業.png",
        selfIntro: "您好！我是您的資產守護者。我不只賣保險，更幫您做風險導航。曾協助超過 100 個家庭完成理賠與退休規劃，我的目標是讓您「買對不買貴」，在風險來臨時，成為您最堅強的後盾。",
        tips: [
            { title: "🔍 保單健檢 (免費)", content: "擔心買了一堆卻賠不到？上傳您的舊保單，我用 AI 系統幫您抓出保障缺口，絕不強迫推銷。" },
            { title: "🚑 24H 急難協助", content: "發生車禍或緊急醫療狀況？按此按鈕直接通話，我不睡覺也會接，第一時間告訴您該怎麼做。" },
            { title: "📊 退休試算神器", content: "想知道存多少錢才能財富自由？輸入年齡與目標，30秒算給你看，量身打造現金流。" }
        ]
    },
    realEstate: {
        label: "房地產仲介",
        award: "2025 年度千萬經紀人 (Top Sales)",
        services: "不動產買賣租賃、房產估價與稅務、投資置產規劃",
        photoUrl: "https://i.postimg.cc/bvG309fk/房仲業.pngg",
        selfIntro: "嗨！我是您專屬的房產顧問。我不只賣房子，是幫您圓一個家的夢。擅長利用大數據精準估價，無論是首購還是投資，都能幫您找到高 CP 值的潛力物件。",
        tips: [
            { title: "🏠 購屋能力試算", content: "輸入薪資與自備款，一鍵算出您的合理購屋總價。" },
            { title: "💰 買房隱形成本計算", content: "別只存頭期款！幫您試算契稅、仲介費等隱藏費用。" },
            { title: "📉 該區真實底價分析", content: "剔除特殊交易，給您最真實的成交區間。" }
        ]
    },
    groupBuy: {
        label: "團購主 / 微商",
        award: "2025 社群電商大賞 - 年度金牌團主",
        services: "嚴選好物開團、超值優惠比價、專屬售後服務",
        photoUrl: "https://i.postimg.cc/jjWZ64YH/團購主.png",
        selfIntro: "哈囉！我是全職媽媽也是挑剔的選物人。我自己不敢用的東西絕不開團！這裡匯集了我跟廠商談到的「全網最低價」，跟著我買，省下的錢比賺的還多！",
        tips: [
            { title: "🎁 本週許願池 & 預告", content: "下週開什麼團？想要什麼商品？點這裡許願，集滿 20 人我就去跟廠商殺價！" },
            { title: "⚡ 結帳傳送門 (防漏單)", content: "LINE 訊息洗版找不到連結？別怕！所有正在開團的「下單連結」都整理在這，點擊直接買。" },
            { title: "🚛 併單省運費專區", content: "買太少怕運費不划算？這裡開放「鄰居併單」或「面交登記」，幫大家省運費最實在。" }
        ]
    },
    wellness: {
        label: "健康管理與創業導師",
        award: "2025 體態管理卓越教練 / 系統化創業導師",
        services: "代謝優化工程、精準體態雕塑、系統化被動收入",
        photoUrl: "https://i.postimg.cc/tJz5RrFg/jian-kang-gu-wen.png",
        selfIntro: "我是嘉吉，擅長用工程邏輯 DEBUG 人生的烘焙工程獅。從破百公斤到型男，我驗證了「身體管理是一套精準的科學」。我不只賣產品，更教你用「系統化 SOP」經營健康與財富。別讓身體的 Bug 拖累你，跟我一起用科技優化代謝，拿回人生的選擇權。",
        tips: [
            { title: "🧬 身體數值計算", content: "開發一個計算BMI，BMR及TDEE的程式" },
            { title: "🍰 甜點控的瘦身菜單", content: "誰說減肥不能吃甜點？烘焙工程獅獨家研發：不用挨餓、不用斷食，享受美食還能掉秤的「飲食配比參數」大公開。" },
            { title: "🚀 AI 創業戰隊招募", content: "不想再用勞力換錢？教你結合「健康黑科技」與「AI 數位工具」，複製我的成功 SOP，打造你的 24 小時自動化被動收入系統。" }
        ]
    }
};

const INTERACTIVE_TEMPLATES = {
    insurance_retirement: {
        label: "🛡️ 保險 - 退休金/教育金試算器",
        requirements: "功能：客戶輸入年齡、期望退休月花費。系統跑出精美的進度條與「資金缺口金額」。\n拓客機制：顯示結果後跳出提示：「想知道如何每月用 3000 元補足缺口？點擊按鈕獲取專屬企劃書。」"
    },
    insurance_test: {
        label: "🛡️ 保險 - 趣味理財性格測驗",
        requirements: "功能：3~5 題簡單的選擇題，評估客戶是保守型、穩健型還是積極型。\n拓客機制：測驗結果只顯示一半，必須點擊授權或加入 LINE 官方帳號才能解鎖完整解析與推薦的保險配置。"
    },
    realEstate_afford: {
        label: "🏠 房仲 - 買房負擔能力試算",
        requirements: "功能：讓客戶輸入自備款、月收入，系統自動換算出「建議購買總價區間」與「每月還款額」。\n拓客機制：算完之後，按鈕引導：「點擊查看符合您預算的 A 級隱藏版好案」，直接推薦聯絡專員。"
    },
    realEstate_vip: {
        label: "🏠 房仲 - VIP 線上看屋預約",
        requirements: "功能：現代 iOS 質感的表單，讓客戶勾選偏好區域、房型、車位需求。\n拓客機制：客戶送出尋屋條件後，直接引導至 LINE 進行一對一尊榮服務安排。"
    },
    micro_bmi: {
        label: "🧬 微創 - 專屬瘦身初步評估",
        requirements: "功能：客戶輸入身高、體重、年齡，系統自動計算 BMI 與 BMR（基礎代謝率），並給出簡單的體型狀態評語。\n拓客機制：頁面底部置入：「想參加 30 天減脂挑戰賽？立即預約免費一對一體態諮詢」。"
    },
    micro_booking: {
        label: "🎁 微創 - 動態型錄與預約系統",
        requirements: "功能：以輪播圖展示最新作品/商品，下方附帶日曆選擇器讓客戶挑選可預約的時段。\n拓客機制：客戶選好時段後，一鍵生成預約資訊發送到店家的 LINE，完成預約。"
    },
    freelance_tarot: {
        label: "🌟 專家 - 線上塔羅/流年測驗",
        requirements: "功能：頁面上展示可互動的塔羅牌抽牌，或輸入生日計算生命靈數流年。\n拓客機制：系統給出簡短提示，並引導：「想深入解析近期運勢？加老師預約完整解析。」"
    },
    freelance_quiz: {
        label: "🌟 專家 - 專業課前測驗與講義",
        requirements: "功能：針對講師專業領域設計 5 題測驗，完成後可解鎖下載精華 PDF 講義的按鈕。\n拓客機制：透過測驗篩選受眾，下載前引導加入 LINE 做為精準行銷名單。"
    }
};

const LANDING_PAGE_TEMPLATES = {
    cafe: {
        label: "☕ 咖啡廳 / 甜點輕食",
        requirements: "生成咖啡與輕食早午餐的專業 landing page，加入 SVG 動畫與真實照片，給人強烈印象及消費衝動，響應式設計。\n功能：展示招牌飲品、店內環境，下方需有「立即訂位」或「外帶自取」按鈕。\n拓客機制：點擊訂位引導加入 LINE 會員領取首購優惠。"
    },
    gym: {
        label: "🏋️ 健身房 / 瑜珈教室",
        requirements: "生成專業質感的私人教練或瑜珈教室 landing page，強調體態改變與教練專業度，給人揮灑汗水的熱血感或身心靈放鬆的寧靜感。\n功能：展示教練師資、課程方案(月費/季費)、場地器材。\n拓客機制：提供「免費預約體驗一堂課」表單，填寫後引導加 LINE 聯繫專員。"
    },
    clinic: {
        label: "✨ 醫美診所 / 美容 SPA",
        requirements: "生成高奢、信任感強的醫美診所或 SPA 中心 landing page，運用溫柔色調與高清晰膚質特寫，強調專業與隱私。\n功能：療程介紹、醫師專業背景、成功案例(BA對比)。\n拓客機制：「線上評估膚況」小測驗，完成後發送專屬保養建議與首次體驗優惠券至 LINE。"
    },
    tutor: {
        label: "📚 補習班 / 線上課程",
        requirements: "生成具備權威感且吸引家長或學生的 landing page，強調升學率、教學法與獨家教材，色調明亮積極。\n功能：課程大綱、講師陣容介紹、歷年榜單或學員評價。\n拓客機制：提供「免費領取考古題/精華講義」按鈕，需加 LINE 即可自動派發 PDF。"
    },
    restaurant: {
        label: "🍽️ 餐廳 / 餐酒館",
        requirements: "生成引發食慾、氣氛迷人的餐廳 landing page，深色質感配上高飽和度的食物誘人照片，或是明亮清新的家庭餐廳風格。\n功能：線上清晰菜單、最新期間限定活動、主廚推薦。\n拓客機制：「壽星免費升級餐點」活動，輸入生日即派發 LINE 電子優惠券。"
    },
    photoStudio: {
        label: "📸 攝影工作室",
        requirements: "生成極簡、藝術感強的攝影工作室 landing page，以作品集為主體，排版如雜誌風。\n功能：展示婚紗、寫真、商案等分類作品集、服務收費標準。\n拓客機制：提供「點我預約線上諮詢」直接對接 LINE，並送「精修照片多一張」優惠。"
    },
    petSalon: {
        label: "🐾 寵物美容 / 旅館",
        requirements: "生成溫馨、可愛且具安心感的寵物服務 landing page，採用馬卡龍色系，強調對毛孩的愛心與專業設備。\n功能：美容價目表、館內無死角攝影畫面、寵物保母證照展示。\n拓客機制：首次預約洗澡「免費升級 SPA」，點擊按鈕跳轉 LINE 預約時段。"
    },
    autoRepair: {
        label: "🚗 汽車美容 / 保修",
        requirements: "生成陽剛、精密、充滿科技感與職人精神的汽車服務 landing page，金屬或深灰色調，強調工藝細節。\n功能：鍍膜/保養套餐方案、施工前後對比、職人施工縮時影片。\n拓客機制：「愛車估價表單」填寫年分車型，即透過 LINE 發送客製化保養建議與報價。"
    },
    designerBrand: {
        label: "👗 獨立設計師 / 服飾品牌",
        requirements: "生成高質感、具現代表達力的品牌 landing page，強調原創設計、材質細節與品牌精神，排版留白多。\n功能：最新一季 Lookbook、熱銷單品選購、品牌故事。\n拓客機制：「訂閱電子報或加 LINE 領取 $200 購物金」，轉化訪客為首次購買。"
    },
    interiorDesign: {
        label: "🛋️ 室內設計 / 裝修工程",
        requirements: "生成空間感強、展現生活品味的室內設計 landing page，排版如建築圖鑑，展現空間配置的巧思。\n功能：各式風格作品集、設計流程與收費標準、客戶 3D 擬真圖與完工對比。\n拓客機制：「免費索取裝潢避坑指南 PDF」，引導加 LINE 以獲取名單。"
    }
};

const DEFAULT_AVATARS = [
    { name: '預設頭像 (AI 生成)', url: 'https://i.postimg.cc/Bv5w1bC7/Gemini-Generated-Image-5gk4x35gk4x35gk4kao-bei.png' },
    { name: '保險顧問', url: 'https://i.postimg.cc/cJKX7BGf/保險業.png' },
    { name: '房仲業者', url: 'https://i.postimg.cc/bvG309fk/房仲業.png' },
    { name: '團購微商', url: 'https://i.postimg.cc/jjWZ64YH/團購主.png' },
    { name: '健康教練', url: 'https://i.postimg.cc/tJz5RrFg/jian-kang-gu-wen.png' }
];

const hexToRgb = (hex) => {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length === 3) {
            c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c = '0x' + c.join('');
        return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',');
    }
    return '0, 243, 255';
};

// --- Helper Components ---
const FormInput = ({ label, name, value, onChange, mb = "mb-0" }) => (
    <div className={`flex flex-col ${mb}`}>
        <label className="text-xs text-slate-500 mb-1">{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} className="rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full" />
    </div>
);
const FormTextarea = ({ label, name, value, onChange, h = "h-24", mb = "mb-0", placeholder }) => (
    <div className={`flex flex-col ${mb}`}>
        <label className="text-xs text-slate-500 mb-1">{label}</label>
        <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} className={`rounded p-2 text-sm outline-none resize-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full ${h}`} />
    </div>
);
const FormSelect = ({ label, name, value, onChange, children, disabled }) => (
    <div className="flex flex-col">
        <label className="text-xs text-slate-500 mb-1">{label}</label>
        <select disabled={disabled} name={name} value={value} onChange={onChange} className={`rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            {children}
        </select>
    </div>
);

// --- 常見欄位中英對照表 ---
const FIELD_MAPPING = {
    name: '姓名',
    phone: '電話',
    email: '信箱',
    address: '地址',
    score: '滿意度/評分',
    learning_reflection: '學習心得',
    impressive_part: '印象深刻的部分',
    suggestions: '建議與回饋',
    whisper: '悄悄話',
    submitted_at: '提交時間',
    application: '應用場景/用途',
    photo_url: '照片網址/截圖',
    company: '公司名稱',
    title: '職稱'
};

const translateField = (key) => {
    const lowerKey = key.toLowerCase();
    return FIELD_MAPPING[lowerKey] || key;
};

// --- Form Data Viewer ---
const FormDataViewer = ({ projectId }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(null); // 改成紀錄 index

    const fetchData = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, `projects/${projectId}/form_responses`));
            const snap = await getDocs(q);
            const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // sort by _createdAt desc
            docs.sort((a, b) => {
                const tA = a._createdAt?.seconds || 0;
                const tB = b._createdAt?.seconds || 0;
                return tB - tA;
            });
            setData(docs);
            setSelectedIndex(null);
        } catch (e) {
            console.error(e);
            alert('無法讀取資料');
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (data.length === 0) return;
        
        // 收集所有的 keys
        const allKeys = new Set();
        data.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!key.startsWith('_') && key !== 'id') {
                    allKeys.add(key);
                }
            });
        });
        
        const headers = ['建立時間', ...Array.from(allKeys).map(translateField)];
        
        const csvRows = [];
        csvRows.push(headers.join(',')); // 加入標題行
        
        data.forEach(item => {
            const row = [];
            // 時間
            row.push(item._createdAt?.seconds ? `"${new Date(item._createdAt.seconds * 1000).toLocaleString()}"` : '"未知"');
            
            // 其他欄位
            Array.from(allKeys).forEach(key => {
                let val = item[key];
                if (val === undefined || val === null) val = '';
                // 處理字串中的換行和雙引號
                let valStr = String(val).replace(/"/g, '""');
                row.push(`"${valStr}"`);
            });
            csvRows.push(row.join(','));
        });
        
        const csvString = "\uFEFF" + csvRows.join('\n'); // 加上 BOM 讓 Excel 正確識別 UTF-8
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `form_responses_${projectId}_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        fetchData();
    }, [projectId]);

    const handlePrev = () => {
        if (selectedIndex !== null && selectedIndex > 0) {
            setSelectedIndex(selectedIndex - 1);
        }
    };

    const handleNext = () => {
        if (selectedIndex !== null && selectedIndex < data.length - 1) {
            setSelectedIndex(selectedIndex + 1);
        }
    };

    const selectedItem = selectedIndex !== null ? data[selectedIndex] : null;

    return (
        <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 mt-6 animate-fade-in-up md:col-span-1 lg:col-span-2">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-emerald-500">6. 填寫資料瀏覽 (form_responses)</h2>
                <div className="flex gap-2">
                    <button onClick={handleExportCSV} disabled={loading || data.length === 0} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50">
                        📥 匯出 CSV
                    </button>
                    <button onClick={fetchData} disabled={loading} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-50">
                        🔄 重新整理
                    </button>
                </div>
            </div>
            {loading ? (
                <div className="text-center py-8 text-slate-500 text-sm">載入中...</div>
            ) : data.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 border border-slate-100 rounded-lg text-slate-400 text-sm italic">
                    尚無使用者填寫的資料
                </div>
            ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 border-b border-slate-200 font-bold text-slate-600 whitespace-nowrap hidden md:table-cell">🕒 提交時間</th>
                                <th className="p-3 border-b border-slate-200 font-bold text-slate-600 whitespace-nowrap">預覽內容</th>
                                <th className="p-3 border-b border-slate-200 font-bold text-slate-600 whitespace-nowrap text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                            {data.map((item, idx) => {
                                const cleanData = Object.fromEntries(Object.entries(item).filter(([k]) => !k.startsWith('_') && k !== 'id'));
                                const keys = Object.keys(cleanData);
                                const previewKeys = keys.slice(0, 3);
                                return (
                                    <tr key={item.id} onClick={() => setSelectedIndex(idx)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors group">
                                        <td className="p-3 text-slate-500 font-mono text-xs whitespace-nowrap hidden md:table-cell align-top">
                                            {item._createdAt?.seconds ? new Date(item._createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                                        </td>
                                        <td className="p-3 align-top max-w-xs sm:max-w-md lg:max-w-xl">
                                            <div className="flex flex-col gap-1">
                                                {/* 手機版顯示時間 */}
                                                <div className="text-xs text-slate-400 font-mono mb-1 md:hidden">
                                                    {item._createdAt?.seconds ? new Date(item._createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                                                </div>
                                                {previewKeys.map(k => (
                                                    <div key={k} className="flex gap-2 text-sm overflow-hidden text-ellipsis">
                                                        <span className="font-bold text-slate-600 shrink-0">{translateField(k)}:</span> 
                                                        <span className="text-slate-500 truncate">{String(cleanData[k])}</span>
                                                    </div>
                                                ))}
                                                {keys.length > 3 && (
                                                    <div className="text-xs font-bold text-emerald-500 mt-1">...及其他 {keys.length - 3} 個欄位</div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right text-emerald-600 font-bold align-middle whitespace-nowrap">
                                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">查看詳情 &rarr;</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedItem && (
                <div className="fixed inset-0 bg-slate-900/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedIndex(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        
                        {/* Header */}
                        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-md">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">表單詳細內容</h3>
                                <div className="text-xs text-slate-500 mt-1 font-mono">
                                    {selectedItem._createdAt?.seconds ? new Date(selectedItem._createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handlePrev} disabled={selectedIndex === 0} className="h-8 px-3 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition font-bold text-sm disabled:opacity-30 disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-600">
                                    &larr; 上一筆
                                </button>
                                <button onClick={handleNext} disabled={selectedIndex === data.length - 1} className="h-8 px-3 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition font-bold text-sm disabled:opacity-30 disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-600">
                                    下一筆 &rarr;
                                </button>
                                <div className="w-px h-8 bg-slate-200 mx-2"></div>
                                <button onClick={() => setSelectedIndex(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-red-500 transition font-bold text-xl leading-none">&times;</button>
                            </div>
                        </div>

                        {/* Content Body (Grid Layout) */}
                        <div className="p-6 overflow-y-auto flex-1 bg-white">
                            <div className="space-y-4">
                                {Object.entries(selectedItem)
                                    .filter(([k]) => !k.startsWith('_') && k !== 'id')
                                    .map(([k, v]) => (
                                        <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0 items-start">
                                            <div className="col-span-1 text-sm font-bold text-slate-500 uppercase tracking-wider pt-1 flex items-center md:justify-end md:text-right">
                                                {/* 顯示中文對應，如果沒有則顯示原 key 的首字大寫（或是原始 key） */}
                                                {translateField(k)}
                                            </div>
                                            <div className="col-span-1 md:col-span-2">
                                                {typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://')) ? (
                                                    v.match(/\.(jpeg|jpg|gif|png|webp)$/i) ? (
                                                        <a href={v} target="_blank" rel="noreferrer" className="block max-w-sm overflow-hidden rounded-lg border border-slate-200 mt-1 shadow-sm">
                                                            <img src={v} alt={translateField(k)} className="w-full h-auto object-cover hover:scale-105 transition-transform" />
                                                        </a>
                                                    ) : (
                                                        <a href={v} target="_blank" rel="noreferrer" className="text-emerald-500 hover:text-emerald-600 font-medium hover:underline break-all text-sm inline-flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded">
                                                            🔗 點擊開啟連結
                                                        </a>
                                                    )
                                                ) : (
                                                    <div className="text-base text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                        {String(v)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                            <button onClick={() => setSelectedIndex(null)} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg shadow-sm transition">
                                關閉
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- User Settings Modal ---
const UserSettings = ({ user, onClose, onUpdate }) => {
    const [alias, setAlias] = useState(user.alias || '');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        setLoading(true);
        try {
            // Uniqueness check
            if (alias && alias !== user.alias) {
                const q = query(collection(db, 'users'), where('alias', '==', alias));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    alert('此 User ID 已被其他用戶使用，請更換一個。');
                    setLoading(false);
                    return;
                }
            }
            // Update Firestore
            await updateDoc(doc(db, 'users', user.userId), { alias });
            onUpdate({ ...user, alias });
            alert('設定已更新！');
            onClose();
        } catch (e) {
            console.error(e);
            alert('更新失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-50/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 shadow-xl p-6 rounded-2xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900">✕</button>
                <h3 className="text-xl font-bold mb-4 text-emerald-500">個人設定</h3>

                <div className="space-y-4">
                    <div className="flex flex-col">
                        <label className="text-xs text-slate-500 mb-1">顯示名稱</label>
                        <input type="text" value={user.displayName} disabled className="rounded p-2 text-sm outline-none bg-slate-100 text-slate-500 cursor-not-allowed" />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-slate-500 mb-1">自訂 User ID (全域唯一)</label>
                        <input
                            type="text"
                            value={alias}
                            onChange={(e) => setAlias(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} // Alpha-numeric only
                            placeholder="例如: lawrence"
                            className="rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                            設定後，您的所有專案網址將變為：<br />
                            <span className="text-emerald-500">/u/{alias || user.userId}/[專案ID]</span>
                        </p>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="w-full py-2 mt-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500 border border-[#10b981]/50 rounded-lg transition"
                    >
                        {loading ? '儲存中...' : '儲存設定'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Gatekeeper Components ---

const TermsModal = ({ onAgree }) => {
    const [checked, setChecked] = useState(false);
    return (
        <div className="fixed inset-0 bg-slate-50 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white max-w-lg w-full rounded-2xl p-6 border border-slate-200 shadow-2xl relative my-8">
                <h2 className="text-2xl font-bold text-emerald-500 mb-6 tracking-wide border-b border-slate-200 pb-4">服務條款與使用規範</h2>
                <div className="text-sm text-slate-700 leading-relaxed space-y-4 mb-6 max-h-[60vh] overflow-y-auto bg-slate-50 p-4 rounded-lg">
                    <p className="font-bold">歡迎使用 Vibe AI 專案工廠。使用本服務前，請務必同意以下條款：</p>
                    <ul className="list-disc pl-5 space-y-3">
                        <li><strong className="text-red-400">嚴禁非法內容：</strong>禁止利用本平台製作、散佈任何色情、詐騙、賭博、暴力或違反法律之內容。</li>
                        <li><strong className="text-red-400">詐騙零容忍：</strong>若發現涉及詐騙行為，我們將立即停權並配合執法機關調查。</li>
                        <li><strong>帳號責任：</strong>您需對您帳號下的所有活動負責，請妥善保管您的帳號。</li>
                        <li><strong>服務終止：</strong>若違反上述規範，我們保留隨時終止服務且不予退費的權利。</li>
                    </ul>
                </div>

                <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg bg-slate-100 hover:bg-slate-200 transition mb-4 select-none border border-slate-200">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                        className="w-5 h-5 accent-emerald-500"
                    />
                    <span className="text-base text-slate-900 font-bold">我已詳細閱讀並同意上述條款</span>
                </label>

                <button
                    onClick={onAgree}
                    disabled={!checked}
                    className={`w-full py-4 rounded-xl font-bold text-lg transition tracking-wide ${checked ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:brightness-110 shadow-lg shadow-emerald-500/30' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                >
                    同意並繼續
                </button>
            </div>
        </div>
    );
};

const SetupAliasScreen = ({ onSave }) => {
    const [localAlias, setLocalAlias] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!localAlias) return;
        setLoading(true);
        try {
            // Uniqueness check (client-side simple check before proceed)
            // Real check happens in onSave logic if pushed up, or we assume VibeAdmin handles it.
            // Let's do a quick check here if possible or trust the callback.
            await onSave(localAlias);
        } catch (e) {
            console.error(e);
            alert(e.message || '設定失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-50 z-[100] flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <div className="text-5xl mb-6 text-slate-900">🆔</div>
                <h2 className="text-3xl font-bold text-slate-900 mb-4">設定您的專屬 ID</h2>
                <p className="text-slate-500 mb-8 leading-relaxed">
                    這是您的全域唯一識別碼，將用於您的所有專案連結。<br />
                    <span className="text-xs text-slate-400">( 設定後不可隨意修改，請謹慎填寫 )</span>
                </p>

                <div className="text-left mb-2 text-xs text-slate-400 pl-1">User Alias (僅限英文數字)</div>
                <input
                    type="text"
                    value={localAlias}
                    onChange={(e) => setLocalAlias(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="例如: lawrence_2024"
                    className="w-full p-4 bg-slate-100 border border-slate-300 rounded-xl text-slate-900 outline-none mb-6 text-lg placeholder:text-slate-400 focus:border-[#10b981] focus:bg-slate-200 transition"
                />

                <div className="bg-slate-50 p-3 rounded-lg mb-6 flex items-center gap-2 justify-center text-xs text-slate-400 font-mono">
                    <span>預覽:</span>
                    <span className="text-emerald-500">/u/{localAlias || 'your-id'}/...</span>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={loading || !localAlias}
                    className="w-full py-4 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-[#10b981]/30 hover:bg-[#059669] disabled:opacity-50 transition text-lg"
                >
                    {loading ? '設定中...' : '確認 ID'}
                </button>
            </div>
        </div>
    );
};

// --- Create Project Modal ---
const CreateProjectModal = ({ userProfile, defaultName, onClose, onCreate }) => {
    const [name, setName] = useState(defaultName);
    const [projectType, setProjectType] = useState('website');
    const [projectAlias, setProjectAlias] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!name || !projectAlias) {
            alert('專案名稱與 ID 皆為必填');
            return;
        }
        setLoading(true);
        try {
            // Check alias uniqueness for this user
            const q = query(
                collection(db, 'projects'),
                where('userId', '==', userProfile.userId),
                where('projectAlias', '==', projectAlias)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                alert('此專案 ID 已存在，請更換一個。');
                setLoading(false);
                return;
            }
            // Proceed to create
            await onCreate({ name, projectAlias, projectType });
        } catch (e) {
            console.error(e);
            alert('建立前檢查失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-50/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
            <div className="bg-white border border-slate-200 shadow-xl p-6 rounded-2xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900">✕</button>
                <div className="text-4xl mb-4 text-center">📁</div>
                <h3 className="text-2xl font-bold mb-2 text-emerald-500 text-center">建立新專案</h3>
                <p className="text-slate-500 mb-6 text-sm text-center">
                    請決定專案名稱與網址 ID，建立後<strong className="text-red-500 ml-1">網址 ID 均不可修改</strong>。
                </p>

                <div className="space-y-5">
                    <div className="flex flex-col">
                        <label className="text-sm text-slate-600 font-bold mb-1">專案名稱</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="例如: 2026年行銷活動"
                            className="rounded-lg p-3 text-base outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-sm text-slate-600 font-bold mb-1">專案類型</label>
                        <select
                            value={projectType}
                            onChange={(e) => setProjectType(e.target.value)}
                            className="rounded-lg p-3 text-base outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                        >
                            <option value="landingPage">🚀 Landing Page (品牌/店家)</option>
                            <option value="website">🌐 一般網站</option>
                            <option value="interactive_tool">🎯 互動式拓客工具</option>
                            <option value="namecard">📇 電子名片</option>
                            <option value="game">🎮 Web 小遊戲</option>
                            <option value="form">📝 電子表單</option>
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-sm text-slate-600 font-bold mb-1">專案自訂 ID (Project Alias)</label>
                        <input
                            type="text"
                            value={projectAlias}
                            onChange={(e) => setProjectAlias(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                            placeholder="僅限英文數字，例如: event_2026"
                            className="rounded-lg p-3 text-base outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />
                        <div className="bg-slate-50 p-3 rounded-lg mt-2 flex items-center justify-center text-xs text-slate-500 font-mono break-all">
                            /u/{userProfile.alias || userProfile.userId}/<span className="text-emerald-500 ml-1">{projectAlias || 'project-id'}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={loading || !name || !projectAlias}
                        className="w-full py-3 mt-2 bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 disabled:opacity-50 transition text-lg"
                    >
                        {loading ? '建立中...' : '確認建立'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ActivationScreen = ({ user, onRedeem, mode = 'activate' }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!code) return;
        setLoading(true);
        try {
            await onRedeem(code);
        } catch (e) {
            console.error(e);
            alert('啟用失敗：' + (e.message || '未知錯誤'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <div className="text-4xl mb-4">🔑</div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{mode === 'activate' ? '啟用您的帳號' : '請輸入您的金鑰'}</h2>
                <p className="text-slate-500 mb-6 text-sm">
                    {mode === 'activate'
                        ? '初次使用請輸入產品序號以啟用服務。'
                        : '請輸入新的序號以啟用或延長服務效期。'}
                </p>

                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="VIBE-XXXX-YYYY"
                    className="w-full text-center text-xl tracking-widest p-3 bg-slate-100 border border-slate-300 rounded-lg text-slate-900 outline-none mb-4 uppercase placeholder:text-slate-400 placeholder:tracking-normal focus:border-[#10b981] focus:bg-slate-200 transition"
                />

                <button
                    onClick={handleSubmit}
                    disabled={loading || !code}
                    className="w-full py-3 bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-bold rounded-lg hover:brightness-110 disabled:opacity-50 transition"
                >
                    {loading ? '驗證中...' : '啟用序號'}
                </button>

                {mode === 'expire' && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                        <a href="/" className="text-sm text-slate-500 hover:text-slate-900 underline">回到列表</a>
                    </div>
                )}
            </div>
        </div>
    );
};

const BannedScreen = () => (
    <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-4xl font-bold text-red-500 mb-4">⛔ 帳號已停權</h1>
        <p className="text-red-600">由於違反使用規範，您的帳號已被暫停使用。</p>
        <p className="text-red-500 text-sm mt-2">如有疑問請聯繫管理員。</p>
    </div>
);

// --- Main Components ---

const getSeoData = (html) => {
    if (!html) return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return {
        title: doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || '無標題',
        desc: doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '無描述',
        image: doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
    };
};

const ProjectCard = ({ project, onEdit, onDelete, userProfile }) => {
    const seo = useMemo(() => {
        return project.htmlCode ? getSeoData(project.htmlCode) : null;
    }, [project.htmlCode]);

    // Construct URL with Aliases if available
    // Priority: Global User Alias > Project User Alias (Legacy) > User ID
    const userParam = userProfile?.alias || project.userAlias || project.userId;
    const projectParam = project.projectAlias || project.id;
    // Add timestamp for cache busting
    // use stable timestamp initialized at mount
    const [timestamp] = useState(() => {
        return project.updatedAt?.seconds ?? Math.floor(Date.now() / 1000);
    });
    const [copyLinkMsg, setCopyLinkMsg] = useState('');

    const projectUrl = `https://lionbaker-run.web.app/u/${userParam}/${projectParam}?t=${timestamp}`;
    // 供複製使用的乾淨連結（不含 timestamp）
    const cleanProjectUrl = `https://lionbaker-run.web.app/u/${userParam}/${projectParam}`;

    const handleCopyLink = async () => {
        const success = await copyToClipboard(cleanProjectUrl);
        setCopyLinkMsg(success ? '✓ 已複製' : '複製失敗');
        setTimeout(() => setCopyLinkMsg(''), 1500);
    };

    return (
        <div className="bg-white border border-slate-200 shadow-xl p-5 rounded-xl hover:bg-slate-50 transition group relative flex flex-col h-full">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border mb-2 inline-block ${project.type === 'game' ? 'border-pink-500 text-pink-500' :
                        project.type === 'namecard' ? 'border-blue-500 text-blue-500' :
                        project.type === 'form' ? 'border-amber-500 text-amber-500' :
                        project.type === 'interactive_tool' ? 'border-purple-500 text-purple-500' :
                        project.type === 'landingPage' ? 'border-indigo-500 text-indigo-500' :
                        'border-green-500 text-green-500'
                        }`}>
                        {project.type === 'game' ? '🎮 Web 小遊戲' : 
                         project.type === 'namecard' ? '📇 電子名片' : 
                         project.type === 'form' ? '📝 電子表單' : 
                         project.type === 'interactive_tool' ? '🎯 互動式工具' :
                         project.type === 'landingPage' ? '🚀 Landing Page' :
                         '🌐 一般網站'}
                    </span>
                    <h3 className="font-bold text-lg leading-tight text-slate-900 mb-1">{project.name}</h3>

                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onEdit(project)}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-sm transition text-slate-700"
                    >
                        編輯
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); if (window.confirm('確定刪除此專案與所有關聯圖片嗎？')) onDelete(project.id); }}
                        className="px-3 py-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded text-sm transition"
                    >
                        刪除
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            {project.htmlCode ? (
                <>
                    <div className="flex-1 bg-[#2b2b2b] rounded-lg overflow-hidden border border-slate-200 mb-4 min-h-[200px] flex flex-col">
                        {seo ? (
                            <>
                                {seo.image ? (
                                    <img src={seo.image} alt="og" className="w-full h-32 object-cover" />
                                ) : (
                                    <div className="w-full h-32 bg-slate-200 flex items-center justify-center text-slate-500 text-xs">No Image</div>
                                )}
                                <div className="p-3 bg-[#1a1a1a] flex-1">
                                    <div className="font-bold text-sm truncate mb-1 text-slate-700 text-left">{seo.title}</div>
                                    <div className="text-xs text-slate-400 line-clamp-2 text-left">{seo.desc}</div>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-6 text-slate-400 text-sm">
                                <span className="mb-2 text-2xl">📝</span>
                                <span>尚無 SEO 預覽</span>
                                <div className="mt-2 text-xs opacity-50 text-center">編輯並儲存後即可預覽</div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            // 在 LINE 客戶端內強制用外部瀏覽器開啟
                            if (liff.isInClient()) {
                                liff.openWindow({ url: projectUrl, external: true });
                            } else {
                                window.open(projectUrl, '_blank', 'noreferrer');
                            }
                        }}
                        className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-[#10b981]/20 rounded-lg text-center text-sm transition flex items-center justify-center gap-2"
                    >
                        🔗 開啟網頁
                    </button>
                    {/* 複製連結按鈕 */}
                    <button
                        onClick={handleCopyLink}
                        className="mt-2 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg text-center text-sm transition flex items-center justify-center gap-2"
                    >
                        {copyLinkMsg ? (
                            <span className="text-emerald-600 font-bold">{copyLinkMsg}</span>
                        ) : (
                            <>📋 複製連結</>
                        )}
                    </button>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 italic text-sm border border-white/5 rounded-lg mb-4 bg-slate-50">
                    尚無程式碼
                </div>
            )}

            <div className="mt-3 text-[10px] text-slate-400 text-right">
                {project.updatedAt?.seconds ? new Date(project.updatedAt.seconds * 1000).toLocaleDateString() : ''}
            </div>
        </div>
    );
};

const ProjectList = ({ projects, onCreate, onEdit, onDelete, userProfile }) => (
    <div className="w-full max-w-5xl space-y-6">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-emerald-500">我的專案列表</h2>
            <button
                onClick={onCreate}
                className="px-6 py-2 bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-bold rounded-lg hover:brightness-110 transition shadow-[0_0_15px_rgba(var(--theme-accent-rgb),0.5)]"
            >
                + 新增專案
            </button>
        </div>

        {projects.length === 0 ? (
            <div className="text-center py-12 bg-white border border-slate-200 shadow-xl rounded-xl text-slate-500">
                目前沒有專案，按右上角新增！
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((p) => (
                    <ProjectCard
                        key={p.id}
                        project={p}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        userProfile={userProfile}
                    />
                ))}
            </div>
        )}
    </div>
);

const ProjectEditor = ({ project, onSave, onBack, userProfile }) => {
    // Basic State
    const [projectType, setProjectType] = useState(project.type || 'namecard');
    const [templateKey, setTemplateKey] = useState('insurance');
    const [statusMsg, setStatusMsg] = useState('');
    const fileInputRef = useRef(null);
    const [saveWarning, setSaveWarning] = useState(null);

    // Shared Fields
    const [commonData, setCommonData] = useState({
        name: project.name || `專案 ${new Date().toISOString().slice(0, 10)}`,
        id: project.id, // For display
        mainColor: project.mainColor || '高科技黑',
        style: project.style || '現代簡約，卡片式設計，帶有質感',
        requirements: project.requirements || '',
        htmlCode: project.htmlCode || '',
        // Aliases
        userAlias: userProfile.alias || '', // Use global alias
        projectAlias: project.projectAlias || '',
        useLiff: project.useLiff || false,
        liffId: project.liffId || '',
        liffFeatures: project.liffFeatures || [],
        enableDatabase: project.enableDatabase || false,
        enableStorage: project.enableStorage || false
    });

    const checkProjectAlias = async (val) => {
        if (!val || val === project.projectAlias) return true;
        // Check if this project alias is already used by THIS user
        const q = query(
            collection(db, 'projects'),
            where('userId', '==', userProfile.userId),
            where('projectAlias', '==', val)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
            // Need to make sure it's not the current doc itself (though unlikely if new)
            const exists = snap.docs.some(d => d.id !== project.id);
            if (exists) return false;
        }
        return true;
    };

    // NameCard State (Merge if exists)
    const [cardData, setCardData] = useState({
        personName: project.personName || '陳嘉吉', // Default name
        title: project.title || '保險經紀人',
        honor: project.honor || '2025 IFPA 亞太保險精英獎',
        phone: project.phone || '0931631725',
        lineId: project.lineId || 'lawrence_chen',
        lineLink: project.lineLink || 'https://line.me/ti/p/RMrbUVJJ9l',
        avatar: project.avatar || DEFAULT_AVATARS[0].url,
        introContent: project.introContent || '在這個瞬息萬變的時代，您需要的不是一份保單，而是一份對未來的承諾。',
        services: project.services || '保險保障、資產傳承、財務規劃',
        item1Title: project.item1Title || '【住院要注意什麼才能理賠？】',
        item1Content: project.item1Content || '診斷證明書、醫療收據...',
        item2Title: project.item2Title || '【車禍標準處理程序 SOP】',
        item2Content: project.item2Content || '報警、保持現場、蒐證...',
        item3Title: project.item3Title || '【新生兒投保黃金期】',
        item3Content: project.item3Content || '出生7-10天內...'
    });

    // Game State
    const [gameData, setGameData] = useState({
        orientation: project.orientation || 'auto',
        platform: project.platform || 'mobile',
        requirements: project.requirements || '' // Share requirements field usually
    });

    // Interactive Tool State
    const [interactiveData, setInteractiveData] = useState({
        templateKey: project.templateKey || 'insurance_retirement',
        expertName: project.expertName || '',
        expertAvatar: project.expertAvatar || DEFAULT_AVATARS[0].url,
        ctaLink: project.ctaLink || 'https://line.me/ti/p/your_id',
        requirements: project.requirements || INTERACTIVE_TEMPLATES['insurance_retirement'].requirements
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
        requirements: project.requirements || LANDING_PAGE_TEMPLATES['cafe'].requirements
    });

    // Form State
    const [formData, setFormData] = useState({
        requirements: project.requirements || '表單欄位要求：\n1. 姓名\n2. 電話\n3. Email\n4. 留言內容'
    });

    // Images
    const [uploadedImages, setUploadedImages] = useState(project.imageUrls ? project.imageUrls.map(url => ({ url, name: 'Image' })) : []);
    const [uploading, setUploading] = useState(false);

    // SEO
    const [ogData, setOgData] = useState({ title: '', description: '', image: '' });
    const isUpdatingRef = useRef(false);

    // Styling
    const currentAccentHex = PREMIUM_COLORS.find(c => c.value === commonData.mainColor)?.hex || '#00ffff';

    useEffect(() => {
        // Init SEO preview if HTML exists
        if (commonData.htmlCode) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(commonData.htmlCode, 'text/html');
            const getMeta = (p) => doc.querySelector(`meta[property="${p}"]`)?.getAttribute('content')
                || doc.querySelector(`meta[name="${p}"]`)?.getAttribute('content') || '';
            setOgData({
                title: getMeta('og:title') || doc.title || '',
                description: getMeta('og:description') || getMeta('description') || '',
                image: getMeta('og:image') || '',
            })
        }
    }, []);

    // ... SEO Logic (Simplified for brevity, same as V2) ...
    // --- SEO Logic ---
    useEffect(() => {
        if (isUpdatingRef.current) return;
        if (!commonData.htmlCode) {
            setOgData({ title: '', description: '', image: '' });
            return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(commonData.htmlCode, 'text/html');

        const getMeta = (property) => {
            return doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ||
                doc.querySelector(`meta[name="${property}"]`)?.getAttribute('content') || '';
        };

        const newOgData = {
            title: getMeta('og:title') || doc.title || '',
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

            // 1. Handle OG Tags (property="og:...")
            const ogRegex = new RegExp(`(<meta\\s+(?:property|name)=["']og:${key}["']\\s+content=["'])([\\s\\S]*?)(["']\\s*/?>)`, 'ig');
            let ogMatchCount = 0;
            newHtml = newHtml.replace(ogRegex, (match, p1, p2, p3) => {
                ogMatchCount++;
                if (ogMatchCount === 1) return `${p1}${safeVal}${p3}`;
                return '';
            });
            if (ogMatchCount === 0) {
                // Insert if missing (Prepend to head for simplicity)
                const headRegex = /<head>/i;
                if (headRegex.test(newHtml)) {
                    newHtml = newHtml.replace(headRegex, `<head>\n    <meta property="og:${key}" content="${safeVal}" />`);
                }
            }

            // 2. Handle Standard Description
            if (key === 'description') {
                const nameRegex = new RegExp(`(<meta\\s+name=["']description["']\\s+content=["'])([\\s\\S]*?)(["']\\s*/?>)`, 'ig');
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

            // 3. Handle <title>
            if (key === 'title') {
                const titleTagRegex = /<title>([\s\S]*?)<\/title>/ig;
                let titleMatchCount = 0;
                newHtml = newHtml.replace(titleTagRegex, (match, p1) => {
                    titleMatchCount++;
                    if (titleMatchCount === 1) return `<title>${val}</title>`; // Title usually doesn't need quote escape inside tag
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

        setCommonData(prev => ({ ...prev, htmlCode: newHtml }));

        setTimeout(() => {
            isUpdatingRef.current = false;
        }, 0);
    };
    // [Manual Implementation Note: I will keep the full SEO logic when generating the file]

    // Handlers
    const handleCommonChange = (e) => setCommonData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleCardChange = (e) => setCardData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleGameChange = (e) => setGameData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleLandingPageChange = (e) => setLandingPageData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleFormChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleFilesUpload = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        setUploading(true);
        setStatusMsg('正在上傳圖片...');
        try {
            const files = Array.from(e.target.files);
            const newUploads = [];
            for (const file of files) {
                // Path: project_assets/{projectId}/{timestamp}_{name}
                const storageRef = ref(storage, `project_assets/${project.id}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(storageRef, file);
                const url = await getDownloadURL(snapshot.ref);
                newUploads.push({ url, name: file.name });
            }
            // Update local state AND Firestore immediately to associate images
            const updatedImages = [...uploadedImages, ...newUploads];
            setUploadedImages(updatedImages);

            // Auto-save image list to firestore
            const docRef = doc(db, 'projects', project.id);
            await updateDoc(docRef, { imageUrls: updatedImages.map(img => img.url) });

            setStatusMsg(`成功上傳 ${newUploads.length} 張圖片！`);
            if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
        } catch (error) {
            console.error('Upload error:', error);
            setStatusMsg('上傳失敗: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    // 儲存成功後若在 LINE 對話中開啟，自動發送通知訊息到對話
    const sendLineNotification = async () => {
        try {
            // 確認 liff 已在 LINE 客戶端內（非外部瀏覽器）
            if (typeof liff === 'undefined' || !liff.isInClient()) return;
            // 確認 context type 可接收聊天室訊息
            const ctx = liff.getContext();
            const validTypes = ['utou', 'room', 'group'];
            if (!ctx || !validTypes.includes(ctx.type)) return;
            // 組合乾淨的專案網址（不含 timestamp）
            const userParam = userProfile?.alias || userProfile?.userId;
            const projectParam = commonData.projectAlias || project.id;
            const projectUrl = `https://lionbaker-run.web.app/u/${userParam}/${projectParam}`;
            await liff.sendMessages([
                {
                    type: 'text',
                    text: `✅ 您已成功建立/修改程式碼\n「${commonData.name}」\n${projectUrl}`
                }
            ]);
        } catch (err) {
            // 靜默處理不影響主儲存流程
            console.warn('LINE 通知發送失敗:', err);
        }
    };

    const handleSave = async (shouldGoBack = true, ignoreWarning = false) => {
        // Validate Project Alias
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
                imageUrls: uploadedImages.map(img => img.url),
                updatedAt: serverTimestamp(),
                // Use first image as thumbnail
                thumbnail: uploadedImages.length > 0 ? uploadedImages[0].url : null,
                userAlias: commonData.userAlias || '',
                projectAlias: commonData.projectAlias || ''
            };
            if (projectType === 'namecard') Object.assign(docData, cardData);
            else if (projectType === 'game') Object.assign(docData, gameData);
            else if (projectType === 'interactive_tool') Object.assign(docData, interactiveData);
            else if (projectType === 'landingPage') Object.assign(docData, landingPageData);
            else if (projectType === 'form') Object.assign(docData, formData);

            await updateDoc(doc(db, 'projects', project.id), docData);

            // 儲存成功後若程式碼有內容，嘗試發送 LINE 對話通知
            if (commonData.htmlCode?.trim()) {
                sendLineNotification();
            }

            if (shouldGoBack) {
                alert('儲存成功！');
                onSave(); // Go back
            } else {
                setStatusMsg('已自動儲存專案');
            }
        } catch (error) {
            console.error(error);
            setStatusMsg('儲存失敗');
        }
    };

    // Prompt Generation (Same as V2)
    const generatePrompt = () => {
        const imageListText = uploadedImages.length > 0
            ? uploadedImages.map((img, idx) => `[圖片${idx + 1}]: ${img.url}`).join('\n')
            : '無';

        let liffInstructions = '';
        if (commonData.useLiff && commonData.liffId) {
            const features = commonData.liffFeatures || [];
            let featureText = '';
            if (features.includes('profile')) featureText += '\n- 在初始化後呼叫 liff.getProfile() 取得用戶名稱、頭像等基本資料，並顯示於畫面上。';
            if (features.includes('sendMessages')) featureText += '\n- 實作按鈕觸發 liff.sendMessages()。⚠️ 錯誤防範：呼叫前務必檢查 `!liff.isInClient()`，並確認 `liff.getContext()?.type` 為 `"utou"`, `"room"`, 或 `"group"` 之一。若不符合 (例如 type 為 none, external, square)，代表沒有「可傳送的對象聊天室」，必須用 alert 提示「請在與好友或群組的聊天視窗內開啟此功能」，以完全避免 INVALID_RECEIVER 錯誤。';
            if (features.includes('shareTargetPicker')) featureText += '\n- 實作按鈕觸發 liff.shareTargetPicker()。⚠️ 錯誤防範：呼叫前務必以 `liff.isApiAvailable("shareTargetPicker")` 檢查，並提供適當的 catch 處理。';

            liffInstructions = `
■ LINE LIFF 整合 (必做)
本專案為 LINE LIFF 應用程式，請務必嚴格執行以下要求：
1. 請在 HTML 的 <head> 標籤中引入 LIFF SDK：<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
2. 在主要的 JavaScript 區塊中，為了避免 iOS LIFF 網路延遲導致畫面卡死，請實作初始化與逾時防呆機制 (設定 5 秒)。範例：
   Promise.race([
       liff.init({ liffId: "${commonData.liffId}" }),
       new Promise((_, reject) => setTimeout(() => reject(new Error('LIFF_TIMEOUT')), 5000))
   ]).then(() => { /* 進入正式邏輯 */ }).catch(err => { /* 在畫面上顯示明顯的「載入逾時重試」按鈕 */ });
   (請確保網址與此 liffId 絕對對應，否則會發生 INVALID_RECEIVER 錯誤)。
3. 所有的主要畫面渲染或操作邏輯，必須確保是在 \`liff.init()\` 成功解析之後才執行。${featureText}
`;
        }

        let apiInstructions = '';
        const isDbEnabled = projectType === 'form' || commonData.enableDatabase;
        const isStorageEnabled = projectType === 'form' || commonData.enableStorage;

        if (isDbEnabled || isStorageEnabled) {
            apiInstructions += '\n■ 資料存取規範 (非常重要)\n1. 嚴格禁止載入或使用 Firebase SDK (例如 import { getFirestore } 等)。\n';
            if (isDbEnabled) {
                apiInstructions += `2. API 支援完整的 CRUD 操作：
   [新增/更新文件 (Upsert)] 使用 POST：
   fetch('https://lionbaker-run.web.app/api/project/' + projectId + '/db/yourCollectionName', {
       method: 'POST', body: JSON.stringify({ _id: '自訂唯一標識符(可選)', ...data }), ...headers
   }) // 💡 提示：帶上 _id 可以避免重複新增，會以該名稱當作文件 ID 覆蓋寫入。
   
   [取得集合列表] 使用 GET：
   fetch('https://lionbaker-run.web.app/api/project/' + projectId + '/db/yourCollectionName')
   
   [修改特定文件] 使用 PUT：
   fetch('https://lionbaker-run.web.app/api/project/' + projectId + '/db/yourCollectionName/' + docId, { method: 'PUT', ... })
   
   [刪除特定文件] 使用 DELETE：
   fetch('https://lionbaker-run.web.app/api/project/' + projectId + '/db/yourCollectionName/' + docId, { method: 'DELETE' })\n`;
            }
            if (isStorageEnabled) {
                apiInstructions += `3. 若需要讓使用者選擇並上傳圖片，請讀取檔案轉為 Base64 並使用 fetch 呼叫 Storage API：
   fetch('https://lionbaker-run.web.app/api/project/' + projectId + '/storage', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ fileName: file.name, fileBase64: base64String, contentType: file.type })
   }).then(res => res.json()).then(data => { /* data.url 即為公開圖片網址 */ });\n`;
            }
            apiInstructions += `4. 網頁執行時可以透過以下程式碼取得目前的 projectId：
   const projectId = document.querySelector('meta[name="x-project-id"]')?.content;
   if (!projectId) { console.error("找不到專案 ID"); return; }
`;
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
務必包含完整的 SEO Meta Tags (og:title, og:description, og:image) 以利社群分享。
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
● 主圖請優先使用：${cardData.avatar}

■ 自我介紹與服務
● 自介：${cardData.introContent}
● 服務項目：${cardData.services}

■ 重點展示 (摺疊選單)
1. ${cardData.item1Title}：${cardData.item1Content}
2. ${cardData.item2Title}：${cardData.item2Content}
3. ${cardData.item3Title}：${cardData.item3Content}

■ 請注意
請製作單頁式、RWD 手機優先的網頁。務必包含 SEO Meta Tags 與 PWA 設定 (manifest, apple-touch-icon)。
`;
        } else if (projectType === 'game') {
            prompt = `【Web 小遊戲開發需求單】
${baseInfo}
■ 遊戲規格
● 螢幕方向：${gameData.orientation}
● 目標平台：${gameData.platform}
● 遊戲玩法/需求：${gameData.requirements}

`;
        } else if (projectType === 'interactive_tool') {
            prompt = `【互動式拓客工具開發需求單】
${baseInfo}
■ 核心設定
● 專家/品牌名稱：${interactiveData.expertName}
● 專家頭像優先使用：${interactiveData.expertAvatar}
● 最終導流 (CTA) 連結：${interactiveData.ctaLink}

■ 工具邏輯與拓客機制 (極重要)
${interactiveData.requirements}

■ 開發與 UI 嚴格規範
1. 必須是單頁式 SPA (純 HTML+CSS+JS 或 React)，RWD 手機優先。
2. 一定要實作「多步驟」或「互動狀態切換」機制 (如：歡迎頁 -> 輸入頁/測驗頁 -> 載入動畫動畫 -> 結果頁)。不可只寫一個死板的長表單。
3. UI 質感要求：現代化 iOS / 高質感風格。使用大圓角 (如 rounded-2xl)、柔和陰影 (shadow-lg)、寬裕的留白 (p-6)。背景請搭配乾淨設計。
4. 表單與元件必須採用標準 Flexbox (flex-col, gap) 佈局，絕對禁止使用難以維護的絕對定位 (position: absolute) 或浮動標籤 (Floating Labels) 排版。
5. 拓客機制實作：在結果頁面，務必將部分重要結果隱藏或模糊處理，並顯示強烈的 CTA 按鈕 (如「解鎖完整報告」、「領取專屬企劃」)，點擊後必須觸發跳轉至「最終導流 (CTA) 連結」。
6. 所有的按鈕、輸入框必須注重互動反饋 (hover/active state)。
`;
        } else if (projectType === 'landingPage') {
            prompt = `【品牌/店家 Landing Page 開發需求單】
${baseInfo}
■ 核心品牌資訊
● 品牌/店家名稱：${landingPageData.storeName}
● 品牌Logo優先使用：${landingPageData.logoUrl}
● 品牌故事/理念：${landingPageData.brandStory}
● 營業時間：${landingPageData.businessHours}
● 聯絡資訊 (地址/電話)：${landingPageData.contactInfo}
● 主打特色/服務項目：
${landingPageData.features}

■ 頁面企劃與拓客機制 (極重要)
${landingPageData.requirements}

■ 開發與 UI 嚴格規範
1. 必須是單頁式 SPA (純 HTML+CSS+JS 或 React)，RWD 手機優先。
2. 視覺排版：給人強烈印象及消費衝動的專業著陸頁，需大量加入滿版高質感真實照片與特效裝飾，並針對指定的行業進行動線規劃。
3. UI 質感要求：現代化風格，適當運用卡片式設計，採用標準 Flexbox 佈局，請使用清晰易讀的大型按鈕 (CTA)。
4. 所有的按鈕、互動必須明確引導使用者了解品牌並點擊購買或加好友。
`;
        } else if (projectType === 'form') {
            prompt = `【電子表單開發需求單】
${baseInfo}
■ 表單與資料處理需求
${formData.requirements}

■ 開發與 UI 嚴格規範
1. 必須是 RWD 手機優先的單頁表單。
2. 表單提交時，必須使用上方提供的「資料存取規範 POST API」將資料寫入至 \`form_responses\` 這個 collection 中 (不要更改集合名稱)。
3. 欄位的 name 或 key 請使用小寫英文（例如 name, phone, email, message）。
4. 提交後請給予明確的成功提示（例如：跳轉感謝頁或顯示彈出視窗）。
`;
        } else {
            prompt = `【網站開發需求單】
${baseInfo}
■ 詳細需求
${commonData.requirements}

■ 請注意
請製作單頁式、RWD 手機優先的網頁。
務必包含完整的 SEO Meta Tags (og:title, og:description, og:image) 以利社群分享。
`;
        }

        // Replace [圖片N] placeholders with actual URLs in the generated prompt text
        let finalPrompt = prompt;
        uploadedImages.forEach((img, idx) => {
            const placeholder = `\\[圖片${idx + 1}\\]`;
            const regex = new RegExp(placeholder, 'g');
            finalPrompt = finalPrompt.replace(regex, img.url);
        });

        return finalPrompt;
    };

    return (
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in-up">
            <div className="lg:col-span-2 flex items-center gap-4 mb-2">
                <button onClick={onBack} className="px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 transition">← 返回列表</button>
                {/* <div className="text-slate-500 font-mono text-sm">Project ID: {project.id}</div> */}
                <div className="ml-auto text-green-400 text-sm">{statusMsg}</div>
            </div>

            {/* Left Column */}
            <div className="space-y-6">
                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">1. 基本設定</h2>
                    {/* <div className="mb-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="text-xs text-slate-500 mb-1 block">專案專屬網址</label>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 text-sm text-slate-700 font-mono break-all line-clamp-2">
                                https://lionbaker-run.web.app/u/{userProfile.alias || userProfile.userId}/{commonData.projectAlias || project.id}
                            </div>
                            <button
                                onClick={async () => {
                                    const url = `https://lionbaker-run.web.app/u/${userProfile.alias || userProfile.userId}/${commonData.projectAlias || project.id}`;
                                    const success = await copyToClipboard(url);
                                    if (success) {
                                        setStatusMsg('✓ 連結已複製');
                                        setTimeout(() => setStatusMsg(''), 1500);
                                    }
                                }}
                                className="shrink-0 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-200 rounded-lg text-xs transition font-bold whitespace-nowrap"
                            >
                                📋 複製
                            </button>
                        </div>
                    </div> */}
                    <div className="space-y-4">
                        <FormSelect label="專案類型 (建立後不可修改)" value={projectType} onChange={(e) => setProjectType(e.target.value)} disabled={true}>
                            <option value="landingPage">🚀 Landing Page (品牌/店家)</option>
                            <option value="website">🌐 一般網站</option>
                            <option value="interactive_tool">🎯 互動式拓客工具</option>
                            <option value="namecard">📇 電子名片</option>
                            <option value="game">🎮 Web 小遊戲</option>
                            <option value="form">📝 電子表單</option>
                        </FormSelect>
                        <FormInput label="專案名稱" name="name" value={commonData.name} onChange={handleCommonChange} />

                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">主色調</label>
                                <div className="flex gap-2">
                                    <input type="text" name="mainColor" value={commonData.mainColor} onChange={handleCommonChange} className="flex-1 rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200" />
                                    <select className="w-10 h-10 flex items-center justify-center rounded p-1 text-center bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer text-lg" onChange={(e) => setCommonData(prev => ({ ...prev, mainColor: e.target.value }))} value="">
                                        <option value="" disabled>🎨</option>
                                        {PREMIUM_COLORS.map(c => <option key={c.name} value={c.value}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">設計風格</label>
                                <div className="flex gap-2">
                                    <input type="text" name="style" value={commonData.style} onChange={handleCommonChange} className="flex-1 rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200" />
                                    <select className="w-10 h-10 flex items-center justify-center rounded p-1 text-center bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer text-lg" onChange={(e) => setCommonData(prev => ({ ...prev, style: e.target.value }))} value="">
                                        <option value="" disabled>✨</option>
                                        {DESIGN_STYLES.map(s => <option key={s.name} value={s.value}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <hr className="border-slate-100 my-2" />
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer mb-2 group select-none">
                                    <input
                                        type="checkbox"
                                        checked={commonData.useLiff}
                                        onChange={(e) => setCommonData(prev => ({ ...prev, useLiff: e.target.checked }))}
                                        className="w-4 h-4 accent-emerald-500"
                                    />
                                    <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition">啟用 LINE LIFF 整合</span>
                                </label>

                                {commonData.useLiff && (
                                    <div className="ml-6 flex flex-col gap-3 animate-fade-in-up mt-2">
                                        <div>
                                            <label className="text-xs text-slate-500 block mb-1">LINE LIFF ID</label>
                                            <input
                                                type="text"
                                                name="liffId"
                                                value={commonData.liffId}
                                                onChange={handleCommonChange}
                                                placeholder="請填入從 LINE Developer 取回的 LIFF ID"
                                                className="w-full rounded p-2 text-sm outline-none bg-white border border-emerald-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                            <span className="text-sm font-bold text-emerald-700 mb-1">希望 LINE LIFF 功能包含：</span>
                                            <label className="flex items-center gap-2 cursor-pointer text-sm text-emerald-800 p-1 hover:bg-emerald-100 rounded">
                                                <input type="checkbox" className="w-4 h-4 accent-emerald-500"
                                                    checked={commonData.liffFeatures?.includes('profile')}
                                                    onChange={(e) => {
                                                        const current = commonData.liffFeatures || [];
                                                        const next = e.target.checked ? [...current, 'profile'] : current.filter(f => f !== 'profile');
                                                        setCommonData(prev => ({ ...prev, liffFeatures: next }));
                                                    }} />
                                                取得用戶基本資料 (Profile)
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer text-sm text-emerald-800 p-1 hover:bg-emerald-100 rounded">
                                                <input type="checkbox" className="w-4 h-4 accent-emerald-500"
                                                    checked={commonData.liffFeatures?.includes('sendMessages')}
                                                    onChange={(e) => {
                                                        const current = commonData.liffFeatures || [];
                                                        const next = e.target.checked ? [...current, 'sendMessages'] : current.filter(f => f !== 'sendMessages');
                                                        setCommonData(prev => ({ ...prev, liffFeatures: next }));
                                                    }} />
                                                傳送訊息到聊天室 (Send Messages)
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer text-sm text-emerald-800 p-1 hover:bg-emerald-100 rounded">
                                                <input type="checkbox" className="w-4 h-4 accent-emerald-500"
                                                    checked={commonData.liffFeatures?.includes('shareTargetPicker')}
                                                    onChange={(e) => {
                                                        const current = commonData.liffFeatures || [];
                                                        const next = e.target.checked ? [...current, 'shareTargetPicker'] : current.filter(f => f !== 'shareTargetPicker');
                                                        setCommonData(prev => ({ ...prev, liffFeatures: next }));
                                                    }} />
                                                分享訊息給好友 (Share Target Picker)
                                            </label>
                                        </div>
                                        <p className="text-[10px] text-emerald-600 mt-1">
                                            系統將自動在產出的程式碼中增加對應的 Prompt 提示。
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">2. 圖片素材</h2>
                    <div className="mb-4">
                        <label className="block text-sm text-slate-500 mb-2">上傳圖片 (自動關聯至此專案)</label>
                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file" multiple onChange={handleFilesUpload} disabled={uploading}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-emerald-500 file:text-white shadow-md shadow-emerald-500/20 hover:file:bg-white/80"
                            />
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
                                <button
                                    onClick={async () => {
                                        const success = await copyToClipboard(img.url);
                                        if (success) {
                                            alert('圖片網址已複製！');
                                        } else {
                                            alert('複製失敗，請手動選取複製。');
                                        }
                                    }}
                                    className="absolute bottom-1 right-1 bg-white border border-emerald-100 text-emerald-600 text-[10px] px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-emerald-50"
                                >
                                    🔗 複製網址
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">3. 詳細需求</h2>
                    {projectType === 'namecard' && (
                        <div className="space-y-4">
                            <FormSelect label="快速模版" value={templateKey} onChange={(e) => {
                                const t = INDUSTRY_TEMPLATES[e.target.value];
                                if (t) {
                                    setTemplateKey(e.target.value);
                                    setCardData(prev => ({
                                        ...prev, personName: t.label.split(' / ')[0], title: t.label, honor: t.award, introContent: t.selfIntro, services: t.services,
                                        avatar: t.photoUrl.replace('pngg', 'png'), // Fix typo if exists
                                        item1Title: t.tips[0].title, item1Content: t.tips[0].content,
                                        item2Title: t.tips[1].title, item2Content: t.tips[1].content,
                                        item3Title: t.tips[2].title, item3Content: t.tips[2].content
                                    }));
                                }
                            }}>
                                <option value="insurance">🛡️ 保險顧問</option>
                                <option value="realEstate">🏠 房仲業者</option>
                                <option value="groupBuy">🎁 團購微商</option>
                                <option value="wellness">🧬 健康教練</option>
                            </FormSelect>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormInput label="姓名" name="personName" value={cardData.personName} onChange={handleCardChange} />
                                <FormInput label="職稱" name="title" value={cardData.title} onChange={handleCardChange} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormInput label="殊榮" name="honor" value={cardData.honor} onChange={handleCardChange} />
                                <FormInput label="電話" name="phone" value={cardData.phone} onChange={handleCardChange} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormInput label="LINE 連結" name="lineLink" value={cardData.lineLink} onChange={handleCardChange} />
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">頭像選擇</label>
                                    <div className="flex gap-4 items-center">
                                        <select
                                            name="avatar"
                                            value={cardData.avatar}
                                            onChange={handleCardChange}
                                            className="flex-1 rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                                        >
                                            <optgroup label="預設頭像">
                                                {DEFAULT_AVATARS.map((a, i) => (
                                                    <option key={i} value={a.url}>{a.name}</option>
                                                ))}
                                            </optgroup>
                                            {uploadedImages.length > 0 && (
                                                <optgroup label="已上傳圖片">
                                                    {uploadedImages.map((img, i) => (
                                                        <option key={i} value={img.url}>[圖片{i + 1}] {img.name}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                        </select>
                                        <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-white/20 shrink-0">
                                            <img src={cardData.avatar} alt="avatar" className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <FormTextarea label="自介" name="introContent" value={cardData.introContent} onChange={handleCardChange} h="h-20" />
                            <FormInput label="服務項目" name="services" value={cardData.services} onChange={handleCardChange} />
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <label className="text-xs text-emerald-500 block mb-2 font-bold">摺疊選單</label>
                                <FormInput mb="mb-2" label="標題 1" name="item1Title" value={cardData.item1Title} onChange={handleCardChange} />
                                <FormTextarea mb="mb-4" label="內容 1" name="item1Content" value={cardData.item1Content} onChange={handleCardChange} h="h-12" />
                                <FormInput mb="mb-2" label="標題 2" name="item2Title" value={cardData.item2Title} onChange={handleCardChange} />
                                <FormTextarea mb="mb-4" label="內容 2" name="item2Content" value={cardData.item2Content} onChange={handleCardChange} h="h-12" />
                                <FormInput mb="mb-2" label="標題 3" name="item3Title" value={cardData.item3Title} onChange={handleCardChange} />
                                <FormTextarea label="內容 3" name="item3Content" value={cardData.item3Content} onChange={handleCardChange} h="h-12" />
                            </div>
                        </div>
                    )}
                    {projectType === 'game' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormSelect label="畫面方向" name="orientation" value={gameData.orientation} onChange={handleGameChange}>
                                    <option value="auto">Auto</option>
                                    <option value="portrait">直式</option>
                                    <option value="landscape">橫式</option>
                                </FormSelect>
                                <FormSelect label="平台" name="platform" value={gameData.platform} onChange={handleGameChange}>
                                    <option value="mobile">Mobile</option>
                                    <option value="tablet">Tablet</option>
                                    <option value="desktop">Desktop</option>
                                </FormSelect>
                            </div>
                            <FormTextarea label="玩法規則" name="requirements" value={gameData.requirements} onChange={handleGameChange} h="h-32" />
                        </div>
                    )}
                    {projectType === 'form' && (
                        <div className="space-y-4">
                            <FormTextarea label="表單需求與欄位描述" name="requirements" value={formData.requirements} onChange={handleFormChange} h="h-48" />
                        </div>
                    )}
                    {projectType === 'website' && (
                        <FormTextarea label="網站需求描述" name="requirements" value={commonData.requirements} onChange={handleCommonChange} h="h-48" />
                    )}
                    {projectType === 'interactive_tool' && (
                        <div className="space-y-4">
                            <FormSelect label="互動情境模版" value={interactiveData.templateKey} onChange={(e) => {
                                const t = INTERACTIVE_TEMPLATES[e.target.value];
                                if (t) {
                                    setInteractiveData(prev => ({
                                        ...prev,
                                        templateKey: e.target.value,
                                        requirements: t.requirements
                                    }));
                                }
                            }}>
                                {Object.keys(INTERACTIVE_TEMPLATES).map(key => (
                                    <option key={key} value={key}>{INTERACTIVE_TEMPLATES[key].label}</option>
                                ))}
                            </FormSelect>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormInput label="專家/品牌名稱" name="expertName" value={interactiveData.expertName} onChange={(e) => setInteractiveData(prev => ({ ...prev, expertName: e.target.value }))} />
                                <FormInput label="最終導流 (CTA) 連結" name="ctaLink" value={interactiveData.ctaLink} onChange={(e) => setInteractiveData(prev => ({ ...prev, ctaLink: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">專家頭像選擇</label>
                                <div className="flex gap-4 items-center">
                                    <select
                                        name="expertAvatar"
                                        value={interactiveData.expertAvatar}
                                        onChange={(e) => setInteractiveData(prev => ({ ...prev, expertAvatar: e.target.value }))}
                                        className="flex-1 rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                                    >
                                        <optgroup label="預設頭像">
                                            {DEFAULT_AVATARS.map((a, i) => (
                                                <option key={i} value={a.url}>{a.name}</option>
                                            ))}
                                        </optgroup>
                                        {uploadedImages.length > 0 && (
                                            <optgroup label="已上傳圖片">
                                                {uploadedImages.map((img, i) => (
                                                    <option key={i} value={img.url}>[圖片{i + 1}] {img.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                    <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-white/20 shrink-0">
                                        <img src={interactiveData.expertAvatar} alt="avatar" className="w-full h-full object-cover" />
                                    </div>
                                </div>
                            </div>
                            <FormTextarea label="工具邏輯與拓客機制 (可微調)" name="requirements" value={interactiveData.requirements} onChange={(e) => setInteractiveData(prev => ({ ...prev, requirements: e.target.value }))} h="h-40" />
                        </div>
                    )}
                    {projectType === 'landingPage' && (
                        <div className="space-y-4">
                            <FormSelect label="Landing Page 模版" value={landingPageData.templateKey} onChange={(e) => {
                                const t = LANDING_PAGE_TEMPLATES[e.target.value];
                                if (t) {
                                    let storeName = '品牌名稱';
                                    let brandStory = '品牌故事...';
                                    let features = '1. 特色一\\n2. 特色二';

                                    switch (e.target.value) {
                                        case 'cafe':
                                            storeName = '星塵咖啡 Stardust Cafe';
                                            brandStory = '創立於 2024 年，志在為每位旅人提供一杯能讓人沈澱心靈的精品咖啡。';
                                            features = '1. 自家烘焙單品豆\\n2. 手工限定輕食早午餐\\n3. 舒適的插座沙發區';
                                            break;
                                        case 'gym':
                                            storeName = '鐵血悍將健身俱樂部';
                                            brandStory = '專注於力量訓練與體態雕塑，陪你打造無堅不摧的意志力。';
                                            features = '1. 國際級進口器材\\n2. 前國手教練1對1指導\\n3. 舒適乾淨的大坪數淋浴空間';
                                            break;
                                        case 'clinic':
                                            storeName = '維納斯醫美 SPA 中心';
                                            brandStory = '用科技結合專業手技，打造專屬於您的無瑕透亮美肌。';
                                            features = '1. 最新皮秒雷射除斑療程\\n2. 專屬私密 VIP 保養包廂\\n3. 專業醫師親自一對一看診';
                                            break;
                                        case 'tutor':
                                            storeName = '百大菁英升學文理補習班';
                                            brandStory = '在地深耕 15 年，超過萬名學生的選擇，我們保證讓您的孩子愛上學習。';
                                            features = '1. 獨家心智圖單字記憶法\\n2. 24 小時專屬解題 APP 隨問隨答\\n3. 歷年榜單全市第一名保證';
                                            break;
                                        case 'restaurant':
                                            storeName = 'Bistro 99 義式餐酒館';
                                            brandStory = '傳承義大利拿坡里正宗手藝，搭配百款精選莊園紅白酒，完美的微醺之夜。';
                                            features = '1. 招牌手工窯烤瑪格麗特披薩\\n2. 在小農食材發想創意料理\\n3. 每週五週末狂歡 Live Band 演唱';
                                            break;
                                        case 'photoStudio':
                                            storeName = '光影紀實攝影工作室';
                                            brandStory = '捕捉最真實的情感瞬間，讓每張照片都成為無可取代的回憶。';
                                            features = '1. 獨家自然光韓系實景攝影棚\\n2. 復古底片質感原色精修服務\\n3. 上百套進口設計師手工婚紗';
                                            break;
                                        case 'petSalon':
                                            storeName = '汪喵星球寵物美容';
                                            brandStory = '把每隻毛孩當作自己的寶貝，提供最無壓力、最溫柔的美容洗沐體驗。';
                                            features = '1. O3臭氧微氣泡SPA浴去味殺菌\\n2. 堅持不打麻醉、全程貓狗分區\\n3. 透明玻璃美容室主人全程安心';
                                            break;
                                        case 'autoRepair':
                                            storeName = '極星車體美研';
                                            brandStory = '堅持職人精神，專注每一個鈑件的完美，給您的愛車超越新車的閃耀。';
                                            features = '1. 航太級奈米陶瓷鍍膜抗污防刮\\n2. 無塵恆溫百萬硬體施工車位\\n3. 歐系車原廠同規數位診斷電腦';
                                            break;
                                        case 'designerBrand':
                                            storeName = 'VIBE 獨立服飾品牌';
                                            brandStory = '為亞洲身型量身打造，主打極簡、舒適且不退流行的剪裁與穿搭設計。';
                                            features = '1. 獨家親膚涼感抗皺特殊面料\\n2. 100% 台灣在地工坊小批製造\\n3. 每週上架限量新款絕不撞衫';
                                            break;
                                        case 'interiorDesign':
                                            storeName = '築夢室內裝修設計';
                                            brandStory = '傾聽您的需求，以實用與空間美學平衡為出發點，為您築起夢想中的家。';
                                            features = '1. 3D全景擬真圖免費出圖溝通\\n2. 履約專戶保證、按階段安心付款\\n3. 專屬工班群組每日進度拍照回報';
                                            break;
                                    }

                                    setLandingPageData(prev => ({
                                        ...prev,
                                        templateKey: e.target.value,
                                        requirements: t.requirements,
                                        storeName,
                                        brandStory,
                                        features
                                    }));
                                }
                            }}>
                                {Object.keys(LANDING_PAGE_TEMPLATES).map(key => (
                                    <option key={key} value={key}>{LANDING_PAGE_TEMPLATES[key].label}</option>
                                ))}
                            </FormSelect>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormInput label="品牌/店家名稱" name="storeName" value={landingPageData.storeName} onChange={handleLandingPageChange} />
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">品牌 Logo 選擇</label>
                                    <div className="flex gap-4 items-center">
                                        <select
                                            name="logoUrl"
                                            value={landingPageData.logoUrl}
                                            onChange={handleLandingPageChange}
                                            className="flex-1 rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                                        >
                                            <optgroup label="預設LOGO">
                                                {DEFAULT_AVATARS.map((a, i) => (
                                                    <option key={i} value={a.url}>{a.name}</option>
                                                ))}
                                            </optgroup>
                                            {uploadedImages.length > 0 && (
                                                <optgroup label="已上傳圖片">
                                                    {uploadedImages.map((img, i) => (
                                                        <option key={i} value={img.url}>[圖片{i + 1}] {img.name}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                        </select>
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden border border-white/20 shrink-0">
                                            <img src={landingPageData.logoUrl} alt="logo" className="w-full h-full object-cover" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormInput label="營業時間" name="businessHours" value={landingPageData.businessHours} onChange={handleLandingPageChange} />
                                <FormInput label="聯絡資訊 (地址/電話)" name="contactInfo" value={landingPageData.contactInfo} onChange={handleLandingPageChange} />
                            </div>
                            <FormTextarea label="品牌故事 / 理念" name="brandStory" value={landingPageData.brandStory} onChange={handleLandingPageChange} h="h-24" />
                            <FormTextarea label="主打特色 / 服務項目 (請條列式)" name="features" value={landingPageData.features} onChange={handleLandingPageChange} h="h-32" />
                            <FormTextarea label="頁面企劃與拓客機制 (可微調)" name="requirements" value={landingPageData.requirements} onChange={handleLandingPageChange} h="h-40" />
                        </div>
                    )}

                    {/* 進階功能選項區塊 */}
                    <div className="mt-8 pt-6 border-t border-slate-200">
                        <label className="text-sm font-bold text-emerald-600 block mb-3">⚡ 進階功能 (自動加入相應的串接提示詞)</label>
                        <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={projectType === 'form' || commonData.enableDatabase}
                                    onChange={(e) => setCommonData(prev => ({ ...prev, enableDatabase: e.target.checked }))}
                                    disabled={projectType === 'form'}
                                    className="w-5 h-5 accent-emerald-500 rounded border-gray-300 focus:ring-emerald-500 disabled:opacity-50"
                                />
                                <span className="text-sm text-slate-700 font-medium">啟用資料庫存取 (Firestore API)</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={projectType === 'form' || commonData.enableStorage}
                                    onChange={(e) => setCommonData(prev => ({ ...prev, enableStorage: e.target.checked }))}
                                    disabled={projectType === 'form'}
                                    className="w-5 h-5 accent-emerald-500 rounded border-gray-300 focus:ring-emerald-500 disabled:opacity-50"
                                />
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
                    <button onClick={() => {
                        const promptText = generatePrompt();
                        // 1. 同步執行複製，保證在使用者的觸控事件同一個 Tick 當下觸發
                        copyToClipboard(promptText).then((success) => {
                            if (success) {
                                alert('已複製 PROMPT 並自動儲存專案更新！');
                            } else {
                                alert('複製失敗，您的瀏覽器可能阻擋了剪貼簿存取。');
                            }
                        });

                        // 2. 異步儲存不阻擋複製權限
                        handleSave(false).catch(e => {
                            console.error('自動儲存失敗', e);
                        });
                    }} className="w-full py-4 text-lg font-bold uppercase tracking-widest bg-emerald-500 text-white shadow-md hover:bg-emerald-600 rounded-xl flex items-center justify-center gap-2 mb-2 hover:scale-[1.02] transition-transform">📋 複製 PROMPT</button>
                    <p className="text-[10px] text-slate-400 text-center">* 已自動將 Prompt 中的 [圖片N] 替換為真實連結</p>
                </div>
                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 flex flex-col gap-6">
                    <h2 className="text-xl font-bold text-emerald-500">5. 程式碼</h2>
                    <textarea
                        className="w-full h-64 rounded-xl p-4 font-mono text-xs bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 focus:outline-none resize-none"
                        placeholder="請貼上 Gemini 產生的 <html>...</html>"
                        value={commonData.htmlCode}
                        onChange={(e) => setCommonData(prev => ({ ...prev, htmlCode: e.target.value }))}
                    ></textarea>

                    {/* SEO Preview & Editor */}
                    {commonData.htmlCode && (
                        <div className="bg-[#00000060] border border-[#ffffff10] rounded-xl p-6 flex flex-col gap-6 animate-fade-in-up backdrop-blur-sm">
                            <div className="border-b border-[#ffffff10] pb-4">
                                <h3 className="text-[#ccc] font-bold mb-4 text-sm w-full uppercase tracking-wider">
                                    📱 SEO 預覽與編輯
                                </h3>
                                {/* Preview Card */}
                                <div className="w-full max-w-[320px] mx-auto bg-white rounded-lg overflow-hidden flex flex-col shadow-2xl border border-slate-200 hover:scale-[1.02] transition-transform duration-300">
                                    <div className="w-full h-[167px] bg-slate-200 relative overflow-hidden group">
                                        {ogData.image ? (
                                            <img src={ogData.image} alt="OG" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                                                無 OG 圖片
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-4 bg-[#f0f0f0] flex-1">
                                        <h4 className="text-white shadow-md shadow-emerald-500/20 font-bold text-sm line-clamp-2 leading-tight mb-2">
                                            {ogData.title || '無標題'}
                                        </h4>
                                        <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed h-[2.5em]">
                                            {ogData.description || '無描述'}
                                        </p>
                                        <div className="mt-3 text-[10px] text-slate-500 uppercase tracking-widest">
                                            lionbaker.web.app
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SEO Inputs */}
                            <div className="flex flex-col gap-4">
                                <FormInput label="標題 (Title)" name="title" value={ogData.title} onChange={handleOgChange} />
                                <FormTextarea label="描述 (Description)" name="description" value={ogData.description} onChange={handleOgChange} h="h-20" />
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">分享圖片 (Image URL)</label>
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="text"
                                            name="image"
                                            value={ogData.image}
                                            onChange={handleOgChange}
                                            placeholder="https://..."
                                            className="rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 w-full"
                                        />
                                        <select
                                            className="w-full p-2 rounded text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    handleOgChange({ target: { name: 'image', value: e.target.value } });
                                                }
                                            }}
                                            value=""
                                        >
                                            <option value="" disabled>🖼️ 從上傳圖片中選擇...</option>
                                            {uploadedImages.map((img, i) => (
                                                <option key={i} value={img.url}>[圖片{i + 1}] {img.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <button type="button" onClick={() => handleSave(true)} className="w-full py-3 font-bold bg-green-600 hover:bg-green-500 rounded-xl text-slate-900 transition shadow-lg shadow-green-500/30">💾 儲存專案</button>
                </div>
                
                {projectType === 'form' && (
                    <FormDataViewer projectId={project.id} />
                )}
            </div>

            {saveWarning && (
                <div className="fixed inset-0 bg-slate-50/80 flex items-center justify-center z-[200] backdrop-blur-sm p-4">
                    <div className="bg-white border border-slate-200 shadow-xl p-6 rounded-2xl w-full max-w-md text-center">
                        <div className="text-5xl mb-4">⚠️</div>
                        <h3 className="text-xl font-bold mb-2 text-slate-800">儲存警告</h3>
                        <p className="text-slate-500 mb-6">{saveWarning.message}<br />確定要繼續儲存嗎？</p>
                        <div className="flex gap-4">
                            <button type="button" onClick={() => setSaveWarning(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition">取消</button>
                            <button type="button" onClick={() => {
                                const goBack = saveWarning.shouldGoBack;
                                setSaveWarning(null);
                                handleSave(goBack, true);
                            }} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition shadow-lg shadow-emerald-500/30">確定儲存</button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

const VibeAdmin = () => {
    const [viewMode, setViewMode] = useState('list'); // list | edit | expire_renew
    const [projects, setProjects] = useState([]);
    const [currentProject, setCurrentProject] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [themeColor, setThemeColor] = useState('#00ffff');
    const [showSettings, setShowSettings] = useState(false);
    const [initError, setInitError] = useState(null); // LIFF/Auth 初始化錯誤訊息
    const [activeTab, setActiveTab] = useState('projects'); // projects | line-bot

    // Gatekeeper State
    const [needsTerms, setNeedsTerms] = useState(false);
    const [needsAlias, setNeedsAlias] = useState(false); // New Step
    const [needsActivation, setNeedsActivation] = useState(false);
    const [isExpired, setIsExpired] = useState(false);
    const [isBanned, setIsBanned] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const fetchProjects = async (userId) => {
        try {
            // Remove orderBy to avoid needing a composite index immediately
            const q = query(collection(db, 'projects'), where('userId', '==', userId));
            const querySnapshot = await getDocs(q);
            const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort client-side (Newest first)
            docs.sort((a, b) => {
                const tA = a.updatedAt?.seconds || 0;
                const tB = b.updatedAt?.seconds || 0;
                return tB - tA;
            });

            setProjects(docs);
        } catch (err) {
            console.error('Fetch error:', err);
        }
    };

    useEffect(() => {
        const handleProfile = async (profile) => {
            if (profile) {
                try {
                    const userRef = doc(db, 'users', profile.userId);
                    const userSnap = await getDoc(userRef);
                    let dbData = {};

                    const calcDefaultExpiry = () => {
                        const d = new Date();
                        //新人有7天免費
                        d.setDate(d.getDate() + 7);
                        d.setHours(23, 59, 59);
                        return d;
                    };

                    if (userSnap.exists()) {
                        dbData = userSnap.data();
                        if (!dbData.expiryDate && !dbData.isSvip) {
                            dbData.expiryDate = calcDefaultExpiry();
                            await updateDoc(userRef, { expiryDate: dbData.expiryDate });
                        }
                    } else {
                        dbData = {
                            displayName: profile.displayName,
                            pictureUrl: profile.pictureUrl,
                            createdAt: serverTimestamp(),
                            role: 'user',
                            status: 'active',
                            expiryDate: calcDefaultExpiry(),
                            agreedToTerms: false
                        };
                        await setDoc(userRef, dbData);
                    }

                    const currentUser = { ...profile, ...dbData };
                    setUserProfile(currentUser);

                    // Gatekeeper Checks
                    if (currentUser.status === 'banned') {
                        setIsBanned(true);
                        return;
                    }

                    if (!currentUser.agreedToTerms) {
                        setNeedsTerms(true);
                        return; // Stop here until terms agreed
                    }

                    if (!currentUser.alias) {
                        setNeedsAlias(true);
                        return; // Stop here until alias set
                    }

                    // License Check
                    // SVIP = Infinite
                    if (!currentUser.isSvip) {
                        if (!currentUser.expiryDate) {
                            // First time, no expiry set (Fallback if logic above fails)
                            setNeedsActivation(true);
                        } else {
                            // Check if expired
                            const exp = currentUser.expiryDate.seconds
                                ? new Date(currentUser.expiryDate.seconds * 1000)
                                : new Date(currentUser.expiryDate);
                            if (new Date() > exp) {
                                setIsExpired(true);
                            }
                        }
                    }

                    fetchProjects(profile.userId);
                } catch (e) {
                    console.error("User Sync Error", e);
                    setUserProfile(profile);
                }
            }
        };

        // LIFF 初始化（含自動重試與全域鎖定，避免重複初始化導致 Load failed）
        const initLiffWithRetry = async (retries = 1) => {
            const LIFF_TIMEOUT_MS = 10000;

            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    // 如果尚未開始初始化，或是因為嚴重錯誤被清空，則發起新的初始化
                    if (!liffInitPromise) {
                        liffInitPromise = liff.init({ liffId: "2008893070-nnNXBPod" }).catch(err => {
                            liffInitPromise = null; // 失敗則允許下一次重試
                            throw err;
                        });
                    }

                    await Promise.race([
                        liffInitPromise,
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('LIFF_TIMEOUT')), LIFF_TIMEOUT_MS)
                        )
                    ]);
                    return; // 初始化成功，直接返回
                } catch (err) {
                    console.warn(`LIFF init 第 ${attempt + 1} 次嘗試失敗:`, err.message);
                    if (err.message === 'LIFF_TIMEOUT') {
                        // 逾時不一定代表失敗，可能只是網路慢。但如果我們重試，不應該重設 promise。
                        // 所以這裡我們不做 liffInitPromise = null
                    }
                    if (attempt === retries) throw err; // 最後一次依然失敗
                    await new Promise(r => setTimeout(r, 1000)); // 等 1 秒再重試
                }
            }
        };

        const init = async () => {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('Skipping LIFF for local testing');
                // 本地測試：Firebase Auth 仍需執行
                try { await signIn(); } catch (e) { console.error('Firebase 登入失敗', e); }
                handleProfile({
                    userId: 'Ue17ac074742b4f21da6f6b41307a246a', // Admin ID
                    displayName: 'Local User',
                    pictureUrl: 'https://placehold.co/150'
                });
                return;
            }

            try {
                // Firebase Auth 獨立執行，不阻擋 LIFF 主流程
                signIn()
                    .then(() => console.log('Firebase Auth OK'))
                    .catch(err => console.error('Firebase 登入失敗（非致命）:', err));

                // 初始化 LIFF（含自動重試）
                await initLiffWithRetry();

                // 關鍵修復：不使用 liff.isLoggedIn()。
                // 在 LINE 內建瀏覽器中，init() 完成後 SDK 已自動完成授權，
                // 直接呼叫 getProfile() 即可。若失敗才代表真正未登入。
                try {
                    const profile = await liff.getProfile();
                    await handleProfile(profile);
                } catch (profileErr) {
                    console.warn('getProfile 失敗，嘗試重新登入:', profileErr.message);
                    // 只有在「外部瀏覽器」中才呼叫 login()，避免 LINE 客戶端內的無窮重導向
                    if (!liff.isInClient()) {
                        liff.login();
                    } else {
                        // 在 LINE 客戶端內 getProfile 失敗是嚴重錯誤
                        throw new Error('無法取得 LINE 用戶資料，請重新開啟頁面。');
                    }
                }
            } catch (err) {
                console.error('LIFF 初始化失敗:', err);
                // 以友善 UI 取代 alert
                if (err.message === 'LIFF_TIMEOUT') {
                    setInitError('連線逾時，請檢查網路後點擊下方按鈕重試。');
                } else if (err.message === 'Load failed') {
                    setInitError('LINE 連線被阻擋或載入失敗，若使用 Safari 請確認尚未開啟防追蹤功能，或請重新整理頁面。');
                } else {
                    setInitError(err.message || '初始化失敗，請重新開啟頁面。');
                }
            }
        };

        init();
    }, []);

    const handleAgreeTerms = async () => {
        try {
            await updateDoc(doc(db, 'users', userProfile.userId), { agreedToTerms: true });
            setUserProfile(prev => ({ ...prev, agreedToTerms: true }));
            setNeedsTerms(false);

            // Re-check next steps
            if (!userProfile.alias) {
                setNeedsAlias(true);
            } else if (!userProfile.isSvip && !userProfile.expiryDate) {
                setNeedsActivation(true);
            }
        } catch (e) {
            console.error('Agree terms failed:', e);
            alert('操作失敗，請重試');
        }
    };

    const handleSetAlias = async (newAlias) => {
        // Uniqueness check
        const q = query(collection(db, 'users'), where('alias', '==', newAlias));
        const snap = await getDocs(q);
        if (!snap.empty) {
            throw new Error('此 ID 已被使用，請更換一個');
        }

        await updateDoc(doc(db, 'users', userProfile.userId), { alias: newAlias });
        setUserProfile(prev => ({ ...prev, alias: newAlias }));
        setNeedsAlias(false);

        // Re-check next steps
        if (!userProfile.isSvip && !userProfile.expiryDate) {
            setNeedsActivation(true);
        }
    };

    const handleRedeemCode = async (code) => {
        // Local Test Bypass
        if (code === 'TEST-VIBE-2026') {
            const updates = { isSvip: true, expiryDate: null };
            await updateDoc(doc(db, 'users', userProfile.userId), updates);
            setUserProfile(prev => ({ ...prev, ...updates }));
            setNeedsActivation(false);
            setIsExpired(false);
            alert('測試序號啟用成功！');
            return;
        }

        // Query License
        const q = query(collection(db, 'license_keys'), where('code', '==', code), where('status', '==', 'active'));
        const snap = await getDocs(q);

        if (snap.empty) {
            throw new Error('序號無效或已被停用');
        }

        const keyDoc = snap.docs[0];
        const keyData = keyDoc.data();

        if (keyData.redeemedUsers && keyData.redeemedUsers.includes(userProfile.userId)) {
            throw new Error('您已兌換過此金鑰，無法重複兌換累積天數');
        }

        if (keyData.type === 'VIP_CLASS' && keyData.validUntil) {
            const validUntilDate = new Date(keyData.validUntil + 'T23:59:59');
            if (new Date() > validUntilDate) {
                throw new Error('此金鑰已超過最後可輸入期限');
            }
        }

        const isSingleUse = keyData.type === 'VIP_PERSONAL' || keyData.type === 'SVIP' || !keyData.type || keyData.type === 'VIP';
        if (isSingleUse && keyData.redeemedUsers && keyData.redeemedUsers.length >= 1) {
            throw new Error('此序號已被使用完畢 (限單次使用)');
        }

        // Calculate new expiry
        let newExpiry = null;
        let isSvip = false;

        if (keyData.type === 'SVIP') {
            isSvip = true;
        } else {
            const days = keyData.days || 30;
            const now = new Date();
            // If already have valid expiry, add to it. Otherwise start from now.
            let baseDate = now;
            if (userProfile.expiryDate) {
                const currentExp = userProfile.expiryDate.seconds ? new Date(userProfile.expiryDate.seconds * 1000) : new Date(userProfile.expiryDate);
                if (currentExp > now) baseDate = currentExp;
            }
            baseDate.setDate(baseDate.getDate() + days);
            baseDate.setHours(23, 59, 59);
            newExpiry = baseDate;
        }

        const keyUpdates = {
            redeemedUsers: arrayUnion(userProfile.userId),
            lastRedeemedAt: serverTimestamp()
        };

        if (isSingleUse) {
            keyUpdates.status = 'redeemed';
        }

        // Transactional update (simulated with Promise.all for now as it's simpler)
        await updateDoc(doc(db, 'license_keys', keyDoc.id), keyUpdates);

        const updates = {
            isSvip: isSvip || userProfile.isSvip || false, // SVIP sticks if you already have it, ensure not undefined
            expiryDate: newExpiry || userProfile.expiryDate || null
        };

        if (isSvip && !updates.isSvip) updates.expiryDate = null; // Shouldn't happen based on logic

        await updateDoc(doc(db, 'users', userProfile.userId), updates);

        // Update local state
        setUserProfile(prev => ({ ...prev, ...updates }));
        setNeedsActivation(false);
        setIsExpired(false);
        alert('序號啟用成功！');
    };

    if (isBanned) return <BannedScreen />;
    if (needsTerms) return <TermsModal onAgree={handleAgreeTerms} />;
    if (needsAlias) return <SetupAliasScreen onSave={handleSetAlias} />;
    if (needsActivation) return <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="activate" />;
    if (isExpired && viewMode !== 'list') return <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="expire" />;

    if (isExpired && viewMode !== 'list') return <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="expire" />;

    const handleCreateProject = async ({ name, projectAlias, projectType }) => {
        if (!userProfile) return;
        const newDoc = {
            name: name,
            type: projectType,
            userId: userProfile.userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            mainColor: '高科技黑',
            style: '現代簡約，卡片式設計，帶有質感',
            htmlCode: '',
            projectAlias: projectAlias, // Save the alias!
            useLiff: false,
            liffId: ''
        };
        try {
            const docRef = await addDoc(collection(db, 'projects'), newDoc);
            const projectData = { id: docRef.id, ...newDoc };
            setProjects(prev => [projectData, ...prev]);
            setCurrentProject(projectData);
            setShowCreateModal(false); // Close Modal
            setViewMode('edit');
        } catch (e) {
            console.error('Create error', e);
            alert('建立專案失敗');
        }
    };

    const handleEditProject = (project) => {
        setCurrentProject(project);
        setViewMode('edit');
        // Update theme color for visual effect
        const color = PREMIUM_COLORS.find(c => c.value === project.mainColor)?.hex || '#00ffff';
        setThemeColor(color);
    };

    const handleDeleteProject = async (id) => {
        try {
            // 1. Delete Firestore Doc
            await deleteDoc(doc(db, 'projects', id));

            // 2. Delete Storage Assets
            const listRef = ref(storage, `project_assets/${id}`);
            const res = await listAll(listRef);
            await Promise.all(res.items.map(item => deleteObject(item)));

            setProjects(prev => prev.filter(p => p.id !== id));
            alert('專案與關聯圖片已刪除');
        } catch (e) {
            console.error('Delete error', e);
            alert('刪除失敗');
        }
    };

    return (
        <div
            className="min-h-screen font-sans flex flex-col items-center p-4 transition-all duration-700 ease-in-out text-slate-700"

        >

            <h1 className="text-3xl font-bold mb-6 mt-4 text-emerald-500 drop-drop-shadow-sm">
                靈感烘焙機 V1
            </h1>

            {!userProfile ? (
                initError ? (
                    // 初始化失敗：顯示友善的錯誤畫面
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
                        <div className="text-5xl">😢</div>
                        <div className="text-slate-600 font-medium text-base max-w-xs">{initError}</div>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg transition"
                        >
                            🔄 重新整理
                        </button>
                    </div>
                ) : (
                    // 載入中：顯示美化的 spinner
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                        <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        <p className="text-slate-400 text-sm">正在驗證身份，請稍候...</p>
                    </div>
                )
            ) : viewMode === 'list' ? (
                <>
                    <div className="w-full max-w-5xl flex justify-between mb-4 px-2 items-center">
                        <div className="flex gap-2 items-center flex-wrap">
                            {userProfile.isSvip ? (
                                <span className="text-yellow-400 font-bold border border-yellow-500/50 bg-yellow-500/10 px-2 py-1 rounded text-xs">♾️ SVIP</span>
                            ) : userProfile.expiryDate ? (
                                <span className={`font-bold border px-2 py-1 rounded text-xs ${isExpired ? 'text-red-400 border-red-500 bg-red-500/10' : 'text-green-400 border-green-500 bg-green-500/10'}`}>
                                    {isExpired ? '已過期 ' : 'VIP '}
                                    (到期日: {new Date(userProfile.expiryDate?.seconds ? userProfile.expiryDate.seconds * 1000 : userProfile.expiryDate).toISOString().split('T')[0]})
                                </span>
                            ) : null}
                            <button
                                onClick={() => setViewMode('expire_renew')}
                                className="ml-2 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 border border-emerald-500/50 px-3 py-1 rounded text-xs transition-all shadow-md">
                                + 輸入金鑰
                            </button>
                        </div>
                    </div>

                    {/* Tabs System */}
                    <div className="w-full max-w-5xl mb-8">
                        <div className="flex bg-white/50 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-200/60 shadow-sm w-fit mx-auto sm:mx-0">
                            <button
                                onClick={() => setActiveTab('projects')}
                                className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 flex items-center gap-2 ${activeTab === 'projects'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                                    }`}
                            >
                                <span className="text-base text-white">📁</span>
                                專案列表
                            </button>
                            <button
                                onClick={() => setActiveTab('line-bot')}
                                className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 flex items-center gap-2 ${activeTab === 'line-bot'
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                                    }`}
                            >
                                <span className="text-base">🤖</span>
                                LINE 機器人管家
                            </button>
                        </div>
                    </div>

                    {activeTab === 'projects' ? (
                        <>
                            {isExpired && (
                                <div className="w-full max-w-5xl mb-4 p-3 bg-red-900/10 border border-red-200/50 rounded-xl text-red-500 text-sm flex justify-between items-center backdrop-blur-sm">
                                    <div className="flex items-center gap-2">
                                        <span>⚠️</span>
                                        <span>您的服務已到期，目前為唯讀模式。</span>
                                    </div>
                                    <button onClick={() => setViewMode('expire_renew')} className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md shadow-red-500/20">立即續約</button>
                                </div>
                            )}

                            <ProjectList
                                projects={projects}
                                onCreate={() => {
                                    if (isExpired) {
                                        alert('服務已到期，請先輸入序號續約。');
                                        setViewMode('expire_renew');
                                    } else {
                                        setShowCreateModal(true);
                                    }
                                }}
                                onEdit={(p) => {
                                    if (isExpired) {
                                        alert('服務已到期，僅供瀏覽。');
                                    } else {
                                        handleEditProject(p);
                                    }
                                }}
                                onDelete={handleDeleteProject}
                                userProfile={userProfile}
                            />
                        </>
                    ) : (
                        <div className="w-full max-w-5xl">
                            <AgentAdmin />
                        </div>
                    )}

                    {showCreateModal && (
                        <CreateProjectModal
                            userProfile={userProfile}
                            defaultName={`專案名稱 ${projects.length + 1}`}
                            onClose={() => setShowCreateModal(false)}
                            onCreate={handleCreateProject}
                        />
                    )}
                </>
            ) : viewMode === 'expire_renew' ? (
                <ActivationScreen user={userProfile} onRedeem={handleRedeemCode} mode="expire" />
            ) : (
                <ProjectEditor
                    project={currentProject}
                    onSave={() => { setViewMode('list'); fetchProjects(userProfile.userId); }}
                    onBack={() => setViewMode('list')}
                    userProfile={userProfile}
                />
            )}

            {showSettings && userProfile && (
                <UserSettings
                    user={userProfile}
                    onClose={() => setShowSettings(false)}
                    onUpdate={(updated) => setUserProfile(updated)}
                />
            )}
        </div >
    );
};

export default VibeAdmin;
