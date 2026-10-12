create extension if not exists pg_net with schema extensions;

-- Track who assigned the task (separate from creator)
alter table public.tasks add column if not exists assigner_id uuid references public.profiles(id) on delete set null;
update public.tasks set assigner_id = creator_id where assignee_id is not null and assigner_id is null;

create or replace function public.tasks_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  if tg_op = 'INSERT' then
    if new.assignee_id is not null then new.assigner_id := coalesce(auth.uid(), new.creator_id); else new.assigner_id := null; end if;
  elsif new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is not null then new.assigner_id := coalesce(auth.uid(), new.creator_id); else new.assigner_id := null; end if;
  else
    new.assigner_id := old.assigner_id;
  end if;
  return new;
end $$;

-- Notification extra fields
alter table public.notifications add column if not exists category text not null default 'general';
alter table public.notifications add column if not exists dismissed_at timestamptz;
alter table public.notifications add column if not exists push_status text not null default 'pending';
alter table public.notifications add column if not exists push_attempts int not null default 0;
alter table public.notifications add column if not exists push_error text;

-- Hide notifications for items the user can no longer access
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated using (
  user_id = auth.uid()
  and (task_id is null or public.can_view_task(task_id, auth.uid()))
  and (project_id is null or public.can_view_project(project_id, auth.uid()))
);

create or replace function public.notifications_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id = new.actor_id then return null; end if;
  -- de-duplicate same event for same recipient within 10 seconds
  if exists (select 1 from public.notifications n where n.user_id = new.user_id and n.type = new.type
      and n.task_id is not distinct from new.task_id and n.project_id is not distinct from new.project_id
      and n.actor_id is not distinct from new.actor_id and n.created_at > now() - interval '10 seconds') then
    return null;
  end if;
  new.category := case
    when new.type in ('assigned','unassigned','reassigned') then 'assignments'
    when new.type in ('comment','mention') then 'comments'
    when new.type in ('status','completed','reopened','blocked') then 'status'
    when new.type in ('due_changed','priority_changed') then 'deadlines'
    when new.type in ('review_requested','approved','changes_requested') then 'reviews'
    when new.type in ('project_added') then 'projects'
    else 'general' end;
  return new;
end $$;
drop trigger if exists notifications_before_insert on public.notifications;
create trigger notifications_before_insert before insert on public.notifications for each row execute function public.notifications_before_insert();

-- Dispatch push via the app's backend route
create or replace function public.notifications_dispatch_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://project--fecce66e-08b4-409a-975c-0dbae665c2cc.lovable.app/api/public/push-dispatch',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists notifications_dispatch_push on public.notifications;
create trigger notifications_dispatch_push after insert on public.notifications for each row execute function public.notifications_dispatch_push();

