import React, { useState, useEffect, useRef, useMemo } from 'react';
import liff from '@line/liff';
import { db, storage, signIn } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc, updateDoc, deleteDoc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { validateHtmlCode } from '../utils/security';

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
const FormSelect = ({ label, name, value, onChange, children }) => (
    <div className="flex flex-col">
        <label className="text-xs text-slate-500 mb-1">{label}</label>
        <select name={name} value={value} onChange={onChange} className="rounded p-2 text-sm outline-none bg-white border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 cursor-pointer w-full">
            {children}
        </select>
    </div>
);

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
            await onCreate({ name, projectAlias });
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
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{mode === 'activate' ? '啟用您的帳號' : '您的服務已到期'}</h2>
                <p className="text-slate-500 mb-6 text-sm">
                    {mode === 'activate'
                        ? '初次使用請輸入產品序號以啟用服務。'
                        : '請輸入新的序號以繼續使用完整功能。您仍可瀏覽現有專案，但無法編輯或新增。'}
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
                        <p className="text-xs text-slate-400 mb-2">或者</p>
                        <a href="/" className="text-sm text-slate-500 hover:text-slate-900 underline">暫時回到列表 (唯讀模式)</a>
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
        return project.updatedAt ? project.updatedAt.seconds : Math.floor(Date.now() / 1000);
    });

    const projectUrl = `https://lionbaker-run.web.app/u/${userParam}/${projectParam}?t=${timestamp}`;

    return (
        <div className="bg-white border border-slate-200 shadow-xl p-5 rounded-xl hover:bg-slate-50 transition group relative flex flex-col h-full">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <span className={`text-[10px] px-2 py-0.5 rounded border mb-2 inline-block ${project.type === 'game' ? 'border-pink-500 text-pink-400' :
                        project.type === 'namecard' ? 'border-blue-500 text-blue-400' : 'border-green-500 text-green-400'
                        }`}>
                        {project.type === 'game' ? 'Web 小遊戲' : project.type === 'namecard' ? '電子名片' : '一般網站'}
                    </span>
                    <h3 className="font-bold text-lg leading-tight text-slate-900 mb-1">{project.name}</h3>
                    <div className="text-xs text-slate-500 font-mono">ID: {project.id}</div>
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
                                    <div className="text-[10px] text-slate-400 truncate mb-1">PROD PREVIEW</div>
                                    <div className="font-bold text-sm truncate mb-1 text-slate-700">{seo.title}</div>
                                    <div className="text-xs text-slate-400 line-clamp-2">{seo.desc}</div>
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

                    <a
                        href={projectUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-[#10b981]/20 rounded-lg text-center text-sm transition flex items-center justify-center gap-2"
                    >
                        🔗 開啟網頁
                    </a>
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
        liffFeatures: project.liffFeatures || []
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
            const ogRegex = new RegExp(`(<meta\\s+(?:property|name)=["']og:${key}["']\\s+content=["'])(.*?)(["']\\s*/?>)`, 'i');
            if (ogRegex.test(newHtml)) {
                newHtml = newHtml.replace(ogRegex, `$1${safeVal}$3`);
            } else {
                // Insert if missing (Prepend to head for simplicity)
                const headRegex = /<head>/i;
                if (headRegex.test(newHtml)) {
                    newHtml = newHtml.replace(headRegex, `<head>\n    <meta property="og:${key}" content="${safeVal}" />`);
                }
            }

            // 2. Handle Standard Description
            if (key === 'description') {
                const nameRegex = new RegExp(`(<meta\\s+name=["']description["']\\s+content=["'])(.*?)(["']\\s*/?>)`, 'i');
                if (nameRegex.test(newHtml)) {
                    newHtml = newHtml.replace(nameRegex, `$1${safeVal}$3`);
                } else {
                    const headRegex = /<head>/i;
                    if (headRegex.test(newHtml)) {
                        newHtml = newHtml.replace(headRegex, `<head>\n    <meta name="description" content="${safeVal}" />`);
                    }
                }
            }

            // 3. Handle <title>
            if (key === 'title') {
                const titleTagRegex = /<title>(.*?)<\/title>/i;
                if (titleTagRegex.test(newHtml)) {
                    newHtml = newHtml.replace(titleTagRegex, `<title>${val}</title>`); // Title usually doesn't need quote escape inside tag
                } else {
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

    const handleSave = async (shouldGoBack = true) => {
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
        try {
            setStatusMsg('正在儲存...');
            const docData = {
                ...commonData,
                type: projectType,
                imageUrls: uploadedImages.map(img => img.url),
                updatedAt: serverTimestamp(),
                // Use first image as thumbnail
                thumbnail: uploadedImages.length > 0 ? uploadedImages[0].url : null,
                userAlias: commonData.userAlias || '',
                projectAlias: commonData.projectAlias || ''
            };
            if (projectType === 'namecard') Object.assign(docData, cardData);
            else if (projectType === 'game') Object.assign(docData, gameData);

            await updateDoc(doc(db, 'projects', project.id), docData);
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
2. 在主要的 JavaScript 區塊中，一啟動就呼叫 \`liff.init({ liffId: "${commonData.liffId}" })\` 進行初始化 (請確保網址與此 liffId 絕對對應，否則會發生 INVALID_RECEIVER 錯誤)。
3. 所有的主要畫面渲染或操作邏輯，必須確保是在 \`liff.init()\` 成功解析之後才執行。${featureText}
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
                <div className="text-slate-500 font-mono text-sm">Project ID: {project.id}</div>
                <div className="ml-auto text-green-400 text-sm">{statusMsg}</div>
            </div>

            {/* Left Column */}
            <div className="space-y-6">
                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">1. 基本設定</h2>
                    <div className="space-y-4">
                        <FormSelect label="專案類型" value={projectType} onChange={(e) => setProjectType(e.target.value)}>
                            <option value="website">🌐 一般網站</option>
                            <option value="namecard">📇 電子名片</option>
                            <option value="game">🎮 Web 小遊戲</option>
                        </FormSelect>
                        <FormInput label="專案名稱" name="name" value={commonData.name} onChange={handleCommonChange} />
                        <div className="mb-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <label className="text-xs text-slate-500 mb-1 block">專案專屬網址</label>
                            <div className="text-sm text-slate-700 font-mono break-all line-clamp-2">
                                https://lionbaker-run.web.app/u/{userProfile.alias || userProfile.userId}/{commonData.projectAlias || project.id}
                            </div>
                        </div>
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
                                    onClick={() => {
                                        navigator.clipboard.writeText(img.url);
                                        alert('圖片網址已複製！');
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
                    {projectType === 'website' && (
                        <FormTextarea label="網站需求描述" name="requirements" value={commonData.requirements} onChange={handleCommonChange} h="h-48" />
                    )}
                </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
                <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-6 border-l-4 border-[#10b981]">
                    <h2 className="text-xl font-bold mb-4 text-emerald-500">4. 產生 Prompt</h2>
                    <button onClick={async () => {
                        await handleSave(false);
                        try {
                            await navigator.clipboard.writeText(generatePrompt());
                            alert('已儲存專案更新並複製 PROMPT！');
                        } catch (e) {
                            console.error(e);
                            alert('複製失敗');
                        }
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

                    <button onClick={handleSave} className="w-full py-3 font-bold bg-green-600 hover:bg-green-500 rounded-xl text-slate-900 transition shadow-lg shadow-green-500/30">💾 儲存專案</button>
                </div>
            </div>
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

    // Gatekeeper State
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
        const init = async () => {
            try {
                await signIn();
                console.log('Firebase OK');
            } catch (err) {
                console.error('Firebase 登入失敗', err);
            }

            const handleProfile = async (profile) => {
                if (profile) {
                    try {
                        const userRef = doc(db, 'users', profile.userId);
                        const userSnap = await getDoc(userRef);
                        let dbData = {};

                        const calcDefaultExpiry = () => {
                            const d = new Date();
                            d.setDate(d.getDate() + 3);
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

            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('Skipping LIFF for local testing');
                handleProfile({
                    userId: 'Ue17ac074742b4f21da6f6b41307a246a', // Admin ID
                    displayName: 'Local User',
                    pictureUrl: 'https://placehold.co/150'
                });
            } else {
                liff.init({ liffId: "2008893070-nnNXBPod" })
                    .then(() => liff.isLoggedIn() ? liff.getProfile() : liff.login())
                    .then(handleProfile)
                    .catch(err => console.error('LIFF Error', err));
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

        // Transactional update (simulated with Promise.all for now as it's simpler)
        await updateDoc(doc(db, 'license_keys', keyDoc.id), {
            redeemedUsers: arrayUnion(userProfile.userId),
            lastRedeemedAt: serverTimestamp()
        });

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

    const handleCreateProject = async ({ name, projectAlias }) => {
        if (!userProfile) return;
        const newDoc = {
            name: name,
            type: 'website',
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
                Vibe AI 專案工廠 V3
            </h1>

            {!userProfile ? (
                <div className="text-center p-10"><p className="text-slate-500">Loading...</p></div>
            ) : viewMode === 'list' ? (
                <>
                    <div className="w-full max-w-5xl flex justify-between mb-4 px-2 items-center">
                        <div className="flex gap-2">
                            {userProfile.isSvip ? (
                                <span className="text-yellow-400 font-bold border border-yellow-500/50 bg-yellow-500/10 px-2 py-1 rounded text-xs">♾️ SVIP</span>
                            ) : userProfile.expiryDate ? (
                                <span className={`font-bold border px-2 py-1 rounded text-xs ${isExpired ? 'text-red-400 border-red-500 bg-red-500/10' : 'text-green-400 border-green-500 bg-green-500/10'}`}>
                                    {isExpired ? '已過期 ' : 'VIP '}
                                    (到期日: {new Date(userProfile.expiryDate?.seconds ? userProfile.expiryDate.seconds * 1000 : userProfile.expiryDate).toISOString().split('T')[0]})
                                </span>
                            ) : null}
                        </div>

                        <button
                            onClick={() => setShowSettings(true)}
                            className="text-xs text-slate-500 hover:text-emerald-500 flex items-center gap-1 transition"
                        >
                            ⚙️ 個人設定 ({userProfile.alias ? `@${userProfile.alias}` : '無 ID'})
                        </button>
                    </div>

                    {isExpired && (
                        <div className="w-full max-w-5xl mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-500 text-sm flex justify-between items-center">
                            <span>⚠️ 您的服務已到期，目前為唯讀模式。</span>
                            <button onClick={() => setViewMode('expire_renew')} className="bg-red-800 hover:bg-red-700 px-3 py-1 rounded text-slate-900 text-xs">立即續約</button>
                        </div>
                    )}

                    <ProjectList
                        projects={projects}
                        onCreate={() => {
                            if (isExpired) {
                                alert('服務已到期，請先輸入序號續約。');
                                setViewMode('expire_renew');
                            } else {
                                setShowCreateModal(true); // Open the modal instead
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
        </div>
    );
};

export default VibeAdmin;
