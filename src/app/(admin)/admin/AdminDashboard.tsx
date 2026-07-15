"use client";
import { useActionState, useState } from "react";
import { FormError, FormOk, SubmitButton } from "@/components/ui/form";
import {
  type AdminState,
  addCounterAction,
  createReceptionUserAction,
  deleteCounterAction,
  deleteReceptionUserAction,
  reopenTokenAction,
  rotateDisplayKeyAction,
  seedCountersAction,
  setActionDelayAction,
  setChimeEnabledAction,
  setCounterPasswordAction,
  setNowServingScaleAction,
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
const TABS = ["Counters", "Reception", "Roster", "Tokens", "Display"] as const;
type Tab = (typeof TABS)[number];

function ActionForm({
  action,
  csrf,
  submit,
  children,
  row,
  confirm: confirmMsg,
  submitClass,
}: {
  action: Action;
  csrf: string;
  submit: string;
  children?: React.ReactNode;
  row?: boolean;
  confirm?: string;
  submitClass?: string;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(action, {});
  return (
    <form
      action={formAction}
      onSubmit={confirmMsg ? (e) => !window.confirm(confirmMsg) && e.preventDefault() : undefined}
      className={row ? "flex items-center gap-2" : "flex flex-col gap-2"}
    >
      <input type="hidden" name="csrf" value={csrf} />
      {children}
      {!row && <FormError message={state.error} />}
      {!row && <FormOk message={state.ok} />}
      <SubmitButton
        className={
          submitClass ??
          (row ? "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50" : undefined)
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

const deleteBtnCls =
  "rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50";

function NowServingSizeForm({ csrf, value }: { csrf: string; value: number }) {
  const [state, formAction] = useActionState<AdminState, FormData>(setNowServingScaleAction, {});
  const [v, setV] = useState(value);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="csrf" value={csrf} />
      <label className="text-sm text-zinc-600">
        Now Serving card size: <b>{v}</b> / 5 <span className="text-zinc-400">(bigger = fewer per row)</span>
      </label>
      <input
        type="range"
        name="scale"
        min={1}
        max={5}
        step={1}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className="w-full max-w-xs accent-maroon"
      />
      <FormError message={state.error} />
      <FormOk message={state.ok} />
      <SubmitButton>Save size</SubmitButton>
    </form>
  );
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
  chimeEnabled,
  nowServingScale,
}: {
  csrf: string;
  counterPasswordSet: boolean;
  counters: CounterRow[];
  receptionUsers: UserRow[];
  displayPath: string;
  applicationCount: number;
  todayTokens: TokenRow[];
  actionDelaySeconds: number;
  chimeEnabled: boolean;
  nowServingScale: number;
}) {
  const [tab, setTab] = useState<Tab>("Counters");

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t-md px-4 py-2 text-sm font-medium ${
              tab === t
                ? "border-x border-t border-zinc-200 bg-white text-maroon"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Counters" && (
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
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-xs text-zinc-500">
                      {c.isOpen ? `open · ${c.status}` : "closed"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ActionForm action={toggleCounterOpenAction} csrf={csrf} submit={c.isOpen ? "Close" : "Open"} row>
                      <input type="hidden" name="counterId" value={c.id} />
                      <input type="hidden" name="open" value={c.isOpen ? "0" : "1"} />
                    </ActionForm>
                    <ActionForm
                      action={deleteCounterAction}
                      csrf={csrf}
                      submit="Delete"
                      row
                      confirm={`Delete ${c.label}? Any token it's holding returns to the queue.`}
                      submitClass={deleteBtnCls}
                    >
                      <input type="hidden" name="counterId" value={c.id} />
                    </ActionForm>
                  </span>
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
        </div>
      )}

      {tab === "Reception" && (
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
              <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{u.username}</span>
                  {!u.isActive && <span className="text-xs text-red-600">disabled</span>}
                </span>
                <span className="flex items-center gap-2">
                  <ActionForm action={setUserActiveAction} csrf={csrf} submit={u.isActive ? "Disable" : "Enable"} row>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="active" value={u.isActive ? "0" : "1"} />
                  </ActionForm>
                  <ActionForm
                    action={deleteReceptionUserAction}
                    csrf={csrf}
                    submit="Delete"
                    row
                    confirm={`Delete reception user '${u.username}'? This can't be undone.`}
                    submitClass={deleteBtnCls}
                  >
                    <input type="hidden" name="userId" value={u.id} />
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tab === "Roster" && (
        <Section title="Applicants (roster CSV)">
          <ImportPanel csrf={csrf} currentCount={applicationCount} />
        </Section>
      )}

      {tab === "Tokens" && (
        <Section title="Today's tokens">
          <ul className="flex max-h-[28rem] flex-col divide-y divide-zinc-100 overflow-y-auto">
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
      )}

      {tab === "Display" && (
        <div className="flex flex-col gap-6">
          <Section title="Display wall link">
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

          <Section title="Sound">
            <p className="text-sm text-zinc-500">
              Display chime is currently <b>{chimeEnabled ? "on" : "off"}</b>. The wall unlocks sound
              on first interaction with the screen — there is no on-screen button.
            </p>
            <ActionForm
              action={setChimeEnabledAction}
              csrf={csrf}
              submit={chimeEnabled ? "Mute chime" : "Enable chime"}
            >
              <input type="hidden" name="enabled" value={chimeEnabled ? "0" : "1"} />
            </ActionForm>
          </Section>

          <Section title="Now Serving card size">
            <NowServingSizeForm csrf={csrf} value={nowServingScale} />
          </Section>
        </div>
      )}
    </div>
  );
}
