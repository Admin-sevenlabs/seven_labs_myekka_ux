/*
 * Seven Labs Myekka UX  (v2 - 2026-04-22)
 * ----------------------------------------------------------------------------
 * Installs three patches into the Frappe Desk, for EVERY user on the site:
 *
 * 1) get_events argument guard  (NEW in v2 - fixes "Server Error: missing
 *    start and end" dialog that core Frappe v16 throws when an internal
 *    widget calls the Event RPC without kwargs). We intercept BOTH
 *    frappe.xcall and frappe.call for this one method and inject
 *    { start: today, end: today + 7 } whenever start/end are missing.
 *
 * 2) Events-tab date-window widener
 *    Core Frappe calls get_events({start: today, end: today}) for the
 *    notifications bell -> Events tab. This hides assigned events that start
 *    tomorrow or later. When we see start === end we widen end to today + 7.
 *
 * 3) On-screen assignment toast
 *    Core Frappe emits a realtime notification event to the session user
 *    after a Notification Log row is inserted. We subscribe and surface it
 *    as a visible frappe.show_alert toast for 8 seconds.
 *
 * All patches are idempotent and defensive - they do nothing if the core
 * Frappe API surface changes, and they never strip arguments from the
 * original call.
 *
 * Author: Seven Labs Vision (CA Raghav Bansal)
 * Deployed: Myekka / Shyam Ji Group
 */

(function () {
	"use strict";

	var APP = "seven_labs_myekka_ux";
	var GET_EVENTS = "frappe.desk.doctype.event.event.get_events";
	var log = function () {
		try {
			console.log.apply(console, ["[" + APP + "]"].concat([].slice.call(arguments)));
		} catch (e) {}
	};

	// Helper: normalise args for get_events. Returns a new args object with
	// start & end guaranteed present. Widens same-day window to 7 days.
	function normaliseEventsArgs(args) {
		var today = (window.frappe && frappe.datetime && frappe.datetime.get_today)
			? frappe.datetime.get_today()
			: new Date().toISOString().slice(0, 10);
		var addDays = function (d, n) {
			if (window.frappe && frappe.datetime && frappe.datetime.add_days) {
				return frappe.datetime.add_days(d, n);
			}
			var dt = new Date(d);
			dt.setDate(dt.getDate() + n);
			return dt.toISOString().slice(0, 10);
		};

		var out = Object.assign({}, args || {});
		var didFix = false;

		if (!out.start || !out.end) {
			out.start = out.start || today;
			out.end = out.end || addDays(out.start, 7);
			didFix = "defaults-injected";
		} else if (out.start === out.end) {
			out.end = addDays(out.start, 7);
			didFix = "same-day-widened";
		}

		return { args: out, didFix: didFix };
	}

	// Patch 1: guard + widen get_events - covers frappe.xcall AND frappe.call
	function installGetEventsGuard() {
		if (!window.frappe) return false;

		if (frappe.xcall && !frappe.xcall.__slv_patched) {
			var originalXcall = frappe.xcall;
			frappe.xcall = function (method, args) {
				try {
					if (method === GET_EVENTS) {
						var r = normaliseEventsArgs(args);
						if (r.didFix) {
							log("xcall get_events " + r.didFix + ":", r.args.start, "->", r.args.end);
							args = r.args;
						}
					}
				} catch (e) {
					log("xcall guard skipped:", e);
				}
				var fwd = Array.prototype.slice.call(arguments);
				if (method === GET_EVENTS) {
					if (fwd.length < 2) fwd.push(args);
					else fwd[1] = args;
				}
				return originalXcall.apply(this, fwd);
			};
			frappe.xcall.__slv_patched = true;
			log("xcall guard installed");
		}

		if (frappe.call && !frappe.call.__slv_patched) {
			var originalCall = frappe.call;
			frappe.call = function (opts) {
				try {
					if (opts && opts.method === GET_EVENTS) {
						var r = normaliseEventsArgs(opts.args);
						if (r.didFix) {
							log("call get_events " + r.didFix + ":", r.args.start, "->", r.args.end);
							opts = Object.assign({}, opts, { args: r.args });
						}
					}
				} catch (e) {
					log("call guard skipped:", e);
				}
				var fwd = Array.prototype.slice.call(arguments);
				if (opts && opts.method === GET_EVENTS) {
					fwd[0] = opts;
				}
				return originalCall.apply(this, fwd);
			};
			try {
				Object.keys(originalCall).forEach(function (k) {
					try { frappe.call[k] = originalCall[k]; } catch (_) {}
				});
			} catch (_) {}
			frappe.call.__slv_patched = true;
			log("call guard installed");
		}

		return !!(frappe.xcall && frappe.xcall.__slv_patched &&
				  frappe.call && frappe.call.__slv_patched);
	}

	// Patch 2: On-screen assignment toast
	function installToast() {
		if (!window.frappe || !frappe.realtime || !frappe.realtime.on) {
			return false;
		}
		if (window.__slv_toast_bound) return true;

		frappe.realtime.on("notification", function () {
			try {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Notification Log",
						filters: { for_user: frappe.session.user },
						fields: ["name", "subject", "document_type", "document_name", "type"],
						order_by: "creation desc",
						limit_page_length: 1
					},
					callback: function (r) {
						var row = (r && r.message && r.message[0]) || null;
						if (!row) return;
						if (window.__slv_last_toast === row.name) return;
						window.__slv_last_toast = row.name;

						var msg = row.subject || "New notification";
						msg = String(msg).replace(/<[^>]*>/g, "").trim();
						if (msg.length > 160) msg = msg.slice(0, 157) + "...";

						var indicator =
							row.type === "Alert" ? "orange"
							: row.type === "Mention" ? "green"
							: "blue";

						frappe.show_alert({ message: msg, indicator: indicator }, 8);
					}
				});
			} catch (e) {
				log("Toast handler error:", e);
			}
		});
		window.__slv_toast_bound = true;
		log("Realtime toast handler bound");
		return true;
	}

	// Bootstrapper - retry until Frappe APIs are ready
	function tryInstall() {
		var p1 = installGetEventsGuard();
		var p2 = installToast();
		return p1 && p2;
	}

	if (!tryInstall()) {
		if (window.$) {
			$(document).on("app_ready", tryInstall);
		}
		var attempts = 0;
		var iv = setInterval(function () {
			if (tryInstall() || ++attempts >= 60) {
				clearInterval(iv);
			}
		}, 500);
	}
})();
