import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReload: () => void;
  onExport: () => void;
}

interface ErrorBoundaryState {
  crashed: boolean;
  exportFailed: boolean;
}

// React only offers error boundaries as class components, so this is the one class component.
// PRE:  children is the app; onReload reloads the page; onExport downloads the current data and
//       may throw when the engine is unusable
// POST: renders children until one of them throws while rendering; then shows "Something went
//       wrong" with Reload and Export data instead of a blank page, and says when the export fails
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { crashed: false, exportFailed: false };

  // PRE:  a descendant threw while rendering
  // POST: returns the state change that switches to the crash screen
  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { crashed: true };
  }

  // PRE:  the crash screen is shown
  // POST: calls onExport; records whether it threw
  exportData = (): void => {
    try {
      this.props.onExport();
      this.setState({ exportFailed: false });
    } catch {
      this.setState({ exportFailed: true });
    }
  };

  // PRE:  none
  // POST: returns children, or the crash screen once a descendant has thrown
  render(): ReactNode {
    if (!this.state.crashed) {
      return this.props.children;
    }
    return (
      <main>
        <h1>Something went wrong</h1>
        <p>
          The calendar hit an unexpected error. Changes you saved are kept in this browser: export a
          copy if you like, then reload.
        </p>
        {this.state.exportFailed && <p role="alert">The export failed too.</p>}
        <button type="button" onClick={this.props.onReload}>
          Reload
        </button>
        <button type="button" onClick={this.exportData}>
          Export data
        </button>
      </main>
    );
  }
}
