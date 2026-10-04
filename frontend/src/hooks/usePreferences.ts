import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchPreferences,
  savePreferences,
  type Preferences,
} from "../services/preferencesService";

const QUERY_KEY = ["preferences"] as const;
const DEFAULT_PREFERENCES: Preferences = { ml_min_confidence: 0.3 };

export function usePreferences() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPreferences,
    staleTime: Infinity,
    placeholderData: DEFAULT_PREFERENCES,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: savePreferences,
    onSuccess: (data) => queryClient.setQueryData(QUERY_KEY, data),
  });
}
