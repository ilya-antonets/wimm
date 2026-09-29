export function LoadingSpinner({ label = "Loading…" }: { label?: string }): JSX.Element {
  return (
    <div role="status" aria-live="polite" className="loading-spinner">
      <span className="loading-spinner__dot" aria-hidden="true" />
      <span className="loading-spinner__label">{label}</span>
    </div>
  );
}
