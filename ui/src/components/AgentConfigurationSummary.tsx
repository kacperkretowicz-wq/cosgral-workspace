import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentConfigurationStats } from '@paperclipai/shared/agent-template';
import { agentsApi } from '@/api/agents';
import { projectsApi } from '@/api/projects';
import { useCompany } from '@/context/CompanyContext';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/queryKeys';
const labels = { available: 'dostępny', working: 'pracuje', waiting: 'oczekuje', offline: 'offline', error: 'błąd' };
export function AgentConfigurationSummaryView({ stats }: { stats?: AgentConfigurationStats }) {
  return <section className="space-y-2" aria-label="Statystyki agenta">
    {stats && <><p>Stan: {labels[stats.state]} · Wykonane zadania (obecnie przypisane): {stats.completedTasks}</p>
      <ul>{stats.recentErrors.map(error => <li key={error.id}>{error.at}: {error.message}</li>)}</ul></>}
    <p className="text-sm text-muted-foreground">MCP, skille, pluginy i integracje: niezweryfikowane dla tego wykonania. Szablon przechowuje tylko deklaracje; nie instaluje narzędzi ani nie nadaje dostępu do repozytorium lub terminala.</p>
  </section>;
}
export function AgentConfigurationSummary({ agentId, companyId, adapterType }: { agentId: string; companyId: string; adapterType: string }) {
  const { companies } = useCompany();
  const client = useQueryClient();
  const [target, setTarget] = useState(companyId), [projectId, setProjectId] = useState('');
  const [json, setJson] = useState(''), [notice, setNotice] = useState(''), [pending, setPending] = useState(false);
  const stats = useQuery({ queryKey: [...queryKeys.agents.detail(agentId), 'config-stats'], queryFn: () => agentsApi.configurationStats(agentId) });
  const projects = useQuery({ queryKey: queryKeys.projects.list(target), queryFn: () => projectsApi.list(target), enabled: Boolean(target) });
  async function action(create: boolean) {
    setPending(true); setNotice('');
    try {
      if (create) {
        await agentsApi.createFromTemplate(target, JSON.parse(json), adapterType, projectId);
        await client.invalidateQueries({ queryKey: queryKeys.agents.list(target) });
        setNotice('Utworzono agenta z ograniczonym dostępem do wybranego projektu. Automatyczne uruchomienia są wyłączone; skonfiguruj runtime i konto przed pracą.');
      } else {
        const contents = JSON.stringify(await agentsApi.configurationTemplate(agentId), null, 2);
        setJson(contents);
        const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'agent-template.json'; link.click(); URL.revokeObjectURL(url);
        setNotice('Szablon pobrany jako plik JSON. Sprawdź własne instrukcje przed udostępnieniem.');
      }
    } catch { setNotice('Operacja niedostępna lub błędny szablon. Sprawdź uprawnienia i konfigurację.'); }
    finally { setPending(false); }
  }
  return <div className="space-y-4">
    <AgentConfigurationSummaryView stats={stats.data} />
    {stats.isError && <p role="alert">Nie udało się pobrać statystyk agenta.</p>}
    <details><summary>Szablon konfiguracji agenta</summary><div className="space-y-2">
      <Button variant="outline" disabled={pending} onClick={() => void action(false)}>Zapisz konfigurację jako szablon JSON</Button>
      <label className="block">Szablon JSON<textarea className="block w-full border rounded-md bg-background p-2" value={json} onChange={e => setJson(e.target.value)} /></label>
      <label className="block">Firma docelowa<select className="block" value={target} onChange={e => { setTarget(e.target.value); setProjectId(''); }}>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="block">Projekt docelowy<select className="block" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">Wybierz projekt</option>{projects.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {projects.isError && <p role="alert">Nie udało się pobrać projektów.</p>}
      <Button disabled={pending || !projectId || !json} onClick={() => void action(true)}>Utwórz agenta z szablonu</Button>
      {notice && <p role="status">{notice}</p>}
    </div></details>
  </div>;
}
