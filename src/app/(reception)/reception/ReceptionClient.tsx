"use client";
import { useActionState } from "react";
import { FormError, FormOk, SubmitButton } from "@/components/ui/form";
import {
  type ReceptionState,
  deleteTokenAction,
  generateTokenAction,
  prioritizeTokenAction,
} from "./actions";

type App = { number: string; name: string };
type Tok = { tokenNumber: number; applicationNumber: string; applicationName: string };
type Missed = Tok & { id: string };

function GenerateForm({ csrf, applicants }: { csrf: string; applicants: App[] }) {
  const [state, action] = useActionState<ReceptionState, FormData>(generateTokenAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="csrf" value={csrf} />
      <label className="text-sm font-medium">Issue a token</label>
      <input
        name="applicationNumber"
        list="applicants"
        placeholder="Search application number…"
        autoComplete="off"
        required
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
      <datalist id="applicants">
        {applicants.map((a) => (
          <option key={a.number} value={a.number}>
            {a.number} — {a.name}
          </option>
        ))}
      </datalist>
      <FormError message={state.error} />
      <FormOk message={state.ok} />
      <SubmitButton>Generate token</SubmitButton>
    </form>
  );
}

function MissedRow({ csrf, t }: { csrf: string; t: Missed }) {
  const [, pri] = useActionState<ReceptionState, FormData>(prioritizeTokenAction, {});
  const [, del] = useActionState<ReceptionState, FormData>(deleteTokenAction, {});
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span>
        <b className="tabular-nums">{t.tokenNumber}</b>{" "}
        <span className="text-sm text-zinc-500">{t.applicationNumber}</span>
      </span>
      <span className="flex gap-2">
        <form action={pri}>
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="tokenId" value={t.id} />
          <SubmitButton className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50">
            Prioritize
          </SubmitButton>
        </form>
        <form
          action={del}
          onSubmit={(e) => {
            if (!confirm(`Delete token ${t.tokenNumber}?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="tokenId" value={t.id} />
          <SubmitButton className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
            Delete
          </SubmitButton>
        </form>
      </span>
    </li>
  );
}

export function ReceptionClient({
  csrf,
  applicants,
  queued,
  missed,
}: {
  csrf: string;
  applicants: App[];
  queued: Tok[];
  missed: Missed[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <GenerateForm csrf={csrf} applicants={applicants} />
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-medium">Queued ({queued.length})</h2>
          <ul className="divide-y divide-zinc-100">
            {queued.length === 0 && <li className="py-2 text-sm text-zinc-400">Empty</li>}
            {queued.map((t) => (
              <li key={t.applicationNumber} className="flex justify-between py-1.5">
                <span className="font-medium tabular-nums">{t.tokenNumber}</span>
                <span className="text-sm text-zinc-500">{t.applicationNumber}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-medium">Not arrived ({missed.length})</h2>
          <ul className="divide-y divide-zinc-100">
            {missed.length === 0 && <li className="py-2 text-sm text-zinc-400">None</li>}
            {missed.map((t) => (
              <MissedRow key={t.id} csrf={csrf} t={t} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
