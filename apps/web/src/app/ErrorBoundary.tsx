import { Component, type ReactNode } from 'react';
import { OctagonAlert, RotateCw } from 'lucide-react';
import { Button, Card, CopyButton, Disclosure } from '../ui/index.ts';

type Props = { children: ReactNode; /** A new value, such as the next route, clears the error. */ resetKey?: unknown };

function Crash({ error }: { error: Error }) {
  const details = [error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message, error.stack].filter(Boolean).join('\n\n');
  return (
    <Card className="mx-auto max-w-xl" padding="lg">
      <div role="alert" className="flex flex-col items-start gap-4">
        <span className="flex size-10 items-center justify-center rounded-lg border border-danger/32 bg-danger/12 text-danger-text" aria-hidden>
          <OctagonAlert className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-text">This page stopped working</h2>
          <p className="mt-1.5 text-sm text-muted">
            Something on it failed to show. Reloading usually fixes it. A payment you already sent keeps going without this page, and you can follow it again after the reload.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<RotateCw />} onClick={() => location.reload()}>
            Reload
          </Button>
          <a href="/" className="link self-center px-2 text-sm">
            Go to the start
          </a>
        </div>
        <Disclosure title="Details" className="w-full">
          <div className="relative">
            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-bg p-3 pr-12 font-mono text-xs leading-5 whitespace-pre-wrap text-muted">{details}</pre>
            <CopyButton value={details} label="Copy details" size="xs" className="absolute top-2 right-2" />
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}

/** Catches what a page throws while rendering, including a chunk that failed to load, and offers a reload. */
export class ErrorBoundary extends Component<Props, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: undefined });
  }
  render() {
    return this.state.error ? <Crash error={this.state.error} /> : this.props.children;
  }
}
