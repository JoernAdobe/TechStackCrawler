import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  /** Name des Bereichs für die Fehlermeldung (z. B. "Results table"). */
  label: string;
  children: ReactNode;
  /** Kompakte Darstellung für einzelne Karten statt ganzer Seitenbereiche. */
  compact?: boolean;
  /** Ändert sich der Key (z. B. neue Analyse), wird der Fehlerzustand zurückgesetzt. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  resetKey: unknown;
}

/**
 * Fängt Render-Fehler eines Teilbereichs ab, damit eine kaputte Karte (z. B. wegen
 * fehlender Felder in einer alten Analyse) nicht die ganze Seite leer rendert.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className={`${this.props.compact ? 'my-4' : 'max-w-7xl mx-auto my-6 px-4 sm:px-6'}`}
      >
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-ts-text-primary">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="flex-1">
            <strong>{this.props.label}</strong> could not be displayed. The rest of the page is unaffected.
          </span>
          <button
            type="button"
            onClick={this.retry}
            className="inline-flex items-center gap-1 rounded-md border border-ts-border px-2 py-1 text-xs hover:bg-ts-surface-light"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>
    );
  }
}
