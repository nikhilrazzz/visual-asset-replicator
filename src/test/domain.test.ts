import { describe, expect, it } from "vitest";
import { extractMentionIds, isAllowedEmail } from "@/lib/domain";

describe("work email domains", () => {
  it("allows @inflooo.com", () => expect(isAllowedEmail("nikhil@inflooo.com")).toBe(true));
  it("allows @makeitviral.ai case-insensitively", () =>
    expect(isAllowedEmail("Jane@MakeItViral.AI")).toBe(true));
  it("rejects gmail", () => expect(isAllowedEmail("someone@gmail.com")).toBe(false));
  it("rejects look-alike subdomains", () =>
    expect(isAllowedEmail("x@evil.inflooo.com.attacker.io")).toBe(false));
});

describe("mentions", () => {
  it("extracts mentioned user ids", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(extractMentionIds(`hi @[Ana](${id}) and @[Ana](${id})`)).toEqual([id]);
  });
});
