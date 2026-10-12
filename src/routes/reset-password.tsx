import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Mafia" },
      { name: "description", content: "Choose a new password for your Mafia account." },
      { property: "og:title", content: "Reset password — Mafia" },
      { property: "og:description", content: "Choose a new password for your Mafia account." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.auth.updateUser({ password: pw });
          if (error) { toast.error(error.message); return; }
          toast.success("Password updated");
          navigate({ to: "/home" });
        }}
      >
        <h1 className="text-3xl font-bold">New password</h1>
        <Input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
        <Button className="w-full" type="submit">Save password</Button>
      </form>
    </div>
  );
}
