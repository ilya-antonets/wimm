import { Group, Loader, Text } from "@mantine/core";

export function LoadingSpinner({ label = "Loading…" }: { label?: string }): JSX.Element {
  return (
    <Group role="status" aria-live="polite" className="loading-spinner" gap="xs">
      <Loader size="sm" aria-hidden="true" />
      <Text className="loading-spinner__label">{label}</Text>
    </Group>
  );
}
