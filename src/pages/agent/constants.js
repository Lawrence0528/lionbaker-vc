/** Agent 預設腳本範本 */
export const PRESET_SCRIPTS = [
    { title: '打招呼', trigger: '你好', reply: '哈囉！有什麼我可以幫忙的嗎？' },
    { title: '詢價', trigger: '多少錢', reply: '詳細報價請參考我們的官網或是直接留言詢問唷！' },
    { title: '營業時間', trigger: '時間', reply: '我們的營業時間為周一至周五 09:00~18:00' },
];

/** 產生 6 碼分享代碼 */
export const generateShareCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
