export const normalizeHtmlDocument = (html) => {
    const rawHtml = String(html ?? '');
    if (!rawHtml.trim()) {
        return { valid: true, html: '', changed: rawHtml !== '' };
    }

    const doctypeMatch = /<!doctype\s+html\b[^>]*>/i.exec(rawHtml);
    const htmlMatch = /<html\b[^>]*>/i.exec(rawHtml);
    const startMatch = doctypeMatch || htmlMatch;
    const endMatches = Array.from(rawHtml.matchAll(/<\/html\s*>/gi));
    const endMatch = endMatches[endMatches.length - 1];

    if (!startMatch || !endMatch || endMatch.index < startMatch.index) {
        return {
            valid: false,
            html: rawHtml,
            changed: false,
            error: '請先去 Gemini Canvas 複製好完整 HTML 程式碼，再貼上。'
        };
    }

    const endIndex = endMatch.index + endMatch[0].length;
    const cleanedHtml = rawHtml.slice(startMatch.index, endIndex).trim();

    return {
        valid: true,
        html: cleanedHtml,
        changed: cleanedHtml !== rawHtml
    };
};

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
