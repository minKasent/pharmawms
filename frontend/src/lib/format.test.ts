import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatShortDate,
} from "./format.ts";

describe("format utilities", () => {
  it("returns placeholder for null or undefined values", () => {
    assert.equal(formatInteger(null), "—");
    assert.equal(formatDecimal(undefined), "—");
    assert.equal(formatCurrency(null), "—");
    assert.equal(formatCompactCurrency(undefined), "—");
    assert.equal(formatPercent(null), "—");
    assert.equal(formatDate(null), "—");
    assert.equal(formatShortDate(undefined), "—");
    assert.equal(formatDateTime(""), "—");
  });

  it("formats numbers and Vietnamese compact currency", () => {
    assert.match(formatInteger(1250), /1\.250/);
    assert.match(formatDecimal(12.345), /12,35/);
    assert.match(formatCompactCurrency(1_500_000_000), /1,5 tỷ/);
    assert.match(formatCompactCurrency(25_000_000), /25 triệu/);
    assert.match(formatCompactCurrency(15_000), /15 nghìn/);
    assert.match(formatPercent(0.125), /12,5%/);
  });

  it("formats ISO dates consistently in Asia/Ho_Chi_Minh timezone", () => {
    assert.equal(formatDate("2026-10-12"), "12/10/2026");
    assert.match(formatShortDate("2026-10-12"), /^12[/-]10$/);
  });
});
