interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Stage 8 placeholder. The full import form (bank select, file input, result
 * summary) is implemented in Stage 9. Kept as a store-driven, always-mounted
 * dialog so the AppShell contract and the "Import CSV" button work today.
 */
export function ImportModal({ open, onClose }: ImportModalProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import CSV"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title">Import CSV</h2>
        <p className="dialog__message">CSV import is coming soon.</p>
        <div className="dialog__actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
