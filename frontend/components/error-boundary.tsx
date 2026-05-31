"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Optional callback to let the parent reset its own state (e.g. go back to input). */
  onReset?: () => void;
};

type State = { hasError: boolean; message: string };

/**
 * Catches render-time errors in the report view so a single malformed field can
 * never blank the whole page. Shows a recoverable message instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Something went wrong rendering this view.",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("Report render error:", error);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-[color:var(--red)]" />
          <div>
            <p className="text-base font-semibold text-[color:var(--text-primary)]">
              We couldn&apos;t display this report
            </p>
            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
              The analysis ran, but part of the result was incomplete. Try running it again.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="rounded-pill bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Start over
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
