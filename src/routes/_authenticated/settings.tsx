import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, signOutEverywhere } from "@/components/mafia/AppShell";
import { InstallStatus } from "@/components/mafia/InstallMafia";
import { NotificationSettings } from "@/components/mafia/NotificationSettings";
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
          if (error) { toast.error(error.message); return; }
          qc.invalidateQueries({ queryKey: ["me"] });
          qc.invalidateQueries({ queryKey: ["team"] });
          toast.success("Profile saved");
        }}
      >
        <div className="flex items-center gap-4">
          <PersonAvatar person={me} size={64} />
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{me?.email}</div>
            <div className="flex gap-2">
              <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
                {me?.avatar_url ? "Change photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !me) return;
                    try {
                      const url = await toAvatarDataUrl(file);
                      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", me.id);
                      if (error) throw error;
                      qc.invalidateQueries({ queryKey: ["me"] });
                      qc.invalidateQueries({ queryKey: ["team"] });
                      toast.success("Profile photo updated");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Couldn't use that image");
                    }
                  }}
                />
              </label>
              {me?.avatar_url && (
                <Button type="button" variant="ghost" size="sm" onClick={async () => {
                  await supabase.from("profiles").update({ avatar_url: null }).eq("id", me.id);
                  qc.invalidateQueries({ queryKey: ["me"] });
                  qc.invalidateQueries({ queryKey: ["team"] });
                }}>Remove</Button>
              )}
            </div>
          </div>
        </div>
        <div><Label htmlFor="n">Full name</Label><Input id="n" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><Label htmlFor="t">Role / title</Label><Input id="t" className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Designer" /></div>
        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={async () => { await signOutEverywhere(qc); navigate({ to: "/auth", replace: true }); }}>Sign out</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
      <section id="install" className="mx-5 mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft md:mx-10">
        <h2 className="mb-3 text-lg font-semibold">App installation</h2>
        <InstallStatus />
      </section>
      <section id="notifications" className="mx-5 mt-6 rounded-2xl border border-border bg-card p-6 shadow-soft md:mx-10">
        <h2 className="mb-3 text-lg font-semibold">Notifications</h2>
        <NotificationSettings />
      </section>
    </div>
  );
}

/** Crop to a centred square and shrink to 256px JPEG so the photo stays small. */
async function toAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please pick an image file");
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 256, 256);
  return canvas.toDataURL("image/jpeg", 0.85);
}
