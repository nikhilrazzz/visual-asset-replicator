import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const { getVapid } = await import("./push.server");
  const v = await getVapid();
  return { publicKey: v.publicKey as string };
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      endpoint: z.string().url().max(2000).startsWith("https://"),
      p256dh: z.string().min(10).max(200),
      auth: z.string().min(4).max(100),
      userAgent: z.string().max(400).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    // Endpoint may previously belong to another account on a shared device: remove it first.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", data.endpoint).neq("user_id", context.userId);
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      { user_id: context.userId, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth, user_agent: data.userAgent ?? null },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ endpoint: z.string().max(2000) }))
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: subs } = await context.supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", context.userId);
    if (!subs?.length) return { sent: 0, failed: 0, errors: ["No devices are subscribed yet."] };
    const { sendToSubs } = await import("./push.server");
    const r = await sendToSubs(subs, { title: "Mafia", body: "Test notification — push is working on this device.", url: "/settings", tag: "test" });
    if (r.expired.length) await context.supabase.from("push_subscriptions").delete().in("id", r.expired);
    return { sent: r.ok.length, failed: r.errors.length + r.expired.length, errors: r.errors };
  });
