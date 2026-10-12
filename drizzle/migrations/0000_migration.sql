
-- ENUMS
create type public.app_role as enum ('admin','member');
create type public.project_role as enum ('owner','editor','commenter','viewer');
create type public.task_status as enum ('todo','in_progress','in_review','blocked','done');
create type public.task_priority as enum ('none','low','medium','high','urgent');

-- DOMAIN HELPER
create or replace function public.is_allowed_email(_email text)
returns boolean language sql immutable set search_path = public as $$
  select lower(split_part(coalesce(_email,''),'@',2)) in ('inflooo.com','makeitviral.ai')
$$;

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  title text,
  last_seen_at timestamptz default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.is_org_member(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = _uid and public.is_allowed_email(p.email))
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "org reads profiles" on public.profiles for select to authenticated using (public.is_org_member(auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- Block non-org signups & create profile
create or replace function public.enforce_email_domain()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_allowed_email(new.email) then
    raise exception 'Mafia is only available to @inflooo.com and @makeitviral.ai work accounts.';
  end if;
  return new;
end $$;
create trigger enforce_email_domain before insert or update of email on auth.users
for each row execute function public.enforce_email_domain();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do update set email = excluded.email;
  insert into public.user_roles (user_id, role) values (new.id, 'member') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- PROJECTS
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null default 'coral',
  visibility text not null default 'team' check (visibility in ('team','private')),
  archived boolean not null default false,
  owner_id uuid not null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null default 'editor',
  added_by uuid,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
grant select, insert, update, delete on public.project_members to authenticated;
grant all on public.project_members to service_role;
alter table public.project_members enable row level security;

create or replace function public.project_role_of(_pid uuid, _uid uuid)
returns public.project_role language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = _pid and user_id = _uid
$$;
create or replace function public.can_view_project(_pid uuid, _uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_member(_uid) and exists(
    select 1 from public.projects p where p.id = _pid and (
      p.visibility = 'team' or p.owner_id = _uid
      or exists(select 1 from public.project_members m where m.project_id = p.id and m.user_id = _uid)))
$$;
create or replace function public.can_edit_project(_pid uuid, _uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_member(_uid) and (
    exists(select 1 from public.projects p where p.id = _pid and p.owner_id = _uid)
    or public.project_role_of(_pid,_uid) in ('owner','editor')
    or exists(select 1 from public.projects p where p.id = _pid and p.visibility='team'
              and not exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=_uid)))
$$;
create or replace function public.can_admin_project(_pid uuid, _uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.projects p where p.id = _pid and p.owner_id = _uid)
    or public.project_role_of(_pid,_uid) = 'owner'
$$;

create policy "view projects" on public.projects for select to authenticated using (public.can_view_project(id, auth.uid()));
create policy "create projects" on public.projects for insert to authenticated with check (public.is_org_member(auth.uid()) and owner_id = auth.uid());
create policy "edit projects" on public.projects for update to authenticated using (public.can_edit_project(id, auth.uid()));
create policy "delete projects" on public.projects for delete to authenticated using (public.can_admin_project(id, auth.uid()));

create policy "view members" on public.project_members for select to authenticated using (public.can_view_project(project_id, auth.uid()));
create policy "add members" on public.project_members for insert to authenticated with check (public.can_admin_project(project_id, auth.uid()));
create policy "update members" on public.project_members for update to authenticated using (public.can_admin_project(project_id, auth.uid()));
create policy "remove members" on public.project_members for delete to authenticated using (public.can_admin_project(project_id, auth.uid()) or user_id = auth.uid());

create or replace function public.add_project_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members(project_id, user_id, role, added_by) values (new.id, new.owner_id, 'owner', new.owner_id)
  on conflict do nothing;
  return new;
end $$;
create trigger add_project_owner after insert on public.projects for each row execute function public.add_project_owner();

-- TASKS
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'none',
  assignee_id uuid references public.profiles(id) on delete set null,
  creator_id uuid not null references public.profiles(id),
  parent_id uuid references public.tasks(id) on delete cascade,
  start_date date,
  due_date date,
  completed_at timestamptz,
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks(assignee_id);
create index on public.tasks(parent_id);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;

create table public.task_projects (
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, project_id)
);
create index on public.task_projects(project_id);
grant select, insert, delete on public.task_projects to authenticated;
grant all on public.task_projects to service_role;
alter table public.task_projects enable row level security;

create or replace function public.can_view_task(_tid uuid, _uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id, creator_id, assignee_id from public.tasks where id = _tid
    union all
    select t.id, t.parent_id, t.creator_id, t.assignee_id from public.tasks t join chain c on t.id = c.parent_id
  )
  select public.is_org_member(_uid) and (
    exists(select 1 from chain where creator_id = _uid or assignee_id = _uid)
    or exists(select 1 from chain c join public.task_projects tp on tp.task_id = c.id where public.can_view_project(tp.project_id, _uid))
  )
$$;
create or replace function public.can_edit_task(_tid uuid, _uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id, creator_id, assignee_id from public.tasks where id = _tid
    union all
    select t.id, t.parent_id, t.creator_id, t.assignee_id from public.tasks t join chain c on t.id = c.parent_id
  )
  select public.is_org_member(_uid) and (
    exists(select 1 from chain where creator_id = _uid or assignee_id = _uid)
    or exists(select 1 from chain c join public.task_projects tp on tp.task_id = c.id where public.can_edit_project(tp.project_id, _uid))
  )
$$;

create policy "view tasks" on public.tasks for select to authenticated using (public.can_view_task(id, auth.uid()));
create policy "create tasks" on public.tasks for insert to authenticated with check (public.is_org_member(auth.uid()) and creator_id = auth.uid());
create policy "edit tasks" on public.tasks for update to authenticated using (public.can_edit_task(id, auth.uid()));
create policy "delete tasks" on public.tasks for delete to authenticated using (creator_id = auth.uid() or public.can_edit_task(id, auth.uid()));

create policy "view task_projects" on public.task_projects for select to authenticated using (public.can_view_project(project_id, auth.uid()));
create policy "link task_projects" on public.task_projects for insert to authenticated with check (public.can_edit_project(project_id, auth.uid()) and public.can_edit_task(task_id, auth.uid()));
create policy "unlink task_projects" on public.task_projects for delete to authenticated using (public.can_edit_project(project_id, auth.uid()));

-- COMMENTS
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index on public.comments(task_id);
grant select, insert, update, delete on public.comments to authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;
create policy "view comments" on public.comments for select to authenticated using (public.can_view_task(task_id, auth.uid()));
create policy "add comments" on public.comments for insert to authenticated with check (author_id = auth.uid() and public.can_view_task(task_id, auth.uid()));
create policy "edit own comments" on public.comments for update to authenticated using (author_id = auth.uid());
create policy "delete own comments" on public.comments for delete to authenticated using (author_id = auth.uid());

-- ACTIVITY
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.activity(task_id);
grant select on public.activity to authenticated;
grant all on public.activity to service_role;
alter table public.activity enable row level security;
create policy "view activity" on public.activity for select to authenticated using (public.can_view_task(task_id, auth.uid()));

-- NOTIFICATIONS
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, created_at desc);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- TRIGGERS: timestamps, completion, activity, notifications
create or replace function public.tasks_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_before_write before insert or update on public.tasks for each row execute function public.tasks_before_write();

create or replace function public.actor_name(_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(full_name, email, 'Someone') from public.profiles where id = _uid
$$;

create or replace function public.tasks_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity(task_id, actor_id, action) values (new.id, actor, 'created');
    if new.assignee_id is not null and new.assignee_id is distinct from actor then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, 'assigned', new.id, coalesce(public.actor_name(actor),'Someone') || ' assigned you "' || new.title || '"');
    end if;
    return new;
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'assignee_changed', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
    if new.assignee_id is not null and new.assignee_id is distinct from actor then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, 'assigned', new.id, coalesce(public.actor_name(actor),'Someone') || ' assigned you "' || new.title || '"');
    end if;
    if old.assignee_id is not null and old.assignee_id is distinct from actor then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (old.assignee_id, actor, 'unassigned', new.id, coalesce(public.actor_name(actor),'Someone') || ' reassigned "' || new.title || '"');
    end if;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
    if new.status = 'done' and new.creator_id is distinct from actor then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.creator_id, actor, 'completed', new.id, coalesce(public.actor_name(actor),'Someone') || ' completed "' || new.title || '"');
    elsif new.assignee_id is not null and new.assignee_id is distinct from actor then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, 'status', new.id, coalesce(public.actor_name(actor),'Someone') || ' moved "' || new.title || '" to ' || replace(new.status::text,'_',' '));
    end if;
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'due_changed', jsonb_build_object('from', old.due_date, 'to', new.due_date));
    if new.assignee_id is not null and new.assignee_id is distinct from actor then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, 'due_changed', new.id, coalesce(public.actor_name(actor),'Someone') || ' changed the due date of "' || new.title || '"');
    end if;
  end if;
  if new.priority is distinct from old.priority then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'priority_changed', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.title is distinct from old.title then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'renamed', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  return new;
