"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Preview = {
  valid: number;
  skipped: number;
  errors: { row: number; message: string }[];
  sample: { applicationNumber: string; applicationName: string }[];
};

export function ImportPanel({ csrf, currentCount }: { csrf: string; currentCount: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);

  async function send(mode: "preview" | "commit") {
    if (!file) {
      setMsg({ error: "Choose a CSV file first." });
      return;
    }
    setBusy(true);
    setMsg({});
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await fetch(`/api/import?mode=${mode}`, {
        method: "POST",
        headers: { "x-csrf-token": csrf },
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({ error: data.error ?? "Import failed." });
        return;
      }
      if (mode === "preview") {
        setPreview(data);
      } else {
        setPreview(null);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setMsg({ ok: `Roster replaced — ${data.count} applicants imported.` });
        router.refresh();
      }
    } catch {
      setMsg({ error: "Import failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        Current roster: <b>{currentCount}</b> applicants. Uploading a CSV replaces the entire list.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPreview(null);
          setMsg({});
        }}
        className="text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => send("preview")}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-40"
        >
          Preview
        </button>
        {preview && preview.valid > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(`Replace all ${currentCount} applicants with ${preview.valid} from the file?`))
                send("commit");
            }}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Commit replace ({preview.valid})
          </button>
        )}
      </div>
      {preview && (
        <div className="rounded-md bg-zinc-50 p-3 text-sm">
          <p>
            <b>{preview.valid}</b> valid · <b>{preview.skipped}</b> skipped
          </p>
          {preview.sample.length > 0 && (
            <ul className="mt-1 text-zinc-600">
              {preview.sample.map((s) => (
                <li key={s.applicationNumber}>
                  {s.applicationNumber} — {s.applicationName}
                </li>
              ))}
            </ul>
          )}
          {preview.errors.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-amber-700">{preview.errors.length} row issues</summary>
              <ul className="text-xs text-zinc-500">
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {msg.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-green-700">{msg.ok}</p>}
    </div>
  );
}
