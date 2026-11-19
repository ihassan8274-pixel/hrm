import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">حدث خطأ في التطبيق</h2>
          <p className="text-slate-600 mb-6">{this.state.error?.message || 'خطأ غير متوقع'}</p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left text-xs font-mono text-slate-500 max-h-40 overflow-auto text-left">
            {this.state.error?.stack?.split('\n').slice(0,5).join('\n')}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={() => this.setState({hasError:false,error:null})} className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700">إعادة المحاولة</button>
            <button onClick={() => window.location.href='/login'} className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50">تسجيل الدخول</button>
          </div>
        </div>
      </div>
    );
    return this.props.children;
  }
}
