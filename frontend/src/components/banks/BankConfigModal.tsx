import { Button, Fieldset, Group, Modal, Stack, TextInput } from "@mantine/core";
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
  col_memo: string;
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
  col_memo: "",
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
    col_memo: bank.column_map.memo != null ? columnValue(bank.column_map.memo) : "",
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
    if (form.col_memo.trim() !== "") {
      map.memo = resolveColumn(form.col_memo, original?.memo);
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
    <Modal
      opened={open}
      onClose={onClose}
      withCloseButton={false}
      className="dialog"
      aria-label={isEdit ? "Edit bank" : "Add bank"}
      size="lg"
      title={isEdit ? "Edit Bank" : "Add Bank"}
    >
      <form className="bank-form" onSubmit={handleSubmit}>
        <Stack gap="sm">
          <TextInput label="Name" value={form.name} onChange={set("name")} required />
          <TextInput
            label="Date format"
            value={form.date_format}
            onChange={set("date_format")}
            placeholder="%Y-%m-%d"
            required
          />
          <TextInput label="Encoding" value={form.encoding} onChange={set("encoding")} required />
          <TextInput
            label="Skip header rows"
            type="number"
            min={0}
            value={form.skip_header_rows}
            onChange={set("skip_header_rows")}
          />
          <TextInput
            label="Skip footer rows"
            type="number"
            min={0}
            value={form.skip_footer_rows}
            onChange={set("skip_footer_rows")}
          />

          <Fieldset legend="Column mapping" className="bank-form__columns">
            <Stack gap="sm">
              <TextInput
                label="Date column"
                value={form.col_date}
                onChange={set("col_date")}
                required
              />
              <TextInput
                label="Amount column"
                value={form.col_amount}
                onChange={set("col_amount")}
                required
              />
              <TextInput
                label="Description column"
                value={form.col_description}
                onChange={set("col_description")}
                required
              />
              <TextInput
                label="Transaction ID column (optional)"
                value={form.col_transaction_id}
                onChange={set("col_transaction_id")}
              />
              <TextInput
                label="Memo column (optional)"
                value={form.col_memo}
                onChange={set("col_memo")}
              />
            </Stack>
          </Fieldset>

          <Group justify="flex-end" className="dialog__actions">
            {isEdit && (
              <Button
                variant="outline"
                color="red"
                className="bank-form__delete"
                onClick={() => setConfirmOpen(true)}
              >
                Delete Bank
              </Button>
            )}
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="dialog__confirm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </Group>
        </Stack>
      </form>

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
    </Modal>
  );
}
