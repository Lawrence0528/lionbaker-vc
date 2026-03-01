/**
 * 提供跨環境（含 LINE LIFF 與舊版瀏覽器）相容的剪貼簿複製功能
 * @param {string} text 要複製的文字內容
 * @returns {Promise<boolean>} 是否複製成功
 */
export const copyToClipboard = (text) => {
    return new Promise((resolve) => {
        // 先以同步方式嘗試傳統的 document.execCommand('copy')
        // 這是因為部分環境 (iOS WebView, LINE LIFF) 嚴格要求複製行為必須在「直接的使用者點擊事件 (synchronous user gesture)」當下發生。
        let fallbackSuccess = false;
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // 隱藏 textarea，避免影響排版
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";

            // 行動裝置相容性設定
            textArea.setAttribute('readonly', '');
            textArea.style.fontSize = '16px'; // 避免 iOS 自動放大

            document.body.appendChild(textArea);

            // 選取與複製
            textArea.focus();
            textArea.select();
            if (textArea.setSelectionRange) {
                textArea.setSelectionRange(0, 99999); // 針對 iOS 需要選取範圍
            }

            fallbackSuccess = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (fallbackSuccess) {
                return resolve(true);
            }
        } catch (err) {
            console.warn('傳統複製失敗：', err);
        }

        // 若傳統方法失敗，則使用現代 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => resolve(true))
                .catch((err) => {
                    console.error('各種複製方法皆失敗：', err);
                    resolve(false);
                });
        } else {
            resolve(fallbackSuccess);
        }
    });
};
