import React from 'react';

const BannedScreen = () => (
    <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-4xl font-bold text-red-500 mb-4">⛔ 帳號已停權</h1>
        <p className="text-red-600">由於違反使用規範，您的帳號已被暫停使用。</p>
        <p className="text-red-500 text-sm mt-2">如有疑問請聯繫管理員。</p>
    </div>
);

export default BannedScreen;
