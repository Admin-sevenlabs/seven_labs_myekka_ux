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
// Late-loading timeline entries are caught via MutationObserver so users never
// see "X ago" — even on slow form renders.
//
// To roll back: remove this file from app_include_js in hooks.py and redeploy.

(function () {
    if (typeof frappe === "undefined" || !frappe.datetime) return;

    const ABS_FORMAT     = "DD MMM YYYY, h:mm A";
    const TOOLTIP_FORMAT = "dddd, DD MMMM YYYY, h:mm:ss A";

    // ---- 1. Override the formatter so new renders use absolute time ----
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

    if (typeof window.prettyDate === "function") {
        window.prettyDate = function (datetime) {
            if (!datetime) return "";
            return moment(datetime).format(ABS_FORMAT);
        };
    }

    // ---- 2. DOM patcher for spans rendered through other code paths ----
    function patchSpan(span) {
        if (!span || span.dataset.slvPatched === "1") return;
        const ts = span.getAttribute("data-timestamp") || span.getAttribute("title");
        if (!ts) return;
        try {
            span.textContent = moment(ts).format(ABS_FORMAT);
            span.dataset.slvPatched = "1";
        } catch (e) {}
    }

    function patchAll(root) {
        (root || document).querySelectorAll(".frappe-timestamp").forEach(patchSpan);
    }

    // Initial pass on ready
    $(document).ready(function () { patchAll(); });

    // ---- 3. Watch for late-loading timeline / activity entries ----
    const observer = new MutationObserver(function (mutations) {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.classList && node.classList.contains("frappe-timestamp")) {
                    patchSpan(node);
                } else if (node.querySelectorAll) {
                    node.querySelectorAll(".frappe-timestamp").forEach(patchSpan);
                }
            }
        }
    });

    function startObserver() {
        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            setTimeout(startObserver, 100);
        }
    }
    startObserver();
})();
