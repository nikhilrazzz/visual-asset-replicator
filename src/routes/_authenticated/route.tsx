import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAllowedEmail } from "@/lib/domain";
import { AppShell } from "@/components/mafia/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.pathname } });
    if (!isAllowedEmail(data.user.email)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { error: "domain" } });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
