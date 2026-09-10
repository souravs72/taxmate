/**
 * TaxMate Desk search — scoped AwesomeBar + sidebar search control.
 */
(function () {
	"use strict";

	frappe.provide("taxmate.search");

	function cfg() {
		return frappe.boot && frappe.boot.taxmate_search;
	}

	function enabled() {
		return Boolean(cfg() && cfg().enabled);
	}

	function is_doctype_allowed(doctype) {
		if (!doctype || !enabled()) {
			return true;
		}
		const c = cfg();
		if ((c.denied_doctypes || []).includes(doctype)) {
			return false;
		}
		if ((c.doctypes || []).includes(doctype)) {
			return true;
		}
		const module = (c.doctype_module || {})[doctype];
		if (!module) {
			return false;
		}
		return (c.modules || []).includes(module);
	}

	function extract_doctype(option) {
		if (!option) {
			return null;
		}
		const route = option.route;
		if (Array.isArray(route)) {
			if (route[0] === "List" || route[0] === "Form" || route[0] === "Tree") {
				return route[1];
			}
			if (route[0] === "query-report") {
				const report = frappe.boot?.user?.all_reports?.[route[1]];
				return report?.ref_doctype || null;
			}
		}
		if (option.type === "New" || option.type === "List" || option.type === "Tree" || option.type === "Report") {
			return option.match || null;
		}
		if (typeof option.match === "string") {
			return option.match;
		}
		return null;
	}

	function filter_options(options) {
		if (!enabled() || !Array.isArray(options)) {
			return options;
		}
		return options.filter((opt) => {
			if (opt.default === "Calculator" || opt.default === "Search" || opt.default === "Current") {
				return true;
			}
			if (opt.onclick && !opt.route && !opt.match) {
				return true;
			}
			if (opt.type === "Marketplace App" || opt.type === "Hub") {
				return false;
			}
			const dt = extract_doctype(opt);
			if (!dt) {
				const value = (opt.value || opt.label || "").toString().replace(/<[^>]+>/g, "");
				const denied = [
					"Employee",
					"Payroll",
					"HR",
					"Manufacturing",
					"BOM",
					"Work Order",
					"Project",
					"Issue",
					"Lead",
					"Opportunity",
				];
				return !denied.some((d) => value.includes(d));
			}
			return is_doctype_allowed(dt);
		});
	}

	taxmate.search.patch_awesomebar = function () {
		if (!enabled() || taxmate.search._patched) {
			return;
		}
		if (!frappe.search?.utils) {
			return;
		}
		taxmate.search._patched = true;

		const utils = frappe.search.utils;
		[
			"get_doctypes",
			"get_reports",
			"get_pages",
			"get_creatables",
			"get_search_in_list",
			"get_recent_pages",
			"get_dashboards",
			"get_desktop_icons",
			"get_marketplace_apps",
		].forEach((method) => {
			if (typeof utils[method] !== "function") {
				return;
			}
			const original = utils[method].bind(utils);
			utils[method] = function () {
				return filter_options(original.apply(this, arguments));
			};
		});

		utils.get_marketplace_apps = function () {
			return [];
		};
	};

	taxmate.search.ensure_awesomebar = function () {
		if (!frappe.boot?.desk_settings?.search_bar) {
			return;
		}
		// Prefer Frappe's native #navbar-modal-search (body-sidebar); only bootstrap if missing.
		if (!document.getElementById("navbar-modal-search")) {
			$("body").append(
				$('<button type="button" id="navbar-modal-search" class="hidden" aria-hidden="true"></button>')
			);
			if (!taxmate.search._awesomebar && frappe.search?.AwesomeBar) {
				taxmate.search._awesomebar = new frappe.search.AwesomeBar();
				taxmate.search._awesomebar.setup("#navbar-modal-search");
			}
		}
	};

	taxmate.search.open = function () {
		taxmate.search.ensure_awesomebar();
		$("#navbar-modal-search").trigger("click");
	};

	taxmate.search.inject_ui = function () {
		if (!enabled()) {
			return;
		}
		if (document.getElementById("taxmate-desk-search")) {
			return;
		}

		const shortcut = frappe.utils.is_mac() ? "⌘K" : "Ctrl+K";
		const $btn = $(`
			<button type="button" id="taxmate-desk-search" class="taxmate-desk-search" title="${__("Search")} (${shortcut})">
				<span class="taxmate-desk-search-icon">${frappe.utils.icon("search", "sm")}</span>
				<span class="taxmate-desk-search-label">${__("Search")}</span>
				<kbd class="taxmate-desk-search-kbd">${shortcut}</kbd>
			</button>
		`);

		const $sidebar = $("nav.vertical-sidebar .app-logo");
		if ($sidebar.length) {
			$sidebar.after($('<div class="taxmate-desk-search-wrap"></div>').append($btn));
		} else {
			const $page = $(".page-head .page-head-content, .navbar .container").first();
			if ($page.length) {
				$page.prepend($btn);
			} else {
				$("body").append($btn);
			}
		}

		$btn.on("click", function (e) {
			e.preventDefault();
			taxmate.search.open();
		});
	};

	$(function () {
		taxmate.search.patch_awesomebar();
		taxmate.search.ensure_awesomebar();
		taxmate.search.inject_ui();
	});

	$(document).on("page-change", function () {
		taxmate.search.inject_ui();
	});
})();
