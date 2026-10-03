import { Button, Container, Group, Stack, Text, Title } from "@mantine/core";

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
    <Container size="md" className="page page--settings">
      <Group justify="space-between" className="page__header" mb="md">
        <Title order={1}>Settings</Title>
        <Group className="page__actions" gap="sm">
          <Button onClick={() => openBankConfigModal(null)}>Add Bank</Button>
          <Button variant="default" onClick={() => setImportModalOpen(true)}>
            Import CSV
          </Button>
        </Group>
      </Group>

      <Title order={2} size="h3" mb="sm">
        Banks
      </Title>
      {isLoading ? (
        <LoadingSpinner label="Loading banks…" />
      ) : banks.length === 0 ? (
        <Text>No banks configured yet. Add one to start importing statements.</Text>
      ) : (
        <Stack gap="xs" className="bank-list">
          {banks.map((bank) => (
            <Group key={bank.id} justify="space-between" className="bank-list__item">
              <Text className="bank-list__name">{bank.name}</Text>
              <Button variant="subtle" onClick={() => openBankConfigModal(bank.id)}>
                Edit
              </Button>
            </Group>
          ))}
        </Stack>
      )}

      <BankConfigModal
        bank={editingBank}
        open={bankConfigModalState.open}
        onClose={closeBankConfigModal}
      />
    </Container>
  );
}
