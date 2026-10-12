# Mafia — Project management app for Inflooo

The brief covers 31 sections. It is built in milestones; each one leaves a working app you can use.

## Milestone 1 (this build)
- Branding: coral `#F05B61`, light grey surfaces, clean Apple-style typography, works on desktop and mobile (sidebar on desktop, bottom bar on phones).
- Sign-in with Google and email, allowed only for `@inflooo.com` and `@makeitviral.ai`. The server checks the domain, not just the browser.
- Team directory filled in automatically when someone signs up. Assignees are always picked from a searchable list, never typed in by hand.
- Home / My Tasks: overdue, today, upcoming, and done tasks.
- Projects: create, edit, archive, members with roles (owner/editor/commenter/viewer), private or team-visible.
- Tasks: title, description, assignee, status, priority, due date, subtasks, a task can belong to more than one project, quick add.
- Views: List, Board (drag and drop), Calendar, Timeline.
- Task detail panel with comments, @mentions, and an activity log.
- Notification centre with unread counts and live updates for assignments, mentions, comments, and due dates.

## Milestone 2
Custom fields, project templates, portfolios, project status updates, search and filters.

## Milestone 3
Workflow automations, request/intake forms (with an optional public link), file attachments, reports, email notifications, an installable phone app, and admin settings.

## Technical details
- Lovable Cloud for the database, sign-in, storage, and live updates. Tables: profiles, user_roles, projects, project_members, sections, tasks, task_projects, subtasks via parent_id, comments, activity, notifications. Later milestones add custom_fields, templates, portfolios, status_updates, automations, forms, and attachments.
- Domain restriction: a signup trigger rejects other domains, and an `is_org_member()` check is added to every access policy. Access to projects goes through `has_project_role()` security-definer functions.
- Notifications are created by database triggers so they can't be skipped. Live updates use realtime subscriptions.
- TanStack routes: /login, /_authenticated/{home, projects, projects/$id, inbox, team, settings}.
- Vitest tests cover the allowed domains, permission rules, and notification triggers.
