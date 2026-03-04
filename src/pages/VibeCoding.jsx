import React, { useState, useEffect } from 'react';
import SEO from '../components/SEO';
import MatrixRain from '../components/MatrixRain';
import { db, functions } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import liff from '@line/liff';

// Placeholder LIFF ID - User needs to replace this
const LIFF_ID = '2008963361-MrRNV5vJ';
const LINE_OA_ID = '@217vdaka'; // e.g., @123xxxxx (Must include @ if using R/oaMessage/ID, usually needs @)

const VibeCoding = () => {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [isLiffLoggedIn, setIsLiffLoggedIn] = useState(false);
    const [lineProfile, setLineProfile] = useState(null);

    // Sessions State
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [sessionsLoading, setSessionsLoading] = useState(true);

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        source: '',
        lastFive: '',
        count: 1,
        paymentMethod: 'transfer' // 'transfer', 'cash', 'linepay'
    });

    // UI State for Source Selection
    const [sourceOption, setSourceOption] = useState(''); // '嘉吉老師', '偉志老師', 'Other'
    const [customSource, setCustomSource] = useState('');

    useEffect(() => {
        if (sourceOption === 'Other') {
            setFormData(prev => ({ ...prev, source: customSource }));
        } else {
            setFormData(prev => ({ ...prev, source: sourceOption }));
        }
    }, [sourceOption, customSource]);

    // Initialize LIFF and Fetch Sessions
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Init LIFF
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.log('Skipping LIFF for local testing');
                    setIsLiffLoggedIn(true);
                    const mockProfile = { userId: 'tester1', displayName: 'Local Tester' };
                    setLineProfile(mockProfile);
                    setFormData(prev => ({ ...prev, name: mockProfile.displayName }));
                } else if (LIFF_ID && LIFF_ID !== 'MY_LIFF_ID') {
                    await Promise.race([
                        liff.init({ liffId: LIFF_ID }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('LIFF_TIMEOUT')), 5000))
                    ]);
                    if (liff.isLoggedIn()) {
                        setIsLiffLoggedIn(true);
                        const profile = await liff.getProfile();
                        setLineProfile(profile);
                        setFormData(prev => ({ ...prev, name: profile.displayName }));
                    }
                }
            } catch (err) {
                console.error('LIFF Init Error:', err);
            }

            // Fetch Sessions (Real Data)
        };
        init();
    }, []);

    // Fetch Sessions (Real Data)
    useEffect(() => {
        const fetchSessions = async () => {
            try {
                setSessionsLoading(true);
                const getSessionsFn = httpsCallable(functions, 'getVibeSessions');
                const result = await getSessionsFn();
                const fetchedSessions = result.data.sessions || [];

                if (fetchedSessions.length > 0) {
                    // Process sessions: format date
                    const processedManager = fetchedSessions.map(s => {
                        const dateObj = new Date(s.date);
                        const days = ['日', '一', '二', '三', '四', '五', '六'];
                        const dayName = days[dateObj.getDay()];
                        const formattedDate = `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')} (${dayName}) ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                        return {
                            ...s,
                            displayDate: formattedDate
                        };
                    });
                    setSessions(processedManager);
                    // Select the first open session by default
                    const firstOpen = processedManager.find(s => s.status === 'open');
                    if (firstOpen) {
                        setSelectedSessionId(firstOpen.id);
                    } else if (processedManager.length > 0) {
                        setSelectedSessionId(processedManager[0].id);
                    }
                } else {
                    // Fallback if no sessions in DB
                    setSessions([
                        {
                            id: 'default_01',
                            date: '2026-02-08T13:00:00',
                            displayDate: '2026/02/08 (日) 13:00',
                            location: 'TOP SPACE 商務中心',
                            address: '臺中市中區民族路23號3樓',
                            price: 1980,
                            originalPrice: 5000,
                            status: 'open',
                            title: 'Vibe Coding 基礎實戰班 (預設)'
                        }
                    ]);
                    setSelectedSessionId('default_01');
                }
            } catch (err) {
                console.error("Failed to fetch sessions:", err);
                // Keep mock/empty or handle error
            } finally {
                setSessionsLoading(false);
            }
        };
        fetchSessions();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSessionSelect = (sessionId) => {
        setSelectedSessionId(sessionId);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.source) {
            setError('請填寫來源資訊');
            return;
        }
        if (formData.paymentMethod === 'transfer' && formData.lastFive.length !== 5) {
            setError('匯款後五碼必須為 5 碼');
            return;
        }

        setLoading(true);

        try {
            const selectedSession = sessions.find(s => s.id === selectedSessionId);
            const sessionInfo = selectedSession ? {
                sessionId: selectedSession.id,
                sessionDate: selectedSession.date, // or displayDate
                sessionLocation: selectedSession.location
            } : {};

            await addDoc(collection(db, 'registrations_vibe'), {
                ...formData,
                ...sessionInfo,
                lineUserId: lineProfile?.userId || null,
                createdAt: serverTimestamp(),
                status: 'pending'
            });

            if (isLiffLoggedIn && liff.isInClient()) {
                const methodText = formData.paymentMethod === 'transfer' ? `匯款後五碼：${formData.lastFive}` :
                    formData.paymentMethod === 'cash' ? '付款方式：現金 (現場繳費)' :
                        '付款方式：LinePay';

                await liff.sendMessages([
                    {
                        type: 'text',
                        text: `【報名成功】\n姓名：${formData.name}\n場次：${selectedSession?.displayDate || '2026/02/08'}\n${methodText}\n\n感謝您的報名，我們已收到您的資訊！`
                    }
                ]);
            }

            setSuccess(true);
            window.scrollTo(0, 0);

        } catch (err) {
            console.error(err);
            setError('報名失敗，請檢查網路連線或稍後再試。');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-black text-slate-200 font-sans flex items-center justify-center p-4 relative overflow-hidden">
                <MatrixRain />
                <div className="relative z-10 text-center py-8 bg-black/80 backdrop-blur-xl border border-green-500/30 rounded-3xl p-10 shadow-[0_0_50px_rgba(34,197,94,0.2)] max-w-md w-full">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/20 text-green-400 rounded-full mb-6 border border-green-500/50">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">報名成功！</h3>
                    <p className="text-slate-300 mb-6">
                        我們已收到您的資訊。<br />
                        {isLiffLoggedIn && liff.isInClient() && <span className="text-sm text-green-300">(確認訊息已發送至聊天室)</span>}
                    </p>
                    <button onClick={() => window.location.reload()} className="text-green-400 hover:text-green-300 font-medium underline underline-offset-4">
                        繼續報名
                    </button>
                    {isLiffLoggedIn && liff.isInClient() && (
                        <button onClick={() => liff.closeWindow()} className="block w-full mt-4 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg transition-colors border border-slate-700">
                            關閉視窗
                        </button>
                    )}

                    {!liff.isInClient() && (
                        <button
                            onClick={() => {
                                const methodText = formData.paymentMethod === 'transfer' ? `匯款後五碼：${formData.lastFive}` :
                                    formData.paymentMethod === 'cash' ? '付款方式：現金' : '付款方式：LinePay';
                                const msg = `【Vibe Coding 報名回報】\n姓名：${formData.name}\n場次：${sessions.find(s => s.id === selectedSessionId)?.displayDate}\n${methodText}\n來源：${formData.source}\n\n(系統自動產生)`;
                                const url = `https://line.me/R/oaMessage/${LINE_OA_ID}/?${encodeURIComponent(msg)}`;
                                window.location.href = url;
                            }}
                            className="block w-full mt-4 bg-[#06c755] hover:bg-[#05b34c] text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.273.362 2.256-.37 3.597-.938 4.18-1.234A9.06 9.06 0 0 0 8 15z" />
                            </svg>
                            回報給官方帳號
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-slate-200 font-sans antialiased overflow-x-hidden relative">
            <SEO
                title="Vibe Coding 超屏新技能 | 實戰工作坊"
                description="掌握 AI 提示詞工程，0 基礎也能寫程式。NFC 標籤應用，開發程式更是開啟你的業績。"
                image="https://lionbaker.web.app/vibe/poster.jpg"
                url="https://lionbaker.web.app/vibe"
                type="website"
                appName="Vibe Coding"
            />

            {/* Matrix Background */}
            <MatrixRain />

            {/* Main Content */}
            <div className="relative z-10 max-w-xl mx-auto px-4 py-12">

                {/* Header */}
                <div className="text-center mb-10">
                    <span className="inline-block px-3 py-1 rounded-full bg-green-900/40 border border-green-500/30 text-green-400 text-xs font-bold tracking-widest mb-4 font-mono">
                        // AI_APPLICATION_WORKSHOP
                    </span>
                    <h1 className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight tracking-tighter">
                        Vibe Coding<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">超屏新技能</span>
                    </h1>
                    <p className="text-slate-400 text-lg font-mono text-sm md:text-base">
                        &lt;System&gt; 別再用「勞力」對抗「趨勢」 &lt;/System&gt;<br />
                        你準備好掌握不被 AI 淘汰的硬實力了嗎？
                    </p>
                </div>


                {/* Course Highlights */}
                <div className="mb-12 space-y-8">
                    <div className="bg-black/60 border border-green-900/50 rounded-2xl p-6 md:p-8 backdrop-blur-sm shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2 font-mono">
                            <span className="text-green-500">_Target:</span> 核心課程
                        </h2>
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/30 text-2xl">01</div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">零基礎也能打造 AI 應用</h3>
                                    <p className="text-slate-400 leading-relaxed text-sm">
                                        別被程式碼嚇到了！我們教你用「自然語言」指揮 AI，這不是教你當工程師，而是教你當超級產品經理。
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/30 text-2xl">02</div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">NFC 實體與數位的橋樑</h3>
                                    <p className="text-slate-400 leading-relaxed text-sm">
                                        學習如何將名片、海報變成「一觸即發」的數位入口。讓客戶的手機成為你的業績提款機。
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/30 text-2xl">03</div>
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1">現場實戰，即學即用</h3>
                                    <p className="text-slate-400 leading-relaxed text-sm">
                                        拒絕紙上談兵！工作坊結束時，你將擁有一個屬於自己的 Web App 作品，直接帶回家應用在業務上。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Lecturers */}
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-10 text-center font-mono">
                            &lt;Mentors /&gt;
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 px-4">
                            {/* Lecturer 1 - Jiaji */}
                            <div className="relative mt-8 pt-12 pb-8 px-6 bg-black/40 rounded-2xl border border-green-500/30 text-center shadow-[0_0_15px_rgba(34,197,94,0.1)] backdrop-blur-md">
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 p-0.5 rounded-full bg-gradient-to-b from-green-400 to-green-900 shadow-[0_0_20px_rgba(34,197,94,0.6)]">
                                    <img
                                        src="https://lionbaker.web.app/vibe/AI1.png"
                                        alt="陳嘉吉"
                                        className="w-24 h-24 rounded-full border-4 border-black object-cover bg-black"
                                    />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-1 mt-2">陳嘉吉</h3>
                                <p className="text-green-400 text-sm mb-4 font-mono">20年資深工程師 <br /> 系統架構師<br />專業烘焙老師<br />飲控健康顧問</p>
                                <div className="w-8 h-1 bg-green-500/50 mx-auto mb-4 rounded-full"></div>
                                <p className="text-slate-300 text-sm leading-relaxed text-justify">
                                    20年工程師邏輯腦 X 11萬烘焙粉絲名師。他是最懂如何靈活運用科技解決痛點的實戰派。不只給妳方向，更給妳武器！教妳用自然語言紀錄蛻變，將內在成長轉化為展現自信的最強影響力。
                                </p>
                            </div>

                            {/* Lecturer 2 - Weizhi */}
                            <div className="relative mt-8 pt-12 pb-8 px-6 bg-black/40 rounded-2xl border border-green-500/30 text-center shadow-[0_0_15px_rgba(34,197,94,0.1)] backdrop-blur-md">
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 p-0.5 rounded-full bg-gradient-to-b from-cyan-400 to-cyan-900 shadow-[0_0_20px_rgba(34,211,238,0.6)]">
                                    <img
                                        src="https://lionbaker.web.app/vibe/AI2.png"
                                        alt="鄭偉志"
                                        className="w-24 h-24 rounded-full border-4 border-black object-cover bg-black"
                                    />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-1 mt-2">鄭偉志</h3>
                                <p className="text-cyan-400 text-sm mb-4 font-mono">千部影片御用剪輯手<br /><br />財商系統講師<br /><br /></p>
                                <div className="w-8 h-1 bg-cyan-500/50 mx-auto mb-4 rounded-full"></div>
                                <p className="text-slate-300 text-sm leading-relaxed text-justify">
                                    3年剪輯經驗.15年業務行銷經驗 。他能用最簡單的方式，讓你理解複雜的商業邏輯。不只教妳剪輯，更教妳如何用數位工具打造無限商機。
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Form Section */}
                    <div className="bg-black/80 backdrop-blur-xl border border-green-500/30 rounded-2xl p-6 md:p-8 shadow-[0_0_40px_rgba(34,197,94,0.15)] relative overflow-hidden">
                        {/* Decorative scanning line */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-green-500/50 shadow-[0_0_15px_#22c55e] animate-scan-line"></div>

                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 font-mono">
                            <span className="w-1.5 h-6 bg-green-500"></span>
                            [ 立即報名 ] JOIN_NOW
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-5">

                            {/* Session Selection */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-3 font-mono">:: 選擇場次 ::</label>
                                <div className="grid grid-cols-1 gap-3">
                                    {sessions.map(session => {
                                        const isFull = (session.currentCount || 0) >= (session.maxCapacity || 50);

                                        return (
                                            <div
                                                key={session.id}
                                                className={`relative border rounded-xl p-4 cursor-pointer transition-all ${selectedSessionId === session.id ? 'border-green-500 bg-green-900/20 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'border-slate-800 hover:border-slate-600 bg-slate-900/50'}`}
                                                onClick={() => handleSessionSelect(session.id)}
                                            >
                                                <div className="flex justify-between items-center mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-3 h-3 rounded-full ${isFull ? 'bg-yellow-500 animate-pulse' : selectedSessionId === session.id ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-slate-600'}`}></div>
                                                        <span className="font-bold text-white text-lg">{session.displayDate}</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {isFull ? (
                                                            <div className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">額滿候補中</div>
                                                        ) : (
                                                            selectedSessionId === session.id && <div className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30">已選擇</div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="pl-5">
                                                    <div className="text-slate-300 font-bold mb-1">
                                                        {session.title || 'Vibe Coding 基礎實戰班'}
                                                    </div>
                                                    <div className="text-sm text-slate-400 mb-2 flex items-start gap-1">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 mt-0.5 text-green-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                        <span>{session.location}<br /><span className="text-xs text-slate-500">{session.address}</span></span>
                                                    </div>
                                                    <div className="flex justify-between items-end">
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-xl font-bold text-green-400 font-mono">${session.price?.toLocaleString()}</span>
                                                            <span className="text-sm text-slate-500 line-through">原價 ${session.originalPrice?.toLocaleString()}</span>
                                                        </div>
                                                        <div className="text-xs text-slate-600 font-mono">
                                                            {isFull ? (
                                                                <span className="text-yellow-500 font-bold">已額滿，您的報名將排入備取之中</span>
                                                            ) : (
                                                                `名額狀態: 剩餘 ${(session.maxCapacity || 50) - (session.currentCount || 0)} 位`
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">:: 付款方式 ::</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button type="button" onClick={() => setFormData(p => ({ ...p, paymentMethod: 'transfer' }))} className={`p-3 rounded-lg border text-sm font-bold transition-all ${formData.paymentMethod === 'transfer' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/50 border-slate-700 text-slate-400'}`}>
                                        轉帳匯款
                                    </button>
                                    <button type="button" onClick={() => setFormData(p => ({ ...p, paymentMethod: 'cash' }))} className={`p-3 rounded-lg border text-sm font-bold transition-all ${formData.paymentMethod === 'cash' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-black/50 border-slate-700 text-slate-400'}`}>
                                        現金支付
                                    </button>
                                    <button type="button" onClick={() => setFormData(p => ({ ...p, paymentMethod: 'linepay' }))} className={`p-3 rounded-lg border text-sm font-bold transition-all ${formData.paymentMethod === 'linepay' ? 'bg-[#06c755] border-[#06c755] text-white' : 'bg-black/50 border-slate-700 text-slate-400'}`}>
                                        LinePay
                                    </button>
                                </div>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1 font-mono">:: 真實姓名 ::</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    required
                                    placeholder="請輸入您的姓名"
                                    className="w-full px-4 py-3 rounded-lg bg-black/50 border border-slate-700 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors backdrop-blur-sm"
                                />
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1 font-mono">:: 手機號碼 ::</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    required
                                    placeholder="0912-345-678"
                                    className="w-full px-4 py-3 rounded-lg bg-black/50 border border-slate-700 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors backdrop-blur-sm"
                                />
                            </div>

                            {/* Source */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-3 font-mono">:: 推薦人 / 來源 :: <span className="text-red-400">*</span></label>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => setSourceOption('嘉吉老師')}
                                        className={`p-3 rounded-lg border text-sm font-bold transition-all ${sourceOption === '嘉吉老師' ? 'bg-green-600 border-green-500 text-black shadow-[0_0_15px_rgba(22,163,74,0.4)]' : 'bg-black/50 border-slate-700 text-slate-400 hover:border-green-500/50'}`}
                                    >
                                        嘉吉老師
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSourceOption('偉志老師')}
                                        className={`p-3 rounded-lg border text-sm font-bold transition-all ${sourceOption === '偉志老師' ? 'bg-cyan-600 border-cyan-500 text-black shadow-[0_0_15px_rgba(8,145,178,0.4)]' : 'bg-black/50 border-slate-700 text-slate-400 hover:border-cyan-500/50'}`}
                                    >
                                        偉志老師
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSourceOption('Other')}
                                    className={`w-full p-3 rounded-lg border text-sm font-bold transition-all mb-3 ${sourceOption === 'Other' ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'bg-black/50 border-slate-700 text-slate-400 hover:border-purple-500/50'}`}
                                >
                                    其他
                                </button>

                                {sourceOption === 'Other' && (
                                    <input
                                        type="text"
                                        value={customSource}
                                        onChange={(e) => setCustomSource(e.target.value)}
                                        required={sourceOption === 'Other'}
                                        placeholder="請填寫推薦人或來源 (例如: FB廣告)"
                                        className="w-full px-4 py-3 rounded-lg bg-black/50 border border-slate-700 text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors font-mono"
                                    />
                                )}
                            </div>

                            {/* Payment Details (Conditional) */}
                            {formData.paymentMethod === 'transfer' && (
                                <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-700/80">
                                    <div className="flex items-center gap-2 mb-3 text-green-400 font-bold text-sm uppercase tracking-wider font-mono">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                        PAYMENT_INFO
                                    </div>
                                    <div className="space-y-2 text-sm text-slate-300 mb-4 font-mono">
                                        <div className="flex justify-between"><span>銀行代碼</span><span className="text-white">國泰世華 (013)</span></div>
                                        <div className="flex justify-between"><span>分行</span><span className="text-white">敦化分行</span></div>
                                        <div className="flex justify-between"><span>戶名</span><span className="text-white">焙獅健康顧問有限公司</span></div>
                                        <div className="mt-2 pt-2 border-t border-slate-700 text-center">
                                            <span className="block text-xs text-slate-500 mb-1">// 匯款帳號</span>
                                            <span className="text-xl font-bold text-green-400 select-all tracking-widest">212035012017</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2 font-mono">:: 匯款帳號後五碼 ::</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                name="lastFive"
                                                value={formData.lastFive}
                                                onChange={handleChange}
                                                required
                                                maxLength={5}
                                                placeholder="XXXXX"
                                                className="w-full px-4 py-3 rounded-lg bg-black border border-slate-600 text-green-400 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-colors font-mono tracking-[0.5em] text-center text-lg placeholder-slate-700"
                                            />
                                            <div className="absolute right-3 top-4 text-xs text-slate-500 font-mono">{formData.lastFive.length}/5</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {formData.paymentMethod === 'linepay' && (
                                <div className="bg-[#00c53d]/10 rounded-xl p-5 border border-[#00c53d]/50 text-center">
                                    <h3 className="text-white font-bold mb-2">LinePay 付款</h3>
                                    <p className="text-[#00c53d] text-sm">請於LinePay繳費後通知銷帳。</p>
                                </div>
                            )}
                            {formData.paymentMethod === 'cash' && (
                                <div className="bg-amber-500/10 rounded-xl p-5 border border-amber-500/50 text-center">
                                    <h3 className="text-white font-bold mb-2">現場繳費</h3>
                                    <p className="text-amber-500 text-sm">請先繳交費用後通知銷帳。</p>
                                </div>
                            )}

                            {/* Error Msg */}
                            {error && (
                                <div className="p-3 bg-red-900/30 border border-red-800 text-red-300 text-sm rounded-lg text-center font-mono">
                                    [錯誤] {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-4 px-4 rounded-xl shadow-[0_0_20px_rgba(22,163,74,0.4)] transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span className="font-mono">請稍候...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="group-hover:tracking-widest transition-all duration-300">確認報名 / CONFIRM</span>
                                    </>
                                )}
                            </button>
                        </form>
                        <footer className="mt-12 text-center text-slate-600 text-xs font-mono">
                            <p>&copy; 2026 Vibe Coding. SYSTEM_ONLINE.</p>
                        </footer>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default VibeCoding;
