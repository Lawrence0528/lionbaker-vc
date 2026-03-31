import React, { useEffect, useState } from 'react';

/**
 * 六格順序：橫向 A,B,C → 第二列 D,E,F（對應 LINE Rich Menu 2×3）。
 * 使用覆蓋在圖上的 Grid 熱區，避免 <map>/<area> 在縮放圖或 LINE WebView 內座標錯亂、全部變成點到第一格。
 */
const CELLS = [
  { key: 'a', label: 'AI 落地策略', href: 'https://liff.line.me/2008893070-IQ1CcsWW' },
  { key: 'b', label: '課程表', href: 'https://liff.line.me/2008893070-IXsuDcqR' },
  { key: 'c', label: 'AI 技術工具', href: 'https://liff.line.me/2008893070-nnNXBPod' },
  { key: 'd', label: '私域導流機器人', href: null },
  { key: 'e', label: '報名課程', href: 'https://liff.line.me/2008893070-nIHgoz1R' },
  { key: 'f', label: '諮詢工程師', href: 'https://lionbaker.web.app/' },
];

const D_MESSAGE = '私域導流機器人功能開發中! 敬請期待...';

const linkCellClass =
  'block h-full w-full min-h-0 min-w-0 border-0 bg-transparent p-0 outline-none ring-0 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset';

/**
 * LINE 平板／電腦版用圖片選單，對應官方帳號 Rich Menu 點擊區。
 */
const Menu = () => {
  const [dModalOpen, setDModalOpen] = useState(false);

  useEffect(() => {
    document.title = 'LINE 選單 | 馬上實現您的靈感';
  }, []);

  return (
    <main className="min-h-screen bg-stone-50 flex flex-col items-center justify-start p-4 sm:p-6 gap-4">
      <header className="w-full max-w-4xl text-center">
        <h1 className="text-lg sm:text-xl font-semibold text-slate-800">LionBaker 功能選單</h1>
        <p className="mt-1 text-sm text-slate-500">請點選圖片對應區塊</p>
      </header>

      <section className="w-full max-w-4xl rounded-2xl shadow-xl overflow-hidden bg-white">
        <div className="relative">
          <img
            src="/menu.jpg"
            alt="LINE 官方帳號功能選單：AI 落地策略、課程表、AI 技術工具、私域導流機器人、報名課程、諮詢工程師"
            className="block w-full h-auto select-none pointer-events-none"
            width={2500}
            height={1686}
            decoding="async"
          />
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-2">
            {CELLS.map(({ key, label, href }) =>
              href ? (
                <a
                  key={key}
                  href={href}
                  className={linkCellClass}
                  aria-label={label}
                  target="_self"
                  rel="noopener noreferrer"
                />
              ) : (
                <button
                  key={key}
                  type="button"
                  className={`${linkCellClass} cursor-pointer`}
                  aria-label={label}
                  onClick={() => setDModalOpen(true)}
                />
              ),
            )}
          </div>
        </div>
      </section>

      {dModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-d-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4">
            <h2 id="menu-d-modal-title" className="text-base font-semibold text-slate-800">
              私域導流機器人
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">{D_MESSAGE}</p>
            <button
              type="button"
              onClick={() => setDModalOpen(false)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg transition-colors"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Menu;
