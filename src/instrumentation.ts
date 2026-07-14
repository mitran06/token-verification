// Runs once at server startup (Next instrumentation hook).
export async function register(): Promise<void> {
  const { assertProductionEnv } = await import("@/lib/env");
  assertProductionEnv();
}
