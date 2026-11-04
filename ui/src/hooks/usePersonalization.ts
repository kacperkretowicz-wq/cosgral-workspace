import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultPersonalization, personalizationSchema, type Personalization } from "@paperclipai/shared/personalization";
import { workspacePreferencesApi } from "../api/workspacePreferences";
import { useTheme } from "../context/ThemeContext";

function localPreference(userId: string): Personalization {
  try { return personalizationSchema.parse(JSON.parse(localStorage.getItem(`cosgral.personalization:${userId}`) ?? "{}")); }
  catch { return defaultPersonalization(); }
}
export function usePersonalization(userId: string, companyId: string) {
  const client = useQueryClient();
  const key = ["personalization", userId];
  const { setTheme } = useTheme();
  const query = useQuery({ queryKey: key, queryFn: () => workspacePreferencesApi.getPersonalization(), retry: false });
  const value = query.data ?? localPreference(userId);
  useEffect(() => {
    if (!query.data) return;
    try { localStorage.setItem(`cosgral.personalization:${userId}`, JSON.stringify(query.data)); } catch { /* Restricted storage. */ }
  }, [query.data, userId]);
  useEffect(() => {
    setTheme(value.theme);
    document.documentElement.dataset.cosgralAccent = value.accent;
  }, [value.theme, value.accent, setTheme]);
  const mutation = useMutation({
    scope: { id: `personalization:${userId}` },
    mutationFn: (next: Personalization) => workspacePreferencesApi.updatePersonalization(companyId, next),

  });
  const update = (patch: Partial<Personalization>) => {
    void client.cancelQueries({ queryKey: key });
    const current = client.getQueryData<Personalization>(key) ?? value;
    const next = personalizationSchema.parse({ ...current, ...patch });
    // The account is captured by this hook; late responses only update its cache.
    client.setQueryData(key, next);
    try { localStorage.setItem(`cosgral.personalization:${userId}`, JSON.stringify(next)); } catch { /* Storage may be restricted. */ }
    mutation.mutate(next);
  };
  return { value, update, error: mutation.error ?? query.error, loaded: query.isFetched };
}
