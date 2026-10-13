import { describe, expect, it } from "vitest";
import { isValidJoinUrl } from "./providers";

describe("isValidJoinUrl — accepts real provider links", () => {
  it.each([
    "https://zoom.us/j/1234567890",
    "https://us02web.zoom.us/j/1234567890",
    "https://eu01web.zoom.us/j/1234567890?pwd=abc",
    "https://ROUTEL.zoom.us/j/1234567890",
  ])("accepts zoom link %s", (url) => {
    expect(isValidJoinUrl("zoom", url)).toBe(true);
  });

  it.each([
    "https://meet.google.com/abc-defg-hij",
    "https://meet.google.com/abc-defg-hij?authuser=0",
  ])("accepts meet link %s", (url) => {
    expect(isValidJoinUrl("google_meet", url)).toBe(true);
  });
});

describe("isValidJoinUrl — rejects off-allowlist and hostile input", () => {
  it("rejects a plain unrelated host", () => {
    expect(isValidJoinUrl("zoom", "https://evil.example/j/1")).toBe(false);
  });

  it("rejects non-https", () => {
    expect(isValidJoinUrl("zoom", "http://zoom.us/j/1234567890")).toBe(false);
    expect(isValidJoinUrl("google_meet", "http://meet.google.com/abc")).toBe(false);
  });

  it("rejects javascript: and data: URLs", () => {
    expect(isValidJoinUrl("zoom", "javascript:alert(1)")).toBe(false);
    expect(isValidJoinUrl("zoom", "data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
  });

  it("rejects credential-prefix spoofing (real host is the attacker's)", () => {
    // Reads as a zoom link to a human; `hostname` is evil.example.
    expect(isValidJoinUrl("zoom", "https://zoom.us@evil.example/j/1")).toBe(false);
    expect(
      isValidJoinUrl("google_meet", "https://meet.google.com@evil.example/abc"),
    ).toBe(false);
  });

  it("rejects lookalike suffix domains", () => {
    expect(isValidJoinUrl("zoom", "https://notzoom.us/j/1")).toBe(false);
    expect(isValidJoinUrl("zoom", "https://zoom.us.evil.example/j/1")).toBe(false);
    expect(isValidJoinUrl("google_meet", "https://meet.google.com.evil.io/a")).toBe(
      false,
    );
  });

  it("rejects a subdomain of meet.google.com's parent", () => {
    expect(isValidJoinUrl("google_meet", "https://mail.google.com/abc")).toBe(false);
  });

  it("does not accept the other provider's host", () => {
    expect(isValidJoinUrl("zoom", "https://meet.google.com/abc-defg-hij")).toBe(
      false,
    );
    expect(isValidJoinUrl("google_meet", "https://zoom.us/j/1234567890")).toBe(
      false,
    );
  });

  it("rejects unparseable input", () => {
    expect(isValidJoinUrl("zoom", "")).toBe(false);
    expect(isValidJoinUrl("zoom", "not a url")).toBe(false);
  });
});
