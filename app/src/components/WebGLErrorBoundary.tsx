'use client';

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Fallback message shown when WebGL/Three.js crashes */
  fallbackMessage?: string;
  /** Optional link to redirect the user */
  fallbackHref?: string;
  fallbackLinkText?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Error Boundary for Three.js / WebGL components.
 * Shows a graceful fallback instead of a white screen when 3D rendering fails.
 */
export default class WebGLErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[WebGLErrorBoundary] 3D rendering failed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center w-full h-full min-h-[200px]" style={{ background: '#0a0a0f' }}>
          <div className="text-center px-6 py-10 max-w-md">
            <div className="text-4xl mb-4 opacity-60">🖥️</div>
            <h3 className="text-lg font-semibold text-white mb-2">3D rendering unavailable</h3>
            <p className="text-sm text-gray-400 mb-4">
              {this.props.fallbackMessage || "Your browser doesn't support WebGL, or the 3D scene encountered an error. Try Chrome or Safari with hardware acceleration enabled."}
            </p>
            {this.props.fallbackHref && (
              <a
                href={this.props.fallbackHref}
                className="inline-block px-5 py-2.5 rounded-lg text-sm font-medium bg-accent-cyan/15 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/25 transition-all"
              >
                {this.props.fallbackLinkText || 'Continue'}
              </a>
            )}
            <button
              onClick={() => this.setState({ hasError: false })}
              className="block mx-auto mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
