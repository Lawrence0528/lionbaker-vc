import React from 'react';
import { FormInput, FormTextarea, FormSelect } from '../../FormFields';
import { LANDING_PAGE_TEMPLATES, DEFAULT_AVATARS } from '../../../constants';

const LANDING_DEFAULTS = {
    cafe: { storeName: '星塵咖啡 Stardust Cafe', brandStory: '創立於 2024 年，志在為每位旅人提供一杯能讓人沈澱心靈的精品咖啡。', features: '1. 自家烘焙單品豆\n2. 手工限定輕食早午餐\n3. 舒適的插座沙發區' },
    gym: { storeName: '鐵血悍將健身俱樂部', brandStory: '專注於力量訓練與體態雕塑，陪你打造無堅不摧的意志力。', features: '1. 國際級進口器材\n2. 前國手教練1對1指導\n3. 舒適乾淨的大坪數淋浴空間' },
    clinic: { storeName: '維納斯醫美 SPA 中心', brandStory: '用科技結合專業手技，打造專屬於您的無瑕透亮美肌。', features: '1. 最新皮秒雷射除斑療程\n2. 專屬私密 VIP 保養包廂\n3. 專業醫師親自一對一看診' },
    tutor: { storeName: '百大菁英升學文理補習班', brandStory: '在地深耕 15 年，超過萬名學生的選擇，我們保證讓您的孩子愛上學習。', features: '1. 獨家心智圖單字記憶法\n2. 24 小時專屬解題 APP 隨問隨答\n3. 歷年榜單全市第一名保證' },
    restaurant: { storeName: 'Bistro 99 義式餐酒館', brandStory: '傳承義大利拿坡里正宗手藝，搭配百款精選莊園紅白酒，完美的微醺之夜。', features: '1. 招牌手工窯烤瑪格麗特披薩\n2. 在小農食材發想創意料理\n3. 每週五週末狂歡 Live Band 演唱' },
    photoStudio: { storeName: '光影紀實攝影工作室', brandStory: '捕捉最真實的情感瞬間，讓每張照片都成為無可取代的回憶。', features: '1. 獨家自然光韓系實景攝影棚\n2. 復古底片質感原色精修服務\n3. 上百套進口設計師手工婚紗' },
    petSalon: { storeName: '汪喵星球寵物美容', brandStory: '把每隻毛孩當作自己的寶貝，提供最無壓力、最溫柔的美容洗沐體驗。', features: '1. O3臭氧微氣泡SPA浴去味殺菌\n2. 堅持不打麻醉、全程貓狗分區\n3. 透明玻璃美容室主人全程安心' },
    autoRepair: { storeName: '極星車體美研', brandStory: '堅持職人精神，專注每一個鈑件的完美，給您的愛車超越新車的閃耀。', features: '1. 航太級奈米陶瓷鍍膜抗污防刮\n2. 無塵恆溫百萬硬體施工車位\n3. 歐系車原廠同規數位診斷電腦' },
    designerBrand: { storeName: 'VIBE 獨立服飾品牌', brandStory: '為亞洲身型量身打造，主打極簡、舒適且不退流行的剪裁與穿搭設計。', features: '1. 獨家親膚涼感抗皺特殊面料\n2. 100% 台灣在地工坊小批製造\n3. 每週上架限量新款絕不撞衫' },
    interiorDesign: { storeName: '築夢室內裝修設計', brandStory: '傾聽您的需求，以實用與空間美學平衡為出發點，為您築起夢想中的家。', features: '1. 3D全景擬真圖免費出圖溝通\n2. 履約專戶保證、按階段安心付款\n3. 專屬工班群組每日進度拍照回報' },
};

/** Landing Page (品牌/店家) - 詳細需求編輯面板 */
const LandingPagePanel = ({ landingPageData, onChange, uploadedImages }) => {
    const handleChange = (e) => onChange({ ...landingPageData, [e.target.name]: e.target.value });

    const handleTemplateChange = (e) => {
        const key = e.target.value;
        const t = LANDING_PAGE_TEMPLATES[key];
        if (t) {
            const def = LANDING_DEFAULTS[key] || { storeName: '品牌名稱', brandStory: '品牌故事...', features: '1. 特色一\n2. 特色二' };
            onChange({
                ...landingPageData,
                templateKey: key,
                requirements: t.requirements,
                storeName: def.storeName,
                brandStory: def.brandStory,
                features: def.features,
            });
        }
    };

    return (
        <div className="space-y-4">
            <FormSelect label="Landing Page 模版" value={landingPageData.templateKey} onChange={handleTemplateChange}>
                {Object.keys(LANDING_PAGE_TEMPLATES).map(key => (
                    <option key={key} value={key}>{LANDING_PAGE_TEMPLATES[key].label}</option>
                ))}
            </FormSelect>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput label="品牌/店家名稱" name="storeName" value={landingPageData.storeName} onChange={handleChange} />
                <div>
                    <label className="text-xs text-slate-500 mb-1 block">品牌 Logo 選擇</label>
                    <div className="flex gap-4 items-center">
                        <select
                            name="logoUrl"
                            value={landingPageData.logoUrl}
                            onChange={handleChange}
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
                <FormInput label="營業時間" name="businessHours" value={landingPageData.businessHours} onChange={handleChange} />
                <FormInput label="聯絡資訊 (地址/電話)" name="contactInfo" value={landingPageData.contactInfo} onChange={handleChange} />
            </div>
            <FormTextarea label="品牌故事 / 理念" name="brandStory" value={landingPageData.brandStory} onChange={handleChange} h="h-24" />
            <FormTextarea label="主打特色 / 服務項目 (請條列式)" name="features" value={landingPageData.features} onChange={handleChange} h="h-32" />
            <FormTextarea label="頁面企劃與拓客機制 (可微調)" name="requirements" value={landingPageData.requirements} onChange={handleChange} h="h-40" />
        </div>
    );
};

export default LandingPagePanel;
