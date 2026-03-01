export const validateHtmlCode = (html) => {
    if (!html) {
        return { valid: true };
    }

    const forbiddenKeywords = [
        'eval('
    ];

    const warningKeywords = [
        'document.cookie',
        'cookie',
        'localStorage',
        'sessionStorage',
        'indexedDB'
    ];

    const lowerHtml = html.toLowerCase();

    for (const keyword of forbiddenKeywords) {
        if (lowerHtml.includes(keyword.toLowerCase())) {
            return {
                valid: false,
                error: `Security violation: The code contains forbidden keyword "${keyword}".`
            };
        }
    }

    for (const keyword of warningKeywords) {
        if (lowerHtml.includes(keyword.toLowerCase())) {
            return {
                valid: true,
                hasWarning: true,
                warningMessage: '請勿開發在本地收集敏感資訊'
            };
        }
    }

    return { valid: true, hasWarning: false };
};

