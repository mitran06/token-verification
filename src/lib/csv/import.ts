import "server-only";
import { db } from "@/db";
import { applications } from "@/db/schema";
import type { AppRow } from "./parse";

// Full replace in one transaction. Safe even with historical tokens present:
// tokens snapshot the applicant name and have no FK to applications.
export async function replaceApplications(rows: AppRow[]): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.delete(applications);
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(applications).values(
        rows.slice(i, i + CHUNK).map((r) => ({
          applicationNumber: r.applicationNumber,
          applicationName: r.applicationName,
        })),
      );
    }
    return rows.length;
  });
}
