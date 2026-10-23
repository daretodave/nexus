// A screen that cannot draw shows a plain card with Reload, never a blank page. Only a screen whose code could not be
// fetched (nexus was updated or stopped while this tab was open) is blamed on that; any other error says so plainly.
// `resetKey` (the page's path): going to another page clears the card.
import { Component } from 'react';
import { Err } from './feedback.jsx';

/** Did a screen's code fail to load (the server that served this tab is gone or newer)? */
export function codeGone(error) {
  const m = String(error?.message || error || '');
  return error?.name === 'ChunkLoadError' || /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically|Loading chunk|Unable to preload CSS/i.test(m);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const gone = codeGone(this.state.error);
    return (
      <div className="ob" style={{ justifyContent: 'center' }}>
        <main className="ob-main" style={{ maxWidth: 560 }}>
          <Err
            title={gone ? 'nexus was updated or stopped' : 'This page hit a problem'}
            body={gone ? 'Reload to get the current version. What you typed is kept.' : 'Reload to try again, or go to another page. What you typed is kept.'}
            detail={String(this.state.error?.message || this.state.error)}
            actions={<button className="btn btn-s btn-primary" type="button" onClick={() => window.location.reload()}>Reload</button>}
          />
        </main>
      </div>
    );
  }
}
