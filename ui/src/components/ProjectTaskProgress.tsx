import type { Issue } from "@paperclipai/shared";

/** A count of accessible tasks, not an estimate of the project's completion. */
export function ProjectTaskProgress({
  issues,
  showAgentCreatedTasks,
}: {
  issues: Issue[];
  showAgentCreatedTasks: boolean;
}) {
  const included = issues.filter((issue) => issue.status !== "cancelled");
  if (included.length === 0) return null;

  const done = included.filter((issue) => issue.status === "done").length;
  const inProgress = included.filter((issue) => issue.status === "in_progress").length;
  const inReview = included.filter((issue) => issue.status === "in_review").length;
  const blocked = included.filter((issue) => issue.status === "blocked").length;
  const waiting = included.length - done - inProgress - inReview - blocked;

  return (
    <section aria-labelledby="project-task-progress-title" className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="project-task-progress-title" className="text-sm font-semibold">Task progress</h3>
        <span className="text-sm font-medium">{done} of {included.length} completed</span>
      </div>
      <progress className="project-task-progress mt-3 h-2 w-full" value={done} max={included.length} aria-label="Completed tasks" />
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <div><dt className="inline">In progress: </dt><dd className="inline font-medium text-foreground">{inProgress}</dd></div>
        <div><dt className="inline">In review: </dt><dd className="inline font-medium text-foreground">{inReview}</dd></div>
        <div><dt className="inline">Blocked: </dt><dd className="inline font-medium text-foreground">{blocked}</dd></div>
        <div><dt className="inline">Waiting: </dt><dd className="inline font-medium text-foreground">{waiting}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Accessible project tasks; cancelled tasks are excluded.{!showAgentCreatedTasks && " Agent-created tasks are hidden."}
      </p>
    </section>
  );
}
