import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render error and shows a readable message instead of a blank page.
 *
 * The application has 74 screens and no front-end tests, so a single thrown
 * exception during render takes the whole interface down and the user is left
 * looking at an empty window with the reason only in the browser console.
 * The boundary turns that into a message and a way out.
 *
 * It was removed in commit 49ea620 while the audit report still promised it.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The details stay in the console for the developer; the user gets a
    // message they can act on.
    console.error('[ui] render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white max-w-lg w-full rounded-2xl border border-rose-200 shadow-sm p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h1 className="mt-5 text-lg font-bold text-slate-800">حدث خطأ في هذه الشاشة</h1>
          <p className="mt-2 text-sm text-slate-600 leading-6">
            الشاشة دي لم تقدر تُعرض. بياناتك محفوظة في السيرفر ولم يتأثر فيها شيء.
            جرّب تحديث الصفحة، ولو الخطأ استمر أرسل لنا تفاصيله.
          </p>
          <pre
            dir="ltr"
            className="mt-4 text-left text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-32"
          >
            {error.message || String(error)}
          </pre>
          <button
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث الصفحة
          </button>
        </div>
      </div>
    );
  }
}
