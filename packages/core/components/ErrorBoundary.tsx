import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-bg-primary text-text-primary p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="text-4xl mb-2">⚠️</div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-text-secondary">
              An unexpected error occurred. You can try dismissing it or reloading the app.
            </p>
            {this.state.error && (
              <pre className="mt-3 p-3 rounded-lg bg-bg-secondary border border-border-subtle text-xs text-text-muted text-left overflow-auto max-h-32 font-mono">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleDismiss}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-bg-tertiary hover:bg-bg-hover text-text-primary border border-border-subtle transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-accent-primary hover:bg-accent-deep text-white transition-colors"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