end $$;
create trigger tasks_after_write after insert or update on public.tasks for each row execute function public.tasks_after_write();

create or replace function public.comments_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record; mentioned uuid; notified uuid[] := array[new.author_id];
begin
  select * into t from public.tasks where id = new.task_id;
  insert into public.activity(task_id, actor_id, action, details) values (new.task_id, new.author_id, 'commented', jsonb_build_object('comment_id', new.id));
  for mentioned in
    select distinct (m[1])::uuid from regexp_matches(new.body, '@\[[^\]]*\]\(([0-9a-f-]{36})\)', 'g') as m
  loop
    if not mentioned = any(notified) and public.can_view_task(new.task_id, mentioned) then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (mentioned, new.author_id, 'mention', new.task_id, public.actor_name(new.author_id) || ' mentioned you on "' || t.title || '"');
      notified := notified || mentioned;
    end if;
  end loop;
  if t.assignee_id is not null and not t.assignee_id = any(notified) then
    insert into public.notifications(user_id, actor_id, type, task_id, message)
    values (t.assignee_id, new.author_id, 'comment', new.task_id, public.actor_name(new.author_id) || ' commented on "' || t.title || '"');
    notified := notified || t.assignee_id;
  end if;
  if not t.creator_id = any(notified) then
    insert into public.notifications(user_id, actor_id, type, task_id, message)
    values (t.creator_id, new.author_id, 'comment', new.task_id, public.actor_name(new.author_id) || ' commented on "' || t.title || '"');
  end if;
  return new;
end $$;
create trigger comments_after_insert after insert on public.comments for each row execute function public.comments_after_insert();

create or replace function public.members_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.user_id is distinct from auth.uid() then
    select name into pname from public.projects where id = new.project_id;
    insert into public.notifications(user_id, actor_id, type, project_id, message)
    values (new.user_id, auth.uid(), 'project_added', new.project_id, coalesce(public.actor_name(auth.uid()),'Someone') || ' added you to ' || pname);
  end if;
  return new;
end $$;
create trigger members_after_insert after insert on public.project_members for each row execute function public.members_after_insert();

create or replace function public.task_projects_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity(task_id, actor_id, action, details) values (new.task_id, auth.uid(), 'added_to_project', jsonb_build_object('project_id', new.project_id));
  return new;
end $$;
create trigger task_projects_after_insert after insert on public.task_projects for each row execute function public.task_projects_after_insert();

-- REALTIME
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.comments;
