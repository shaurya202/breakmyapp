import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-xl font-bold text-red-300">Unable to open this page</h1>
        <p className="mt-3">The report link may be invalid, or the service may be temporarily unavailable.</p>
        <a className="mt-4 inline-block text-acid underline" href="/">Back to the breaker</a>
      </main>
    );
    return this.props.children;
  }
}
