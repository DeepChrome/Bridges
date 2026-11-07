/* A throw in any screen must not take the window with it (§30ad): the
   boundary shows what broke and two ways on. The store is debounced, so a
   crash is not a debounce — the pending save is written by session.js's
   beforeunload on a reload, and "Try again" remounts without one. */

import React from "react";
import { Btn } from "./ui.jsx";

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[boundary]", error, info && info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pane-inner">
        <h1>Something broke</h1>
        <p className="sub">Your progress is saved.</p>
        <pre className="muted" style={{ whiteSpace: "pre-wrap", userSelect: "text" }}>{String(this.state.error && this.state.error.message)}</pre>
        <div className="hrow">
          <Btn kind="pri" label="Try again" onClick={() => this.setState({ error: null })} />
          <Btn label="Reload" onClick={() => window.location.reload()} />
        </div>
      </div>
    );
  }
}
