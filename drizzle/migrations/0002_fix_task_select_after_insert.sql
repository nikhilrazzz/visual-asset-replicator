DROP POLICY IF EXISTS "view tasks" ON public.tasks;
CREATE POLICY "view tasks" ON public.tasks FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid()) AND (creator_id = auth.uid() OR assignee_id = auth.uid() OR public.can_view_task(id, auth.uid())));