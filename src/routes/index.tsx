import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mafia — Work management for Inflooo" },
      { name: "description", content: "Mafia is Inflooo's home for projects, tasks, and team collaboration." },
      { property: "og:title", content: "Mafia — Work management for Inflooo" },
      { property: "og:description", content: "Mafia is Inflooo's home for projects, tasks, and team collaboration." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/home" : "/auth", replace: true });
  },
});
