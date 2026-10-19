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
  INSERT INTO public.tasks (title, description, priority, assignee_id, assigner_id, creator_id, parent_id, start_date, due_date, due_time, recurrence)
  VALUES (NEW.title, NEW.description, NEW.priority, NEW.assignee_id, NEW.assigner_id, NEW.creator_id, NEW.parent_id,
          CASE WHEN span IS NOT NULL THEN nxt - span END, nxt, NEW.due_time, NEW.recurrence)
  RETURNING id INTO new_id;
  INSERT INTO public.task_projects (task_id, project_id) SELECT new_id, project_id FROM public.task_projects WHERE task_id = NEW.id;
  NEW.recurrence := 'none';
  RETURN NEW;
END $$;