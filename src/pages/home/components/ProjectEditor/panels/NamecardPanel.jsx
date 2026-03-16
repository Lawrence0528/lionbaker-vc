import React from 'react';
import { FormInput, FormTextarea, FormSelect } from '../../FormFields';
import { INDUSTRY_TEMPLATES } from '../../../constants';

/** 電子名片 - 詳細需求編輯面板 */
const NamecardPanel = ({ cardData, onChange, templateKey, onTemplateChange, uploadedImages, onAvatarUploadClick }) => {
    const handleCardChange = (e) => onChange({ ...cardData, [e.target.name]: e.target.value });

    const applyTemplate = (t) => {
        if (!t) return;
        onChange({
            ...cardData,
            personName: t.label.split(' / ')[0] || t.label.split('／')[0] || '',
            title: t.label,
            honor: t.award || '',
            introContent: t.selfIntro || '',
            services: t.services || '',
            avatar: (t.photoUrl || '').replace('pngg', 'png'),
            item1Title: t.tips[0]?.title || '',
            item1Content: t.tips[0]?.content || '',
            item2Title: t.tips[1]?.title || '',
            item2Content: t.tips[1]?.content || '',
            item3Title: t.tips[2]?.title || '',
            item3Content: t.tips[2]?.content || '',
        });
    };

    return (
        <div className="space-y-4">
            <FormSelect
                label="快速模版"
                value={templateKey}
                onChange={(e) => {
                    const t = INDUSTRY_TEMPLATES[e.target.value];
                    if (t) {
                        onTemplateChange(e.target.value);
                        applyTemplate(t);
                    }
                }}
            >
                <option value="general">📋 通用</option>
                <option value="insurance">🛡️ 保險顧問</option>
                <option value="realEstate">🏠 房仲業者</option>
                <option value="groupBuy">🎁 團購微商</option>
                <option value="wellness">🧬 健康教練</option>
                <option value="wellnessSpirit">🌿 身心靈</option>
                <option value="tarotAstrology">🔮 占星/塔羅</option>
                <option value="eyelashBeauty">✨ 美睫店/材料行</option>
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
                    <label className="text-xs text-slate-500 mb-1 block">頭像</label>
                    <div className="flex gap-3 items-center">
                        <div className="w-14 h-14 rounded-full bg-slate-100 overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                            {cardData.avatar ? (
                                <img src={cardData.avatar} alt="頭像預覽" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-slate-400 text-xs">頭像</span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onAvatarUploadClick}
                            className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 transition flex items-center gap-2"
                        >
                            📷 上傳照片
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">上傳完成即自動設為頭像，圖片會同步加入「2. 圖片素材」</p>
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
    );
};

export default NamecardPanel;
