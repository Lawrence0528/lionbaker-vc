import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.');
const outDir = resolve(root, 'public/line-flex');
const bgPath = resolve(outDir, 'ai-tool-workshop-bg.png');
mkdirSync(outDir, { recursive: true });

const font = 'STHeiti';
const W = 1080;
const H = 1920;

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function textLines(lines, x, y, size, fill, weight = 700, leading = 1.18, anchor = 'start') {
  return lines
    .map((line, i) => (
      `<text x="${x}" y="${y + i * size * leading}" fill="${fill}" font-family="${font}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(line)}</text>`
    ))
    .join('\n');
}

function pill(x, y, width, label, fill = 'rgba(14,165,233,.18)', stroke = '#38bdf8') {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="72" rx="36" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <circle cx="${x + 42}" cy="${y + 36}" r="9" fill="#38bdf8"/>
    <text x="${x + 70}" y="${y + 47}" fill="#e0f2fe" font-family="${font}" font-size="30" font-weight="800">${esc(label)}</text>
  `;
}

function card(x, y, width, height, title, desc, n) {
  return `
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="34" fill="rgba(2,6,23,.75)" stroke="rgba(125,211,252,.35)" stroke-width="2"/>
    <rect x="${x + 32}" y="${y + 34}" width="76" height="76" rx="24" fill="rgba(56,189,248,.16)" stroke="rgba(125,211,252,.45)" stroke-width="2"/>
    <text x="${x + 70}" y="${y + 84}" fill="#7dd3fc" font-family="${font}" font-size="30" font-weight="900" text-anchor="middle">${n}</text>
    <text x="${x + 132}" y="${y + 72}" fill="#ffffff" font-family="${font}" font-size="40" font-weight="900">${esc(title)}</text>
    <text x="${x + 132}" y="${y + 122}" fill="#a1a1aa" font-family="${font}" font-size="28" font-weight="600">${esc(desc)}</text>
  `;
}

const pages = [
  {
    name: '01-hero',
    badge: 'AI 落地師培訓班',
    title: ['你不是要學', '更多 AI 工具'],
    titleAccent: '你要讓 AI 幫你做出東西',
    body: ['從只會問簡單問題開始，', '一天做出貼圖、電子名片、NFC 應用與工作小工具。'],
    blocks: [
      ['只會問 AI', '會下有效指令'],
      ['拿到答案', '做出可用成果'],
      ['追新工具', '建立自己的流程'],
    ],
  },
  {
    name: '02-journey',
    badge: '從幼幼班到指揮官',
    title: ['今天結束，', '你會升一級'],
    titleAccent: '不是聽懂，是做得出來',
    body: ['學會把模糊需求拆成 AI 能執行的任務，', '讓 AI 從聊天對象變成你的實作夥伴。'],
    blocks: [
      ['01 提詞框架', '角色、任務、背景、格式'],
      ['02 AI 當老師', '叫 AI 幫你選工具與流程'],
      ['03 反覆修改', '把結果調到能真的使用'],
      ['04 上線分享', '名片、貼圖、小工具帶走'],
    ],
  },
  {
    name: '03-results',
    badge: '當天帶走',
    title: ['5 個實作成果', '直接拿來用'],
    titleAccent: '零基礎也能完成',
    body: ['不是一堆應該很有用的知識，', '而是看得到、能分享、能延伸的作品。'],
    blocks: [
      ['AI 提詞框架', '讓 AI 回答變準'],
      ['品牌貼圖素材', 'LINE / 社群可用'],
      ['AI 電子名片', 'NFC 一碰就打開'],
      ['Canvas 小工具', '解決工作問題'],
      ['落地流程手冊', '回去繼續複製'],
    ],
  },
  {
    name: '04-tools',
    badge: '不寫程式也能做',
    title: ['讓 AI 幫你', '生成小工具'],
    titleAccent: '想法比技術更值錢',
    body: ['你負責定義問題與情境，', 'AI 負責產出、修改、整合，直到工具能用。'],
    blocks: [
      ['行銷問題', '開發信、貼文、問卷、流程'],
      ['客戶互動', '回覆腳本、名片頁、預約導流'],
      ['內容生產', '短影音腳本、素材、貼圖'],
    ],
  },
  {
    name: '05-signup',
    badge: '適合你，如果你想',
    title: ['把 AI 變成', '你的工作助力'],
    titleAccent: '1 天實作，名額有限',
    body: ['適合業務、創業者、講師、服務業老闆，', '也適合完全零基礎、但想真的做出成果的人。'],
    blocks: [
      ['不用程式背景', '會打字就能跟上'],
      ['用你的產業練', '不是通用範例'],
      ['現場完成成果', '回去馬上能展示'],
    ],
  },
];

function pageSvg(page, idx) {
  const blockY = idx === 2 ? 980 : 1050;
  const renderedBlocks = page.blocks
    .map((b, i) => card(82, blockY + i * 150, 916, 124, b[0], b[1], String(i + 1).padStart(2, '0')))
    .join('\n');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#020617" stop-opacity=".98"/>
      <stop offset=".45" stop-color="#020617" stop-opacity=".72"/>
      <stop offset="1" stop-color="#020617" stop-opacity=".98"/>
    </linearGradient>
    <radialGradient id="glow" cx=".2" cy=".15" r=".9">
      <stop offset="0" stop-color="#0ea5e9" stop-opacity=".35"/>
      <stop offset=".55" stop-color="#0f172a" stop-opacity=".18"/>
      <stop offset="1" stop-color="#020617" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <image href="${bgPath}" x="-260" y="0" width="1600" height="1920" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${W}" height="${H}" fill="url(#shade)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="42" y="42" width="996" height="1836" rx="58" fill="none" stroke="rgba(125,211,252,.28)" stroke-width="3"/>
  ${pill(82, 112, Math.max(420, page.badge.length * 34 + 130), page.badge)}
  ${textLines(page.title, 82, 340, 86, '#ffffff', 900, 1.1)}
  <text x="82" y="${page.title.length > 1 ? 558 : 462}" fill="#7dd3fc" font-family="${font}" font-size="50" font-weight="900">${esc(page.titleAccent)}</text>
  ${textLines(page.body, 82, page.title.length > 1 ? 668 : 572, 34, '#d4d4d8', 700, 1.45)}
  ${renderedBlocks}
  <rect x="82" y="1706" width="916" height="96" rx="32" fill="#0ea5e9"/>
  <text x="540" y="1768" fill="#ffffff" font-family="${font}" font-size="42" font-weight="900" text-anchor="middle">下方按鈕立即報名</text>
  <text x="540" y="1848" fill="#71717a" font-family="${font}" font-size="24" font-weight="700" text-anchor="middle">AI 落地師培訓班｜1 天實作課</text>
</svg>`;
}

for (const [idx, page] of pages.entries()) {
  const svg = pageSvg(page, idx);
  const svgPath = resolve(outDir, `${page.name}.svg`);
  const pngPath = resolve(outDir, `${page.name}.png`);
  writeFileSync(svgPath, svg);
  execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-f', 'png', '-o', pngPath, svgPath], { stdio: 'inherit' });
}

const flex = {
  type: 'carousel',
  contents: pages.map((page) => ({
    type: 'bubble',
    size: 'mega',
    hero: {
      type: 'image',
      url: `https://ai.lionbaker.com/line-flex/${page.name}.png`,
      size: 'full',
      aspectRatio: '9:16',
      aspectMode: 'cover',
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'sm',
          color: '#0ea5e9',
          action: {
            type: 'uri',
            label: '立即報名',
            uri: 'https://ai.lionbaker.com/signup',
          },
        },
      ],
      flex: 0,
    },
  })),
};

writeFileSync(resolve(outDir, 'ai-course-flex-message.json'), `${JSON.stringify(flex, null, 2)}\n`);
