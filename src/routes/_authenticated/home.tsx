import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { isBefore, isToday, parseISO, startOfToday, addDays } from "date-fns";
import { CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/mafia/AppShell";
import { QuickAdd, TaskRow } from "@/components/mafia/TaskRow";
import { EmptyState } from "@/components/mafia/bits";
import { meQuery, myTasksQuery, type TaskWithProjects } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "My tasks — Mafia" },
      { name: "description", content: "Everything assigned to you across Inflooo projects." },
      { property: "og:title", content: "My tasks — Mafia" },
      { property: "og:description", content: "Everything assigned to you across Inflooo projects." },
    ],
  }),
  component: HomePage,
});

function group(tasks: TaskWithProjects[]) {
  const today = startOfToday();
  const week = addDays(today, 7);
  const g = { overdue: [] as TaskWithProjects[], today: [] as TaskWithProjects[], week: [] as TaskWithProjects[], later: [] as TaskWithProjects[], done: [] as TaskWithProjects[] };
  for (const t of tasks) {
    if (t.status === "done") { g.done.push(t); continue; }
    if (!t.due_date) { g.later.push(t); continue; }
    const d = parseISO(t.due_date);
    if (isToday(d)) g.today.push(t);
    else if (isBefore(d, today)) g.overdue.push(t);
    else if (isBefore(d, week)) g.week.push(t);
    else g.later.push(t);
  }
  return g;
}

function HomePage() {
  const { data: me } = useQuery(meQuery);
  const { data: tasks = [], isLoading } = useQuery(myTasksQuery);
  const g = group(tasks);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const sections: [string, TaskWithProjects[], string?][] = [
    ["Overdue", g.overdue, "text-destructive"],
    ["Today", g.today, "text-warning"],
    ["Next 7 days", g.week],
    ["Later / no date", g.later],
    ["Recently completed", g.done.slice(0, 10)],
  ];
  return (
    <div className="mx-auto max-w-5xl pb-10">
      <PageHeader title={`${greet}, ${me?.full_name?.split(" ")[0] ?? "there"}`} subtitle={`${tasks.length - g.done.length} open tasks · ${g.overdue.length} overdue · ${g.today.length} due today`} />
      <div className="space-y-6 px-5 md:px-10">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Overdue", g.overdue.length], ["Due today", g.today.length], ["This week", g.week.length], ["Done", g.done.length]].map(([l, n]) => (
            <div key={l} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="text-xs text-muted-foreground">{l}</div>
              <div className="mt-1 font-display text-3xl font-bold">{n}</div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <QuickAdd defaultAssignee={me?.id} placeholder="Add a task for yourself — press Enter" />
        </div>
        {!isLoading && tasks.length === 0 ? (
          <EmptyState icon={<CheckCheck />} title="You're all clear" body="Nothing is assigned to you yet. Add a task above or open a project." />
        ) : (
          sections.filter(([, l]) => l.length).map(([label, list, tone]) => (
            <section key={label}>
              <h2 className={`mb-2 text-sm font-semibold ${tone ?? ""}`}>{label} <span className="font-normal text-muted-foreground">{list.length}</span></h2>
              <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                {list.map((t) => <TaskRow key={t.id} task={t} />)}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
