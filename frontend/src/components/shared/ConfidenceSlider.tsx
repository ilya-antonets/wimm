import { Group, Slider, Text } from "@mantine/core";
import { useEffect, useState } from "react";

import { usePreferences, useUpdatePreferences } from "../../hooks/usePreferences";

const MARKS = [{ value: 0.3, label: "default" }];

export function ConfidenceSlider(): JSX.Element {
  const { data: prefs } = usePreferences();
  const updatePreferences = useUpdatePreferences();
  const [localVal, setLocalVal] = useState(prefs?.ml_min_confidence ?? 0.3);

  useEffect(() => {
    if (prefs) setLocalVal(prefs.ml_min_confidence);
  }, [prefs]);

  return (
    <div>
      <Group justify="space-between" mb={4}>
        <Text size="sm" c="dimmed">
          ML confidence threshold
        </Text>
        <Text size="sm" fw={500}>
          {localVal.toFixed(2)}
        </Text>
      </Group>
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={localVal}
        onChange={setLocalVal}
        onChangeEnd={(v) => updatePreferences.mutate({ ml_min_confidence: v })}
        marks={MARKS}
        mb="xs"
      />
    </div>
  );
}
