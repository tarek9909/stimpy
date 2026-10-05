import { Component, type ReactNode, type Ref } from 'react';
import { Builder, type BuilderData, type BuilderHandle, type ThrottleSimulator } from '@stimpy/builder';
import { Button } from '@stimpy/ui';

class PreviewBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error): void {
    console.error('[stimpy:admin] builder preview error', error.name, error.message);
  }
  override componentDidUpdate(prev: { resetKey: string }): void {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-danger p-4">
        <p className="font-medium">Couldn&apos;t load the preview.</p>
        <p className="text-body-sm text-fg-muted">This only affects the preview. Your settings and the website are unaffected.</p>
        <Button size="sm" variant="secondary" onClick={() => this.setState({ failed: false })}>Try again</Button>
      </div>
    );
  }
}

/**
 * The real `<Builder />` from `@stimpy/builder`, fed with the form's UNSAVED state (no API call). It is lazy-loaded together with this
 * file, so Three.js stays out of the dashboard's main bundle (the engine itself is imported only when the 3D view is used).
 * `force3d` lets the preview show 3D on any machine; runtime failures (missing mesh, bad GLB) still fall back to 2D inside the Builder.
 */
export default function PreviewPanel({ data, throttle, handleRef, debug }: { data: BuilderData; throttle: ThrottleSimulator; handleRef: Ref<BuilderHandle>; debug?: boolean }) {
  return (
    <PreviewBoundary resetKey={data.config.model3d?.url ?? 'none'}>
      <Builder data={data} surface="page" force3d throttleSimulator={throttle} hidePhotoLinks stickyBar={false} ref={handleRef} debug3d={debug} />
    </PreviewBoundary>
  );
}
