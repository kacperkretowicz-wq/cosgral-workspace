import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import { projectsApi } from "@/api/projects";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function AddProjectRepositoryUrl({ project }: { project: Project }) {
  const client = useQueryClient();
  const id = useId();
  const [url, setUrl] = useState("");
  const add = useMutation({
    mutationFn: () => projectsApi.createWorkspace(project.id, {
      repoUrl: url.trim(), sourceType: "git_repo",
    }, project.companyId),
    onSuccess: () => {
      setUrl("");
      for (const ref of new Set([project.id, project.urlKey])) {
        void client.invalidateQueries({ queryKey: queryKeys.projects.detail(ref) });
      }
      void client.invalidateQueries({ queryKey: queryKeys.projects.all(project.companyId) });
    },
  });
  return <form className="flex flex-col gap-2" onSubmit={(event) => {
    event.preventDefault();
    if (url.trim() && !add.isPending) add.mutate();
  }}>
    <label htmlFor={id} className="text-sm font-medium">Add a repository by URL</label>
    <Input id={id} type="url" required value={url} disabled={add.isPending}
      aria-describedby={`${id}-help`} placeholder="https://github.com/owner/repository"
      onChange={(event) => { setUrl(event.target.value); add.reset(); }} />
    <p id={`${id}-help`} className="text-xs text-muted-foreground">Private repositories require an authorized connection before agents can access them.</p>
    {add.isError && <p role="alert" className="text-sm text-destructive">{add.error.message}</p>}
    {add.isSuccess && <p role="status" className="text-sm text-muted-foreground">Repository added</p>}
    <div className="flex justify-end">
      <Button type="submit" disabled={!url.trim() || add.isPending}>{add.isPending ? "Adding…" : "Add repository"}</Button>
    </div>
  </form>;
}
