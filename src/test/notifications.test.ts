import { describe, expect, it } from "vitest";
import { detectPlatform } from "@/lib/install";
import { groupNotifications, relTime } from "@/components/mafia/NotificationCenter";

describe("install platform detection", () => {
  it("iPhone is ios", () => expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari")).toBe("ios"));
  it("iPadOS desktop UA with touch is ios", () => expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605", 5)).toBe("ios"));
  it("Android", () => expect(detectPlatform("Mozilla/5.0 (Linux; Android 14) Chrome/120")).toBe("android"));
  it("Mac Safari", () => expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/17 Safari/605", 0)).toBe("mac-safari"));
  it("Windows Chrome is desktop", () => expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe("desktop"));
});

describe("notification relative time", () => {
  const now = new Date("2026-10-12T12:00:00Z").getTime();
  it("just now", () => expect(relTime("2026-10-12T11:59:40Z", now)).toBe("Just now"));
  it("5 min ago", () => expect(relTime("2026-10-12T11:55:00Z", now)).toBe("5 min ago"));
});

describe("grouping", () => {
  const n = (id: string, task: string, type: string) => ({ id, task_id: task, type }) as never;
  it("groups adjacent same task+type, keeps every record", () => {
    const g = groupNotifications([n("1", "a", "comment"), n("2", "a", "comment"), n("3", "b", "comment")]);
    expect(g.map((x) => x.length)).toEqual([2, 1]);
  });
});
