import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Mafia by Inflooo" },
      { name: "description", content: "How Mafia, Inflooo's project management app, collects, uses and protects your data." },
      { property: "og:title", content: "Privacy Policy — Mafia by Inflooo" },
      { property: "og:description", content: "How Mafia collects, uses and protects your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Mafia</Link>
      <h1 className="mt-6 text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: October 13, 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground">
        <p>Mafia is an internal project management app operated by Inflooo. It is available only to people with an @inflooo.com or @makeitviral.ai work account.</p>
        <h2>What we collect</h2>
        <p>Your name, work email and profile photo from sign-in; the projects, tasks, comments and files you create; notification settings; and, if you allow notifications, a device token used to deliver them.</p>
        <h2>How we use it</h2>
        <p>Only to run Mafia: showing your work, notifying you about assignments and updates, and keeping your account secure. We do not sell your data, show ads or track you across other apps or websites.</p>
        <h2>Who can see it</h2>
        <p>Teammates in your organisation can see the projects and tasks shared with them. Private projects are visible only to their members. Data is stored with our hosting provider under strict access controls.</p>
        <h2>Keeping and deleting data</h2>
        <p>Data is kept while your work account is active. To have your account and data deleted, contact your Inflooo administrator or email us below.</p>
        <h2>Contact</h2>
        <p>Questions about privacy: <a className="text-primary" href="mailto:teaminflooo@gmail.com">teaminflooo@gmail.com</a></p>
      </div>
    </main>
  );
}
