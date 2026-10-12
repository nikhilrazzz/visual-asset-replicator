import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOMAIN_ERROR, isAllowedEmail } from "@/lib/domain";
import { InstallButton } from "@/components/mafia/InstallMafia";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional(), error: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Mafia" },
      { name: "description", content: "Sign in to Mafia with your Inflooo or MakeItViral work account." },
      { property: "og:title", content: "Sign in — Mafia" },
      { property: "og:description", content: "Sign in to Mafia with your Inflooo or MakeItViral work account." },
    ],
  }),
  component: AuthPage,
});

function safePath(p?: string) {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/home";
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(search.error === "domain" ? DOMAIN_ERROR : "");

  useEffect(() => {
    const go = (email?: string | null) => {
      if (!email) return;
      if (!isAllowedEmail(email)) {
        supabase.auth.signOut();
        setError(DOMAIN_ERROR);
        return;
      }
      navigate({ to: safePath(search.redirect), replace: true });
    };
    supabase.auth.getSession().then(({ data }) => go(data.session?.user.email));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => go(s?.user.email));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isAllowedEmail(email)) return setError(DOMAIN_ERROR);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      setError(msg.includes("only available") || msg.includes("Database error") ? DOMAIN_ERROR : msg);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (res.error) {
      const m = res.error.message ?? "";
      setError(m.includes("only available") || m.includes("Database error") ? DOMAIN_ERROR : m || "Google sign-in failed");
    }
  }

  async function forgot() {
    if (!isAllowedEmail(email)) return setError("Enter your work email first.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) toast.error(error.message);
    else toast.success("Check your inbox for a reset link.");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-xl font-bold text-primary-foreground">M</span>
          <span className="font-display text-xl font-bold">Mafia</span>
        </div>
        <div>
          <h1 className="font-display text-6xl font-bold leading-[0.95]">
            Run the work.<br /><span className="text-primary">Together.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg opacity-70">Projects, tasks, deadlines and teammates — all in one place for the Inflooo family.</p>
        </div>
        <p className="text-sm opacity-50">© Inflooo</p>
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary opacity-30 blur-3xl" />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-3xl font-bold">{mode === "signin" ? "Welcome back" : "Join your team"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your @inflooo.com or @makeitviral.ai account.</p>
          {sent ? (
            <div className="mt-8 rounded-2xl border border-border bg-card p-5 text-sm">
              <p className="font-semibold">Check your email</p>
              <p className="mt-1 text-muted-foreground">We sent a confirmation link to {email}. Click it to finish joining Mafia.</p>
            </div>
          ) : (
            <>
              <Button variant="outline" className="mt-8 w-full" onClick={google}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.25 1.5-1.6 4.4-5.35 4.4a5.9 5.9 0 0 1 0-11.8c1.85 0 3.1.8 3.8 1.45l2.6-2.5C16.75 3.95 14.6 3 12 3a9 9 0 1 0 0 18c5.2 0 8.65-3.65 8.65-8.8 0-.6-.05-1.05-.15-1.5Z" /></svg>
                Continue with Google
              </Button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
              <form onSubmit={submit} className="space-y-3">
                {mode === "signup" && (
                  <div><Label htmlFor="name">Full name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" /></div>
                )}
                <div><Label htmlFor="email">Work email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1" placeholder="you@inflooo.com" /></div>
                <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1" /></div>
                {error && <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</Button>
              </form>
              <div className="mt-4 flex justify-between text-sm">
                <button className="text-muted-foreground hover:text-foreground" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
                  {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
                </button>
                {mode === "signin" && <button className="text-muted-foreground hover:text-foreground" onClick={forgot}>Forgot?</button>}
              </div>
              <div className="mt-10 text-center"><InstallButton variant="subtle" /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
