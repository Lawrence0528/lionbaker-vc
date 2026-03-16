/**
 * Home 專案常數 - 專案類型、模版、色彩、風格等
 * 依專案類型組織：landingPage, website, interactive_tool, namecard, game, form
 */

/** 專案類型選項 (CreateProjectModal 與 ProjectEditor 共用) */
export const PROJECT_TYPES = [
    { value: 'landingPage', label: '🚀 Landing Page (品牌/店家)' },
    { value: 'website', label: '🌐 一般網站' },
    { value: 'interactive_tool', label: '🎯 互動式拓客工具' },
    { value: 'namecard', label: '📇 電子名片' },
    { value: 'game', label: '🎮 Web 小遊戲' },
    { value: 'form', label: '📝 電子表單' },
];

export const PREMIUM_COLORS = [
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
    { name: '極致灰', hex: '#bdc3c7', value: '極致灰：中性且堅定的灰色，象徵實用與穩固的基礎' },
];

export const DESIGN_STYLES = [
    { name: '現代簡約 (預設)', value: '現代簡約，卡片式設計，帶有質感' },
    { name: '奢華黑金', value: '低調奢華，黑金配色，流體光影，頂級尊榮感' },
    { name: '科技未來', value: '賽博龐克風格，霓虹光暈，玻璃擬態，高科技感' },
    { name: '清新自然', value: '森林系配色，柔和圓角，植物紋理，療癒氛圍' },
    { name: '專業商務', value: '經典海軍藍，幾何切分，權威穩重，信賴感' },
    { name: '人文藝術', value: '莫蘭迪色系，留白排版，襯線字體，藝廊氣息' },
    { name: '活潑親和', value: '明亮高飽和配色，塗鴉元素，動態微互動，親切感' },
    { name: '極簡主義', value: '極致灰階，無印風格，細線條，理性冷靜' },
    { name: '時尚雜誌', value: '雜誌封面排版，大圖壓字，Bold 字體，視覺衝擊' },
    { name: '溫暖手作', value: '奶茶色調，紙質紋理，手繪圖示，溫馨感' },
];

