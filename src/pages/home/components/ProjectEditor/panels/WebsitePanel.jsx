import React from 'react';
import { FormTextarea } from '../../FormFields';

/** 一般網站 - 詳細需求編輯面板 */
const WebsitePanel = ({ requirements, onChange }) => (
    <FormTextarea
        label="網站需求描述"
        name="requirements"
        value={requirements}
        onChange={onChange}
        h="h-48"
    />
);

export default WebsitePanel;
