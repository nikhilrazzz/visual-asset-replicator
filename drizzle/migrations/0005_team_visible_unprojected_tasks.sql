CREATE OR REPLACE FUNCTION public.can_view_task(_tid uuid, _uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive chain as (
    select id, parent_id, creator_id, assignee_id from public.tasks where id = _tid
    union all
    select t.id, t.parent_id, t.creator_id, t.assignee_id from public.tasks t join chain c on t.id = c.parent_id
  )
  select public.is_org_member(_uid) and (
    exists(select 1 from chain where creator_id = _uid or assignee_id = _uid)
    or exists(select 1 from chain c join public.task_projects tp on tp.task_id = c.id where public.can_view_project(tp.project_id, _uid))
    or not exists(select 1 from chain c join public.task_projects tp on tp.task_id = c.id)
  )
$function$;