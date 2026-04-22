# Seven Labs Myekka UX

Custom Frappe app for the **Shyam Ji Group / Myekka ERPNext** instance at `myekka.m.frappe.cloud`.
Author: **Seven Labs Vision** (CA Raghav Bansal).

It ships two tiny, defensive patches to the Desk UI — no DocType changes, no data
migrations, no scheduler jobs. All intelligence lives in one JS bundle injected
via `app_include_js`.

---

## What it does

### 1. Events-tab widener (fixes "No Upcoming Events")

Frappe's core notifications bell → Events tab calls
`frappe.desk.doctype.event.event.get_events({start: today, end: today})`.
That is, `start === end === today`, so any Event starting tomorrow or later
is hidden from the bell. Assignees therefore saw "No Upcoming Events" even
when they had assignments for the next week.

This app wraps `frappe.xcall` to intercept that specific call and widen `end`
to `today + 7 days`. All other `xcall` traffic passes through unchanged.

### 2. On-screen assignment toast

Frappe already broadcasts a `notification` realtime event to the session
user after a `Notification Log` row is inserted (which the Myekka
`sj_todo_after_insert_notify` Server Script does on every ToDo assignment).
Core Frappe does not render this as a toast — only as a bell badge bump.

This app subscribes to that realtime channel, fetches the freshest
`Notification Log` row for the session user, and surfaces it as a visible
`frappe.show_alert` toast for 8 seconds.

---

## Install (Frappe Cloud)

1. Push this repo to a GitHub repository owned by Seven Labs or the Shyam
   Ji Group (private is fine — Frappe Cloud supports private GitHub installs
   via the GitHub App).
2. On Frappe Cloud → Bench (or Group, depending on plan) → **Apps**
   → **Install from GitHub** → point to the repo and branch (`main`).
3. Frappe Cloud will do a bench build. Approve the deploy.
4. On the Myekka **site** → **Apps** → install
   `seven_labs_myekka_ux`.
5. Hard-refresh the browser (`Ctrl + Shift + R`). Open the Desk.

### Verify install

Open DevTools Console. You should see:

    [seven_labs_myekka_ux] Events-tab widener installed
    [seven_labs_myekka_ux] Realtime toast handler bound

Click the notifications bell → Events tab — assignments starting within the
next 7 days should now appear (instead of "No Upcoming Events").

Ask another admin to assign an Event to you (via the ASSIGN button) — a blue
toast should pop in the bottom-right with the subject.

## Install (Local dev / Docker)

    bench get-app https://github.com/<your-org>/seven_labs_myekka_ux --branch main
    bench --site <site-name> install-app seven_labs_myekka_ux
    bench --site <site-name> clear-cache
    bench build

Hard-refresh browser.

---

## Uninstall / Rollback

    # On Frappe Cloud: Site → Apps → Uninstall seven_labs_myekka_ux
    # Or locally:
    bench --site <site-name> uninstall-app seven_labs_myekka_ux

Uninstall is safe — the app writes no DocTypes and performs no migrations.
Once uninstalled the original Frappe behaviour returns (today-only Events
tab, no toast).

---

## Files

    seven_labs_myekka_ux/
    ├── pyproject.toml              ← package metadata
    ├── license.txt
    ├── README.md
    ├── MANIFEST.in
    ├── .gitignore
    └── seven_labs_myekka_ux/       ← inner package
        ├── __init__.py             ← __version__
        ├── hooks.py                ← app_include_js → myekka_ux.bundle.js
        ├── modules.txt
        ├── patches.txt             ← empty
        ├── config/
        │   ├── __init__.py
        │   └── desktop.py          ← Module icon/label
        ├── public/js/
        │   └── myekka_ux.bundle.js ← THE BRAINS — both patches live here
        └── seven_labs_myekka_ux/   ← module folder
            └── __init__.py

---

## Tuning

Edit `seven_labs_myekka_ux/public/js/myekka_ux.bundle.js`:

- **Widen window**: change `frappe.datetime.add_days(args.start, 7)` to
  `add_days(args.start, 30)` for a 30-day lookahead.
- **Toast duration**: change the `8` (seconds) in the `frappe.show_alert`
  call.
- **Toast colour**: change the `indicator` field in the `callback`.

After any edit: `bench build && bench clear-cache` on the server, hard-refresh
the browser.

---

## Companion Server Scripts (deployed separately on Myekka)

This app pairs with 5 Server Scripts already live on Myekka:

1. `sj_todo_after_insert_notify` — syncs ToDo → Event Participants + inserts
   Notification Log (which triggers the realtime event this app listens for).
2. `sj_todo_on_delete_cleanup` — removes Event Participants when a ToDo is
   unassigned.
3. `sj_event_reminder_24h` — scheduled Daily — inserts Notification Log +
   sends email 24 hours before an Event.
4. `sj_event_reminder_1h` — scheduled Hourly — ditto for 1 hour before.
5. `sj_backfill_event_participants` — disabled one-shot backfill.

Removing this custom app does NOT remove or affect those Server Scripts —
bell + email reminders will continue to work. Only the toast + widened
Events-tab window disappear.
