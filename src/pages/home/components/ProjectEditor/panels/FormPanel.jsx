import React from 'react';
import { FormTextarea } from '../../FormFields';

/** 電子表單 - 詳細需求編輯面板 */
const FormPanel = ({ formData, onChange }) => {
    const handleChange = (e) => onChange({ ...formData, [e.target.name]: e.target.value });

    return (
        <div className="space-y-4">
            <FormTextarea
                label="表單需求與欄位描述"
                name="requirements"
                value={formData.requirements}
                onChange={handleChange}
                h="h-48"
            />
        </div>
    );
};

export default FormPanel;
