import { Component, ReactNode } from "react";
import { Screen, Eyebrow, Title } from "./Shell";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Catches render-time crashes anywhere below it so a bug in one screen
 * shows a recoverable message instead of a blank white page. Reload is
 * the entire recovery story — App's own load-on-mount logic (engine/save.ts)
 * picks the last Career-Hub checkpoint back up on its own, so there's
 * nothing bespoke to wire here. A crash before that first checkpoint
 * simply has nothing to resume, same as it always did.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error("Unhandled error in BlackTop — Career:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Screen>
        <div className="rise mt-16 text-center">
          <Eyebrow>Something broke</Eyebrow>
          <Title size="xl">Timeout.</Title>
          <p className="mt-4 text-mute text-sm leading-relaxed">
            This screen hit a snag. Your last save is safe — reload to pick up right where you left off.
          </p>
        </div>
        <div className="mt-auto pt-10 rise rise-1">
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </Screen>
    );
  }
}
