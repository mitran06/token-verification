import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums — one canonical value end-to-end (an invalid status cannot be written,
// which structurally kills the legacy case-mismatch bug).
// ---------------------------------------------------------------------------
export const userRole = pgEnum("user_role", ["admin", "reception"]); // counters are NOT accounts
export const sessionKind = pgEnum("session_kind", ["user", "counter"]);
export const counterStatus = pgEnum("counter_status", ["active", "on_break", "closed"]);
export const tokenStatus = pgEnum("token_status", ["queued", "assigned", "served", "not_arrived"]);
export const tokenEventType = pgEnum("token_event_type", [
  "generated",
  "assigned",
  "served",
  "not_arrived",
  "prioritized",
  "deleted",
  "reopened",
]);

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// users — ADMIN + RECEPTION only (individual accounts). Counters log in with a
// shared password (app_config.counter_password_hash) and are stored separately.
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 50 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("users_username_lower_uniq").on(sql`lower(${t.username})`)],
);

// ---------------------------------------------------------------------------
// counters — physical stations. Admin seeds/opens the N staffed today.
// ---------------------------------------------------------------------------
export const counters = pgTable(
  "counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: varchar("label", { length: 30 }).notNull(), // 'Counter 1' — shown on wall + picker
    sortOrder: integer("sort_order").notNull().default(0),
    isOpen: boolean("is_open").notNull().default(false),
    status: counterStatus("status").notNull().default("closed"),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex("counters_label_lower_uniq").on(sql`lower(${t.label})`)],
);

// ---------------------------------------------------------------------------
// sessions — opaque server-side. EITHER a user (admin/reception) OR a counter.
// ---------------------------------------------------------------------------
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256(cookie token) hex
    kind: sessionKind("kind").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    counterId: uuid("counter_id").references(() => counters.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [
    index("sessions_counter_active").on(t.counterId).where(sql`kind = 'counter'`),
    index("sessions_expires_at_idx").on(t.expiresAt), // cheap expired-session sweep
    check(
      "sessions_kind_target_ck",
      sql`(kind = 'user' AND user_id IS NOT NULL AND counter_id IS NULL)
        OR (kind = 'counter' AND counter_id IS NOT NULL AND user_id IS NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// applications — the applicant roster (fully replaced on each CSV import).
// ---------------------------------------------------------------------------
export const applications = pgTable("applications", {
  applicationNumber: varchar("application_number", { length: 50 }).primaryKey(),
  applicationName: varchar("application_name", { length: 200 }).notNull(),
  createdAt,
  updatedAt,
});

// ---------------------------------------------------------------------------
// daily_sequences — authoritative per-IST-day token counter (race/restart safe).
// ---------------------------------------------------------------------------
export const dailySequences = pgTable("daily_sequences", {
  businessDay: date("business_day").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

// ---------------------------------------------------------------------------
// tokens — the queue. No FK to applications (roster is replaceable); the
// applicant name is snapshotted so issued tokens survive a roster replace.
// assigned_to references a COUNTER (station), not a person.
// ---------------------------------------------------------------------------
export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessDay: date("business_day").notNull(),
    tokenNumber: integer("token_number").notNull(),
    applicationNumber: varchar("application_number", { length: 50 }).notNull(),
    applicationName: varchar("application_name", { length: 200 }).notNull(),
    status: tokenStatus("status").notNull().default("queued"),
    assignedTo: uuid("assigned_to").references(() => counters.id),
    createdAt,
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    servedAt: timestamp("served_at", { withTimezone: true }),
    updatedAt,
    // v2 (additive): verificationOutcome, verificationNotes, verifiedBy, verifiedAt
  },
  (t) => [
    uniqueIndex("tokens_day_number_uniq").on(t.businessDay, t.tokenNumber),
    // ≤1 live token per applicant per day (fixes the legacy duplicate leak).
    uniqueIndex("tokens_one_live_per_app")
      .on(t.businessDay, t.applicationNumber)
      .where(sql`status IN ('queued','assigned','not_arrived')`),
    index("tokens_queue_pick").on(t.businessDay, t.tokenNumber).where(sql`status = 'queued'`),
    index("tokens_assigned_by_counter").on(t.assignedTo).where(sql`status = 'assigned'`),
    index("tokens_day_status").on(t.businessDay, t.status),
  ],
);

// ---------------------------------------------------------------------------
// token_events — append-only audit. token_id SET NULL on delete; number +
// application snapshotted so the trail survives a hard delete. Actor is a
// counter OR a user (both null = system, e.g. day roll).
// ---------------------------------------------------------------------------
export const tokenEvents = pgTable(
  "token_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    tokenId: uuid("token_id").references(() => tokens.id, { onDelete: "set null" }),
    tokenNumber: integer("token_number"),
    applicationNumber: varchar("application_number", { length: 50 }),
    eventType: tokenEventType("event_type").notNull(),
    actorCounterId: uuid("actor_counter_id").references(() => counters.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    fromStatus: tokenStatus("from_status"),
    toStatus: tokenStatus("to_status"),
    createdAt,
  },
  (t) => [index("token_events_token_idx").on(t.tokenId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// app_config — key/value. Holds: counter_password_hash (shared counter login),
// display_link_secret, chime_enabled, etc.
// ---------------------------------------------------------------------------
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt,
});
