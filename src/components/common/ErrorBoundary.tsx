import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[BUDJU] Uncaught error:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="text-center p-8 max-w-md">
            <img
              src="/images/logo.svg"
              alt="BUDJU"
              className="w-16 h-16 mx-auto mb-4 opacity-60"
            />
            <h2 className="text-xl font-bold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-400 mb-6 text-sm">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-budju-pink text-white rounded-budju text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
              <button
                onClick={() => (window.location.href = "/")}
                className="px-4 py-2 bg-gray-700 text-white rounded-budju text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