/** 電子名片 - 產業模版 */
export const INDUSTRY_TEMPLATES = {
    insurance: {
        label: '保險與理財顧問',
        award: '2025 IFPA 亞太保險精英獎',
        services: '保險保障、資產傳承、財務規劃',
        photoUrl: 'https://i.postimg.cc/cJKX7BGf/保險業.png',
        selfIntro: '您好！我是您的資產守護者。我不只賣保險，更幫您做風險導航。曾協助超過 100 個家庭完成理賠與退休規劃，我的目標是讓您「買對不買貴」，在風險來臨時，成為您最堅強的後盾。',
        tips: [
            { title: '🔍 保單健檢 (免費)', content: '擔心買了一堆卻賠不到？上傳您的舊保單，我用 AI 系統幫您抓出保障缺口，絕不強迫推銷。' },
            { title: '🚑 24H 急難協助', content: '發生車禍或緊急醫療狀況？按此按鈕直接通話，我不睡覺也會接，第一時間告訴您該怎麼做。' },
            { title: '📊 退休試算神器', content: '想知道存多少錢才能財富自由？輸入年齡與目標，30秒算給你看，量身打造現金流。' },
        ],
    },
    realEstate: {
        label: '房地產仲介',
        award: '2025 年度千萬經紀人 (Top Sales)',
        services: '不動產買賣租賃、房產估價與稅務、投資置產規劃',
        photoUrl: 'https://i.postimg.cc/bvG309fk/房仲業.png',
        selfIntro: '嗨！我是您專屬的房產顧問。我不只賣房子，是幫您圓一個家的夢。擅長利用大數據精準估價，無論是首購還是投資，都能幫您找到高 CP 值的潛力物件。',
        tips: [
            { title: '🏠 購屋能力試算', content: '輸入薪資與自備款，一鍵算出您的合理購屋總價。' },
            { title: '💰 買房隱形成本計算', content: '別只存頭期款！幫您試算契稅、仲介費等隱藏費用。' },
            { title: '📉 該區真實底價分析', content: '剔除特殊交易，給您最真實的成交區間。' },
        ],
    },
    groupBuy: {
        label: '團購主 / 微商',
        award: '2025 社群電商大賞 - 年度金牌團主',
        services: '嚴選好物開團、超值優惠比價、專屬售後服務',
        photoUrl: 'https://i.postimg.cc/jjWZ64YH/團購主.png',
        selfIntro: '哈囉！我是全職媽媽也是挑剔的選物人。我自己不敢用的東西絕不開團！這裡匯集了我跟廠商談到的「全網最低價」，跟著我買，省下的錢比賺的還多！',
        tips: [
            { title: '🎁 本週許願池 & 預告', content: '下週開什麼團？想要什麼商品？點這裡許願，集滿 20 人我就去跟廠商殺價！' },
            { title: '⚡ 結帳傳送門 (防漏單)', content: 'LINE 訊息洗版找不到連結？別怕！所有正在開團的「下單連結」都整理在這，點擊直接買。' },
            { title: '🚛 併單省運費專區', content: '買太少怕運費不划算？這裡開放「鄰居併單」或「面交登記」，幫大家省運費最實在。' },
        ],
    },
    wellness: {
        label: '健康管理與創業導師',
        award: '2025 體態管理卓越教練 / 系統化創業導師',
        services: '代謝優化工程、精準體態雕塑、系統化被動收入',
        photoUrl: 'https://i.postimg.cc/tJz5RrFg/jian-kang-gu-wen.png',
        selfIntro: '我是嘉吉，擅長用工程邏輯 DEBUG 人生的烘焙工程獅。從破百公斤到型男，我驗證了「身體管理是一套精準的科學」。我不只賣產品，更教你用「系統化 SOP」經營健康與財富。別讓身體的 Bug 拖累你，跟我一起用科技優化代謝，拿回人生的選擇權。',
        tips: [
            { title: '🧬 身體數值計算', content: '開發一個計算BMI，BMR及TDEE的程式' },
            { title: '🍰 甜點控的瘦身菜單', content: '誰說減肥不能吃甜點？烘焙工程獅獨家研發：不用挨餓、不用斷食，享受美食還能掉秤的「飲食配比參數」大公開。' },
            { title: '🚀 AI 創業戰隊招募', content: '不想再用勞力換錢？教你結合「健康黑科技」與「AI 數位工具」，複製我的成功 SOP，打造你的 24 小時自動化被動收入系統。' },
        ],
    },
    general: {
        label: '通用 / 自由填寫',
        award: '',
        services: '',
        photoUrl: '',
        selfIntro: '',
        tips: [
            { title: '標題 1', content: '內容 1' },
            { title: '標題 2', content: '內容 2' },
            { title: '標題 3', content: '內容 3' },
        ],
    },
    wellnessSpirit: {
        label: '身心靈療癒',
        award: '',
        services: '身心靈療癒、能量療癒、冥想指引',
        photoUrl: '',
        selfIntro: '探索內在、連結高我，提供身心靈整合的療癒服務與指引。',
        tips: [
            { title: '🌿 能量療癒預約', content: '提供一對一能量療癒、脈輪調整等服務。' },
            { title: '🧘 冥想與靜心指引', content: '帶領冥想、呼吸法與靜心練習，協助身心放鬆。' },
            { title: '📅 課程與工作坊', content: '定期開設身心靈相關課程與工作坊，歡迎預約參加。' },
        ],
    },
    tarotAstrology: {
        label: '占星 / 塔羅',
        award: '',
        services: '塔羅占卜、占星解讀、流年運勢',
        photoUrl: '',
        selfIntro: '透過塔羅與占星，為您提供心靈指引與運勢解讀，陪伴您找到方向。',
        tips: [
            { title: '🔮 線上塔羅占卜', content: '預約一對一塔羅解讀，深入探討您關心的課題。' },
            { title: '⭐ 占星與流年解讀', content: '本命盤、流年運勢、合盤分析等專業解讀服務。' },
            { title: '📖 預約與諮詢', content: '點擊預約，獲取專屬解讀時段與諮詢方式。' },
        ],
    },
};

