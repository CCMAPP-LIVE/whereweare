"use client";

import { useState } from "react";
import { asLengthKind, lengthLabel, type LengthKind } from "@/lib/bookingLength";
import AccountLogo from "@/components/AccountLogo";

export type ManagedAccount = {
  id: string;
  email: string;
  canInvite: boolean;
  logoUrl: string | null;
};

export type ManagedLink = {
  id: string;
  calendarAccountId: string;
  slug: string;
  title: string;
  description: string | null;
  hostName: string | null;
  durationMin: number;
  lengthKind: LengthKind;
  weekdays: number[];
  dayStart: string;
  dayEnd: string;
  minNoticeHours: number;
  maxDaysAhead: number;
  bufferMin: number;
  addMeet: boolean;
  inPerson: boolean;
  location: string | null;
  locationMode: "host" | "client";
  active: boolean;
};

export type ManagedBooking = {
  id: string;
  linkId: string;
  start: string;
  end: string;
  guestName: string;
  guestEmail: string;
  notes: string | null;
  meetUrl: string | null;
  guestLocation: string | null;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const mins = 6 * 60 + i * 30; // 06:00 – 22:00
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});
const TZ = "Europe/London";

function londonFmt(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(new Date(iso));
}

/** "david@brainshed.co.uk" -> "brainshed" — a natural default link name. */
function domainLabel(email: string): string {
  const domain = email.split("@")[1] ?? "";
  return (domain.split(".")[0] ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
}

type FormState = {
  calendarAccountId: string;
  slug: string;
  title: string;
  description: string;
  hostName: string;
  durationMin: number;
  lengthKind: LengthKind;
  weekdays: number[];
  dayStart: string;
  dayEnd: string;
  minNoticeHours: number;
  maxDaysAhead: number;
  bufferMin: number;
  addMeet: boolean;
  inPerson: boolean;
  location: string;
  locationMode: "host" | "client";
};

function toPayload(f: FormState) {
  return {
    calendar_account_id: f.calendarAccountId,
    slug: f.slug,
    title: f.title,
    description: f.description,
    host_name: f.hostName,
    duration_min: f.durationMin,
    length_kind: f.lengthKind,
    weekdays: f.weekdays,
    day_start: f.dayStart,
    day_end: f.dayEnd,
    min_notice_hours: f.minNoticeHours,
    max_days_ahead: f.maxDaysAhead,
    buffer_min: f.bufferMin,
    add_meet: f.addMeet,
    in_person: f.inPerson,
    location: f.location,
    location_mode: f.locationMode,
  };
}

type ApiLink = {
  id: string;
  calendar_account_id: string;
  slug: string;
  title: string;
  description: string | null;
  host_name: string | null;
  duration_min: number;
  length_kind: string;
  weekdays: number[];
  day_start: string;
  day_end: string;
  min_notice_hours: number;
  max_days_ahead: number;
  buffer_min: number;
  add_meet: boolean;
  in_person: boolean;
  location: string | null;
  location_mode: string;
  active: boolean;
};

function fromApi(l: ApiLink): ManagedLink {
  return {
    id: l.id,
    calendarAccountId: l.calendar_account_id,
    slug: l.slug,
    title: l.title,
    description: l.description,
    hostName: l.host_name,
    durationMin: l.duration_min,
    lengthKind: asLengthKind(l.length_kind),
    weekdays: l.weekdays,
    dayStart: l.day_start.slice(0, 5),
    dayEnd: l.day_end.slice(0, 5),
    minNoticeHours: l.min_notice_hours,
    maxDaysAhead: l.max_days_ahead,
    bufferMin: l.buffer_min,
    addMeet: l.add_meet,
    inPerson: l.in_person,
    location: l.location,
    locationMode: l.location_mode === "client" ? "client" : "host",
    active: l.active,
  };
}

const input =
  "w-full rounded-lg border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10";
const label = "mb-1 block text-xs font-medium uppercase text-neutral-400";

function LinkForm({
  accounts,
  linkPrefix,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  accounts: ManagedAccount[];
  linkPrefix: string;
  initial: FormState;
  submitLabel: string;
  onSubmit: (f: FormState) => Promise<string | null>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const account = accounts.find((a) => a.id === f.calendarAccountId);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(await onSubmit(f));
        setSaving(false);
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Invites come from</span>
          <select
            value={f.calendarAccountId}
            onChange={(e) => {
              const next = accounts.find((a) => a.id === e.target.value);
              setF((cur) => ({
                ...cur,
                calendarAccountId: e.target.value,
                slug: cur.slug || (next ? domainLabel(next.email) : ""),
              }));
            }}
            className={input}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
                {a.canInvite ? "" : " (needs permission)"}
              </option>
            ))}
          </select>
          {account && !account.canInvite && (
            <span className="mt-1 block text-[11px] text-amber-600">
              This account can&apos;t send invites yet — use &ldquo;Allow invites&rdquo; above first.
            </span>
          )}
        </label>
        <label className="block">
          <span className={label}>Link name</span>
          <div className="flex items-center gap-1 text-sm">
            <span className="shrink-0 text-neutral-400">{linkPrefix.replace(/^https?:\/\//, "")}/</span>
            <input
              value={f.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="brainshed"
              className={input}
            />
          </div>
        </label>
        <label className="block">
          <span className={label}>Meeting title</span>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Your name on the page (optional)</span>
          <input
            value={f.hostName}
            onChange={(e) => set("hostName", e.target.value)}
            placeholder="e.g. David Marr, Brainshed"
            className={input}
          />
        </label>
      </div>

      <label className="block">
        <span className={label}>Description (optional)</span>
        <textarea
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className={input}
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className={label}>Length</span>
          <select
            value={f.lengthKind === "minutes" ? String(f.durationMin) : f.lengthKind}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "half_day" || v === "full_day") set("lengthKind", v);
              else setF((cur) => ({ ...cur, lengthKind: "minutes", durationMin: Number(v) }));
            }}
            className={input}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {lengthLabel("minutes", d)}
              </option>
            ))}
            <option value="half_day">Half day</option>
            <option value="full_day">Whole day</option>
          </select>
          {f.lengthKind !== "minutes" && (
            <span className="mt-1 block text-[11px] text-neutral-500">
              {f.lengthKind === "half_day"
                ? "Morning or afternoon half of the hours below."
                : "The whole of the hours below."}
            </span>
          )}
        </label>
        <label className="block">
          <span className={label}>From</span>
          <select value={f.dayStart} onChange={(e) => set("dayStart", e.target.value)} className={input}>
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Until</span>
          <select value={f.dayEnd} onChange={(e) => set("dayEnd", e.target.value)} className={input}>
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Gap between</span>
          <select
            value={f.bufferMin}
            onChange={(e) => set("bufferMin", Number(e.target.value))}
            className={input}
          >
            {[0, 5, 10, 15, 30].map((b) => (
              <option key={b} value={b}>
                {b} min
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className={label}>Days</span>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d, i) => {
            const on = f.weekdays.includes(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  set("weekdays", on ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort())
                }
                className={
                  "rounded-lg border px-2.5 py-1 text-xs " +
                  (on
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-black/10 dark:border-white/10")
                }
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={label}>Minimum notice</span>
          <select
            value={f.minNoticeHours}
            onChange={(e) => set("minNoticeHours", Number(e.target.value))}
            className={input}
          >
            {[0, 2, 4, 12, 24, 48, 72].map((h) => (
              <option key={h} value={h}>
                {h === 0 ? "None" : `${h} hours`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Bookable up to</span>
          <select
            value={f.maxDaysAhead}
            onChange={(e) => set("maxDaysAhead", Number(e.target.value))}
            className={input}
          >
            {[7, 14, 28, 42, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} days ahead
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className={label}>Where</span>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.addMeet}
              onChange={(e) => set("addMeet", e.target.checked)}
              className="accent-teal-600"
            />
            Add Google Meet
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={f.inPerson}
              onChange={(e) => {
                const on = e.target.checked;
                // In person usually means no video call — untick Meet when switching
                // to in person; re-tick it for a hybrid meeting.
                setF((cur) => ({ ...cur, inPerson: on, addMeet: on ? false : cur.addMeet }));
              }}
              className="accent-teal-600"
            />
            In person
          </label>
        </div>
        {f.inPerson && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-black/10 p-2 text-sm dark:border-white/10">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="location-mode"
                checked={f.locationMode === "host"}
                onChange={() => set("locationMode", "host")}
                className="accent-teal-600"
              />
              At my address
            </label>
            {f.locationMode === "host" && (
              <input
                value={f.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Address, e.g. Brainshed, 12 High Street, Christchurch BH23 1AB"
                className={input}
              />
            )}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="location-mode"
                checked={f.locationMode === "client"}
                onChange={() => set("locationMode", "client")}
                className="accent-teal-600"
              />
              At the client&apos;s location
            </label>
            {f.locationMode === "client" && (
              <span className="block pl-6 text-[11px] text-neutral-500">
                The client enters their address when booking; it becomes the invite&apos;s location.
              </span>
            )}
          </div>
        )}
        {f.inPerson && f.addMeet && (
          <span className="mt-1 block text-[11px] text-neutral-500">
            The invite will have the address and a Meet link, for anyone joining remotely.
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          disabled={saving}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-2 text-sm text-neutral-500">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function BookingsManager({
  bookingBase,
  accounts: initialAccounts,
  initialLinks,
  bookings: initialBookings,
  setupNeeded,
}: {
  bookingBase: string;
  accounts: ManagedAccount[];
  initialLinks: ManagedLink[];
  bookings: ManagedBooking[];
  setupNeeded: boolean;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [logoBusy, setLogoBusy] = useState<string | null>(null);
  const [links, setLinks] = useState(initialLinks);
  const [bookings, setBookings] = useState(initialBookings);
  const [creating, setCreating] = useState(initialLinks.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const urlFor = (slug: string) => `${bookingBase}/${slug}`;
  const emailOf = (accountId: string) => accounts.find((a) => a.id === accountId)?.email ?? "—";
  const linkTitle = (id: string) => links.find((l) => l.id === id)?.title ?? "Booking";

  async function save(path: string, method: "POST" | "PUT", body: unknown) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok && json.ok
      ? { link: fromApi(json.link as ApiLink), error: null }
      : { link: null, error: (json.error as string) ?? "Couldn't save." };
  }

  async function uploadLogo(accountId: string, file: File) {
    if (file.size > 2 * 1024 * 1024) return alert("Logo must be 2 MB or smaller.");
    setLogoBusy(accountId);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/account-logo/${accountId}`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok)
        setAccounts((cur) => cur.map((a) => (a.id === accountId ? { ...a, logoUrl: json.logoUrl } : a)));
      else alert(json.error ?? "Couldn't upload that logo.");
    } finally {
      setLogoBusy(null);
    }
  }

  async function removeLogo(accountId: string) {
    setLogoBusy(accountId);
    const res = await fetch(`/api/account-logo/${accountId}`, { method: "DELETE" });
    if (res.ok) setAccounts((cur) => cur.map((a) => (a.id === accountId ? { ...a, logoUrl: null } : a)));
    setLogoBusy(null);
  }

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(urlFor(slug));
      setCopied(slug);
      setTimeout(() => setCopied((c) => (c === slug ? null : c)), 2000);
    } catch {
      prompt("Copy this link:", urlFor(slug));
    }
  }

  async function toggleActive(l: ManagedLink) {
    const { link } = await save(`/api/booking-links/${l.id}`, "PUT", { active: !l.active });
    if (link) setLinks((cur) => cur.map((x) => (x.id === link.id ? link : x)));
  }

  async function remove(l: ManagedLink) {
    if (!confirm(`Delete "${l.title}"? The link will stop working. Booked meetings stay in your calendar.`))
      return;
    const res = await fetch(`/api/booking-links/${l.id}`, { method: "DELETE" });
    if (res.ok) {
      setLinks((cur) => cur.filter((x) => x.id !== l.id));
      setBookings((cur) => cur.filter((b) => b.linkId !== l.id));
    }
  }

  async function cancelBooking(b: ManagedBooking) {
    if (!confirm(`Cancel the meeting with ${b.guestName}? They'll get a cancellation email.`)) return;
    const res = await fetch(`/api/bookings/${b.id}`, { method: "DELETE" });
    if (res.ok) setBookings((cur) => cur.filter((x) => x.id !== b.id));
    else alert("Couldn't cancel that booking.");
  }

  const firstInviter = accounts.find((a) => a.canInvite) ?? accounts[0];
  const newForm: FormState = {
    calendarAccountId: firstInviter?.id ?? "",
    slug: firstInviter ? domainLabel(firstInviter.email) : "",
    title: "30 minute meeting",
    description: "",
    hostName: "",
    durationMin: 30,
    lengthKind: "minutes",
    weekdays: [0, 1, 2, 3, 4],
    dayStart: "09:00",
    dayEnd: "17:00",
    minNoticeHours: 24,
    maxDaysAhead: 28,
    bufferMin: 10,
    addMeet: true,
    inPerson: false,
    location: "",
    locationMode: "host",
  };

  const section = "rounded-2xl border border-black/10 p-4 dark:border-white/10";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-3 sm:p-5">
      <h1 className="text-lg font-semibold sm:text-xl">Bookings</h1>
      <p className="text-sm text-neutral-500">
        Send someone a link and they pick a time that&apos;s free across{" "}
        <strong>all</strong> your calendars. The invite comes from whichever account you choose.
      </p>

      {setupNeeded && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-50/60 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          One-time setup: the booking tables haven&apos;t been created in the database yet. Run{" "}
          <code>supabase/migrations/20261001_booking_links.sql</code> in the Supabase SQL editor,
          then reload this page.
        </p>
      )}

      <section className={section}>
        <h2 className="mb-2 font-semibold">Accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Connect a Google account on <a href="/settings" className="underline">Settings</a> first.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                <AccountLogo logoUrl={a.logoUrl} email={a.email} size="sm" />
                <span className="min-w-0 flex-1 truncate">{a.email}</span>
                <label
                  className={
                    "cursor-pointer text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 " +
                    (logoBusy === a.id ? "pointer-events-none opacity-50" : "")
                  }
                >
                  {logoBusy === a.id ? "Uploading…" : a.logoUrl ? "Change logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) uploadLogo(a.id, file);
                    }}
                  />
                </label>
                {a.logoUrl && (
                  <button
                    onClick={() => removeLogo(a.id)}
                    disabled={logoBusy === a.id}
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                )}
                {a.canInvite ? (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">
                    ✓ Can send invites
                  </span>
                ) : (
                  <a
                    href="/api/connect-google?next=/bookings"
                    className="rounded-lg border border-amber-500/50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                    title={`Reconnect ${a.email} and tick the calendar permission`}
                  >
                    Allow invites
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {accounts.some((a) => !a.canInvite) && (
          <p className="mt-2 text-[11px] text-neutral-400">
            &ldquo;Allow invites&rdquo; reconnects the account: choose that same Google account and
            allow it to manage events. The app only ever creates the meetings people book.
          </p>
        )}
      </section>

      <section className={section}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Your booking links</h2>
          {!creating && accounts.length > 0 && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              + New link
            </button>
          )}
        </div>

        {creating && accounts.length > 0 && !setupNeeded && (
          <div className="mb-4 rounded-xl bg-black/[0.03] p-3 dark:bg-white/5">
            <LinkForm
              accounts={accounts}
              linkPrefix={bookingBase}
              initial={newForm}
              submitLabel="Create link"
              onCancel={links.length ? () => setCreating(false) : undefined}
              onSubmit={async (f) => {
                const { link, error } = await save("/api/booking-links", "POST", toPayload(f));
                if (link) {
                  setLinks((cur) => [...cur, link]);
                  setCreating(false);
                }
                return error;
              }}
            />
          </div>
        )}

        {links.length === 0 && !creating ? (
          <p className="text-sm text-neutral-500">No links yet.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id} className="rounded-xl border border-black/10 p-3 dark:border-white/10">
                {editingId === l.id ? (
                  <LinkForm
                    accounts={accounts}
                    linkPrefix={bookingBase}
                    initial={{
                      calendarAccountId: l.calendarAccountId,
                      slug: l.slug,
                      title: l.title,
                      description: l.description ?? "",
                      hostName: l.hostName ?? "",
                      durationMin: l.durationMin,
                      lengthKind: l.lengthKind,
                      weekdays: l.weekdays,
                      dayStart: l.dayStart,
                      dayEnd: l.dayEnd,
                      minNoticeHours: l.minNoticeHours,
                      maxDaysAhead: l.maxDaysAhead,
                      bufferMin: l.bufferMin,
                      addMeet: l.addMeet,
                      inPerson: l.inPerson,
                      location: l.location ?? "",
                      locationMode: l.locationMode,
                    }}
                    submitLabel="Save"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (f) => {
                      const { link, error } = await save(`/api/booking-links/${l.id}`, "PUT", toPayload(f));
                      if (link) {
                        setLinks((cur) => cur.map((x) => (x.id === link.id ? link : x)));
                        setEditingId(null);
                      }
                      return error;
                    }}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{l.title}</span>
                      <span className="text-xs text-neutral-500">
                        {lengthLabel(l.lengthKind, l.durationMin)}
                        {l.inPerson ? (l.locationMode === "client" ? " · At client's location" : " · In person") : ""}
                        {l.addMeet ? " · Meet" : ""} · from {emailOf(l.calendarAccountId)}
                      </span>
                      {!l.active && (
                        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] uppercase text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
                        {urlFor(l.slug)}
                      </code>
                      <button
                        onClick={() => copy(l.slug)}
                        className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-700"
                      >
                        {copied === l.slug ? "Copied ✓" : "Copy link"}
                      </button>
                      <a
                        href={urlFor(l.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-teal-700 underline dark:text-teal-300"
                      >
                        Preview
                      </a>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-neutral-500">
                      <button onClick={() => setEditingId(l.id)} className="hover:text-neutral-800 dark:hover:text-neutral-200">
                        Edit
                      </button>
                      <button onClick={() => toggleActive(l)} className="hover:text-neutral-800 dark:hover:text-neutral-200">
                        {l.active ? "Pause" : "Resume"}
                      </button>
                      <button onClick={() => remove(l)} className="hover:text-red-600">
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={section}>
        <h2 className="mb-2 font-semibold">Upcoming bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing booked yet.</p>
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {londonFmt(b.start, { weekday: "short", day: "numeric", month: "short" })},{" "}
                    {londonFmt(b.start, { hour: "2-digit", minute: "2-digit" })}–
                    {londonFmt(b.end, { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {b.guestName} · {b.guestEmail} · {linkTitle(b.linkId)}
                  </div>
                  {b.guestLocation && (
                    <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">📍 {b.guestLocation}</div>
                  )}
                  {b.notes && <div className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">“{b.notes}”</div>}
                  {b.meetUrl && (
                    <a href={b.meetUrl} target="_blank" rel="noreferrer" className="text-xs text-teal-700 underline dark:text-teal-300">
                      Meet link
                    </a>
                  )}
                </div>
                <button onClick={() => cancelBooking(b)} className="text-xs text-neutral-400 hover:text-red-600">
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
