import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type ProjectRole = Database["public"]["Enums"]["project_role"];
export type TaskWithProjects = Task & { task_projects: { project_id: string }[] };

export const STATUSES: { value: TaskStatus; label: string; tone: string }[] = [
  { value: "todo", label: "To do", tone: "bg-muted text-muted-foreground" },
  { value: "in_progress", label: "In progress", tone: "bg-info-soft text-info" },
  { value: "in_review", label: "In review", tone: "bg-warning-soft text-warning" },
  { value: "blocked", label: "Blocked", tone: "bg-primary-soft text-destructive" },
  { value: "done", label: "Done", tone: "bg-success-soft text-success" },
];
export const PRIORITIES: { value: TaskPriority; label: string; tone: string }[] = [
  { value: "none", label: "No priority", tone: "text-muted-foreground" },
  { value: "low", label: "Low", tone: "text-info" },
  { value: "medium", label: "Medium", tone: "text-warning" },
  { value: "high", label: "High", tone: "text-primary" },
  { value: "urgent", label: "Urgent", tone: "text-destructive" },
];
export const PROJECT_COLORS: Record<string, string> = {
  coral: "bg-primary",
  green: "bg-success",
  blue: "bg-info",
  amber: "bg-warning",
  ink: "bg-foreground",
};

const TASK_SELECT = "*, task_projects(project_id)";

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const id = await currentUserId();
    if (!id) return null;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const teamQuery = queryOptions({
  queryKey: ["team"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    if (error) throw error;
    return data;
  },
  staleTime: 60_000,
});

export const projectsQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*, project_members(user_id, role), task_projects(task_id, tasks(status))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const projectQuery = (id: string) =>
  queryOptions({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, project_members(user_id, role)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const projectTasksQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["tasks", "project", projectId],
    queryFn: async () => {
      const { data: links, error: e1 } = await supabase
        .from("task_projects")
        .select("task_id")
        .eq("project_id", projectId);
      if (e1) throw e1;
      const ids = links.map((l) => l.task_id);
      if (!ids.length) return [] as TaskWithProjects[];
      const { data, error } = await supabase
        .from("tasks")
        .select(TASK_SELECT)
        .in("id", ids)
        .is("parent_id", null)
        .order("position");
      if (error) throw error;
      return data as TaskWithProjects[];
    },
  });

export const myTasksQuery = queryOptions({
  queryKey: ["tasks", "mine"],
  queryFn: async () => {
    const id = await currentUserId();
    if (!id) return [] as TaskWithProjects[];
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("assignee_id", id)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data as TaskWithProjects[];
  },
});

export const assignedByMeQuery = queryOptions({
  queryKey: ["tasks", "assigned-by-me"],
  queryFn: async () => {
    const id = await currentUserId();
    if (!id) return [] as TaskWithProjects[];
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("creator_id", id)
      .not("assignee_id", "is", null)
      .neq("assignee_id", id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as TaskWithProjects[];
  },
});

export const taskQuery = (id: string) =>
  queryOptions({
    queryKey: ["task", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).maybeSingle();
      if (error) throw error;
      return data as TaskWithProjects | null;
    },
  });

export const subtasksQuery = (id: string) =>
  queryOptions({
    queryKey: ["subtasks", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("parent_id", id).order("created_at");
      if (error) throw error;
      return data;
    },
  });

export const commentsQuery = (taskId: string) =>
  queryOptions({
    queryKey: ["comments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase.from("comments").select("*").eq("task_id", taskId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

export const activityQuery = (taskId: string) =>
  queryOptions({
    queryKey: ["activity", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },
});

function fail(e: unknown) {
  toast.error(e instanceof Error ? e.message : "Something went wrong");
}

export function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["task"] });
    qc.invalidateQueries({ queryKey: ["subtasks"] });
    qc.invalidateQueries({ queryKey: ["activity"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      projectId?: string | null | undefined;
      assignee_id?: string | null | undefined;
      due_date?: string | null | undefined;
      status?: TaskStatus | undefined;
      priority?: TaskPriority | undefined;
      parent_id?: string | null | undefined;
    }) => {
      const uid = await currentUserId();
      if (!uid) throw new Error("Please sign in again");
      const { projectId, ...rest } = input;
      const row = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as typeof rest;
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...(row as unknown as Record<string, never>), title: rest.title.trim(), creator_id: uid })
        .select()
        .single();
      if (error) throw error;
      if (projectId) {
        const { error: e2 } = await supabase.from("task_projects").insert({ task_id: data.id, project_id: projectId });
        if (e2) throw e2;
      }
      return data;
    },
    onSuccess: invalidate,
    onError: fail,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Task> & { id: string }) => {
      const { error } = await supabase.from("tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Task deleted");
    },
    onError: fail,
  });
}

export function useLinkProject() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ taskId, projectId, remove }: { taskId: string; projectId: string; remove?: boolean }) => {
      const q = remove
        ? supabase.from("task_projects").delete().eq("task_id", taskId).eq("project_id", projectId)
        : supabase.from("task_projects").insert({ task_id: taskId, project_id: projectId });
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: fail,
  });
}

export function personName(p?: Pick<Profile, "full_name" | "email"> | null) {
  return p?.full_name || p?.email || "Unknown";
}

export function initials(p?: Pick<Profile, "full_name" | "email"> | null) {
  const n = personName(p);
  return n
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}
