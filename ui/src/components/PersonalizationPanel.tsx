import { usePersonalization } from "../hooks/usePersonalization";
import type { Personalization } from "@paperclipai/shared/personalization";

export function PersonalizationPanel({ userId, companyId }: { userId: string; companyId: string }) {
  const { value, update, error } = usePersonalization(userId, companyId);
  return <section aria-label="Personalizacja" className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Personalizacja</h2>
    <p className="text-sm text-muted-foreground">Wygląd i układ COSGRAL zapisują się automatycznie dla Twojego konta.</p>
    <label className="flex items-center justify-between gap-4">Motyw
      <select aria-label="Motyw" className="rounded-md border bg-background p-2" value={value.theme} onChange={e => update({ theme: e.target.value as Personalization["theme"] })}>
        <option value="system">Systemowy</option><option value="light">Jasny</option><option value="dark">Ciemny</option>
      </select>
    </label>
    <label className="flex items-center justify-between gap-4">Akcent
      <select aria-label="Akcent" className="rounded-md border bg-background p-2" value={value.accent} onChange={e => update({ accent: e.target.value as Personalization["accent"] })}>
        <option value="cosgral">COSGRAL</option><option value="violet">Fiolet</option><option value="ocean">Ocean</option><option value="amber">Bursztyn</option>
      </select>
    </label>
    <p className="text-sm text-muted-foreground">Szerokości paneli rozmowy zmienisz przeciągając ich krawędź albo strzałkami po zaznaczeniu separatora. Widok Chat / Tabela / Workflow i otwarcie panelu bocznego są zapamiętywane.</p>
    {error && <p role="alert" className="text-sm text-destructive">Nie udało się zsynchronizować preferencji. Używana jest kopia lokalna; ponów zmianę, aby zapisać ją na serwerze.</p>}
  </section>;
}
