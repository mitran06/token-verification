import "server-only";
import Papa from "papaparse";
import { z } from "zod";

export type AppRow = { applicationNumber: string; applicationName: string };
export type ParseResult = {
  error?: string;
  rows: AppRow[];
  skipped: number;
  errors: { row: number; message: string }[];
};

// Tolerant column detection — the real export (student_list_report*.csv) uses
// "Application No" and "Name", but accept common variants.
const APP_ALIASES = ["application no", "application number", "application_number", "app no", "app_no", "number"];
const NAME_ALIASES = ["name", "applicant name", "student name", "applicant_name"];

const rowSchema = z.object({
  applicationNumber: z.string().trim().min(1).max(50),
  applicationName: z.string().trim().min(1).max(200),
});

export function parseApplicationsCsv(text: string): ParseResult {
  const clean = text.replace(/^﻿/, ""); // strip BOM
  const res = Papa.parse<Record<string, string>>(clean, { header: true, skipEmptyLines: true });
  const fields = res.meta.fields ?? [];
  const find = (aliases: string[]) => fields.find((f) => aliases.includes(f.trim().toLowerCase()));
  const appCol = find(APP_ALIASES);
  const nameCol = find(NAME_ALIASES);
  if (!appCol || !nameCol) {
    return {
      error: `Couldn't find an application-number column and a name column. Columns found: ${fields.join(", ") || "(none)"}`,
      rows: [],
      skipped: 0,
      errors: [],
    };
  }

  const byNum = new Map<string, AppRow>(); // duplicate application numbers in file → keep last
  const errors: { row: number; message: string }[] = [];
  let skipped = 0;
  res.data.forEach((r, i) => {
    const parsed = rowSchema.safeParse({
      applicationNumber: r[appCol] ?? "",
      applicationName: r[nameCol] ?? "",
    });
    if (!parsed.success) {
      skipped++;
      if (errors.length < 50) errors.push({ row: i + 2, message: "missing application number or name" });
      return;
    }
    byNum.set(parsed.data.applicationNumber, parsed.data);
  });

  return { rows: [...byNum.values()], skipped, errors };
}
