import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetRateLimit,
  lockRemainingMs,
  recordFailure,
  recordSuccess,
} from "@/lib/auth/ratelimit";

describe("login rate limiter", () => {
  beforeEach(() => _resetRateLimit());

  it("locks after 5 failures within the window", () => {
    const key = "login:user:1.2.3.4";
    for (let i = 0; i < 4; i++) recordFailure(key);
    expect(lockRemainingMs(key)).toBe(0);
    recordFailure(key); // 5th trips the lock
    expect(lockRemainingMs(key)).toBeGreaterThan(0);
  });

  it("a success clears the counter", () => {
    const key = "login:user:5.6.7.8";
    recordFailure(key);
    recordFailure(key);
    recordSuccess(key);
    expect(lockRemainingMs(key)).toBe(0);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 5; i++) recordFailure("a");
    expect(lockRemainingMs("a")).toBeGreaterThan(0);
    expect(lockRemainingMs("b")).toBe(0);
  });
});
