// Seven Labs Vision — Myekka UX
// Override Frappe's relative-time formatter to show absolute date + time
// Format: "04 May 2026, 7:00 PM"
//
// Affects every place Frappe uses comment_when() / prettyDate():
//   - Form activity timeline (Project, Task, Lead, Sales Order, etc.)
//   - Comments
//   - Notification dropdown
//   - List view "Last Updated" columns
//
// To roll back: remove this file from app_include_js in hooks.py and redeploy.

(function () {
    if (typeof frappe === "undefined" || !frappe.datetime) return;

    const ABS_FORMAT     = "DD MMM YYYY, h:mm A";
    const TOOLTIP_FORMAT = "dddd, DD MMMM YYYY, h:mm:ss A";

    // Primary timeline / comment formatter
    frappe.datetime.comment_when = function (datetime, mini) {
        if (!datetime) return "";
        const m = moment(datetime);
        return (
            '<span class="frappe-timestamp" ' +
            'data-timestamp="' + datetime + '" ' +
            'title="' + m.format(TOOLTIP_FORMAT) + '">' +
            m.format(ABS_FORMAT) +
            "</span>"
        );
    };

    // Used by some list-view / notification renderers
    if (typeof window.prettyDate === "function") {
        window.prettyDate = function (datetime) {
            if (!datetime) return "";
            return moment(datetime).format(ABS_FORMAT);
        };
    }

    // Refresh any already-rendered relative spans on page load
    $(document).ready(function () {
        $(".frappe-timestamp").each(function () {
            const ts = $(this).attr("data-timestamp") || $(this).attr("title");
            if (ts) $(this).text(moment(ts).format(ABS_FORMAT));
        });
    });
})();
