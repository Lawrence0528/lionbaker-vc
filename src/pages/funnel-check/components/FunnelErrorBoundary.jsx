import React from 'react';

export default class FunnelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    // dev 用：把錯誤留在 console，方便你貼更多資訊
    // eslint-disable-next-line no-console
    console.error('FunnelCheck ErrorBoundary 捕捉到錯誤：', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const message =
      this.state.error?.message ||
      this.state.error?.toString?.() ||
      '未知錯誤（請查看 console）';

    return (
      <main className="min-h-screen bg-stone-50 text-slate-900 font-sans p-4">
        <section className="max-w-md mx-auto mt-10 bg-white rounded-2xl shadow-xl border border-slate-200 p-6">
          <h1 className="text-lg font-black text-rose-700">漏斗健檢系統出錯</h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            目前頁面發生執行期錯誤，為了避免白畫面，我們把訊息顯示在這裡。
          </p>
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl">
            {message}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all active:scale-[0.99]"
          >
            重新整理
          </button>
        </section>
      </main>
    );
  }
}

