/* TravelTogether: Itinerary script.
   The "Shared helpers" block at the top is the same in every page's script. This page's own code starts
   at the heading comment with its name. Pages talk to each other only through localStorage keys
   (see README.md), never by importing each other. */
(function () {
  "use strict";

  /* ======================================================================
     Shared helpers. This block is repeated at the top of every page's script
     so each page stays self-contained (the contract is the localStorage keys,
     not shared files).
     ====================================================================== */
  const TRIP_KEY = "tp:trip";
  const THEME_KEY = "tp:theme";
  const MAX_TRIP_DAYS = 366;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    up: ["M10 16V4M5 9l5-5 5 5"],
    down: ["M10 4v12M5 11l5 5 5-5"],
    edit: ["M3 17l.8-3.6L13.6 3.6a1.8 1.8 0 0 1 2.6 0l.2.2a1.8 1.8 0 0 1 0 2.6L6.6 16.2 3 17z", "M12 5.2l2.8 2.8"],
    delete: ["M4 6h12M8 6V4h4v2M6 6l.7 11h6.6L14 6M8.5 9v5M11.5 9v5"],
    location: ["M10 17s6-4.6 6-9a6 6 0 1 0-12 0c0 4.4 6 9 6 9z", "M10 6.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"],
    plus: ["M10 4v12M4 10h12"],
    close: ["M5 5l10 10M15 5L5 15"],
    check: ["M4 10.5l4 4 8-9"],
    clock: ["M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M10 6.5V10l2.5 1.5"],
    upload: ["M10 13V3M6.5 6.5L10 3l3.5 3.5M4 12.5v3h12v-3"],
    download: ["M10 3v10M6.5 9.5L10 13l3.5-3.5M4 12.5v3h12v-3"],
    printer: ["M5 7V3h10v4M5 14H3V8h14v6h-2M5 11h10v6H5z"],
    alert: ["M10 3l8 14H2L10 3z", "M10 8v4M10 14.5v.01"]
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    (ICONS[name] || []).forEach((d) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    });
    return svg;
  }

  function plural(count, one, many) {
    return count + " " + (count === 1 ? one : many);
  }

  function makeId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function slugify(text, fallback) {
    const slug = String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || fallback || "trip";
  }

  /* ---- storage: never throws ---- */
  function storageGet(key) {
    try { return { ok: true, value: window.localStorage.getItem(key) }; }
    catch (error) { return { ok: false, value: null }; }
  }
  function storageSet(key, text) {
    try { window.localStorage.setItem(key, text); }
    catch (error) { return false; }
    queueSync(key);
    return true;
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); }
    catch (error) { return false; }
    queueSync(key);
    return true;
  }

  /* ---- calendar dates (YYYY-MM-DD) without timezone shifts ---- */
  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = new Date(2000, 0, 1, 0, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }
  function dateKey(date) {
    return String(date.getFullYear()).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function dayNumber(key) {
    const date = parseDate(key);
    return date ? Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000) : NaN;
  }
  function daysBetween(startKey, endKey) {
    const first = dayNumber(startKey);
    const last = dayNumber(endKey);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
    const days = [];
    const cursor = parseDate(startKey);
    for (let index = first; index <= last; index += 1) {
      days.push(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }
  function tripLength(trip) {
    return dayNumber(trip.endDate) - dayNumber(trip.startDate) + 1;
  }
  /* Where today falls against the trip: before it, during it, or after it. */
  function tripWhen(trip) {
    const today = dayNumber(todayKey());
    const start = dayNumber(trip.startDate);
    const end = dayNumber(trip.endDate);
    if (today < start) {
      const left = start - today;
      return { phase: "upcoming", text: left === 1 ? "Starts tomorrow" : "Starts in " + left + " days" };
    }
    if (today > end) {
      const gone = today - end;
      return { phase: "past", text: gone === 1 ? "Ended yesterday" : "Ended " + gone + " days ago" };
    }
    return { phase: "now", text: "Happening now: day " + (today - start + 1) + " of " + (end - start + 1) };
  }
  function todayKey() {
    return dateKey(new Date());
  }
  function formatDate(key, options) {
    const date = parseDate(key);
    return date ? new Intl.DateTimeFormat(undefined, options).format(date) : String(key || "");
  }
  function formatRange(startKey, endKey) {
    const start = parseDate(startKey);
    const end = parseDate(endKey);
    if (!start || !end) return "";
    const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
    return typeof formatter.formatRange === "function" ? formatter.formatRange(start, end) : formatter.format(start) + " to " + formatter.format(end);
  }

  /* ---- the shared trip contract (read-only here) ---- */
  function isValidTrip(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    if (typeof value.id !== "string" || !value.id.trim()) return false;
    if (typeof value.title !== "string" || !value.title.trim()) return false;
    if (typeof value.destination !== "string" || !value.destination.trim()) return false;
    if (!parseDate(value.startDate) || !parseDate(value.endDate) || value.endDate < value.startDate) return false;
    if (tripLength(value) > MAX_TRIP_DAYS) return false;
    if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) return false;
    return Number.isInteger(value.travelers) && value.travelers > 0;
  }
  function readActiveTrip() {
    const raw = storageGet(TRIP_KEY);
    if (!raw.ok) return { trip: null, status: "unavailable" };
    if (raw.value === null) return { trip: null, status: "none" };
    try {
      const parsed = JSON.parse(raw.value);
      return isValidTrip(parsed) ? { trip: parsed, status: "ok" } : { trip: null, status: "invalid" };
    } catch (error) {
      return { trip: null, status: "invalid" };
    }
  }
  function fillTripStrip(trip) {
    const set = (name, text) => {
      document.querySelectorAll('[data-trip="' + name + '"]').forEach((node) => { node.textContent = text; });
    };
    set("title", trip.title);
    set("destination", trip.destination);
    set("dates", formatRange(trip.startDate, trip.endDate));
    set("length", plural(tripLength(trip), "day", "days"));
    const when = tripWhen(trip);
    document.querySelectorAll('[data-trip="when"]').forEach((node) => {
      node.textContent = when.text;
      node.dataset.phase = when.phase;
    });
    set("travelers", plural(trip.travelers, "traveler", "travelers"));
    set("currency", "Budget in " + trip.currency);
  }

  /* ---- messages ---- */
  function announce(message) {
    const live = document.getElementById("live");
    if (!live) return;
    live.textContent = "";
    window.setTimeout(() => { live.textContent = message; }, 40);
  }
  function showNotice(message, kind, action) {
    const box = document.getElementById("notice");
    if (!box) return;
    box.querySelector(".notice-text").textContent = message;
    box.dataset.kind = kind || "info";
    const old = box.querySelector(".notice-action");
    if (old) old.remove();
    if (action) {
      const button = el("button", "button button-secondary button-small notice-action", action.label);
      button.type = "button";
      button.addEventListener("click", action.onClick);
      box.querySelector(".notice-text").after(button);
    }
    box.hidden = false;
    announce(message);
  }
  function hideNotice() {
    const box = document.getElementById("notice");
    if (box) box.hidden = true;
  }
  function wireNotice() {
    const close = document.getElementById("notice-close");
    if (close) close.addEventListener("click", hideNotice);
  }

  /* ---- accessible dialogs (fall back to window.confirm) ---- */
  // choiceDialog resolves with the value of the chosen button, or null when cancelled.
  function choiceDialog(options) {
    return new Promise((resolve) => {
      if (typeof HTMLDialogElement === "undefined" || typeof HTMLDialogElement.prototype.showModal !== "function") {
        resolve(window.confirm(options.message) ? options.choices[0].value : null);
        return;
      }
      const stamp = String(Date.now());
      const dialog = el("dialog", "dialog");
      dialog.setAttribute("aria-labelledby", "dlg-title-" + stamp);
      dialog.setAttribute("aria-describedby", "dlg-text-" + stamp);
      const form = el("form", "dialog-body");
      form.method = "dialog";
      const title = el("h2", "", options.title);
      title.id = "dlg-title-" + stamp;
      const text = el("p", "", options.message);
      text.id = "dlg-text-" + stamp;
      const actions = el("div", "dialog-actions");
      const cancel = el("button", "button button-secondary", options.cancelLabel || "Cancel");
      cancel.type = "submit";
      cancel.value = "";
      actions.append(cancel);
      options.choices.forEach((choice) => {
        const button = el("button", "button " + (choice.danger ? "button-danger" : "button-primary"), choice.label);
        button.type = "submit";
        button.value = choice.value;
        actions.append(button);
      });
      form.append(title, text, actions);
      dialog.append(form);
      document.body.append(dialog);
      dialog.addEventListener("close", () => {
        const value = dialog.returnValue || null;
        dialog.remove();
        resolve(value);
      });
      dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(""); });
      dialog.showModal();
      cancel.focus();
    });
  }

  function confirmDialog(options) {
    return choiceDialog({
      title: options.title,
      message: options.message,
      cancelLabel: options.cancelLabel,
      choices: [{ value: "confirm", label: options.confirmLabel || "Confirm", danger: options.danger }]
    }).then((value) => value === "confirm");
  }

  /* ---- JSON files ---- */
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---- theme: follows the system, switchable, remembered ---- */
  function applyTheme(theme, remember) {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#060b18" : "#f8fafc");
    const button = document.getElementById("theme-toggle");
    if (button) {
      const label = "Switch to " + (theme === "dark" ? "light" : "dark") + " theme";
      button.setAttribute("aria-label", label);
      button.title = label;
    }
    if (remember) storageSet(THEME_KEY, theme);
  }
  /* Switch theme. Where the browser supports view transitions, the new theme is revealed
     in a circle that grows from the button; otherwise (or with reduced motion) it is instant. */
  let reveals = 0;
  function switchTheme(button) {
    const root = document.documentElement;
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
    };
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm || typeof document.startViewTransition !== "function") { apply(); return; }
    const box = button.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    root.style.setProperty("--reveal-x", x + "px");
    root.style.setProperty("--reveal-y", y + "px");
    root.style.setProperty("--reveal-r", Math.ceil(Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))) + "px");
    root.classList.add("theme-reveal");
    reveals += 1;
    const done = () => {
      reveals -= 1;
      if (reveals > 0) return;
      reveals = 0;
      root.classList.remove("theme-reveal");
      ["--reveal-x", "--reveal-y", "--reveal-r"].forEach((name) => root.style.removeProperty(name));
    };
    try {
      const transition = document.startViewTransition(apply);
      transition.ready.catch(() => {}); /* a quick second click skips this one: not an error */
      transition.finished.then(done, done);
    } catch (error) {
      apply();
      done();
    }
  }

  /* ======================================================================
     Accounts and the database (Supabase, used through its REST API).
     When CLOUD_CONFIG is filled in, visitors can create an account and log
     in. Their trips and plans are then saved in the database's "user_data"
     table and follow them to any browser, and destinations added on the
     Admin page are stored in the "destinations" table for every visitor.
     With CLOUD_CONFIG empty the site works as before, in this browser only.
     The key is the project's PUBLIC (anon/publishable) key, which is meant
     to be in the page: row-level security in the database decides what it
     may read and write (see database.sql). Never put the secret key here.
     ====================================================================== */
  const CLOUD_CONFIG = { url: "https://izrjmpqbbtbantlhqrct.supabase.co", key: "sb_publishable_17Jau0Uj5lEfiJ68padrnA_DSfy2JMo" };
  const SESSION_KEY = "tp:session";
  const SYNCED = /^tp:(trip|trips|favorites|itinerary:[\w:-]+|budget:[\w:-]+|packing:[\w:-]+)$/;
  function cloudConfig() { return window.__tpCloudConfig || CLOUD_CONFIG; }
  function cloudReady() {
    const conf = cloudConfig();
    return Boolean(conf.url && conf.key) && typeof fetch === "function" && (window.__tpCloud === true || !navigator.webdriver);
  }
  function rawSet(key, text) { try { window.localStorage.setItem(key, text); return true; } catch (error) { return false; } }
  function rawRemove(key) { try { window.localStorage.removeItem(key); return true; } catch (error) { return false; } }
  function readSession() {
    try {
      const value = JSON.parse(window.localStorage.getItem(SESSION_KEY));
      return value && typeof value.access_token === "string" && value.user && typeof value.user.id === "string" ? value : null;
    } catch (error) { return null; }
  }
  function writeSession(session) {
    if (session) rawSet(SESSION_KEY, JSON.stringify(session));
    else rawRemove(SESSION_KEY);
  }
  function sessionFrom(data, previous) {
    if (!data || typeof data.access_token !== "string" || !data.user || typeof data.user.id !== "string") return null;
    const meta = data.user.user_metadata || {};
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600),
      user: { id: data.user.id, email: data.user.email || "", name: cleanName(meta.display_name) || (previous ? previous.user.name : "") },
      admin: previous ? previous.admin === true : false
    };
  }
  function cleanName(value) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 60) : ""; }
  function cloudError(data, status) {
    const text = data && (data.error_description || data.msg || data.message || data.error);
    const error = new Error(typeof text === "string" && text ? text : "The server answered " + status + ".");
    error.status = status;
    return error;
  }
  function cloudFetch(path, options, token) {
    const conf = cloudConfig();
    const opts = options || {};
    /* A logged-in request carries the user's token. Publishable keys (sb_publishable_...) are not tokens,
       so a visitor's request sends only the apikey header; older anon keys are sent both ways. */
    const headers = { apikey: conf.key };
    if (token) headers.Authorization = "Bearer " + token;
    else if (!/^sb_/.test(conf.key)) headers.Authorization = "Bearer " + conf.key;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.prefer) headers.Prefer = opts.prefer;
    return fetch(conf.url.replace(/\/+$/, "") + path, {
      method: opts.method || "GET", headers, keepalive: opts.keepalive === true,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then((response) => response.text().then((text) => {
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
      if (!response.ok) throw cloudError(data, response.status);
      return data;
    }), () => { throw new Error("Couldn't reach the server. Check your connection."); });
  }
  let refreshing = null;
  function freshSession() {
    const session = readSession();
    if (!session) return Promise.resolve(null);
    if (session.expires_at * 1000 - Date.now() > 60000) return Promise.resolve(session);
    if (!refreshing) {
      refreshing = cloudFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refresh_token } })
        .then((data) => { const next = sessionFrom(data, session); writeSession(next); return next; })
        .catch((error) => { if (error.status) writeSession(null); return error.status ? null : session; })
        .then((value) => { refreshing = null; return value; });
    }
    return refreshing;
  }
  function cloudData(path, options) {
    return freshSession().then((session) => {
      if (!session) throw new Error("You're logged out. Log in again to save to your account.");
      return cloudFetch(path, options, session.access_token);
    });
  }
  /* Compare stored JSON by meaning: the database may reorder object keys. */
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function localSyncedKeys() {
    const keys = [];
    try { for (let index = 0; index < window.localStorage.length; index += 1) { const key = window.localStorage.key(index); if (SYNCED.test(key)) keys.push(key); } }
    catch (error) { /* storage blocked */ }
    return keys;
  }

  /* ---- saving changes to the account: every write of a synced key is queued and sent shortly after ---- */
  const pendingKeys = new Set();
  let syncTimer = 0;
  let cloudSyncState = { state: "saved", message: "" };
  function setSyncState(state, message) {
    cloudSyncState = { state, message: message || "" };
    const line = document.getElementById("account-sync");
    if (line) {
      line.dataset.state = state;
      line.textContent = state === "saving" ? "Saving to your account…" : state === "error" ? "Not saved: " + cloudSyncState.message : "Everything is saved to your account.";
    }
  }
  function queueSync(key) {
    if (!SYNCED.test(key) || !cloudReady() || !readSession()) return;
    pendingKeys.add(key);
    setSyncState("saving");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => flushSync(false), 600);
  }
  function flushSync(leaving) {
    clearTimeout(syncTimer);
    const session = readSession();
    if (!session || !pendingKeys.size) return Promise.resolve();
    const keys = Array.from(pendingKeys);
    pendingKeys.clear();
    const upserts = [];
    const removals = [];
    keys.forEach((key) => {
      const raw = storageGet(key);
      if (raw.value === null) { removals.push(key); return; }
      try { upserts.push({ user_id: session.user.id, key, value: JSON.parse(raw.value) }); } catch (error) { /* not JSON: skip */ }
    });
    const send = (path, options) => (leaving ? cloudFetch(path, Object.assign({ keepalive: true }, options), session.access_token) : cloudData(path, options));
    const jobs = [];
    if (upserts.length) jobs.push(send("/rest/v1/user_data?on_conflict=user_id,key", { method: "POST", body: upserts, prefer: "resolution=merge-duplicates,return=minimal" }));
    if (removals.length) jobs.push(send("/rest/v1/user_data?key=in." + encodeURIComponent("(" + removals.map((key) => '"' + key + '"').join(",") + ")"), { method: "DELETE", prefer: "return=minimal" }));
    return Promise.all(jobs).then(() => { if (!pendingKeys.size) setSyncState("saved"); }, (error) => {
      keys.forEach((key) => pendingKeys.add(key));
      setSyncState("error", error.message);
    });
  }
  /* Bring the account's saved data into this browser. "merge" (right after logging in) keeps
     what was made here before logging in and uploads it; "mirror" makes this browser match the account. */
  function applyRows(rows, mode) {
    const inCloud = new Set();
    let changed = false;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || !SYNCED.test(row.key) || row.value === undefined) return;
      inCloud.add(row.key);
      let local = null;
      try { local = JSON.parse(storageGet(row.key).value); } catch (error) { local = null; }
      if (canonical(local) !== canonical(row.value)) { rawSet(row.key, JSON.stringify(row.value)); changed = true; }
    });
    localSyncedKeys().forEach((key) => {
      if (inCloud.has(key) || pendingKeys.has(key)) return;
      if (mode === "merge") pendingKeys.add(key);
      else { rawRemove(key); changed = true; }
    });
    return changed;
  }
  function loadProfile(session) {
    return cloudData("/rest/v1/profiles?select=display_name,is_admin&id=eq." + encodeURIComponent(session.user.id)).then((rows) => {
      const profile = Array.isArray(rows) && rows[0] ? rows[0] : {};
      const current = readSession() || session;
      current.admin = profile.is_admin === true;
      current.user.name = cleanName(profile.display_name) || current.user.name;
      writeSession(current);
      return current;
    });
  }
  function afterLogin(data) {
    const session = sessionFrom(data, null);
    if (!session) return Promise.reject(new Error("The server sent an answer the site didn't understand."));
    writeSession(session);
    return loadProfile(session)
      .then(() => cloudData("/rest/v1/user_data?select=key,value"))
      .then((rows) => { applyRows(rows, "merge"); return flushSync(false); })
      .then(() => readSession());
  }
  function logIn(email, password) {
    return cloudFetch("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }).then(afterLogin);
  }
  function signUp(name, email, password) {
    return cloudFetch("/auth/v1/signup", { method: "POST", body: { email, password, data: { display_name: name } } })
      .then((data) => (data && data.access_token ? afterLogin(data) : { needsConfirmation: true }));
  }
  function logOut() {
    return flushSync(false).catch(() => null).then(() => {
      const session = readSession();
      return session ? cloudFetch("/auth/v1/logout", { method: "POST" }, session.access_token).catch(() => null) : null;
    }).then(() => {
      /* leave nothing of this account behind in a shared browser */
      localSyncedKeys().forEach(rawRemove);
      writeSession(null);
      window.location.href = "./index.html";
    });
  }

  /* ---- the account button in the header ---- */
  function initialsFor(text) {
    return String(text || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?";
  }
  function renderAccount() {
    const host = document.getElementById("account");
    if (!host) return;
    host.replaceChildren();
    host.hidden = !cloudReady();
    if (host.hidden) return;
    const session = readSession();
    const page = window.location.pathname.split("/").pop() || "index.html";
    if (!session) {
      const link = el("a", "account-login", "Log in");
      link.href = "./login.html" + (page === "login.html" ? "" : "?next=" + encodeURIComponent(page));
      host.append(link);
      return;
    }
    const name = session.user.name || session.user.email;
    const menu = el("details", "account-menu");
    const summary = el("summary", "account-button");
    summary.setAttribute("aria-label", "Account menu for " + name);
    summary.append(el("span", "account-avatar", initialsFor(name)), el("span", "account-name", name));
    const panel = el("div", "account-panel");
    panel.append(el("p", "account-who", name), el("p", "account-email", session.user.email));
    const sync = el("p", "account-sync");
    sync.id = "account-sync";
    sync.setAttribute("role", "status");
    panel.append(sync);
    if (session.admin) {
      const admin = el("a", "account-item", "Destination admin");
      admin.href = "./admin.html";
      panel.append(admin);
    }
    const out = el("button", "account-item account-out", "Log out");
    out.type = "button";
    out.addEventListener("click", () => { out.disabled = true; out.textContent = "Logging out…"; logOut(); });
    panel.append(out);
    menu.append(summary, panel);
    menu.addEventListener("keydown", (event) => { if (event.key === "Escape" && menu.open) { menu.open = false; summary.focus(); } });
    document.addEventListener("click", (event) => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
    host.append(menu);
    setSyncState(cloudSyncState.state, cloudSyncState.message);
  }
  let pulledThisPage = false;
  function cloudBoot() {
    if (!cloudReady()) return;
    renderAccount();
    window.addEventListener("pagehide", () => { flushSync(true); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSync(true); });
    if (!readSession() || pulledThisPage) return;
    pulledThisPage = true;
    freshSession().then((session) => {
      if (!session) { renderAccount(); return null; }
      return Promise.all([loadProfile(session), cloudData("/rest/v1/user_data?select=key,value")]).then((results) => {
        renderAccount();
        if (!applyRows(results[1], "mirror")) return;
        /* this browser was behind the account: show the account's data (once) */
        let last = 0;
        try { last = Number(window.sessionStorage.getItem("tp:pulled")) || 0; } catch (error) { last = 0; }
        if (Date.now() - last < 8000) return;
        try { window.sessionStorage.setItem("tp:pulled", String(Date.now())); } catch (error) { /* ignore */ }
        window.location.reload();
      });
    }).catch((error) => setSyncState("error", error.message));
  }

  /* iPhone-style tab press: the glass bubble squishes over to the tapped tab first,
     then the next page loads (and the header shows a loading shine until it does). */
  function initNavLens() {
    const root = document.documentElement;
    const nav = document.querySelector(".primary-nav");
    const calm = () => Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const isPageLink = (link, event) => link && link.href && !link.hasAttribute("download") && (!link.target || link.target === "_self") &&
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
      link.origin === window.location.origin && link.pathname !== window.location.pathname;
    let going = false;
    /* arrived from a bubble move: the bubble is already over this tab, so the page just crossfades */
    try {
      if (window.sessionStorage.getItem("tp:lens")) {
        window.sessionStorage.removeItem("tp:lens");
        root.classList.add("lens-arrived");
        window.setTimeout(() => root.classList.remove("lens-arrived"), 1200);
      }
    } catch (error) { /* storage blocked */ }

    /* any link to another page of the site: show the loading shine straight away */
    document.addEventListener("click", (event) => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!event.defaultPrevented && isPageLink(link, event)) root.classList.add("is-navigating");
    });
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;   /* came back with the Back button: undo the half-finished move */
      going = false;
      root.classList.remove("is-navigating");
      if (nav) {
        nav.classList.remove("lens-moving");
        nav.querySelectorAll(".nav-lens").forEach((lens) => lens.remove());
        nav.querySelectorAll(".is-target, .is-pressed").forEach((link) => link.classList.remove("is-target", "is-pressed"));
      }
    });
    if (!nav) return;

    const release = () => nav.querySelectorAll(".is-pressed").forEach((link) => link.classList.remove("is-pressed"));
    nav.addEventListener("pointerdown", (event) => {
      const link = event.target.closest("a");
      if (link && event.button === 0) link.classList.add("is-pressed");
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((type) => nav.addEventListener(type, release));

    nav.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (!isPageLink(link, event)) return;
      if (going) { event.preventDefault(); return; }
      const from = nav.querySelector('a[aria-current="page"]');
      if (calm() || !from || typeof link.animate !== "function") return;   /* plain, instant navigation */
      event.preventDefault();
      going = true;
      const a = { x: from.offsetLeft, y: from.offsetTop, w: from.offsetWidth, h: from.offsetHeight };
      const b = { x: link.offsetLeft, y: link.offsetTop, w: link.offsetWidth, h: link.offsetHeight };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: (a.w + b.w) / 2 + Math.abs(b.x - a.x) * 0.45 };
      const lens = document.createElement("span");
      lens.className = "nav-lens";
      lens.setAttribute("aria-hidden", "true");
      Object.assign(lens.style, { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px" });
      nav.append(lens);
      nav.classList.add("lens-moving");
      link.classList.add("is-target");
      const at = (box, w, sx, sy, offset) => Object.assign({ left: box.x + "px", top: box.y + "px", width: w + "px", transform: "scale(" + sx + ", " + sy + ")" }, offset === undefined ? {} : { offset });
      lens.animate([
        at(a, a.w, 1, 1),
        at(a, a.w, 1.08, 1.1, 0.14),                                   /* lifts as it lets go */
        { left: mid.x - (mid.w - (a.w + b.w) / 2) / 2 + "px", top: mid.y + "px", width: mid.w + "px", transform: "scale(1.04, 0.86)", offset: 0.5 }, /* stretches while it travels */
        at(b, b.w, 0.97, 1.06, 0.8),                                   /* lands with a little wobble */
        at(b, b.w, 1, 1)
      ], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0.24, 1)" });
      window.setTimeout(() => {
        root.classList.add("is-navigating");
        try { window.sessionStorage.setItem("tp:lens", "1"); } catch (error) { /* private mode: only the hand-off is less smooth */ }
        window.location.assign(link.href);
      }, 300);
    });
  }

  function initTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light", false);
    cloudBoot();
    /* the header turns into a floating glass capsule once the page scrolls */
    const markScrolled = () => document.documentElement.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", markScrolled, { passive: true });
    markScrolled();
    /* pages slide up under the floating header by exactly its height */
    const header = document.querySelector(".site-header");
    if (header) {
      const measure = () => document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
      measure();
      if ("ResizeObserver" in window) new ResizeObserver(measure).observe(header);
    }
    initNavLens();
    const button = document.getElementById("theme-toggle");
    if (button) button.addEventListener("click", () => switchTheme(button));
    /* A page-to-page transition that gets skipped (hidden tab, quick second click) is not an error. */
    window.addEventListener("pagereveal", (event) => {
      if (event.viewTransition) event.viewTransition.ready.catch(() => {});
    });
    const query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (query && query.addEventListener) {
      query.addEventListener("change", (event) => {
        const saved = storageGet(THEME_KEY).value;
        if (saved !== "light" && saved !== "dark") applyTheme(event.matches ? "dark" : "light", false);
      });
    }
    window.addEventListener("storage", (event) => {
      if (event.key === THEME_KEY && (event.newValue === "light" || event.newValue === "dark")) applyTheme(event.newValue, false);
    });
  }

  /* ---- keep a second tab honest ---- */
  function watchActiveTrip() {
    window.addEventListener("storage", (event) => {
      if (event.key !== TRIP_KEY && event.key !== null) return;
      showNotice("The active trip was changed in another tab.", "warning", { label: "Reload this page", onClick: () => window.location.reload() });
    });
  }

  /* ======================================================================
     Itinerary page.
     Reads the active trip (it never writes it) and keeps this trip's
     activities under localStorage["tp:itinerary:" + trip.id] as
     { version: 1, activities: [{ id, title, date, startTime, duration,
     location, notes }] }. Dates are YYYY-MM-DD strings, start times are
     24-hour HH:MM and durations are hours (0.25 to 24).
     ====================================================================== */
  const STORAGE_PREFIX = "tp:itinerary:";
  const MAX_ACTIVITIES = 5000;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const LIMITS = { title: 100, location: 120, notes: 1000, minHours: 0.25, maxHours: 24 };
  const FIELDS = ["title", "date", "time", "duration", "location", "notes"];
  const MOVE_TITLES = { up: "Move up", down: "Move down", edit: "Edit", delete: "Delete" };

  const $ = (id) => document.getElementById(id);

  const state = {
    trip: null,
    days: [],
    daySet: new Set(),
    activities: [],
    selected: "",
    editingId: "",
    storageKey: "",
    canSave: true,
    conflicts: new Map()
  };
  let timeTouched = false;

  /* ---- small helpers ---- */
  function round2(value) { return Math.round(value * 100) / 100; }

  function toMinutes(time) {
    const match = TIME_PATTERN.exec(time);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  }
  function toTime(total) {
    const safe = ((Math.round(total) % 1440) + 1440) % 1440;
    return String(Math.floor(safe / 60)).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0");
  }
  function clock(minutesOfDay) {
    const date = new Date(2000, 0, 1, 0, 0, 0, 0);
    date.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date).replace(/\s/g, "\u00a0");
  }
  function lengthMinutes(hours) { return Math.max(1, Math.round(hours * 60)); }
  function lengthText(minutes) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return {
      short: (hours ? hours + "h" : "") + (hours && rest ? " " : "") + (rest ? rest + "m" : ""),
      long: (hours ? plural(hours, "hour", "hours") : "") + (hours && rest ? " " : "") + (rest ? plural(rest, "minute", "minutes") : "")
    };
  }
  function startAbs(activity) { return dayNumber(activity.date) * 1440 + toMinutes(activity.startTime); }
  function endAbs(activity) { return startAbs(activity) + lengthMinutes(activity.duration); }
  function timeRange(activity) {
    const start = toMinutes(activity.startTime);
    const end = start + lengthMinutes(activity.duration);
    return {
      start: clock(start),
      end: clock(end % 1440),
      nextDay: end >= 1440
    };
  }
  function shortDay(key) { return formatDate(key, { weekday: "short", month: "short", day: "numeric" }); }
  function longDay(key) { return formatDate(key, { weekday: "long", month: "long", day: "numeric", year: "numeric" }); }

  function findActivity(id) { return state.activities.find((activity) => activity.id === id) || null; }
  function dayList(key) { return state.activities.filter((activity) => activity.date === key); }
  function isOutside(activity) { return !state.daySet.has(activity.date); }
  function outsideList() {
    return state.activities.filter(isOutside).sort((a, b) => startAbs(a) - startAbs(b));
  }
  function cardFor(id) {
    return Array.from(document.querySelectorAll("#day-panel .activity, #outside-list .activity")).find((item) => item.dataset.id === id) || null;
  }
  function isChronological(list) {
    for (let i = 1; i < list.length; i += 1) {
      if (toMinutes(list[i].startTime) < toMinutes(list[i - 1].startTime)) return false;
    }
    return true;
  }
  function ensureIds(list) {
    const seen = new Set();
    list.forEach((activity) => {
      if (!activity.id || seen.has(activity.id)) activity.id = makeId("act");
      seen.add(activity.id);
    });
  }
  function fingerprint(activity) {
    return [activity.title, activity.date, activity.startTime, activity.duration, activity.location, activity.notes].join("\u0001");
  }

  /* ---- one place that decides what a valid activity is (storage and import) ---- */
  function readActivity(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "it is not an activity" };
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) return { error: "the title is empty" };
    if (title.length > LIMITS.title) return { error: "the title is longer than " + LIMITS.title + " characters" };
    if (!parseDate(raw.date)) return { error: "the date must look like 2026-03-04" };
    if (typeof raw.startTime !== "string" || !TIME_PATTERN.test(raw.startTime)) return { error: "the start time must look like 09:30 (24-hour)" };
    const hours = typeof raw.duration === "string" && raw.duration.trim() !== "" ? Number(raw.duration) : raw.duration;
    if (typeof hours !== "number" || !Number.isFinite(hours) || hours < LIMITS.minHours || hours > LIMITS.maxHours) {
      return { error: "the duration must be a number of hours from 0.25 to 24" };
    }
    const location = raw.location === undefined || raw.location === null ? "" : raw.location;
    if (typeof location !== "string") return { error: "the location must be text" };
    if (location.trim().length > LIMITS.location) return { error: "the location is longer than " + LIMITS.location + " characters" };
    const notes = raw.notes === undefined || raw.notes === null ? "" : raw.notes;
    if (typeof notes !== "string") return { error: "the notes must be text" };
    if (notes.trim().length > LIMITS.notes) return { error: "the notes are longer than " + LIMITS.notes + " characters" };
    const id = typeof raw.id === "string" && raw.id.trim() && raw.id.length <= 100 ? raw.id : "";
    return {
      activity: { id, title, date: raw.date, startTime: raw.startTime, duration: round2(hours), location: location.trim(), notes: notes.trim() }
    };
  }

  /* ---- storage ---- */
  function loadActivities() {
    state.activities = [];
    const raw = storageGet(state.storageKey);
    if (!raw.ok) { state.canSave = false; return { problem: "storage", skipped: 0 }; }
    state.canSave = true;
    if (raw.value === null) return { problem: "", skipped: 0 };
    let parsed;
    try { parsed = JSON.parse(raw.value); } catch (error) { return { problem: "unreadable", skipped: 0 }; }
    const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.activities) ? parsed.activities : null;
    if (!list) return { problem: "unreadable", skipped: 0 };
    let skipped = Math.max(0, list.length - MAX_ACTIVITIES);
    list.slice(0, MAX_ACTIVITIES).forEach((item) => {
      const result = readActivity(item);
      if (result.activity) state.activities.push(result.activity);
      else skipped += 1;
    });
    ensureIds(state.activities);
    return { problem: skipped ? "skipped" : "", skipped };
  }

  function save() {
    const ok = storageSet(state.storageKey, JSON.stringify({ version: 1, activities: state.activities }));
    state.canSave = ok;
    renderStorageNote();
    if (!ok) {
      showNotice("This change could not be saved because the browser blocked storage or it is full. Use Export to keep a copy.", "warning");
    }
    return ok;
  }

  function renderStorageNote() {
    $("storage-note").textContent = state.canSave
      ? "Changes save automatically in this browser. Use Export to back up or share this itinerary."
      : "Storage is unavailable, so changes will be lost when you leave this page. Use Export to keep a copy.";
  }

  /* ---- overlaps: every activity against every other, across midnight ---- */
  function computeConflicts() {
    const map = new Map();
    const link = (from, to) => {
      if (!map.has(from.id)) map.set(from.id, []);
      map.get(from.id).push(to);
    };
    const items = state.activities.map((activity) => ({ activity, start: startAbs(activity), end: endAbs(activity) }));
    items.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i - 1; j >= 0; j -= 1) {
        // Nothing lasts longer than 24 hours, so anything that started a day earlier is over.
        if (items[i].start - items[j].start >= 1440) break;
        if (items[j].end > items[i].start) {
          link(items[i].activity, items[j].activity);
          link(items[j].activity, items[i].activity);
        }
      }
    }
    map.forEach((others) => others.sort((a, b) => startAbs(a) - startAbs(b)));
    return map;
  }

  function overlapItem(activity, other) {
    const at = clock(toMinutes(other.startTime));
    return "“" + other.title + "” " + (other.date === activity.date ? "at " + at : "on " + shortDay(other.date) + " at " + at);
  }

  function overlapText(activity, others) {
    if (others.length <= 2) return "Overlaps with " + others.map((other) => overlapItem(activity, other)).join(" and ");
    return "Overlaps with " + overlapItem(activity, others[0]) + ", " + overlapItem(activity, others[1]) + " and " + (others.length - 2) + " more";
  }

  /* ---- rendering ---- */
  function buildTabs() {
    const tabs = $("day-tabs");
    tabs.replaceChildren();
    const today = todayKey();
    state.days.forEach((key, index) => {
      const tab = el("button", "day-tab");
      tab.type = "button";
      tab.id = "day-tab-" + index;
      tab.dataset.date = key;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "day-panel");
      tab.append(el("span", "tab-day", key === today ? "Today" : formatDate(key, { weekday: "short" })));
      const count = el("span", "tab-count");
      count.append(el("span", "tab-count-number"));
      tab.append(count);
      tab.append(el("span", "tab-date", formatDate(key, { month: "short", day: "numeric" })));
      tabs.append(tab);
    });
  }

  // Scrolls only the tab strip (for very long trips), so the page itself never jumps.
  function revealTab(tab) {
    const strip = $("day-tabs");
    const bounds = strip.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    if (box.top < bounds.top) strip.scrollTop -= bounds.top - box.top + 6;
    else if (box.bottom > bounds.bottom) strip.scrollTop += box.bottom - bounds.bottom + 6;
  }

  function updateTabs(scroll) {
    const counts = new Map();
    state.activities.forEach((activity) => counts.set(activity.date, (counts.get(activity.date) || 0) + 1));
    const today = todayKey();
    $("day-tabs").querySelectorAll(".day-tab").forEach((tab, index) => {
      const key = tab.dataset.date;
      const selected = key === state.selected;
      const total = counts.get(key) || 0;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      const badge = tab.querySelector(".tab-count");
      badge.dataset.empty = total ? "false" : "true";
      badge.querySelector(".tab-count-number").textContent = total ? String(total) : "";
      tab.setAttribute("aria-label", "Day " + (index + 1) + ", " + formatDate(key, { weekday: "long", month: "long", day: "numeric" }) +
        (key === today ? ", today" : "") + ", " + (total ? plural(total, "activity", "activities") : "no activities"));
      if (selected && scroll) revealTab(tab);
    });
  }

  function actionButton(name, label, disabled) {
    const button = el("button", "icon-button" + (name === "delete" ? " delete" : ""));
    button.type = "button";
    button.dataset.action = name;
    button.setAttribute("aria-label", label);
    button.title = MOVE_TITLES[name];
    button.disabled = Boolean(disabled);
    button.append(icon(name));
    return button;
  }

  function activityItem(activity, options) {
    const item = el("li", "activity");
    item.dataset.id = activity.id;
    if (state.editingId === activity.id) item.dataset.editing = "true";
    const others = state.conflicts.get(activity.id);
    if (others && others.length) item.dataset.conflict = "true";

    const range = timeRange(activity);
    const length = lengthText(lengthMinutes(activity.duration));
    const time = el("div", "activity-time");
    time.append(el("span", "time-start", range.start));
    time.append(el("span", "time-until", "until " + range.end + (range.nextDay ? " next day" : "")));
    const badge = el("span", "badge time-length");
    const shortLength = el("span", "", length.short);
    shortLength.setAttribute("aria-hidden", "true");
    badge.append(shortLength, el("span", "visually-hidden", length.long));
    time.append(badge);

    const main = el("div", "activity-main");
    main.append(el(options.heading || "h4", "activity-title", activity.title));
    if (options.showDate) main.append(el("p", "activity-date", longDay(activity.date) + " (not a day of this trip)"));
    if (activity.location) {
      const place = el("p", "activity-meta");
      place.append(icon("location"), el("span", "", activity.location));
      main.append(place);
    }
    if (activity.notes) main.append(el("p", "activity-notes", activity.notes));
    if (others && others.length) {
      const flags = el("p", "activity-flags");
      const flag = el("span", "badge badge-amber");
      flag.append(icon("alert"), el("span", "", overlapText(activity, others)));
      flags.append(flag);
      main.append(flags);
    }

    const actions = el("div", "activity-actions");
    if (options.movable && options.total > 1) {
      actions.append(
        actionButton("up", "Move “" + activity.title + "” up", options.position === 0),
        actionButton("down", "Move “" + activity.title + "” down", options.position === options.total - 1)
      );
    }
    actions.append(
      actionButton("edit", "Edit “" + activity.title + "”", false),
      actionButton("delete", "Delete “" + activity.title + "”", false)
    );

    item.append(time, main, actions);
    return item;
  }

  /* A picture of the selected day: one block per activity along a time axis, with overlapping
     ones on separate rows. It repeats what the list below says in words, so it is hidden from
     assistive technology. */
  const HOUR_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
  function hourLabel(minutesOfDay) {
    return HOUR_FORMAT.format(new Date(2000, 0, 1, Math.floor(minutesOfDay / 60), 0, 0, 0)).replace(/\s/g, "\u00a0");
  }
  function renderRibbon(list) {
    const host = $("day-ribbon");
    host.replaceChildren();
    host.hidden = list.length === 0;
    if (!list.length) return;
    const blocks = list.map((activity) => {
      const start = toMinutes(activity.startTime);
      return { activity, start, end: start + lengthMinutes(activity.duration), lane: 0 };
    }).sort((a, b) => a.start - b.start || a.end - b.end);
    const from = Math.floor(blocks[0].start / 60) * 60;
    const until = Math.max(from + 240, Math.ceil(Math.max.apply(null, blocks.map((block) => block.end)) / 60) * 60);
    const span = until - from;
    /* Rows: each activity takes the first row that is free when it starts (three rows at most). */
    const rowEnds = [];
    blocks.forEach((block) => {
      let lane = rowEnds.findIndex((end) => end <= block.start);
      if (lane < 0) lane = rowEnds.length < 3 ? rowEnds.length : rowEnds.indexOf(Math.min.apply(null, rowEnds));
      rowEnds[lane] = Math.max(rowEnds[lane] || 0, block.end);
      block.lane = lane;
    });
    const track = el("div", "ribbon-track");
    track.style.setProperty("--lanes", String(rowEnds.length));
    const axis = el("div", "ribbon-axis");
    const step = span <= 360 ? 60 : span <= 720 ? 120 : span <= 1080 ? 180 : 240;
    for (let minute = from; minute <= until; minute += step) {
      const at = ((minute - from) / span * 100).toFixed(2) + "%";
      const line = el("i", "ribbon-line");
      line.style.left = at;
      track.append(line);
      const tick = el("span", "ribbon-tick" + (minute === until ? " is-end" : ""), hourLabel(minute % 1440));
      tick.style.left = at;
      axis.append(tick);
    }
    let clash = false;
    blocks.forEach((block) => {
      const mark = el("span", "ribbon-block");
      const range = timeRange(block.activity);
      mark.title = block.activity.title + ": " + range.start + " to " + range.end + (range.nextDay ? " next day" : "");
      if (state.conflicts.has(block.activity.id)) { mark.dataset.conflict = "true"; clash = true; }
      mark.style.left = ((block.start - from) / span * 100).toFixed(2) + "%";
      mark.style.width = "calc(" + ((block.end - block.start) / span * 100).toFixed(2) + "% - 2px)";
      mark.style.setProperty("--lane", String(block.lane));
      track.append(mark);
    });
    host.append(track, axis);
    if (clash) {
      const key = el("p", "ribbon-key");
      key.append(el("i", ""), document.createTextNode("Overlapping"));
      host.append(key);
    }
  }

  function renderDay() {
    const key = state.selected;
    const index = state.days.indexOf(key);
    const list = dayList(key);
    $("selected-day-label").textContent = "Day " + (index + 1) + " of " + state.days.length;
    $("selected-day-date").textContent = longDay(key);
    const minutes = list.reduce((sum, activity) => sum + lengthMinutes(activity.duration), 0);
    const overlapping = list.filter((activity) => state.conflicts.has(activity.id)).length;
    let summary = list.length ? plural(list.length, "activity", "activities") + " · " + lengthText(minutes).short + " planned" : "Nothing planned yet";
    if (overlapping) summary += " · " + plural(overlapping, "activity overlaps", "activities overlap");
    $("day-summary").textContent = summary;
    $("day-tools").hidden = isChronological(list);
    const ul = $("activity-list");
    ul.replaceChildren();
    const inOrder = isChronological(list);
    let busyUntil = -1;
    list.forEach((activity, position) => {
      const item = activityItem(activity, { heading: "h4", movable: true, position, total: list.length });
      const start = toMinutes(activity.startTime);
      /* Free time since everything earlier finished (only meaningful while the day is in time order). */
      if (inOrder && busyUntil >= 0 && start - busyUntil >= 15) {
        const free = lengthText(start - busyUntil);
        const note = el("p", "gap-note");
        const seen = el("span", "", free.short + " free");
        seen.setAttribute("aria-hidden", "true");
        note.append(seen, el("span", "visually-hidden", free.long + " free before this activity."));
        item.classList.add("has-gap");
        item.prepend(note);
      }
      busyUntil = Math.max(busyUntil, start + lengthMinutes(activity.duration));
      ul.append(item);
    });
    renderRibbon(list);
    ul.hidden = list.length === 0;
    $("empty-day").hidden = list.length > 0;
    $("day-panel").setAttribute("aria-labelledby", "day-tab-" + index);
  }

  function renderOutside() {
    const list = outsideList();
    const ul = $("outside-list");
    ul.replaceChildren();
    list.forEach((activity) => ul.append(activityItem(activity, { heading: "h3", movable: false, showDate: true })));
    $("outside-count").textContent = String(list.length);
    $("outside-section").hidden = list.length === 0;
  }

  function renderTotals() {
    const inside = state.activities.filter((activity) => !isOutside(activity));
    const minutes = inside.reduce((sum, activity) => sum + lengthMinutes(activity.duration), 0);
    const days = plural(state.days.length, "day", "days");
    $("trip-total").textContent = inside.length
      ? days + " · " + plural(inside.length, "activity", "activities") + " · " + lengthText(minutes).short + " planned"
      : days + " · nothing planned yet";
  }

  function refresh() {
    state.conflicts = computeConflicts();
    updateTabs(false);
    renderDay();
    renderOutside();
    renderTotals();
  }

  /* ---- selecting a day ---- */
  function selectDay(key, focusTab) {
    if (!state.daySet.has(key)) return;
    state.selected = key;
    updateTabs(true);
    renderDay();
    if (!state.editingId) {
      $("activity-date").value = key;
      if (!timeTouched) $("activity-time").value = suggestTime(key);
    }
    if (focusTab) {
      const tab = $("day-tabs").querySelector('.day-tab[aria-selected="true"]');
      if (tab) tab.focus();
    }
  }

  function onTabKeydown(event) {
    const current = event.target.closest(".day-tab");
    if (!current) return;
    const tabs = Array.from($("day-tabs").querySelectorAll(".day-tab"));
    const index = tabs.indexOf(current);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    selectDay(tabs[next].dataset.date, true);
  }

  /* ---- the form ---- */
  function buildDateOptions() {
    const select = $("activity-date");
    select.replaceChildren();
    state.days.forEach((key) => {
      const option = el("option", "", shortDay(key));
      option.value = key;
      select.append(option);
    });
  }

  function clearTempOption() {
    const temp = $("activity-date").querySelector("option[data-temp]");
    if (temp) temp.remove();
  }

  function setFormDate(key) {
    const select = $("activity-date");
    clearTempOption();
    if (!state.daySet.has(key)) {
      const option = el("option", "", formatDate(key, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " (not a day of this trip)");
      option.value = key;
      option.dataset.temp = "true";
      select.prepend(option);
    }
    select.value = key;
  }

  function suggestTime(key) {
    let latest = -1;
    dayList(key).forEach((activity) => {
      const end = toMinutes(activity.startTime) + lengthMinutes(activity.duration);
      if (end > latest) latest = end;
    });
    return latest > 0 && latest < 1440 ? toTime(latest) : "09:00";
  }

  function setFieldError(name, message) {
    const input = $("activity-" + name);
    const error = $("activity-" + name + "-error");
    if (message) {
      error.textContent = message;
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
    } else {
      error.textContent = "";
      error.hidden = true;
      input.removeAttribute("aria-invalid");
    }
  }
  function clearErrors() {
    FIELDS.forEach((name) => setFieldError(name, ""));
    const box = $("form-error");
    box.textContent = "";
    box.hidden = true;
  }
  function showFormError(message) {
    const box = $("form-error");
    box.textContent = message;
    box.hidden = false;
  }
  function setStatus(message) { $("form-status").textContent = message; }

  function resetForm() {
    state.editingId = "";
    $("activity-form").reset();
    clearErrors();
    setStatus("");
    setFormDate(state.selected);
    $("activity-time").value = suggestTime(state.selected);
    timeTouched = false;
    $("form-title").textContent = "Add an activity";
    $("form-sub").textContent = "It joins the selected day in time order.";
    $("save-activity").textContent = "Add activity";
    $("cancel-edit").hidden = true;
  }

  function beginEdit(activity) {
    state.editingId = activity.id;
    clearErrors();
    setStatus("");
    $("activity-title").value = activity.title;
    setFormDate(activity.date);
    $("activity-time").value = activity.startTime;
    timeTouched = true;
    $("activity-duration").value = String(activity.duration);
    $("activity-location").value = activity.location;
    $("activity-notes").value = activity.notes;
    $("form-title").textContent = "Edit activity";
    $("form-sub").textContent = "Press Save changes when you are done.";
    $("save-activity").textContent = "Save changes";
    $("cancel-edit").hidden = false;
    document.querySelectorAll(".activity[data-editing]").forEach((item) => item.removeAttribute("data-editing"));
    const card = cardFor(activity.id);
    if (card) card.dataset.editing = "true";
    $("activity-title").focus();
  }

  function cancelEdit() {
    const id = state.editingId;
    resetForm();
    document.querySelectorAll(".activity[data-editing]").forEach((item) => item.removeAttribute("data-editing"));
    announce("Editing cancelled.");
    const card = id ? cardFor(id) : null;
    const button = card && card.querySelector('[data-action="edit"]');
    if (button) button.focus();
    else $("activity-title").focus();
  }

  function validateForm(values) {
    const errors = {};
    if (!values.title) errors.title = "Enter a name for this activity.";
    else if (values.title.length > LIMITS.title) errors.title = "Use " + LIMITS.title + " characters or fewer.";
    const editing = state.editingId ? findActivity(state.editingId) : null;
    if (!values.date) errors.date = "Choose a day.";
    else if (!state.daySet.has(values.date) && !(editing && editing.date === values.date)) errors.date = "Choose a day that is part of this trip.";
    if (!TIME_PATTERN.test(values.startTime)) errors.time = "Choose a start time.";
    const hours = Number(values.durationText);
    if (values.durationText === "" || !Number.isFinite(hours)) errors.duration = "Enter the duration in hours.";
    else if (hours < LIMITS.minHours) errors.duration = "It must last at least 0.25 hours (15 minutes).";
    else if (hours > LIMITS.maxHours) errors.duration = "It can't last longer than 24 hours.";
    if (values.location.length > LIMITS.location) errors.location = "Use " + LIMITS.location + " characters or fewer.";
    if (values.notes.length > LIMITS.notes) errors.notes = "Use " + LIMITS.notes + " characters or fewer.";
    return { errors, hours };
  }

  // Places an activity at the end of its day's chronological run (before the first later one).
  function insertChronologically(list, activity) {
    const start = toMinutes(activity.startTime);
    let at = -1;
    let last = -1;
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].date !== activity.date) continue;
      last = i;
      if (at < 0 && toMinutes(list[i].startTime) > start) at = i;
    }
    if (at < 0) at = last >= 0 ? last + 1 : list.length;
    list.splice(at, 0, activity);
  }

  function onSubmit(event) {
    event.preventDefault();
    clearErrors();
    setStatus("");
    const values = {
      title: $("activity-title").value.trim(),
      date: $("activity-date").value,
      startTime: $("activity-time").value,
      durationText: $("activity-duration").value.trim(),
      location: $("activity-location").value.trim(),
      notes: $("activity-notes").value.trim()
    };
    const result = validateForm(values);
    const names = FIELDS.filter((name) => result.errors[name]);
    if (names.length) {
      names.forEach((name) => setFieldError(name, result.errors[name]));
      $("activity-" + names[0]).focus();
      return;
    }
    const data = {
      title: values.title,
      date: values.date,
      startTime: values.startTime,
      duration: round2(result.hours),
      location: values.location,
      notes: values.notes
    };
    if (state.editingId) updateActivity(state.editingId, data);
    else addActivity(data);
  }

  function addActivity(data) {
    if (state.activities.length >= MAX_ACTIVITIES) {
      showFormError("This itinerary already has the most activities it can hold (" + MAX_ACTIVITIES.toLocaleString() + "). Delete some first.");
      return;
    }
    const activity = Object.assign({ id: makeId("act") }, data);
    insertChronologically(state.activities, activity);
    save();
    state.selected = activity.date;
    refresh();
    updateTabs(true);
    resetForm();
    setStatus("Added “" + activity.title + "” to " + shortDay(activity.date) + ".");
    $("activity-title").focus();
  }

  function updateActivity(id, data) {
    const index = state.activities.findIndex((activity) => activity.id === id);
    if (index < 0) {
      resetForm();
      refresh();
      showNotice("That activity no longer exists, so nothing was changed.", "warning");
      return;
    }
    const activity = state.activities[index];
    const moved = activity.date !== data.date || activity.startTime !== data.startTime;
    Object.assign(activity, data);
    if (moved) {
      state.activities.splice(index, 1);
      insertChronologically(state.activities, activity);
    }
    save();
    if (state.daySet.has(activity.date)) state.selected = activity.date;
    resetForm();
    refresh();
    updateTabs(true);
    setStatus("Saved changes to “" + activity.title + "”.");
    const card = cardFor(activity.id);
    const button = card && card.querySelector('[data-action="edit"]');
    if (button) button.focus();
  }

  function removeActivity(activity) {
    const id = activity.id;
    const wasOutside = isOutside(activity);
    confirmDialog({
      title: "Delete this activity?",
      message: "“" + activity.title + "” will be removed from your itinerary. This can't be undone.",
      confirmLabel: "Delete activity",
      danger: true
    }).then((confirmed) => {
      if (!confirmed) return;
      const index = state.activities.findIndex((item) => item.id === id);
      if (index < 0) return;
      const removed = state.activities.splice(index, 1)[0];
      if (state.editingId === id) resetForm();
      save();
      refresh();
      announce("Deleted “" + removed.title + "”.");
      const target = wasOutside && !$("outside-section").hidden ? $("outside-title") : $("selected-day-date");
      target.focus();
    });
  }

  function moveActivity(activity, step) {
    const list = dayList(activity.date);
    const index = list.indexOf(activity);
    const other = list[index + step];
    if (!other) return;
    const a = state.activities.indexOf(activity);
    const b = state.activities.indexOf(other);
    state.activities[a] = other;
    state.activities[b] = activity;
    save();
    refresh();
    const position = index + step + 1;
    announce("Moved “" + activity.title + "” " + (step < 0 ? "up" : "down") + ". It is now number " + position + " of " + list.length + " on this day.");
    const card = cardFor(activity.id);
    if (!card) return;
    const wanted = step < 0 ? "up" : "down";
    let button = card.querySelector('[data-action="' + wanted + '"]');
    if (!button || button.disabled) button = card.querySelector('[data-action="' + (wanted === "up" ? "down" : "up") + '"]');
    if (button) button.focus();
  }

  function sortDay() {
    const key = state.selected;
    const sorted = dayList(key).sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    const slots = [];
    state.activities.forEach((activity, index) => { if (activity.date === key) slots.push(index); });
    slots.forEach((slot, position) => { state.activities[slot] = sorted[position]; });
    save();
    refresh();
    announce("This day is now in start-time order.");
    $("selected-day-date").focus();
  }

  function onListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const item = button.closest(".activity");
    const activity = item ? findActivity(item.dataset.id) : null;
    if (!activity) return;
    const action = button.dataset.action;
    if (action === "edit") beginEdit(activity);
    else if (action === "delete") removeActivity(activity);
    else moveActivity(activity, action === "up" ? -1 : 1);
  }

  function onFormInput(event) {
    const id = event.target.id || "";
    if (id === "activity-time") timeTouched = true;
    const name = id.replace(/^activity-/, "");
    if (FIELDS.indexOf(name) >= 0) setFieldError(name, "");
    setStatus("");
  }

  /* ---- export / import ---- */
  function exportJson() {
    const payload = {
      version: 1,
      tripId: state.trip.id,
      tripTitle: state.trip.title,
      exportedAt: new Date().toISOString(),
      activities: state.activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        date: activity.date,
        startTime: activity.startTime,
        duration: activity.duration,
        location: activity.location,
        notes: activity.notes
      }))
    };
    downloadText("itinerary-" + slugify(state.trip.title, "trip") + "-" + todayKey() + ".json", JSON.stringify(payload, null, 2));
    showNotice(
      state.activities.length ? "Exported " + plural(state.activities.length, "activity", "activities") + " as a JSON file." : "Exported an empty itinerary as a JSON file.",
      "success"
    );
  }

  function readFileText(file) {
    if (typeof file.text === "function") return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function parseImport(text) {
    let data;
    try { data = JSON.parse(text); } catch (error) { return { error: "This file is not valid JSON." }; }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "This does not look like an itinerary export." };
    if (data.version !== undefined && data.version !== 1) return { error: "This file uses format version " + String(data.version).slice(0, 20) + ", which this page can't read." };
    if (!Array.isArray(data.activities)) return { error: "This does not look like an itinerary export: it has no activities list." };
    if (data.activities.length > MAX_ACTIVITIES) return { error: "This file has more than " + MAX_ACTIVITIES.toLocaleString() + " activities." };
    const activities = [];
    for (let i = 0; i < data.activities.length; i += 1) {
      const result = readActivity(data.activities[i]);
      if (result.error) return { error: "Activity " + (i + 1) + " can't be imported because " + result.error + "." };
      activities.push(result.activity);
    }
    return {
      activities,
      tripId: typeof data.tripId === "string" ? data.tripId : "",
      tripTitle: typeof data.tripTitle === "string" ? data.tripTitle.slice(0, 100) : ""
    };
  }

  function onImportFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showNotice("That file is larger than 2 MB, so it can't be an itinerary export. Nothing was changed.", "warning");
      return;
    }
    readFileText(file).then(handleImport).catch(() => {
      showNotice("That file could not be read. Nothing was changed.", "warning");
    });
  }

  function handleImport(text) {
    const parsed = parseImport(text);
    if (parsed.error) {
      showNotice(parsed.error + " Nothing was changed.", "warning");
      return;
    }
    const incoming = parsed.activities;
    if (!incoming.length) {
      showNotice("That file has no activities, so there was nothing to import.", "info");
      return;
    }
    const existing = state.activities.length;
    const foreign = Boolean(parsed.tripId) && parsed.tripId !== state.trip.id;
    const source = foreign && parsed.tripTitle ? " It was exported from “" + parsed.tripTitle + "”." : foreign ? " It was exported from a different trip." : "";
    if (!existing && !foreign) {
      applyImport(incoming, "merge");
      return;
    }
    const count = plural(incoming.length, "activity", "activities");
    choiceDialog({
      title: "Import " + count + "?",
      message: existing
        ? "You already have " + plural(existing, "activity", "activities") + ". Merge adds the ones from the file and skips any you already have. Replace deletes your current activities first." + source
        : "The file has " + count + "." + source + " Add them to this trip?",
      choices: existing
        ? [{ value: "merge", label: "Merge" }, { value: "replace", label: "Replace all", danger: true }]
        : [{ value: "merge", label: "Import" }]
    }).then((choice) => {
      if (!choice) { announce("Import cancelled."); return; }
      applyImport(incoming, choice);
    });
  }

  function applyImport(incoming, mode) {
    const wasEmpty = state.activities.length === 0;
    const keepFileOrder = mode === "replace" || wasEmpty;
    const next = mode === "replace" ? [] : state.activities.slice();
    const ids = new Set(next.map((activity) => activity.id));
    const seen = new Set(next.map(fingerprint));
    let added = 0;
    let skipped = 0;
    incoming.forEach((activity) => {
      if (mode !== "replace" && seen.has(fingerprint(activity))) { skipped += 1; return; }
      const copy = Object.assign({}, activity);
      if (!copy.id || ids.has(copy.id)) copy.id = makeId("act");
      ids.add(copy.id);
      seen.add(fingerprint(copy));
      if (keepFileOrder) next.push(copy);
      else insertChronologically(next, copy);
      added += 1;
    });
    if (next.length > MAX_ACTIVITIES) {
      showNotice("Importing would take this itinerary past " + MAX_ACTIVITIES.toLocaleString() + " activities. Nothing was changed.", "warning");
      return;
    }
    state.activities = next;
    resetForm();
    save();
    refresh();
    const outside = outsideList().length;
    let message = mode === "replace" && !wasEmpty
      ? "Replaced your itinerary with " + plural(added, "activity", "activities") + " from the file."
      : "Imported " + plural(added, "activity", "activities") + (skipped ? " and skipped " + skipped + " you already had" : "") + ".";
    if (outside) message += " " + plural(outside, "activity falls", "activities fall") + " outside the trip dates and " + (outside === 1 ? "is" : "are") + " listed under the schedule.";
    showNotice(message, outside ? "warning" : "success");
  }

  /* ---- print ---- */
  function printTable(list, withDate) {
    const table = el("table", "print-table" + (withDate ? " print-table-dated" : ""));
    const head = el("tr");
    (withDate ? ["Date", "Time", "Activity", "Location", "Notes"] : ["Time", "Activity", "Location", "Notes"]).forEach((label) => {
      const th = el("th", "", label);
      th.scope = "col";
      head.append(th);
    });
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const body = el("tbody");
    list.forEach((activity) => {
      const row = el("tr");
      const range = timeRange(activity);
      if (withDate) row.append(el("td", "", shortDay(activity.date)));
      row.append(el("td", "", range.start + " to " + range.end + (range.nextDay ? " (next day)" : "")));
      const title = el("td");
      title.append(el("strong", "", activity.title));
      const others = state.conflicts.get(activity.id);
      if (others && others.length) title.append(el("span", "print-note", overlapText(activity, others)));
      row.append(title, el("td", "", activity.location), el("td", "print-notes", activity.notes));
      body.append(row);
    });
    table.append(body);
    return table;
  }

  function renderPrint() {
    const root = $("print-itinerary");
    root.replaceChildren();
    if (!state.trip) return;
    const trip = state.trip;
    const head = el("header", "print-head");
    head.append(el("h2", "", trip.title));
    head.append(el("p", "print-sub", trip.destination + " · " + formatRange(trip.startDate, trip.endDate) + " · " + plural(trip.travelers, "traveler", "travelers")));
    root.append(head);
    state.days.forEach((key, index) => {
      const section = el("section", "print-day");
      section.append(el("h3", "", "Day " + (index + 1) + " · " + longDay(key)));
      const list = dayList(key);
      section.append(list.length ? printTable(list, false) : el("p", "print-empty", "Nothing planned."));
      root.append(section);
    });
    const outside = outsideList();
    if (outside.length) {
      const section = el("section", "print-day");
      section.append(el("h3", "", "Outside the trip dates"));
      section.append(printTable(outside, true));
      root.append(section);
    }
  }

  /* ---- other tabs ---- */
  function reloadFromStorage() {
    resetForm();
    loadActivities();
    state.conflicts = computeConflicts();
    refresh();
    renderStorageNote();
    hideNotice();
    announce("Loaded the latest itinerary.");
  }

  function onStorage(event) {
    if (event.key !== state.storageKey && event.key !== null) return;
    showNotice("This itinerary was changed in another tab.", "warning", { label: "Load the latest", onClick: reloadFromStorage });
  }

  /* ---- start ---- */
  function showEmptyTrip(status) {
    $("itinerary-app").hidden = true;
    $("no-trip").hidden = false;
    if (status === "invalid") {
      $("no-trip-text").textContent = "The saved trip is incomplete or damaged, so it can't be used. Create it again on Explore and your itinerary will be ready here.";
    } else if (status === "unavailable") {
      $("no-trip-text").textContent = "This browser is blocking site storage, so the trip can't be loaded. Allow storage for this site, then reload.";
      showNotice("Site storage is blocked in this browser, so your trip and plans can't be loaded or saved.", "warning");
    }
  }

  function reportLoad(loaded) {
    if (loaded.problem === "storage") {
      showNotice("Site storage is blocked in this browser. You can still plan here, but nothing will be saved. Use Export to keep a copy.", "warning");
    } else if (loaded.problem === "unreadable") {
      showNotice("The saved itinerary for this trip could not be read, so you are starting fresh. Your first change will replace the unreadable data.", "warning");
    } else if (loaded.problem === "skipped") {
      showNotice(plural(loaded.skipped, "saved activity was", "saved activities were") + " incomplete or invalid and left out.", "warning");
    } else {
      const outside = outsideList().length;
      if (outside) {
        showNotice(plural(outside, "activity falls", "activities fall") + " outside the trip dates. " + (outside === 1 ? "It is" : "They are") + " kept in a separate list below the schedule.", "warning", {
          label: "Show " + (outside === 1 ? "it" : "them"),
          onClick: () => { $("outside-title").focus(); }
        });
      }
    }
  }

  function wire() {
    $("day-tabs").addEventListener("click", (event) => {
      const tab = event.target.closest(".day-tab");
      if (tab) selectDay(tab.dataset.date, false);
    });
    $("day-tabs").addEventListener("keydown", onTabKeydown);
    $("day-panel").addEventListener("click", onListClick);
    $("outside-list").addEventListener("click", onListClick);
    $("sort-day").addEventListener("click", sortDay);
    $("empty-add").addEventListener("click", () => { $("activity-title").focus(); });
    const form = $("activity-form");
    form.addEventListener("submit", onSubmit);
    form.addEventListener("input", onFormInput);
    $("cancel-edit").addEventListener("click", cancelEdit);
    $("jump-add").addEventListener("click", () => { $("activity-title").focus(); });
    $("import-button").addEventListener("click", () => { $("import-file").click(); });
    $("import-file").addEventListener("change", onImportFile);
    $("export-button").addEventListener("click", exportJson);
    $("print-button").addEventListener("click", () => { renderPrint(); window.print(); });
    window.addEventListener("beforeprint", renderPrint);
    window.addEventListener("afterprint", () => { $("print-itinerary").replaceChildren(); });
    window.addEventListener("storage", onStorage);
  }

  function start() {
    initTheme();
    wireNotice();
    const result = readActiveTrip();
    watchActiveTrip();
    if (result.status !== "ok") {
      showEmptyTrip(result.status);
      return;
    }
    const trip = result.trip;
    state.trip = trip;
    state.days = daysBetween(trip.startDate, trip.endDate);
    state.daySet = new Set(state.days);
    state.storageKey = STORAGE_PREFIX + trip.id;
    $("no-trip").hidden = true;
    $("itinerary-app").hidden = false;
    fillTripStrip(trip);
    const loaded = loadActivities();
    const today = todayKey();
    state.selected = state.daySet.has(today) ? today : state.days[0];
    buildTabs();
    buildDateOptions();
    resetForm();
    refresh();
    updateTabs(true);
    renderStorageNote();
    wire();
    reportLoad(loaded);
  }

  start();
})();
