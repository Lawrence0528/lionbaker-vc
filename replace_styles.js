const fs = require('fs');

try {
    let content = fs.readFileSync('src/pages/VibeAdmin.jsx', 'utf8');

    // Remove custom styling completely since we want simple tailwind
    content = content.replace(/style=\{\{\s*'--theme-accent': themeColor,(?:.|\n)*?\}\}/g, 
        'className="min-h-screen font-sans flex flex-col items-center p-4 transition-all duration-700 ease-in-out text-slate-800 bg-slate-50"');

    // Also remove the <style> component fully and use pure Tailwind classes wherever possible
    content = content.replace(/<style>\{`[\s\S]*?`\}<\/style>/, '');

    // Now replacing the hardcoded classes
    content = content.replace(/bg-\[\#111\]/g, 'bg-white');
    content = content.replace(/bg-black/g, 'bg-slate-50');
    content = content.replace(/text-white/g, 'text-slate-800');
    content = content.replace(/bg-white\/10/g, 'bg-slate-100');
    content = content.replace(/bg-white\/5/g, 'bg-slate-50');
    content = content.replace(/border-gray-800/g, 'border-slate-200');
    content = content.replace(/border-gray-700/g, 'border-slate-300');
    content = content.replace(/border-gray-600/g, 'border-slate-300');
    content = content.replace(/text-gray-400/g, 'text-slate-500');
    content = content.replace(/text-gray-200/g, 'text-slate-700');
    content = content.replace(/text-gray-500/g, 'text-slate-400');
    content = content.replace(/theme-glass-card/g, 'bg-white border border-slate-200 shadow-md');
    // For theme inputs
    content = content.replace(/theme-input/g, 'bg-slate-50 border border-slate-300 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200');
    // For theme buttons
    content = content.replace(/theme-btn/g, 'bg-emerald-500 text-white shadow-md hover:bg-emerald-600');
    // Replace custom var styles
    content = content.replace(/var\(--theme-accent\)/g, '#10b981'); // Emerald 500
    content = content.replace(/bg-\[var\(--theme-accent\)\]/g, 'bg-emerald-500');
    content = content.replace(/text-\[var\(--theme-accent\)\]/g, 'text-emerald-500');
    content = content.replace(/accent-\[var\(--theme-accent\)\]/g, 'accent-emerald-500');

    fs.writeFileSync('src/pages/VibeAdmin.jsx', content);
    console.log("Successfully replaced");
} catch (e) {
    console.error(e);
}
