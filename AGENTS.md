<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Data access goes through the browser Supabase client + TanStack Query (src/lib/data.ts); RLS security-definer helpers (can_view_project, can_edit_task, …) are the permission boundary.
- Notifications and activity rows are created only by database triggers, so no client path can skip them.
- Allowed work-email domains are enforced by a trigger on auth.users and is_org_member() in RLS; src/lib/domain.ts mirrors the list for UX only.
- Signed-in pages live under src/routes/_authenticated/ whose layout wraps them in AppShell (which also hosts the task detail panel and realtime subscriptions).
