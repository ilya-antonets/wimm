import { apiClient } from "./api";

export interface Preferences {
  ml_min_confidence: number;
}

export async function fetchPreferences(): Promise<Preferences> {
  const { data } = await apiClient.get<Preferences>("/preferences");
  return data;
}

export async function savePreferences(prefs: Preferences): Promise<Preferences> {
  const { data } = await apiClient.put<Preferences>("/preferences", prefs);
  return data;
}
