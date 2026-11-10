"use client";

import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    onError: () => void;
    resetKey?: number;
    fallback?: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  componentDidUpdate(previous: Readonly<{ resetKey?: number }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed
      ? (this.props.fallback ?? null)
      : this.props.children;
  }
}
