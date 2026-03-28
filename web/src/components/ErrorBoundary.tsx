import React from "react";

type ErrorBoundaryProps =
{
  children: React.ReactNode;
};

type ErrorBoundaryState =
{
  hasError: boolean;
  errorMessage: string;
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState>
{
  constructor(props: ErrorBoundaryProps)
  {
    super(props);

    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState
  {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : "Unexpected application error.",
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo)
  {
    console.error("Unhandled application error:", error, errorInfo);
  }

  handleReload = () =>
  {
    window.location.reload();
  };

  handleGoLobby = () =>
  {
    window.location.assign("/lobby");
  };

  render()
  {
    if (!this.state.hasError)
    {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-red-300/90">
              Application Error
            </div>

            <h1 className="mt-3 text-2xl font-semibold text-white">
              Something went wrong.
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              Leyline hit an unexpected crash. You can reload the page or return to the lobby.
            </p>

            {this.state.errorMessage ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-300">
                {this.state.errorMessage}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-500/12 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/45 hover:bg-emerald-500/18"
              >
                Reload Page
              </button>

              <button
                type="button"
                onClick={this.handleGoLobby}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}