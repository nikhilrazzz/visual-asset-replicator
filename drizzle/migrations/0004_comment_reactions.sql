CREATE TABLE public.comment_reactions (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.comment_reactions TO authenticated;
GRANT ALL ON public.comment_reactions TO service_role;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view reactions" ON public.comment_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND public.can_view_task(c.task_id, auth.uid())));
CREATE POLICY "add own reaction" ON public.comment_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND char_length(emoji) <= 16 AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND public.can_view_task(c.task_id, auth.uid())));
CREATE POLICY "remove own reaction" ON public.comment_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());