import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/mafia/AppShell";
import { PersonAvatar } from "@/components/mafia/bits";
import { meQuery } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Mafia" },
      { name: "description", content: "Update your Mafia profile." },
      { property: "og:title", content: "Settings — Mafia" },
      { property: "og:description", content: "Update your Mafia profile." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { data: me } = useQuery(meQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  useEffect(() => { if (me) { setName(me.full_name ?? ""); setTitle(me.title ?? ""); } }, [me?.id]);
  return (
    <div className="mx-auto max-w-2xl pb-10">
      <PageHeader title="Settings" subtitle="Your profile is visible to everyone at Inflooo." />
      <form
        className="mx-5 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft md:mx-10"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!me) return;
          const { error } = await supabase.from("profiles").update({ full_name: name.trim(), title: title.trim() || null }).eq("id", me.id);
          if (error) return toast.error(error.message);
          qc.invalidateQueries({ queryKey: ["me"] });
          qc.invalidateQueries({ queryKey: ["team"] });
          toast.success("Profile saved");
        }}
      >
        <div className="flex items-center gap-4">
          <PersonAvatar person={me} size={56} />
          <div className="text-sm text-muted-foreground">{me?.email}</div>
        </div>
        <div><Label htmlFor="n">Full name</Label><Input id="n" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><Label htmlFor="t">Role / title</Label><Input id="t" className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Designer" /></div>
        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }}>Sign out</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </div>
  );
}
