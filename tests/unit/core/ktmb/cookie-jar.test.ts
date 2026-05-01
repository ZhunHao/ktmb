import { describe, expect, it } from "vitest";
import { CookieJar } from "../../../../src/core/ktmb/cookie-jar.js";

describe("CookieJar", () => {
  it("starts empty and produces empty Cookie header", () => {
    const jar = new CookieJar();
    expect(jar.toHeader()).toBe("");
  });

  it("absorbs a single Set-Cookie and emits it", () => {
    const jar = new CookieJar();
    jar.absorb(["__RequestVerificationToken=abc; path=/; HttpOnly"]);
    expect(jar.toHeader()).toBe("__RequestVerificationToken=abc");
  });

  it("absorbs multiple Set-Cookie headers and emits them sorted by name", () => {
    const jar = new CookieJar();
    jar.absorb([
      "X-CSRF=cookie1; path=/",
      "ARRAffinity=cookie2; path=/",
      "session=cookie3; path=/",
    ]);
    expect(jar.toHeader()).toBe(
      "ARRAffinity=cookie2; X-CSRF=cookie1; session=cookie3",
    );
  });

  it("later Set-Cookie with the same name overwrites the value", () => {
    const jar = new CookieJar();
    jar.absorb(["session=v1; path=/"]);
    jar.absorb(["session=v2; path=/"]);
    expect(jar.toHeader()).toBe("session=v2");
  });

  it("ignores Set-Cookie with empty value (server clears)", () => {
    const jar = new CookieJar();
    jar.absorb(["session=v1"]);
    jar.absorb(["session=; path=/; expires=Thu, 01 Jan 1970"]);
    expect(jar.toHeader()).toBe("");
  });

  it("seedFromHeader parses a user-supplied Cookie header", () => {
    const jar = new CookieJar();
    jar.seedFromHeader(".AspNetCore.Identity.Application=foo; X-CSRF=bar");
    expect(jar.toHeader()).toBe(
      ".AspNetCore.Identity.Application=foo; X-CSRF=bar",
    );
  });
});