/** 互動式拓客工具 - 模版 */
export const INTERACTIVE_TEMPLATES = {
    insurance_retirement: {
        label: '🛡️ 保險 - 退休金/教育金試算器',
        requirements: '功能：客戶輸入年齡、期望退休月花費。系統跑出精美的進度條與「資金缺口金額」。\n拓客機制：顯示結果後跳出提示：「想知道如何每月用 3000 元補足缺口？點擊按鈕獲取專屬企劃書。」',
    },
    insurance_test: {
        label: '🛡️ 保險 - 趣味理財性格測驗',
        requirements: '功能：3~5 題簡單的選擇題，評估客戶是保守型、穩健型還是積極型。\n拓客機制：測驗結果只顯示一半，必須點擊授權或加入 LINE 官方帳號才能解鎖完整解析與推薦的保險配置。',
    },
    realEstate_afford: {
        label: '🏠 房仲 - 買房負擔能力試算',
        requirements: '功能：讓客戶輸入自備款、月收入，系統自動換算出「建議購買總價區間」與「每月還款額」。\n拓客機制：算完之後，按鈕引導：「點擊查看符合您預算的 A 級隱藏版好案」，直接推薦聯絡專員。',
    },
    realEstate_vip: {
        label: '🏠 房仲 - VIP 線上看屋預約',
        requirements: '功能：現代 iOS 質感的表單，讓客戶勾選偏好區域、房型、車位需求。\n拓客機制：客戶送出尋屋條件後，直接引導至 LINE 進行一對一尊榮服務安排。',
    },
    micro_bmi: {
        label: '🧬 微創 - 專屬瘦身初步評估',
        requirements: '功能：客戶輸入身高、體重、年齡，系統自動計算 BMI 與 BMR（基礎代謝率），並給出簡單的體型狀態評語。\n拓客機制：頁面底部置入：「想參加 30 天減脂挑戰賽？立即預約免費一對一體態諮詢」。',
    },
    micro_booking: {
        label: '🎁 微創 - 動態型錄與預約系統',
        requirements: '功能：以輪播圖展示最新作品/商品，下方附帶日曆選擇器讓客戶挑選可預約的時段。\n拓客機制：客戶選好時段後，一鍵生成預約資訊發送到店家的 LINE，完成預約。',
    },
    freelance_tarot: {
        label: '🌟 專家 - 線上塔羅/流年測驗',
        requirements: '功能：頁面上展示可互動的塔羅牌抽牌，或輸入生日計算生命靈數流年。\n拓客機制：系統給出簡短提示，並引導：「想深入解析近期運勢？加老師預約完整解析。」',
    },
    freelance_quiz: {
        label: '🌟 專家 - 專業課前測驗與講義',
        requirements: '功能：針對講師專業領域設計 5 題測驗，完成後可解鎖下載精華 PDF 講義的按鈕。\n拓客機制：透過測驗篩選受眾，下載前引導加入 LINE 做為精準行銷名單。',
    },
};

