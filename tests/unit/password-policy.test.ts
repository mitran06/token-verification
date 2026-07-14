import { describe, expect, it } from "vitest";
import { assertNonEmptyPassword, assertStrongAdminPassword } from "@/lib/auth/password";

describe("admin password policy", () => {
  it("rejects too-short passwords", () => {
    expect(() => assertStrongAdminPassword("Ab1cdef")).toThrow(); // < 12
  });
  it("rejects missing character classes", () => {
    expect(() => assertStrongAdminPassword("alllowercase12")).toThrow(); // no uppercase
    expect(() => assertStrongAdminPassword("ALLUPPERCASE12")).toThrow(); // no lowercase
    expect(() => assertStrongAdminPassword("NoDigitsHereAA")).toThrow(); // no number
  });
  it("accepts a strong password", () => {
    expect(assertStrongAdminPassword("Str0ngAdminPass")).toBe("Str0ngAdminPass");
  });
});

describe("simple password guard", () => {
  it("requires non-empty", () => {
    expect(() => assertNonEmptyPassword("")).toThrow();
  });
  it("allows a simple non-empty value (counter/reception)", () => {
    expect(assertNonEmptyPassword("1")).toBe("1");
  });
});
