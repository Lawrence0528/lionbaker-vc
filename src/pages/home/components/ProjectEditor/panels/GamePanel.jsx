import React from 'react';
import { FormTextarea, FormSelect } from '../../FormFields';

/** Web 小遊戲 - 詳細需求編輯面板 */
const GamePanel = ({ gameData, onChange }) => {
    const handleChange = (e) => onChange({ ...gameData, [e.target.name]: e.target.value });

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <FormSelect label="畫面方向" name="orientation" value={gameData.orientation} onChange={handleChange}>
                    <option value="auto">Auto</option>
                    <option value="portrait">直式</option>
                    <option value="landscape">橫式</option>
                </FormSelect>
                <FormSelect label="平台" name="platform" value={gameData.platform} onChange={handleChange}>
                    <option value="mobile">Mobile</option>
                    <option value="tablet">Tablet</option>
                    <option value="desktop">Desktop</option>
                </FormSelect>
            </div>
            <FormTextarea label="玩法規則" name="requirements" value={gameData.requirements} onChange={handleChange} h="h-32" />
        </div>
    );
};

export default GamePanel;
