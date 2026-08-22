/**
 * SuspenseErrorBoundary — Safe lazy-load wrapper with retry.
 *
 * Wraps React.lazy() imports so that chunk-load failures show a
 * friendly error card INSTEAD of breaking the entire app.
 *
 * Usage:
 *   <SuspenseErrorBoundary name="لوحة التحكم">
 *     <HeavyComponent />
 *   </SuspenseErrorBoundary>
 *
 * Features:
 *   - Catches chunk-load errors (ChunkLoadError, network failures)
 *   - Shows a beautiful error state with retry button
 *   - Retry resets the error and re-mounts children (causes React.lazy
 *     to attempt loading the chunk again)
 *   - "العودة للرئيسية" navigates to /
 *   - Loading state via Suspense + LoadingFallback
 *   - Animated transitions between states
 */
import React, { Suspense, Component } from 'react';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';
import LoadingFallback from './LoadingFallback';

// ═══════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY (inner)
// ═══════════════════════════════════════════════════════════════════════════

class LazyErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isChunkError: false,
      retryKey: 0, // incremented on retry to force React.lazy() to re-attempt
    };
  }

  static getDerivedStateFromError(error) {
    const msg = (error && error.message) || '';
    // Only detect genuine chunk/asset load failures
    const isChunkLoad =
      msg.includes('Loading chunk') ||
      msg.includes('ChunkLoadError');

    return {
      hasError: true,
      error,
      isChunkError: isChunkLoad,
    };
  }

  componentDidCatch(error, info) {
    console.error(`[SuspenseErrorBoundary] "${this.props.name}" failed:`, error, info);
    this.setState({ errorInfo: info });
  }

  handleRetry = () => {
    this.setState(prev => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryKey: prev.retryKey + 1, // forces React.lazy() to retry
    }));
  };

  handleGoHome = () => {
    // Navigate home first, then reset after navigation
    window.location.hash = '#/';
    setTimeout(() => this.setState({ hasError: false, error: null, retryKey: 0 }), 50);
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback
        name={this.props.name}
        error={this.state.error}
        isChunk={this.state.isChunkError}
        onRetry={this.handleRetry}
        onHome={this.handleGoHome}
      />;
    }
    // Key forces React.lazy() to retry loading instead of using cached rejection
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR FALLBACK UI
// ═══════════════════════════════════════════════════════════════════════════

const ErrorFallback = ({ name, error, isChunk, onRetry, onHome }) => {
  const errorMsg = error?.message || 'حدث خطأ غير متوقع';

  return (
    <div
      className="flex items-center justify-center p-8"
      style={{
        minHeight: '400px',
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        className="rounded-2xl p-10 text-center max-w-md w-full"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-premium)',
        }}
      >
        {/* Icon */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{
            background: isChunk
              ? 'rgba(245,158,11,0.12)'
              : 'rgba(239,68,68,0.1)',
          }}
        >
          {isChunk ? (
            <RefreshCw size={36} style={{ color: '#f59e0b' }} />
          ) : (
            <AlertTriangle size={40} style={{ color: '#ef4444' }} />
          )}
        </div>

        {/* Title */}
        <h2
          className="text-xl font-black mb-2"
          style={{ color: 'var(--color-text)' }}
        >
          {isChunk ? 'تعذر تحميل ملفات الصفحة' : 'تعذر تحميل الصفحة'}
        </h2>

        {/* Page name */}
        {name && (
          <p
            className="text-sm font-bold mb-1"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {name}
          </p>
        )}

        {/* Error detail (collapsible) */}
        <details
          className="mb-6 text-left"
          style={{ direction: 'ltr' }}
        >
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
            className="mt-2 p-3 rounded-xl text-[10px] leading-relaxed overflow-auto max-h-32"
            style={{
              background: '#1e1e2e',
              color: '#cdd6f4',
              border: '1px solid #313244',
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
            }}
          >
            {errorMsg}
          </pre>
        </details>

        {/* Description */}
        <p
          className="text-sm mb-8 leading-relaxed"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {isChunk
            ? 'تعذر تحميل ملفات هذه الصفحة. يمكنك إعادة المحاولة أو إعادة تشغيل التطبيق.'
            : 'تعذر تحميل الصفحة بسبب خطأ داخلي في التطبيق. يمكنك إعادة المحاولة أو العودة للصفحة الرئيسية.'}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #0891b2, #0e7490)',
              color: '#fff',
              boxShadow: '0 4px 14px rgba(8,145,178,0.3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(8,145,178,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(8,145,178,0.3)'; }}
          >
            <RefreshCw size={16} className="group-hover:animate-spin" />
            <span>إعادة المحاولة</span>
          </button>

          <button
            onClick={onHome}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 cursor-pointer"
            style={{
              background: 'transparent',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Home size={16} />
            <span>العودة للرئيسية</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SafeSuspense — Drop-in replacement for <Suspense> that also catches
 * chunk-load errors and shows a retry UI.
 *
 * @param {Object} props
 * @param {ReactNode} props.children - The lazy-loaded component(s)
 * @param {string} [props.name] - Human-readable page/module name for the error card
 * @param {ReactNode} [props.fallback] - Custom loading fallback (default: LoadingFallback)
 */
const SafeSuspense = ({ children, name, fallback }) => (
  <Suspense fallback={fallback || <LoadingFallback />}>
    <LazyErrorBoundary name={name}>
      {children}
    </LazyErrorBoundary>
  </Suspense>
);

export default SafeSuspense;

// Also export the raw boundary for custom use cases
export { LazyErrorBoundary as SuspenseErrorBoundary };
