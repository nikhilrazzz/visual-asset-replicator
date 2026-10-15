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
import Cropper, { type Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

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
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const savePhoto = async () => {
    if (!me || !src || !area) return;
    setSaving(true);
    try {
      const url = await cropToDataUrl(src, area);
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", me.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Profile photo updated");
      setSrc(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that image");
    } finally { setSaving(false); }
  };
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
                    if (!file.type.startsWith("image/")) { toast.error("Please pick an image file"); return; }
                    const r = new FileReader();
                    r.onload = () => { setCrop({ x: 0, y: 0 }); setZoom(1); setSrc(r.result as string); };
                    r.readAsDataURL(file);
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
      <Dialog open={!!src} onOpenChange={(o) => !o && setSrc(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Crop your photo</DialogTitle>
          <div className="relative h-80 w-full overflow-hidden rounded-xl bg-muted">
            {src && <Cropper image={src} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
              onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            Zoom <Slider min={1} max={4} step={0.01} value={[zoom]} onValueChange={(v) => setZoom(v[0] ?? 1)} />
          </div>
          <p className="text-xs text-muted-foreground">Drag to move, pinch or use the slider to zoom.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSrc(null)}>Cancel</Button>
            <Button disabled={saving || !area} onClick={savePhoto}>{saving ? "Saving…" : "Save photo"}</Button>
          </div>
        </DialogContent>
      </Dialog>
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

/** Cut the chosen square at up to 640px with high-quality smoothing for a sharp photo. */
async function cropToDataUrl(src: string, a: Area): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const size = Math.min(640, Math.round(a.width));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, a.x, a.y, a.width, a.height, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.92);
}
