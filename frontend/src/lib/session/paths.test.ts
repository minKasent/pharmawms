import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOME_PATH, isSessionExpiredRedirect, safeReturnPath, sessionExpiredPath } from "./paths.ts";

describe("safeReturnPath", () => {
  it("accepts normal same-origin absolute paths", () => {
    assert.equal(safeReturnPath("/batches"), "/batches");
    assert.equal(safeReturnPath("/batches?status=EXPIRED&expiringWithinDays=30"), "/batches?status=EXPIRED&expiringWithinDays=30");
    assert.equal(safeReturnPath("/products/42#forecast"), "/products/42#forecast");
  });

  it("rejects null, undefined, and empty strings", () => {
    assert.equal(safeReturnPath(null), HOME_PATH);
    assert.equal(safeReturnPath(undefined), HOME_PATH);
    assert.equal(safeReturnPath(""), HOME_PATH);
    assert.equal(safeReturnPath("   "), HOME_PATH);
  });

  it("rejects protocol-relative and external URLs", () => {
    assert.equal(safeReturnPath("//evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("///evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/\\evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("https://evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("http://evil.com/login"), HOME_PATH);
    assert.equal(safeReturnPath("javascript:alert(1)"), HOME_PATH);
  });

  it("rejects control character and percent-encoded open redirect bypasses", () => {
    assert.equal(safeReturnPath("/\t/evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/%09/evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/\r\n/evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/%0d%0a/evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/\u0000/evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/\u007f/evil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/%5cevil.com"), HOME_PATH);
    assert.equal(safeReturnPath("/%2fevil.com"), HOME_PATH);
  });
});

describe("sessionExpiredPath", () => {
  it("builds login path with expired reason and optional return path", () => {
    assert.equal(sessionExpiredPath(), "/login?reason=expired");
    assert.equal(sessionExpiredPath("/"), "/login?reason=expired");
    assert.equal(sessionExpiredPath("/stock"), "/login?reason=expired&next=%2Fstock");
    assert.equal(isSessionExpiredRedirect(new URL("http://localhost/login?reason=expired")), true);
    assert.equal(isSessionExpiredRedirect(new URL("http://localhost/login")), false);
  });
});
