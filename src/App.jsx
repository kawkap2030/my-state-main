import React from 'react';
import { RouterProvider } from 'react-router-dom';
import router from './router';
import { ToastProvider, ToastRenderer } from './components/ui/Toast';
import { SmartNotificationProvider } from './context/SmartNotificationContext';

// ═══════════════════════════════════════════════════════════════════════════
// Global Error Boundary — catches fatal errors that bubble past per-page
// error boundaries, e.g. router crashes, context-provider failures.
// ═══════════════════════════════════════════════════════════════════════════
class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
    this.maxRetries = 3;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[GlobalErrorBoundary] Fatal error:', error, info);
  }

  handleRetry = () => {
    const next = this.state.retryCount + 1;
    if (next <= this.maxRetries) {
      this.setState({ hasError: false, error: null, retryCount: next });
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, retryCount: 0 });
    window.location.hash = '#/';
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('ChunkLoadError');
      const canRetry = this.state.retryCount < this.maxRetries;

      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{
            background: 'linear-gradient(135deg, #0c1929 0%, #0f172a 30%, #1a2332 70%, #0f172a 100%)',
          }}
          dir="rtl"
        >
          <div
            className="rounded-2xl p-10 text-center max-w-md w-full"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              animation: 'fadeIn 0.4s ease',
            }}
          >
            {/* Icon */}
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(239,68,68,0.1)' }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>

            {/* Title */}
            <h1
              className="text-xl font-black mb-3"
              style={{ color: 'var(--color-text)' }}
            >
              {isChunkError
                ? 'تعذر تحميل جزء من التطبيق'
                : 'حدث خطأ غير متوقع'}
            </h1>

            {/* Subtitle */}
            <p
              className="text-sm mb-6 leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {isChunkError
                ? 'قد يكون الخادم غير متاح مؤقتاً أو هناك مشكلة في الاتصال. حاول إعادة التحميل.'
                : 'عذراً، حدث خطأ غير متوقع في التطبيق. يمكنك إعادة المحاولة أو العودة للصفحة الرئيسية.'}
            </p>

            {/* Error message (collapsible) */}
            {this.state.error?.message && (
              <details className="mb-6 text-left" style={{ direction: 'ltr' }}>
                <summary
                  className="text-[11px] font-bold cursor-pointer py-1 px-3 rounded-lg inline-block"
                  style={{
                    color: 'var(--color-text-muted)',
                    background: 'var(--color-bg)',
                  }}
                >
                  تفاصيل الخطأ
                </summary>
                <pre
                  className="mt-2 p-3 rounded-xl text-[10px] leading-relaxed overflow-auto max-h-24"
                  style={{
                    background: '#1e1e2e',
                    color: '#cdd6f4',
                    border: '1px solid #313244',
                    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  }}
                >
                  {this.state.error.message}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #0891b2, #0e7490)',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(8,145,178,0.3)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(8,145,178,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(8,145,178,0.3)'; }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:animate-spin">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  <span>
                    {canRetry
                      ? `إعادة المحاولة (${this.state.retryCount + 1}/${this.maxRetries})`
                      : 'إعادة المحاولة'}
                  </span>
                </button>
              )}

              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer"
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  border: '1px solid var(--color-border)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                <span>العودة للرئيسية</span>
              </button>
            </div>

            {/* Retry exhausted notice */}
            {!canRetry && (
              <p
                className="mt-4 text-[11px] font-bold"
                style={{ color: 'var(--color-danger)' }}
              >
                تكرر الخطأ عدة مرات. قد تحتاج إلى إعادة تشغيل التطبيق.
              </p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { GlobalAppProvider } from './context/GlobalAppContext';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <GlobalErrorBoundary>
      <SmartNotificationProvider>
        <ToastProvider>
          <AuthProvider>
            <GlobalAppProvider>
              <RouterProvider router={router} />
            </GlobalAppProvider>
          </AuthProvider>
        </ToastProvider>
      </SmartNotificationProvider>
    </GlobalErrorBoundary>
  );
}

export default App;