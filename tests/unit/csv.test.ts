import { describe, expect, it } from "vitest";
import { parseApplicationsCsv } from "@/lib/csv/parse";

describe("parseApplicationsCsv", () => {
  it("parses the real export shape (Application No / Name among many columns)", () => {
    const csv = `"SL No","Application No",Name,Gender\n1,2103001519,"A Amrutha",Female\n2,2103010160,"A Naveen",Male`;
    const r = parseApplicationsCsv(csv);
    expect(r.error).toBeUndefined();
    expect(r.rows).toEqual([
      { applicationNumber: "2103001519", applicationName: "A Amrutha" },
      { applicationNumber: "2103010160", applicationName: "A Naveen" },
    ]);
  });

  it("strips BOM and accepts alias headers", () => {
    const csv = `﻿application_number,applicant name\nA1,Alice\nA2,Bob`;
    const r = parseApplicationsCsv(csv);
    expect(r.rows.map((x) => x.applicationNumber)).toEqual(["A1", "A2"]);
  });

  it("skips rows missing a field and dedups by number (last wins)", () => {
    const csv = `Application No,Name\nA1,Alice\n,NoNumber\nA2,\nA1,Alice Updated`;
    const r = parseApplicationsCsv(csv);
    expect(r.rows).toEqual([{ applicationNumber: "A1", applicationName: "Alice Updated" }]);
    expect(r.skipped).toBe(2);
  });

  it("errors when the required columns aren't present", () => {
    const r = parseApplicationsCsv(`foo,bar\n1,2`);
    expect(r.error).toBeTruthy();
    expect(r.rows.length).toBe(0);
  });
});
