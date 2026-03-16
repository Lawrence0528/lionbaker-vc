import React from 'react';
import { FormInput, FormTextarea, FormSelect } from '../../FormFields';
import { INTERACTIVE_TEMPLATES, DEFAULT_AVATARS } from '../../../constants';

/** 互動式拓客工具 - 詳細需求編輯面板 */
const InteractiveToolPanel = ({ interactiveData, onChange, uploadedImages }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onChange({ ...interactiveData, [name]: value });
    };

    return (
        <div className="space-y-4">
            <FormSelect
                label="互動情境模版"
                value={interactiveData.templateKey}
                onChange={(e) => {
                    const t = INTERACTIVE_TEMPLATES[e.target.value];
                    if (t) {
                        onChange({
                            ...interactiveData,
                            templateKey: e.target.value,
                            requirements: t.requirements,
                        });
                    }
                }}
            >
                {Object.keys(INTERACTIVE_TEMPLATES).map(key => (
                    <option key={key} value={key}>{INTERACTIVE_TEMPLATES[key].label}</option>
                ))}
            </FormSelect>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput label="專家/品牌名稱" name="expertName" value={interactiveData.expertName} onChange={handleChange} />
                <FormInput label="最終導流 (CTA) 連結" name="ctaLink" value={interactiveData.ctaLink} onChange={handleChange} />
            </div>
            <div>
                <label className="text-xs text-slate-500 mb-1 block">專家頭像選擇</label>
                <div className="flex gap-4 items-center">
                    <select
                        name="expertAvatar"
                        value={interactiveData.expertAvatar}
                        onChange={(e) => onChange({ ...interactiveData, expertAvatar: e.target.value })}
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
            <FormTextarea
                label="工具邏輯與拓客機制 (可微調)"
                name="requirements"
                value={interactiveData.requirements}
                onChange={(e) => onChange({ ...interactiveData, requirements: e.target.value })}
                h="h-40"
            />
        </div>
    );
};

export default InteractiveToolPanel;
