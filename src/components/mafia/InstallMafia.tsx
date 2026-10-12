import { useState } from "react";
import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstall } from "@/lib/install";
import { cn } from "@/lib/utils";

export function InstallButton({ variant = "sidebar", className }: { variant?: "sidebar" | "icon" | "subtle" | "button"; className?: string }) {
  const inst = useInstall();
  const [open, setOpen] = useState(false);
  if (!inst.ready || inst.installed) return null;

  async function click() {
    if (inst.canPrompt) {
      const r = await inst.prompt();
      if (r === "accepted") toast.success("Mafia is installing");
      return;
    }
    setOpen(true);
  }

  const btn =
    variant === "icon" ? (
      <button aria-label="Install Mafia" onClick={click} className={cn("rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground", className)}>
        <Download className="h-5 w-5" />
      </button>
    ) : variant === "subtle" ? (
      <button onClick={click} className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground", className)}>
        <Download className="h-3.5 w-3.5" /> Install the Mafia app
      </button>
    ) : variant === "button" ? (
      <Button onClick={click} className={className}><Download className="h-4 w-4" /> Install Mafia</Button>
    ) : (
      <button onClick={click} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary-soft", className)}>
        <Download className="h-4 w-4" /> Install Mafia
      </button>
    );

  return (
    <>
      {btn}
      <InstallDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function InstallStatus() {
  const inst = useInstall();
  if (!inst.ready) return null;
  if (inst.installed)
    return <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Mafia is installed on this device.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Install Mafia to open it from your home screen or dock in its own window{inst.platform === "ios" ? " — on iPhone and iPad this is required for push notifications" : ""}.</p>
      <InstallButton variant="button" />
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
      <span className="pt-0.5 text-sm">{children}</span>
    </li>
  );
}

function InstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { platform, inIframe } = useInstall();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const iosSafari = platform === "ios" && !/CriOS|FxiOS|EdgiOS/.test(ua);
  const firefox = /Firefox/.test(ua);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Install Mafia</DialogTitle>
          <DialogDescription>
            {platform === "ios"
              ? "iPhone and iPad install web apps from Safari's Share menu. Installing is also required to get push notifications."
              : "Add Mafia to your device so it opens in its own window."}
          </DialogDescription>
        </DialogHeader>
        {inIframe && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">You're viewing Mafia inside an editor preview. Open mafia.inflooo.com in its own browser tab to install.</p>}
        <ol className="space-y-3">
          {platform === "ios" ? (
            <>
              {!iosSafari && <Step n={0}>Open <b>mafia.inflooo.com</b> in <b>Safari</b> (other browsers on iOS can't install apps on all versions).</Step>}
              <Step n={1}>Open Mafia in Safari.</Step>
              <Step n={2}>Tap the <Share className="inline h-4 w-4" /> <b>Share</b> icon in the toolbar.</Step>
              <Step n={3}>Scroll and select <SquarePlus className="inline h-4 w-4" /> <b>Add to Home Screen</b>.</Step>
              <Step n={4}>Tap <b>Add</b>, then open Mafia from your Home Screen.</Step>
            </>
          ) : platform === "android" ? (
            <>
              <Step n={1}>Open Mafia in <b>Chrome</b>, <b>Edge</b> or <b>Samsung Internet</b>.</Step>
              <Step n={2}>Tap the <b>⋮ menu</b>.</Step>
              <Step n={3}>Choose <b>Install app</b> or <b>Add to Home screen</b>.</Step>
            </>
          ) : platform === "mac-safari" ? (
            <>
              <Step n={1}>In Safari, open the <b>File</b> menu (or the Share button).</Step>
              <Step n={2}>Choose <b>Add to Dock…</b> (macOS Sonoma or later).</Step>
              <Step n={3}>Click <b>Add</b>. Mafia appears in your Dock and Launchpad.</Step>
            </>
          ) : firefox ? (
            <>
              <Step n={1}>Firefox on desktop can't install web apps.</Step>
              <Step n={2}>Open <b>mafia.inflooo.com</b> in <b>Chrome</b> or <b>Edge</b> and click the install icon in the address bar.</Step>
            </>
          ) : (
            <>
              <Step n={1}>Look for the <Download className="inline h-4 w-4" /> <b>install icon</b> at the right of the address bar (Chrome / Edge).</Step>
              <Step n={2}>Or open the browser menu and choose <b>Install Mafia</b> / <b>Apps → Install this site as an app</b>.</Step>
              <Step n={3}>Click <b>Install</b>. Mafia opens in its own window.</Step>
            </>
          )}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
