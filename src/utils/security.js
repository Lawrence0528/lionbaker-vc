export const validateHtmlCode = (html) => {
    if (!html) {
        return { valid: true };
    }

    const forbiddenKeywords = [
        'document.cookie',
        'cookie',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'eval('
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

    return { valid: true };
};

