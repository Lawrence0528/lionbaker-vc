import { useEffect } from 'react';

/**
 * SEO 組件：動態設定 document title 與 Open Graph 等 Meta 標籤
 */
const SEO = ({ title, description, image, url, type = 'website', appName }) => {
  useEffect(() => {
    if (title) document.title = title;
    const setMeta = (name, content, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content || '');
    };
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:image', image, true);
    setMeta('og:url', url, true);
    setMeta('og:type', type, true);
    if (appName) setMeta('og:site_name', appName, true);
    return () => { document.title = '馬上實現您的靈感'; };
  }, [title, description, image, url, type, appName]);
  return null;
};

export default SEO;
