import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useBanks } from "../../hooks/useBanks";
import { useImport } from "../../hooks/useImport";
import type { ImportResult } from "../../types";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * CSV import dialog. Store-driven and always mounted by AppShell (keep the
 * `{ open, onClose }` signature). On success it shows an inline summary and a
 * collapsible failed-rows list; on error it toasts and stays open.
 */
export function ImportModal({ open, onClose }: ImportModalProps): JSX.Element | null {
  const { banks } = useBanks();
  const { importCsv } = useImport();
  const [bankId, setBankId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showFailed, setShowFailed] = useState(false);

  useEffect(() => {
    if (open) {
      setBankId("");
      setFile(null);
      setResult(null);
      setShowFailed(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!bankId || !file) return;
    importCsv.mutate(
      { bankId: Number(bankId), file },
      {
        onSuccess: (res) => setResult(res),
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const canSubmit = bankId !== "" && file !== null && !importCsv.isPending;

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
        <form className="import-form" onSubmit={handleSubmit}>
          <label className="import-form__field">
            <span>Bank</span>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">Select a bank…</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
          </label>
          <label className="import-form__field">
            <span>CSV file</span>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="dialog__actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="dialog__confirm" disabled={!canSubmit}>
              {importCsv.isPending ? "Importing…" : "Import"}
            </button>
          </div>
        </form>

        {result && (
          <div className="import-result" role="status">
            <p className="import-result__summary">
              {result.new_transactions} new, {result.duplicate_transactions} duplicates,{" "}
              {result.failed_rows.length} failed
            </p>
            {result.failed_rows.length > 0 && (
              <details open={showFailed} onToggle={(e) => setShowFailed(e.currentTarget.open)}>
                <summary>Failed rows ({result.failed_rows.length})</summary>
                <ul className="import-result__failed">
                  {result.failed_rows.map((row) => (
                    <li key={row.row_number}>
                      Row {row.row_number}: {row.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
