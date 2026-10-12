DROP POLICY IF EXISTS "view projects" ON public.projects;
CREATE POLICY "view projects" ON public.projects FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.can_view_project(id, auth.uid()));