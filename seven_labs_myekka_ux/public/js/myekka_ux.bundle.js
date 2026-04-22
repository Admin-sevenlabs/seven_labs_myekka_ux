/*
 * Seven Labs Myekka UX
 * ----------------------------------------------------------------------------
 * Injects two patches into the Frappe Desk:
 *
 * 1) Events-tab widener
 *    Core Frappe calls `get_events({start: today, end: today})` for the
 *    notifications bell -> Events tab. This hides assigned events that start
 *    tomorrow or later. We wrap `frappe.xcall` so that when it receives this
 *    specific method with start === end, we widen end to today + 7 days.
 *
 * 2) On-screen assignment toast
 *    Core Frappe emits a realtime `notification` event to the session user
 *    after a `Notification Log` row is inserted. We subscribe and surface it
 *    as a visible `frappe.show_alert` toast for 8 seconds.
 *
 * Both patches are idempotent and defensive — they do nothing if the core
 * Frappe API surface changes.
 *
 * Author: Seven Labs Vision (CA Raghav Bansal)
 * Deployed: Myekka / Shyam Ji Group
 */

(function () {
	"use strict";

	var APP = "seven_labs_myekka_ux";
	var log = function () {
		try {
			console.log.apply(console, ["[" + APP + "]"].concat([].slice.call(arguments)));
		} catch (e) {}
	};

	// ---------------------------------------------------------------------
	// Patch 1: Events-tab date-window widener
	// ---------------------------------------------------------------------
	function installEventsWidener() {
		if (!window.frappe || !frappe.xcall) {
			return false;
		}
		if (frappe.xcall.__slv_patched) return true;

		var originalXcall = frappe.xcall;
		frappe.xcall = function (method, args) {
			try {
				if (
					method === "frappe.desk.doctype.event.event.get_events" &&
					args &&
					args.start &&
					args.start === args.end
				) {
					// Bell's Events tab default — widen to 7 days
					args = Object.assign({}, args, {
						end: frappe.datetime.add_days(args.start, 7)
					});
					log("Widened Events-tab window: " + args.start + " -> " + args.end);
				}
			} catch (e) {
				log("Widener skipped:", e);
			}
			return originalXcall.apply(this, arguments.length === 2 ? [method, args] : [method]);
		};
		frappe.xcall.__slv_patched = true;
		log("Events-tab widener installed");
		return true;
	}

	// ---------------------------------------------------------------------
	// Patch 2: On-screen assignment toast
	// ---------------------------------------------------------------------
	function installToast() {
		if (!window.frappe || !frappe.realtime || !frappe.realtime.on) {
			return false;
		}
		if (window.__slv_toast_bound) return true;

		frappe.realtime.on("notification", function () {
			try {
				// Frappe only sends this event to the current session user.
				// Fetch the freshest Notification Log for this user and toast it.
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
						// De-dup: skip if we already toasted this exact row
						if (window.__slv_last_toast === row.name) return;
						window.__slv_last_toast = row.name;

						var msg = row.subject || "New notification";
						// Strip HTML tags for the toast (they render ugly in show_alert)
						msg = String(msg).replace(/<[^>]*>/g, "").trim();
						if (msg.length > 160) msg = msg.slice(0, 157) + "...";

						var indicator =
							row.type === "Alert"
								? "orange"
								: row.type === "Mention"
								? "green"
								: "blue";

						frappe.show_alert(
							{ message: msg, indicator: indicator },
							8
						);
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

	// ---------------------------------------------------------------------
	// Bootstrapper — retry until Frappe APIs are ready
	// ---------------------------------------------------------------------
	function tryInstall() {
		var p1 = installEventsWidener();
		var p2 = installToast();
		return p1 && p2;
	}

	// Immediate attempt
	if (!tryInstall()) {
		// Wait for app_ready
		if (window.$) {
			$(document).on("app_ready", tryInstall);
		}
		// Also poll for up to 30 seconds (Desk boot can be slow on first login)
		var attempts = 0;
		var iv = setInterval(function () {
			if (tryInstall() || ++attempts >= 60) {
				clearInterval(iv);
			}
		}, 500);
	}
})();
