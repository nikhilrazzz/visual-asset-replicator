import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ id: z.string().uuid() });

// Called by a database trigger after a notification row is inserted.
// The caller only supplies an id; the handler re-reads the row and only delivers
// notifications still marked "pending", so it cannot be used to send arbitrary content.
export const Route = createFileRoute("/api/public/push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("bad request", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendToSubs } = await import("@/lib/push.server");

        // Claim the row atomically (idempotent across retries/duplicates)
        const { data: n } = await supabaseAdmin
          .from("notifications")
          .update({ push_status: "sending", push_attempts: 1 })
          .eq("id", parsed.data.id)
          .eq("push_status", "pending")
          .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .select("id, user_id, type, category, task_id, project_id, message")
          .maybeSingle();
        if (!n) return Response.json({ ok: true, skipped: true });

        const { data: prefs } = await supabaseAdmin.from("notification_preferences").select("*").eq("user_id", n.user_id).maybeSingle();
        const catOn = !prefs || (prefs as Record<string, unknown>)[n.category] !== false;
        if (prefs && (!prefs.push_enabled || !catOn)) {
          await supabaseAdmin.from("notifications").update({ push_status: "disabled" }).eq("id", n.id);
          return Response.json({ ok: true, disabled: true });
        }
        const { data: subs = [] } = await supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", n.user_id);
        if (!subs || subs.length === 0) {
          await supabaseAdmin.from("notifications").update({ push_status: "no_device" }).eq("id", n.id);
          return Response.json({ ok: true, devices: 0 });
        }
        const url = n.task_id ? `/home?task=${n.task_id}` : n.project_id ? `/projects/${n.project_id}` : "/inbox";
        const r = await sendToSubs(subs, { title: "Mafia", body: n.message.slice(0, 180), url, tag: n.task_id ?? n.id });
        if (r.expired.length) await supabaseAdmin.from("push_subscriptions").delete().in("id", r.expired);
        if (r.ok.length) await supabaseAdmin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failure_count: 0 }).in("id", r.ok);
        if (r.errors.length) console.error("push errors", n.id, r.errors);
        await supabaseAdmin
          .from("notifications")
          .update({ push_status: r.ok.length ? "sent" : "failed", push_error: r.errors[0] ?? null })
          .eq("id", n.id);
        return Response.json({ ok: true, sent: r.ok.length, expired: r.expired.length, failed: r.errors.length });
      },
    },
  },
});
