import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PERMISSION_KEYS } from "@paperclipai/shared";
import { companyRoleDefinitionSchema, type CompanyRoleDefinition } from "@paperclipai/shared/company-roles";
import { companyRolesApi, type CompanyRole } from "../api/companyRoles";
import { accessApi } from "../api/access";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export function CompanyRolesPanel({ companyId, userId }: { companyId: string; userId: string }) {
  const client = useQueryClient();
  const queryKey = ["company-roles", userId, companyId];
  const roles = useQuery({ queryKey, queryFn: () => companyRolesApi.list(companyId), retry: false });
  const access = useQuery({ queryKey: ["company-role-access", userId, companyId], queryFn: accessApi.getCurrentBoardAccess, retry: false });
  const member = access.data?.memberships?.find(m => m.companyId === companyId && m.status === "active");
  const canEdit = member?.membershipRole === "owner" || member?.membershipRole === "admin";
  const [editing, setEditing] = useState<CompanyRole | "new" | null>(null);
  const [draft, setDraft] = useState<CompanyRoleDefinition>({ name: "", description: "", permissions: [] });
  const [memberId, setMemberId] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<CompanyRole | null>(null);
  const [notice, setNotice] = useState("");
  const save = useMutation({
    mutationFn: (definition: CompanyRoleDefinition) => {
      if (!canEdit || !editing) throw new Error("Brak prawa edycji.");
      return editing === "new" ? companyRolesApi.create(companyId, definition) : companyRolesApi.update(companyId, editing.id, { ...definition, version: editing.version });
    },
    onSuccess: role => {
      client.setQueryData<CompanyRole[]>(queryKey, old => [...(old ?? []).filter(r => r.id !== role.id), role]);
      setEditing(null); setNotice("Zapisano rolę."); setError("");
    },
    onError: e => setError(`Nie udało się zapisać roli. ${e.message} W razie konfliktu odśwież listę i ponów edycję.`),
  });
  const apply = useMutation({
    mutationFn: (role: CompanyRole) => {
      if (!canEdit) throw new Error("Brak prawa przypisania.");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId.trim())) throw new Error("Podaj poprawny identyfikator członkostwa (UUID).");
      return companyRolesApi.apply(companyId, memberId.trim(), { roleId: role.id, version: role.version });
    },
    onSuccess: () => { setNotice("Zastosowano rolę do członkostwa."); setError(""); },
    onError: e => setError(`Nie udało się zastosować roli. ${e.message}`),
  });
  const remove = useMutation({
    mutationFn: (role: CompanyRole) => {
      if (!canEdit) throw new Error("Brak prawa usuwania.");
      return companyRolesApi.remove(companyId, role.id, role.version);
    },
    onSuccess: (_result, role) => {
      client.setQueryData<CompanyRole[]>(queryKey, old => (old ?? []).filter(r => r.id !== role.id));
      setDeleting(null); if (editing !== "new" && editing?.id === role.id) setEditing(null);
      setError(""); setNotice("Usunięto rolę.");
    },
    onError: e => setError(`Nie udało się usunąć roli. ${e.message}`),
  });
  const pending = save.isPending || apply.isPending || remove.isPending;
  function edit(role: CompanyRole | "new") {
    setEditing(role); setDraft(role === "new" ? { name: "", description: "", permissions: [] } : { name: role.name, description: role.description, permissions: [...role.permissions] });
    setError(""); setNotice("");
  }
  return <section aria-label="Własne role firmy" className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Własne role firmy</h2>
    <p className="text-sm text-muted-foreground">Zastosowanie roli zastępuje bezpośrednie granty członkostwa. Pusta rola je odbiera. Edycja definicji nie zmienia wcześniejszych przypisań; zastosuj nową wersję świadomie. Właściciele, administratorzy, widzowie i nieaktywne członkostwa są chronione.</p>
    {roles.isPending && <p role="status">Wczytywanie ról…</p>}
    {(roles.error || access.error) && <p role="alert" className="text-sm text-destructive">Nie udało się wczytać ról lub dostępu. {roles.error?.message ?? access.error?.message}</p>}
    {!access.isPending && !canEdit && <p className="text-sm text-muted-foreground">Panel dostępny tylko do odczytu.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {canEdit && <div className="space-y-4">
      <Button disabled={pending} onClick={() => { setError(""); void roles.refetch(); }}>Odśwież listę</Button>
      <label className="block space-y-2">Identyfikator członkostwa
        <Input aria-label="Identyfikator członkostwa" value={memberId} onChange={e => setMemberId(e.target.value)} disabled={pending} aria-describedby="role-member-help" />
      </label>
      <p id="role-member-help" className="text-sm text-muted-foreground">UUID członkostwa użytkownika lub agenta w tej firmie (nie identyfikator agenta ani konta).</p>
      <Button onClick={() => edit("new")} disabled={pending}>Nowa rola</Button>
    </div>}
    {roles.data?.length === 0 && <p>Brak własnych ról.</p>}
    <ul className="space-y-4">{roles.data?.map(role => <li key={role.id} className="space-y-2">
      <h3 className="font-semibold">{role.name} · wersja {role.version}</h3>
      <p>{role.description}</p><p className="text-sm text-muted-foreground">{role.permissions.join(", ") || "Brak bezpośrednich uprawnień"}</p>
      {canEdit && <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={pending} onClick={() => edit(role)}>Edytuj {role.name}</Button>
        <Button variant="outline" disabled={pending} onClick={() => { setDeleting(role); setError(""); }}>Usuń {role.name}</Button>
        <Button variant="outline" disabled={pending || !memberId.trim()} onClick={() => { setError(""); setNotice(""); apply.mutate(role); }}>Zastosuj {role.name}</Button>
      </div>}
    </li>)}</ul>
    {canEdit && deleting && <div className="space-y-2" role="group" aria-label="Potwierdzenie usunięcia">
      <p>Usunąć rolę {deleting.name}? Role z zapisanymi zastosowaniami są chronione.</p>
      <div className="flex items-center justify-between gap-4"><Button disabled={pending} variant="outline" onClick={() => setDeleting(null)}>Anuluj usunięcie</Button><Button disabled={pending} onClick={() => remove.mutate(deleting)}>Potwierdź usunięcie {deleting.name}</Button></div>
    </div>}
    {canEdit && editing && <form noValidate className="space-y-4" onSubmit={e => {
      e.preventDefault(); if (pending) return;
      const parsed = companyRoleDefinitionSchema.safeParse(draft);
      if (!parsed.success) { setError("Podaj nazwę roli (1–100 znaków), opis do 2000 znaków i poprawne uprawnienia."); return; }
      setError(""); save.mutate(parsed.data);
    }}>
      <fieldset disabled={pending} className="space-y-4">
        <legend>{editing === "new" ? "Nowa rola" : `Edycja: ${editing.name}`}</legend>
        <label className="block space-y-2">Nazwa roli<Input autoFocus aria-label="Nazwa roli" maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="block space-y-2">Opis roli<Textarea aria-label="Opis roli" maxLength={2000} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        <fieldset className="space-y-2"><legend>Uprawnienia firmowe</legend>{PERMISSION_KEYS.map(key => <label key={key} className="flex items-center gap-2">
          <input type="checkbox" checked={draft.permissions.includes(key)} onChange={e => setDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, key] : draft.permissions.filter(p => p !== key) })} />{key}
        </label>)}</fieldset>
        <div className="flex items-center justify-between gap-4"><Button type="button" variant="outline" onClick={() => { setEditing(null); setError(""); }}>Anuluj</Button><Button type="submit">Zapisz rolę</Button></div>
      </fieldset>
    </form>}

  </section>;
}
