import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WORKSPACE_INSTRUCTION_MAX_LENGTH } from "@paperclipai/shared/workspace-instructions";
import { workspaceInstructionsApi } from "../api/workspaceInstructions";
import { projectsApi } from "../api/projects";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

function InstructionEditor({ companyId, userId, scope }: { companyId: string; userId: string; scope: string }) {
  const client = useQueryClient();
  const queryKey = ["workspace-instructions", userId, companyId, scope];
  const query = useQuery({ queryKey, queryFn: () => workspaceInstructionsApi.get(companyId, scope), retry: false });
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => workspaceInstructionsApi.put(companyId, scope, { text: draft ?? query.data?.text ?? "" }),
    onSuccess: value => { client.setQueryData(queryKey, { ...value, canEdit: true }); setDraft(null); setSaved(true); },
  });
  if (query.isPending) return <p role="status">Wczytywanie instrukcji…</p>;
  if (query.error) return <p role="alert" className="text-sm text-destructive">Nie udało się odczytać instrukcji. {query.error.message}</p>;
  return <div className="space-y-4">
    <Textarea aria-label="Treść instrukcji" value={draft ?? query.data?.text ?? ""} maxLength={WORKSPACE_INSTRUCTION_MAX_LENGTH}
      readOnly={!query.data?.canEdit || save.isPending} onChange={e => { setDraft(e.target.value); setSaved(false); }} />
    {!query.data?.canEdit && <p className="text-sm text-muted-foreground">Ten zakres jest dostępny tylko do odczytu.</p>}
    {save.error && <p role="alert" className="text-sm text-destructive">Nie udało się zapisać instrukcji. {save.error.message}</p>}
    {saved && <p role="status" className="text-sm text-muted-foreground">Zapisano. Instrukcje będą użyte przy kolejnym uruchomieniu.</p>}
    <div className="flex items-center justify-end"><Button disabled={!query.data?.canEdit || save.isPending} onClick={() => save.mutate()}>Zapisz instrukcje</Button></div>
  </div>;
}
export function WorkspaceInstructionsPanel({ companyId, userId }: { companyId: string; userId: string }) {
  const [scope, setScope] = useState("me");
  const projects = useQuery({ queryKey: ["instruction-projects", userId, companyId], queryFn: () => projectsApi.list(companyId), retry: false });
  return <section aria-label="Instrukcje pracy" className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Instrukcje pracy</h2>
    <p className="text-sm text-muted-foreground">Firma → projekt → osoba odpowiedzialna. Instrukcje osobiste dotyczą tej firmy i zadań, za które odpowiadasz. Zmiany obowiązują od kolejnego uruchomienia; nie nadają uprawnień. Limit: {WORKSPACE_INSTRUCTION_MAX_LENGTH} znaków. Nie wpisuj sekretów ani danych logowania.</p>
    <label className="flex items-center justify-between gap-4">Zakres instrukcji
      <select aria-label="Zakres instrukcji" className="rounded-md border bg-background p-2" value={scope} onChange={e => setScope(e.target.value)}>
        <option value="me">Moje w tej firmie</option><option value="company">Firma</option>
        {projects.data?.map(project => <option key={project.id} value={`projects/${project.id}`}>Projekt: {project.name}</option>)}
      </select>
    </label>
    {projects.error && <p role="alert" className="text-sm text-destructive">Nie udało się wczytać projektów.</p>}
    <InstructionEditor key={`${userId}:${companyId}:${scope}`} {...{ companyId, userId, scope }} />
  </section>;
}
