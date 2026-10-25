import React from "react";
import i18n from "../i18n/index.js";

/** Last line of defence: a render error shows a friendly screen instead of a blank page. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Kartoteka] crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fc-gutter min-h-screen flex items-center justify-center py-10">
        <div className="fc-panel p-6 max-w-md w-full text-center">
          <h1 className="text-title-lg">{i18n.t("errorBoundary.title")}</h1>
          <p className="fc-muted mt-2 text-sm">
            {i18n.t("errorBoundary.body")}
          </p>
          <pre className="bg-surface-container-high rounded-lg p-3 mt-4 text-xs text-left overflow-auto fc-mono">{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" className="fc-btn fc-btn-primary px-4 py-2.5 mt-4" onClick={() => window.location.reload()}>
            {i18n.t("errorBoundary.reload")}
          </button>
        </div>
      </div>
    );
  }
}
