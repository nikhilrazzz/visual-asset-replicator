import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/mafia/AppShell";
import { NotificationList } from "@/components/mafia/NotificationCenter";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox — Mafia" },
      { name: "description", content: "Assignments, mentions and updates from your teammates." },
      { property: "og:title", content: "Inbox — Mafia" },
      { property: "og:description", content: "Assignments, mentions and updates from your teammates." },
    ],
  }),
  component: Inbox,
});

function Inbox() {
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <PageHeader title="Inbox" subtitle="Everything that needs your attention." />
      <div className="px-5 md:px-10"><NotificationList /></div>
    </div>
  );
}
