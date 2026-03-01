/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'tech-blue': '#00f0ff',
                'tech-dark': '#0a0f1c',
                'tech-card': '#111a2e',
                'bread-orange': '#ff9d42',
                royal: { 800: '#0f172a', 900: '#020617' },
                gold: { 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
                mystic: { 900: '#2e1065', 800: '#4c1d95', 700: '#5b21b6' }
            },
            fontFamily: {
                'sans': ['Noto Sans TC', 'sans-serif'],
                'tech': ['Orbitron', 'sans-serif'],
            },
            animation: {
                'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'scan': 'scan 3s linear infinite',
                'float': 'float 3s ease-in-out infinite',
                'float-slow': 'float 6s ease-in-out infinite',
                'spin-slow': 'spin 10s linear infinite',
                'shine': 'shine 4s linear infinite'
            },
            keyframes: {
                scan: {
                    '0%': { top: '0%', opacity: '0' },
                    '10%': { opacity: '1' },
                    '90%': { opacity: '1' },
                    '100%': { top: '100%', opacity: '0' }
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-5px)' } // Landing page version
                },
                // Renamed aiwoman2 version to avoid conflict if needed, or just merge logic. 
                // aiwoman2 'float' was translateY(-10px), landing was -5px. 
                // I'll keep default float as landing (-5px) and maybe make a float-deep for aiwoman if needed, or just use one.
                // Actually, aiwoman2 defined 'float' keyframes too. Let's add shine.
                shine: {
                    'to': { backgroundPosition: '200% center' }
                }
            }
        },
    },
    plugins: [],
}
