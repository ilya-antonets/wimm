import { Button, Group, Overlay, Paper, Text, Title } from "@mantine/core";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  if (!open) return null;
  return (
    <Overlay
      color="#000"
      backgroundOpacity={0.5}
      zIndex={1000}
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <Paper
        shadow="md"
        p="lg"
        radius="md"
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        maw={420}
        w="90%"
      >
        <Title order={2} size="h4" className="dialog__title">
          {title}
        </Title>
        <Text className="dialog__message" mt="sm">
          {message}
        </Text>
        <Group justify="flex-end" mt="lg" className="dialog__actions">
          <Button variant="default" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button color="red" className="dialog__confirm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Group>
      </Paper>
    </Overlay>
  );
}
