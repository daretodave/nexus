// A screen that cannot draw (most often: nexus was updated or stopped while this tab was open, and the screen's code
// is gone from the server) shows a plain card with Reload, never a blank page.
import { Component } from 'react';
import { Err } from './feedback.jsx';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ob" style={{ justifyContent: 'center' }}>
        <main className="ob-main" style={{ maxWidth: 560 }}>
          <Err
            title="nexus was updated or stopped"
            body="Reload to get the current version. What you typed is kept."
            detail={String(this.state.error?.message || this.state.error)}
            actions={<button className="btn btn-s btn-primary" type="button" onClick={() => window.location.reload()}>Reload</button>}
          />
        </main>
      </div>
    );
  }
}
