/**
 * 可重用的腳本編輯器（供 Agent 私有腳本與 Skill 腳本共用）
 * variant: 'agent' | 'skill' 決定主色系 (emerald / indigo)
 */
const ScriptEditor = ({
    scripts,
    setScripts,
    onAddScript,
    onImageUpload,
    onRemoveImage,
    uploadingImageIndex,
    variant = 'agent',
}) => {
    const isAgent = variant === 'agent';
    const inputRing = isAgent ? 'focus:ring-emerald-400' : 'focus:ring-indigo-400';
    const btnClass = isAgent ? 'text-emerald-600 hover:text-emerald-700' : 'text-indigo-600 hover:text-indigo-700';
    const labelClass = isAgent ? 'hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600' : 'hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600';
    const triggerClass = isAgent ? 'font-bold text-emerald-700' : 'font-bold text-indigo-700';

    const handleAddReplyLine = (scriptIndex) => {
        const newS = [...scripts];
        if (!newS[scriptIndex].replyTexts) newS[scriptIndex].replyTexts = [newS[scriptIndex].reply || ''];
        newS[scriptIndex].replyTexts.push('');
        setScripts(newS);
    };

    const handleRemoveReplyLine = (scriptIndex, textIndex) => {
        const newS = [...scripts];
        newS[scriptIndex].replyTexts.splice(textIndex, 1);
        setScripts(newS);
    };

    const handleRemoveScript = (scriptIndex) => {
        const newS = scripts.filter((_, i) => i !== scriptIndex);
        setScripts(newS);
    };

    const handleScriptChange = (scriptIndex, field, value) => {
        const newS = [...scripts];
        if (field === 'title') newS[scriptIndex].title = value;
        if (field === 'trigger') newS[scriptIndex].trigger = value;
        if (field === 'replyTexts') newS[scriptIndex].replyTexts = value;
        setScripts(newS);
    };

    return (
        <div className="flex flex-col gap-4">
            {scripts?.map((script, index) => (
                <div key={script.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 relative group">
                    <button
                        onClick={() => handleRemoveScript(index)}
                        className="absolute right-4 top-4 text-slate-400 hover:text-red-500 bg-white shadow-sm rounded-full w-8 h-8 flex items-center justify-center border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                        ✕
                    </button>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-4 flex flex-col gap-2">
                            <input
                                type="text"
                                placeholder="標題"
                                className={`w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-1 ${inputRing} outline-none`}
                                value={script.title}
                                onChange={(e) => handleScriptChange(index, 'title', e.target.value)}
                            />
                            <textarea
                                placeholder="關鍵字 (逗號分隔)&#10;只要句子中包含任何一個關鍵字就會觸發"
                                className={`w-full bg-white border border-slate-300 rounded-lg p-2 text-sm focus:ring-1 ${inputRing} outline-none ${triggerClass} mt-1 h-20 resize-none`}
                                value={script.trigger}
                                onChange={(e) => handleScriptChange(index, 'trigger', e.target.value)}
                            />
                            <div className="text-xs text-slate-400 font-bold mt-1">💡 可輸入多組關鍵字，用半形逗號分隔，符合其一即觸發</div>
                        </div>
                        <div className="md:col-span-8 flex flex-col gap-3 md:border-l md:border-slate-200 md:pl-4">
                            <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg">
                                <span className="text-sm font-bold text-slate-600 px-1">💬 回覆文字區塊</span>
                                <button
                                    onClick={() => handleAddReplyLine(index)}
                                    className={`text-xs ${btnClass} bg-white px-3 py-1.5 shadow-sm rounded-md font-bold`}
                                >
                                    + 新增一行
                                </button>
                            </div>
                            {(script.replyTexts || [script.reply || '']).map((text, tIndex) => (
                                <div key={tIndex} className="flex gap-2 relative group/text">
                                    <textarea
                                        placeholder={isAgent ? '輸入當此關鍵字觸發時機器人要回覆的訊息' : '輸入當此關鍵字觸發時回覆的訊息'}
                                        className={`flex-1 w-full bg-white border border-slate-300 rounded-lg p-2 text-sm h-16 resize-none focus:ring-1 ${inputRing} outline-none`}
                                        value={text}
                                        onChange={(e) => {
                                            const newS = [...scripts];
                                            if (!newS[index].replyTexts) newS[index].replyTexts = [newS[index].reply || ''];
                                            newS[index].replyTexts[tIndex] = e.target.value;
                                            setScripts(newS);
                                        }}
                                    />
                                    {(script.replyTexts || []).length > 1 && (
                                        <button
                                            onClick={() => handleRemoveReplyLine(index, tIndex)}
                                            className="absolute right-2 top-2 text-slate-400 hover:text-red-500 bg-white shadow-sm rounded-full w-6 h-6 flex items-center justify-center border border-slate-200 opacity-0 group-hover/text:opacity-100 transition-opacity"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            ))}
                            <div className="flex items-center gap-3 mt-1 pt-3 border-t border-slate-200/50">
                                <div className="text-sm font-bold text-slate-600 shrink-0">🖼️ 回覆圖片</div>
                                <div className="flex-1 flex gap-2 overflow-x-auto items-center pb-2">
                                    {(() => {
                                        const images = script.replyImages || (script.imageUrl ? [script.imageUrl] : []);
                                        return images.map((imgUrl, iIndex) => (
                                            <div key={iIndex} className="relative group/img shrink-0 mt-2">
                                                <img src={imgUrl} className="w-14 h-14 rounded-lg object-cover border border-slate-200 shadow-sm" alt="預覽" />
                                                <button
                                                    onClick={() => onRemoveImage(index, iIndex)}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white shadow-md border border-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover/img:opacity-100 transition-opacity"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ));
                                    })()}
                                    <label
                                        className={`bg-white mt-2 text-slate-500 text-xs px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 cursor-pointer whitespace-nowrap ${labelClass} transition font-bold shadow-sm`}
                                    >
                                        {uploadingImageIndex === index ? '🚀 上傳中...' : '＋ 加入圖片'}
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => onImageUpload(index, e.target.files[0])}
                                            disabled={uploadingImageIndex === index}
                                        />
                                    </label>
                                </div>
                            </div>
                            {(() => {
                                const totalItems =
                                    (script.replyTexts?.length || 1) + (script.replyImages?.length || (script.imageUrl ? 1 : 0));
                                if (totalItems > 5) {
                                    return (
                                        <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-3 rounded-xl font-bold flex items-center gap-2 mt-2">
                                            <span>
                                                ⚠️ 注意：目前設定了 {totalItems} 項回覆內容，已超過 LINE 單次傳送 5
                                                個訊息的限制。前 5 項以外的訊息將不會被發出。
                                            </span>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ScriptEditor;
