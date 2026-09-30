import { useBanks } from "../hooks/useBanks";
import { BankConfigModal } from "../components/banks/BankConfigModal";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { useAppStore } from "../store/useAppStore";

export function SettingsPage(): JSX.Element {
  const { banks, isLoading } = useBanks();
  const bankConfigModalState = useAppStore((s) => s.bankConfigModalState);
  const openBankConfigModal = useAppStore((s) => s.openBankConfigModal);
  const closeBankConfigModal = useAppStore((s) => s.closeBankConfigModal);
  const setImportModalOpen = useAppStore((s) => s.setImportModalOpen);

  const editingBank =
    bankConfigModalState.bankId != null
      ? (banks.find((b) => b.id === bankConfigModalState.bankId) ?? null)
      : null;

  return (
    <section className="page page--settings">
      <header className="page__header">
        <h1>Settings</h1>
        <div className="page__actions">
          <button type="button" onClick={() => openBankConfigModal(null)}>
            Add Bank
          </button>
          <button type="button" onClick={() => setImportModalOpen(true)}>
            Import CSV
          </button>
        </div>
      </header>

      <h2>Banks</h2>
      {isLoading ? (
        <LoadingSpinner label="Loading banks…" />
      ) : banks.length === 0 ? (
        <p>No banks configured yet. Add one to start importing statements.</p>
      ) : (
        <ul className="bank-list">
          {banks.map((bank) => (
            <li key={bank.id} className="bank-list__item">
              <span className="bank-list__name">{bank.name}</span>
              <button type="button" onClick={() => openBankConfigModal(bank.id)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      <BankConfigModal
        bank={editingBank}
        open={bankConfigModalState.open}
        onClose={closeBankConfigModal}
      />
    </section>
  );
}