-- Two-way assigner/assignee events
create or replace function public.tasks_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); an text; boss uuid;
begin
  an := coalesce(public.actor_name(actor), 'Someone');
  if tg_op = 'INSERT' then
    insert into public.activity(task_id, actor_id, action) values (new.id, actor, 'created');
    if new.assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, 'assigned', new.id, an || ' assigned you a new task: ' || new.title);
    end if;
    return new;
  end if;
  boss := coalesce(new.assigner_id, new.creator_id);
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'assignee_changed', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
    if new.assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, case when old.assignee_id is null then 'assigned' else 'reassigned' end, new.id,
        an || case when old.assignee_id is null then ' assigned you a new task: ' || new.title else ' reassigned "' || new.title || '" to you' end);
    end if;
    if old.assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (old.assignee_id, actor, 'unassigned', new.id, an || ' removed you from "' || new.title || '"');
    end if;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
    if actor is not distinct from new.assignee_id then
      -- assignee -> assigner
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (boss, actor,
        case new.status when 'done' then 'completed' when 'in_review' then 'review_requested' when 'blocked' then 'blocked' else 'status' end,
        new.id,
        case new.status
          when 'done' then 'Your assignee ' || an || ' marked "' || new.title || '" as completed'
          when 'in_review' then an || ' requested your review on "' || new.title || '"'
          when 'blocked' then an || ' reported a blocker on "' || new.title || '"'
          else an || ' moved "' || new.title || '" to ' || replace(new.status::text,'_',' ') end);
    else
      if new.assignee_id is not null then
        insert into public.notifications(user_id, actor_id, type, task_id, message)
        values (new.assignee_id, actor,
          case when old.status = 'done' then 'reopened' when old.status = 'in_review' and new.status = 'done' then 'approved'
               when old.status = 'in_review' then 'changes_requested' when new.status = 'done' then 'completed' else 'status' end,
          new.id,
          case when old.status = 'done' then an || ' reopened "' || new.title || '"'
               when old.status = 'in_review' and new.status = 'done' then 'Your task "' || new.title || '" was approved'
               when old.status = 'in_review' then an || ' requested changes to "' || new.title || '"'
               else an || ' moved "' || new.title || '" to ' || replace(new.status::text,'_',' ') end);
      end if;
      if boss is distinct from new.assignee_id and new.status in ('done','blocked') then
        insert into public.notifications(user_id, actor_id, type, task_id, message)
        values (boss, actor, case when new.status = 'done' then 'completed' else 'blocked' end, new.id,
          an || case when new.status = 'done' then ' completed "' else ' marked as blocked "' end || new.title || '"');
      end if;
    end if;
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'due_changed', jsonb_build_object('from', old.due_date, 'to', new.due_date));
    if new.assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, 'due_changed', new.id, 'A deadline changed for "' || new.title || '"');
    end if;
  end if;
  if new.priority is distinct from old.priority then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'priority_changed', jsonb_build_object('from', old.priority, 'to', new.priority));
    if new.assignee_id is not null then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (new.assignee_id, actor, 'priority_changed', new.id, an || ' changed the priority of "' || new.title || '" to ' || new.priority::text);
    end if;
  end if;
  if new.title is distinct from old.title then
    insert into public.activity(task_id, actor_id, action, details) values (new.id, actor, 'renamed', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.description is distinct from old.description and new.assignee_id is not null then
    insert into public.notifications(user_id, actor_id, type, task_id, message)
    values (new.assignee_id, actor, 'status', new.id, an || ' updated the instructions for "' || new.title || '"');
  end if;
  return new;
end $$;

create or replace function public.comments_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record; mentioned uuid; notified uuid[] := array[new.author_id]; an text; r uuid;
begin
  select * into t from public.tasks where id = new.task_id;
  an := public.actor_name(new.author_id);
  insert into public.activity(task_id, actor_id, action, details) values (new.task_id, new.author_id, 'commented', jsonb_build_object('comment_id', new.id));
  for mentioned in
    select distinct (m[1])::uuid from regexp_matches(new.body, '@\[[^\]]*\]\(([0-9a-f-]{36})\)', 'g') as m
  loop
    if not mentioned = any(notified) and public.can_view_task(new.task_id, mentioned) then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (mentioned, new.author_id, 'mention', new.task_id, 'You were mentioned by ' || an || ' in "' || t.title || '"');
      notified := notified || mentioned;
    end if;
  end loop;
  foreach r in array array[t.assignee_id, t.assigner_id, t.creator_id] loop
    if r is not null and not r = any(notified) then
      insert into public.notifications(user_id, actor_id, type, task_id, message)
      values (r, new.author_id, 'comment', new.task_id, an || ' commented on "' || t.title || '": ' || left(regexp_replace(new.body, '@\[([^\]]*)\]\([0-9a-f-]{36}\)', '@\1', 'g'), 80));
      notified := notified || r;
    end if;
  end loop;
  return new;
end $$;

-- Push subscriptions (one per device)
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count int not null default 0
);
create index on public.push_subscriptions(user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;
create policy "own subs select" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own subs insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own subs update" on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own subs delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Preferences
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  email_enabled boolean not null default false,
  assignments boolean not null default true,
  comments boolean not null default true,
  status boolean not null default true,
  deadlines boolean not null default true,
  reviews boolean not null default true,
  projects boolean not null default true,
  sound boolean not null default false,
  quiet_start smallint,
  quiet_end smallint,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
alter table public.notification_preferences enable row level security;
create policy "own prefs select" on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy "own prefs insert" on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());
create policy "own prefs update" on public.notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());