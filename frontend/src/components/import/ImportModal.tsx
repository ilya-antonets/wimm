import { Button, Group, Input, Modal, NativeSelect, Stack, Text } from "@mantine/core";
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
    <Modal
      opened={open}
      onClose={onClose}
      withCloseButton={false}
      className="dialog"
      aria-label="Import CSV"
      title="Import CSV"
    >
      <form className="import-form" onSubmit={handleSubmit}>
        <Stack gap="sm">
          <NativeSelect
            label="Bank"
            value={bankId}
            onChange={(e) => setBankId(e.currentTarget.value)}
          >
            <option value="">Select a bank…</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </NativeSelect>
          <Input.Wrapper label="CSV file" className="import-form__field">
            <Input
              component="input"
              type="file"
              accept=".csv"
              aria-label="CSV file"
              onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
            />
          </Input.Wrapper>

          <Group justify="flex-end" className="dialog__actions">
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" className="dialog__confirm" disabled={!canSubmit}>
              {importCsv.isPending ? "Importing…" : "Import"}
            </Button>
          </Group>
        </Stack>
      </form>

      {result && (
        <div className="import-result" role="status">
          <Text className="import-result__summary" mt="md">
            {result.new_transactions} new, {result.duplicate_transactions} duplicates,{" "}
            {result.failed_rows.length} failed
          </Text>
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
    </Modal>
  );
}
