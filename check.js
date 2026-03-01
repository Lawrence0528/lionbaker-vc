const fs = require('fs');
let content = fs.readFileSync('src/pages/VibeAdmin.jsx', 'utf8');

console.log("bg-black:", (content.match(/bg-black/g) || []).length);
console.log("text-black:", (content.match(/text-black/g) || []).length);
console.log("text-white:", (content.match(/text-white/g) || []).length);
console.log("bg-[#111]:", (content.match(/bg-\\[#111\\]/g) || []).length);
console.log("bg-[#050505]:", (content.match(/bg-\\[#050505\\]/g) || []).length);
console.log("theme-glass-card:", (content.match(/theme-glass-card/g) || []).length);
console.log("theme-input:", (content.match(/theme-input/g) || []).length);
console.log("theme-btn:", (content.match(/theme-btn/g) || []).length);
console.log("text-[var(--theme-accent)]:", (content.match(/text-\\[var\\(--theme-accent\\)\\]/g) || []).length);
