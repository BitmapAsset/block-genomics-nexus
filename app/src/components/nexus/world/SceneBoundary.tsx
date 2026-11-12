'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  onFail: () => void;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/** A second net around the 3D scene: an error thrown while it renders hands the view to the no-3D card. */
export default class SceneBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[SceneBoundary] the 3D scene failed:', error);
    this.props.onFail();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