/** Landing Page - 產業模版 */
export const LANDING_PAGE_TEMPLATES = {
    cafe: {
        label: '☕ 咖啡廳 / 甜點輕食',
        requirements: '生成咖啡與輕食早午餐的專業 landing page，加入 SVG 動畫與真實照片，給人強烈印象及消費衝動，響應式設計。\n功能：展示招牌飲品、店內環境，下方需有「立即訂位」或「外帶自取」按鈕。\n拓客機制：點擊訂位引導加入 LINE 會員領取首購優惠。',
    },
    gym: {
        label: '🏋️ 健身房 / 瑜珈教室',
        requirements: '生成專業質感的私人教練或瑜珈教室 landing page，強調體態改變與教練專業度，給人揮灑汗水的熱血感或身心靈放鬆的寧靜感。\n功能：展示教練師資、課程方案(月費/季費)、場地器材。\n拓客機制：提供「免費預約體驗一堂課」表單，填寫後引導加 LINE 聯繫專員。',
    },
    clinic: {
        label: '✨ 醫美診所 / 美容 SPA',
        requirements: '生成高奢、信任感強的醫美診所或 SPA 中心 landing page，運用溫柔色調與高清晰膚質特寫，強調專業與隱私。\n功能：療程介紹、醫師專業背景、成功案例(BA對比)。\n拓客機制：「線上評估膚況」小測驗，完成後發送專屬保養建議與首次體驗優惠券至 LINE。',
    },
    tutor: {
        label: '📚 補習班 / 線上課程',
        requirements: '生成具備權威感且吸引家長或學生的 landing page，強調升學率、教學法與獨家教材，色調明亮積極。\n功能：課程大綱、講師陣容介紹、歷年榜單或學員評價。\n拓客機制：提供「免費領取考古題/精華講義」按鈕，需加 LINE 即可自動派發 PDF。',
    },
    restaurant: {
        label: '🍽️ 餐廳 / 餐酒館',
        requirements: '生成引發食慾、氣氛迷人的餐廳 landing page，深色質感配上高飽和度的食物誘人照片，或是明亮清新的家庭餐廳風格。\n功能：線上清晰菜單、最新期間限定活動、主廚推薦。\n拓客機制：「壽星免費升級餐點」活動，輸入生日即派發 LINE 電子優惠券。',
    },
    photoStudio: {
        label: '📸 攝影工作室',
        requirements: '生成極簡、藝術感強的攝影工作室 landing page，以作品集為主體，排版如雜誌風。\n功能：展示婚紗、寫真、商案等分類作品集、服務收費標準。\n拓客機制：提供「點我預約線上諮詢」直接對接 LINE，並送「精修照片多一張」優惠。',
    },
    petSalon: {
        label: '🐾 寵物美容 / 旅館',
        requirements: '生成溫馨、可愛且具安心感的寵物服務 landing page，採用馬卡龍色系，強調對毛孩的愛心與專業設備。\n功能：美容價目表、館內無死角攝影畫面、寵物保母證照展示。\n拓客機制：首次預約洗澡「免費升級 SPA」，點擊按鈕跳轉 LINE 預約時段。',
    },
    autoRepair: {
        label: '🚗 汽車美容 / 保修',
        requirements: '生成陽剛、精密、充滿科技感與職人精神的汽車服務 landing page，金屬或深灰色調，強調工藝細節。\n功能：鍍膜/保養套餐方案、施工前後對比、職人施工縮時影片。\n拓客機制：「愛車估價表單」填寫年分車型，即透過 LINE 發送客製化保養建議與報價。',
    },
    designerBrand: {
        label: '👗 獨立設計師 / 服飾品牌',
        requirements: '生成高質感、具現代表達力的 brand landing page，強調原創設計、材質細節與品牌精神，排版留白多。\n功能：最新一季 Lookbook、熱銷單品選購、品牌故事。\n拓客機制：「訂閱電子報或加 LINE 領取 $200 購物金」，轉化訪客為首次購買。',
    },
    interiorDesign: {
        label: '🛋️ 室內設計 / 裝修工程',
        requirements: '生成空間感強、展現生活品味的室內設計 landing page，排版如建築圖鑑，展現空間配置的巧思。\n功能：各式風格作品集、設計流程與收費標準、客戶 3D 擬真圖與完工對比。\n拓客機制：「免費索取裝潢避坑指南 PDF」，引導加 LINE 以獲取名單。',
    },
};

export const DEFAULT_AVATARS = [
    { name: '預設頭像 (AI 生成)', url: 'https://i.postimg.cc/Bv5w1bC7/Gemini-Generated-Image-5gk4x35gk4x35gk4kao-bei.png' },
    { name: '保險顧問', url: 'https://i.postimg.cc/cJKX7BGf/保險業.png' },
    { name: '房仲業者', url: 'https://i.postimg.cc/bvG309fk/房仲業.png' },
    { name: '團購微商', url: 'https://i.postimg.cc/jjWZ64YH/團購主.png' },
    { name: '健康教練', url: 'https://i.postimg.cc/tJz5RrFg/jian-kang-gu-wen.png' },
];

export const hexToRgb = (hex) => {
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
