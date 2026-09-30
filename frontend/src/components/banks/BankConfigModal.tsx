import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { useBankMutations } from "../../hooks/useBanks";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import type { BankRead, ColumnMap } from "../../types";

interface BankConfigModalProps {
  bank: BankRead | null; // null = create mode
  open: boolean;
  onClose: () => void;
}

interface FormState {
  name: string;
  date_format: string;
  encoding: string;
  skip_header_rows: string;
  skip_footer_rows: string;
  col_date: string;
  col_amount: string;
  col_description: string;
  col_transaction_id: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  date_format: "",
  encoding: "utf-8",
  skip_header_rows: "0",
  skip_footer_rows: "0",
  col_date: "",
  col_amount: "",
  col_description: "",
  col_transaction_id: "",
};

function columnValue(v: string | number): string {
  return String(v);
}

function fromBank(bank: BankRead): FormState {
  return {
    name: bank.name,
    date_format: bank.date_format,
    encoding: bank.encoding,
    skip_header_rows: String(bank.skip_header_rows),
    skip_footer_rows: String(bank.skip_footer_rows),
    col_date: columnValue(bank.column_map.date),
    col_amount: columnValue(bank.column_map.amount),
    col_description: columnValue(bank.column_map.description),
    col_transaction_id:
      bank.column_map.transaction_id != null ? columnValue(bank.column_map.transaction_id) : "",
  };
}

/** A column-map field is a 0-based integer index when it parses as one, else a name. */
function parseColumn(value: string): string | number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function BankConfigModal({ bank, open, onClose }: BankConfigModalProps): JSX.Element | null {
  const { createBank, updateBank, deleteBank } = useBankMutations();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setForm(bank ? fromBank(bank) : EMPTY_FORM);
    setConfirmOpen(false);
  }, [bank, open]);

  if (!open) return null;

  const isEdit = bank !== null;

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Preserve the loaded value's original type when the text is unchanged, so an
  // all-digit column *name* (e.g. a header literally called "2024") is not
  // silently reinterpreted as a 0-based index on save.
  const resolveColumn = (
    text: string,
    original: string | number | null | undefined
  ): string | number => {
    if (original != null && String(original) === text.trim()) return original;
    return parseColumn(text);
  };

  const buildColumnMap = (): ColumnMap => {
    const original = bank?.column_map;
    const map: ColumnMap = {
      date: resolveColumn(form.col_date, original?.date),
      amount: resolveColumn(form.col_amount, original?.amount),
      description: resolveColumn(form.col_description, original?.description),
    };
    if (form.col_transaction_id.trim() !== "") {
      map.transaction_id = resolveColumn(form.col_transaction_id, original?.transaction_id);
    }
    return map;
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const name = form.name.trim();
    const date_format = form.date_format.trim();
    const encoding = form.encoding.trim();
    const requiredColumns = [form.col_date, form.col_amount, form.col_description];
    if (!name || !date_format || !encoding || requiredColumns.some((c) => c.trim() === "")) {
      toast.error("Please fill in all required fields.");
      return;
    }
    const payload = {
      name,
      column_map: buildColumnMap(),
      date_format,
      encoding,
      skip_header_rows: Number(form.skip_header_rows) || 0,
      skip_footer_rows: Number(form.skip_footer_rows) || 0,
    };
    if (isEdit && bank) {
      updateBank.mutate({ id: bank.id, ...payload }, { onSuccess: onClose });
    } else {
      createBank.mutate(payload, { onSuccess: onClose });
    }
  };

  const handleDelete = (): void => {
    if (!bank) return;
    deleteBank.mutate(bank.id, { onSuccess: onClose });
  };

  const saving = createBank.isPending || updateBank.isPending;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit bank" : "Add bank"}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title">{isEdit ? "Edit Bank" : "Add Bank"}</h2>
        <form className="bank-form" onSubmit={handleSubmit}>
          <label className="bank-form__field">
            <span>Name</span>
            <input value={form.name} onChange={set("name")} required />
          </label>
          <label className="bank-form__field">
            <span>Date format</span>
            <input
              value={form.date_format}
              onChange={set("date_format")}
              placeholder="%Y-%m-%d"
              required
            />
          </label>
          <label className="bank-form__field">
            <span>Encoding</span>
            <input value={form.encoding} onChange={set("encoding")} required />
          </label>
          <label className="bank-form__field">
            <span>Skip header rows</span>
            <input
              type="number"
              min={0}
              value={form.skip_header_rows}
              onChange={set("skip_header_rows")}
            />
          </label>
          <label className="bank-form__field">
            <span>Skip footer rows</span>
            <input
              type="number"
              min={0}
              value={form.skip_footer_rows}
              onChange={set("skip_footer_rows")}
            />
          </label>

          <fieldset className="bank-form__columns">
            <legend>Column mapping</legend>
            <label className="bank-form__field">
              <span>Date column</span>
              <input value={form.col_date} onChange={set("col_date")} required />
            </label>
            <label className="bank-form__field">
              <span>Amount column</span>
              <input value={form.col_amount} onChange={set("col_amount")} required />
            </label>
            <label className="bank-form__field">
              <span>Description column</span>
              <input value={form.col_description} onChange={set("col_description")} required />
            </label>
            <label className="bank-form__field">
              <span>Transaction ID column (optional)</span>
              <input value={form.col_transaction_id} onChange={set("col_transaction_id")} />
            </label>
          </fieldset>

          <div className="dialog__actions">
            {isEdit && (
              <button
                type="button"
                className="bank-form__delete"
                onClick={() => setConfirmOpen(true)}
              >
                Delete Bank
              </button>
            )}
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="dialog__confirm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete bank"
        message={
          bank
            ? `Delete "${bank.name}"? This is only possible if it has no transactions or imports.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmOpen(false);
          handleDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
