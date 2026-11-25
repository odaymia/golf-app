import { Component } from 'react';

// If a screen crashes, show a way out instead of a blank page. "Go home"
// forgets the screen the app reopens to (lib/place.js), so it can't loop
// straight back into the same crash.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const home = () => {
      try {
        localStorage.removeItem('golf-app:place');
      } catch {
        // storage blocked
      }
      location.href = location.pathname;
    };
    return (
      <div className="screen crash-screen">
        <div className="card warn-box">
          <h2>Something went wrong on this screen</h2>
          <p>Your scores are saved. Try reloading, or go back to the home screen.</p>
          <p className="muted small">{String(this.state.error?.message ?? this.state.error).slice(0, 200)}</p>
        </div>
        <button className="btn btn-primary btn-xl" onClick={() => location.reload()}>
          Reload
        </button>
        <button className="btn btn-ghost btn-xl" onClick={home}>
          Go to home screen
        </button>
      </div>
    );
  }
}
