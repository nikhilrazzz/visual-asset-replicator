CREATE POLICY "avatar upload own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatar delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

ALTER TABLE public.tasks ADD COLUMN recurrence text NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none','daily','weekdays','weekly','monthly','yearly'));

CREATE OR REPLACE FUNCTION public.tasks_repeat_on_done() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base date; nxt date; new_id uuid; span int;
BEGIN
  IF NEW.recurrence = 'none' OR NEW.status <> 'done' OR OLD.status = 'done' THEN RETURN NEW; END IF;
  base := COALESCE(NEW.due_date, current_date);
  nxt := CASE NEW.recurrence
    WHEN 'daily' THEN base + 1
    WHEN 'weekdays' THEN base + CASE EXTRACT(dow FROM base)::int WHEN 5 THEN 3 WHEN 6 THEN 2 ELSE 1 END
    WHEN 'weekly' THEN base + 7
    WHEN 'monthly' THEN (base + interval '1 month')::date
    ELSE (base + interval '1 year')::date END;
  span := CASE WHEN NEW.start_date IS NOT NULL AND NEW.due_date IS NOT NULL THEN NEW.due_date - NEW.start_date END;
  INSERT INTO public.tasks (title, description, priority, assignee_id, assigner_id, creator_id, parent_id, start_date, due_date, recurrence)
  VALUES (NEW.title, NEW.description, NEW.priority, NEW.assignee_id, NEW.assigner_id, NEW.creator_id, NEW.parent_id,
          CASE WHEN span IS NOT NULL THEN nxt - span END, nxt, NEW.recurrence)
  RETURNING id INTO new_id;
  INSERT INTO public.task_projects (task_id, project_id) SELECT new_id, project_id FROM public.task_projects WHERE task_id = NEW.id;
  NEW.recurrence := 'none';
  RETURN NEW;
END $$;

CREATE TRIGGER tasks_repeat_on_done BEFORE UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_repeat_on_done();