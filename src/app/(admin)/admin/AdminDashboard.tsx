"use client";
import { useActionState } from "react";
import { FormError, FormOk, SubmitButton } from "@/components/ui/form";
import {
  type AdminState,
  addCounterAction,
  createReceptionUserAction,
  reopenTokenAction,
  rotateDisplayKeyAction,
  seedCountersAction,
  setActionDelayAction,
  setCounterPasswordAction,
  setUserActiveAction,
  toggleCounterOpenAction,
} from "./actions";
import { ImportPanel } from "./ImportPanel";

type CounterRow = { id: string; label: string; isOpen: boolean; status: string };
type UserRow = { id: string; username: string; isActive: boolean };
type TokenRow = {
  id: string;
  tokenNumber: number;
  applicationNumber: string;
  status: "queued" | "assigned" | "served" | "not_arrived";
};
type Action = (prev: AdminState, formData: FormData) => Promise<AdminState>;

const inputCls = "rounded-md border border-zinc-300 px-3 py-2";

function ActionForm({
  action,
  csrf,
  submit,
  children,
  row,
}: {
  action: Action;
  csrf: string;
  submit: string;
  children?: React.ReactNode;
  row?: boolean;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(action, {});
  return (
    <form action={formAction} className={row ? "flex items-center gap-2" : "flex flex-col gap-2"}>
      <input type="hidden" name="csrf" value={csrf} />
      {children}
      {!row && <FormError message={state.error} />}
      {!row && <FormOk message={state.ok} />}
      <SubmitButton
        className={
          row
            ? "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
            : undefined
        }
      >
        {submit}
      </SubmitButton>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-5">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: TokenRow["status"] }) {
  const cls =
    status === "served"
      ? "bg-zinc-200 text-zinc-700"
      : status === "assigned"
        ? "bg-emerald-100 text-emerald-800"
        : status === "not_arrived"
          ? "bg-amber-100 text-amber-800"
          : "bg-blue-100 text-blue-800";
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{status.replace("_", " ")}</span>;
}

export function AdminDashboard({
  csrf,
  counterPasswordSet,
  counters,
  receptionUsers,
  displayPath,
  applicationCount,
  todayTokens,
  actionDelaySeconds,
}: {
  csrf: string;
  counterPasswordSet: boolean;
  counters: CounterRow[];
  receptionUsers: UserRow[];
  displayPath: string;
  applicationCount: number;
  todayTokens: TokenRow[];
  actionDelaySeconds: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Shared counter password">
        <p className="text-sm text-zinc-500">
          {counterPasswordSet
            ? "A counter password is set. Enter a new one to change it."
            : "Not set yet — counter staff can't log in until you set this."}
        </p>
        <ActionForm action={setCounterPasswordAction} csrf={csrf} submit="Save password">
          <input
            name="password"
            type="password"
            placeholder="New shared counter password"
            required
            className={inputCls}
          />
        </ActionForm>
      </Section>

      <Section title="Counters">
        <ActionForm action={seedCountersAction} csrf={csrf} submit="Open counters">
          <label className="text-sm text-zinc-600">
            Open this many counters for today (Counter 1…N):
          </label>
          <input name="count" type="number" min={1} max={50} placeholder="e.g. 6" required className={inputCls} />
        </ActionForm>

        <ActionForm action={addCounterAction} csrf={csrf} submit="Add">
          <input name="label" placeholder="Add a custom counter (e.g. NRI Desk)" className={inputCls} />
        </ActionForm>

        <ul className="flex flex-col divide-y divide-zinc-100">
          {counters.length === 0 && <li className="py-2 text-sm text-zinc-500">No counters yet.</li>}
          {counters.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-zinc-500">
                  {c.isOpen ? `open · ${c.status}` : "closed"}
                </span>
              </span>
              <ActionForm action={toggleCounterOpenAction} csrf={csrf} submit={c.isOpen ? "Close" : "Open"} row>
                <input type="hidden" name="counterId" value={c.id} />
                <input type="hidden" name="open" value={c.isOpen ? "0" : "1"} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Counter action delay">
        <p className="text-sm text-zinc-500">
          Seconds a counter must wait after pressing <b>Next Token</b> or <b>Not Arrived</b> before
          either can be pressed again — guards against an accidental double-click skipping a token.
          Set to 0 to disable.
        </p>
        <ActionForm action={setActionDelayAction} csrf={csrf} submit="Save delay">
          <label className="text-sm text-zinc-600">Delay in seconds (0–120):</label>
          <input
            name="seconds"
            type="number"
            min={0}
            max={120}
            defaultValue={actionDelaySeconds}
            required
            className={inputCls}
          />
        </ActionForm>
      </Section>

      <Section title="Reception users">
        <ActionForm action={createReceptionUserAction} csrf={csrf} submit="Create reception user">
          <input name="username" placeholder="Username" className={inputCls} />
          <input name="password" type="password" placeholder="Password" className={inputCls} />
        </ActionForm>

        <ul className="flex flex-col divide-y divide-zinc-100">
          {receptionUsers.length === 0 && (
            <li className="py-2 text-sm text-zinc-500">No reception users yet.</li>
          )}
          {receptionUsers.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                <span className="font-medium">{u.username}</span>
                {!u.isActive && <span className="text-xs text-red-600">disabled</span>}
              </span>
              <ActionForm action={setUserActiveAction} csrf={csrf} submit={u.isActive ? "Disable" : "Enable"} row>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="active" value={u.isActive ? "0" : "1"} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Applicants (roster CSV)">
        <ImportPanel csrf={csrf} currentCount={applicationCount} />
      </Section>

      <Section title="Today's tokens">
        <ul className="flex max-h-72 flex-col divide-y divide-zinc-100 overflow-y-auto">
          {todayTokens.length === 0 && (
            <li className="py-2 text-sm text-zinc-400">No tokens issued today.</li>
          )}
          {todayTokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                <b className="tabular-nums">{t.tokenNumber}</b>
                <span className="text-sm text-zinc-500">{t.applicationNumber}</span>
                <StatusBadge status={t.status} />
              </span>
              {t.status === "served" && (
                <ActionForm action={reopenTokenAction} csrf={csrf} submit="Reopen" row>
                  <input type="hidden" name="tokenId" value={t.id} />
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Display wall">
        <p className="text-sm text-zinc-500">
          Open this link on the waiting-room screen. Rotating it disables the old one.
        </p>
        <a
          href={displayPath}
          target="_blank"
          rel="noreferrer"
          className="break-all text-sm text-blue-600 underline"
        >
          {displayPath}
        </a>
        <ActionForm action={rotateDisplayKeyAction} csrf={csrf} submit="Rotate display link" />
      </Section>
    </div>
  );
}
