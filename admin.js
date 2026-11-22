/* TravelTogether: Admin script.
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

  /* photos kept in the repository (photos/<id>.jpg); generated by the build from the files present */
  const LOCAL_PHOTOS = new Set(["bali", "banff", "bangkok", "cairo", "cape-town", "cusco", "lisbon", "marrakech", "new-york", "paris", "reykjavik", "rio", "rome", "samarkand", "santorini", "seoul", "sydney", "tokyo"]);

  /* ======================================================================
     Bundled destination data
     Costs are SAMPLE numbers for planning: rounded, mid-range, per person
     per day, in the destination's own currency. They are not live prices.
     ====================================================================== */
  const REGIONS = ["Europe", "Asia", "Africa & Middle East", "North America", "South America", "Oceania"];

  const ACTIVITIES = [
    { id: "beach", label: "Beaches" },
    { id: "culture", label: "History & culture" },
    { id: "food", label: "Food" },
    { id: "nature", label: "Nature" },
    { id: "adventure", label: "Adventure" },
    { id: "city", label: "City life" },
    { id: "relax", label: "Relaxation" }
  ];

  const COST_LEVELS = { 1: "Budget-friendly", 2: "Moderate", 3: "Higher", 4: "Splurge" };
  const COST_ROWS = [
    { key: "stay", label: "Stay (half of a shared mid-range room)" },
    { key: "food", label: "Food and drink" },
    { key: "transport", label: "Local transport" },
    { key: "activities", label: "Sights and activities" }
  ];

  const DESTINATIONS = [
    {
      id: "paris", name: "Paris", country: "France", region: "Europe", activities: ["culture", "food", "city"],
      blurb: "Museums, café terraces and river walks in a city that rewards slow wandering. Neighborhoods feel like small towns, so pick two or three and go deep.",
      highlights: ["Louvre and Musée d'Orsay", "Seine riverside walks", "Montmartre and Sacré-Cœur", "Bakeries, bistros and street markets"],
      bestTime: "April to June, September to October", idealStay: "4 to 6 days", currency: "EUR", costLevel: 3,
      costs: { stay: 85, food: 55, transport: 10, activities: 30 }
    },
    {
      id: "rome", name: "Rome", country: "Italy", region: "Europe", activities: ["culture", "food", "city"],
      blurb: "Ancient ruins, baroque fountains and long lunches within walking distance of each other. Start early to beat the crowds, then take the afternoon slowly.",
      highlights: ["Colosseum and Roman Forum", "Vatican Museums and St. Peter's Basilica", "Dinner in Trastevere", "Trevi Fountain at night"],
      bestTime: "April to May, September to October", idealStay: "4 to 5 days", currency: "EUR", costLevel: 2,
      costs: { stay: 70, food: 45, transport: 8, activities: 25 }
    },
    {
      id: "lisbon", name: "Lisbon", country: "Portugal", region: "Europe", activities: ["city", "food", "culture"],
      blurb: "Hilly, tiled and sun-washed, with river views around every corner. Good food is inexpensive, and the Atlantic coast is a short train ride away.",
      highlights: ["Alfama and its viewpoints", "Tram 28 and tiled facades", "Belém: Jerónimos Monastery and the tower", "Pastéis de nata and grilled seafood"],
      bestTime: "March to May, September to October", idealStay: "3 to 5 days", currency: "EUR", costLevel: 2,
      costs: { stay: 55, food: 35, transport: 6, activities: 20 }
    },
    {
      id: "santorini", name: "Santorini", country: "Greece", region: "Europe", activities: ["beach", "relax"],
      blurb: "Whitewashed villages on the rim of a flooded volcano. Come for the sunsets, stay for the beaches and the local wine.",
      highlights: ["Caldera views at Oia and Fira", "Red Beach and Perissa black-sand beach", "Boat trip around the volcano", "Winery visits and sunset dinners"],
      bestTime: "May to June, September to October", idealStay: "3 to 5 days", currency: "EUR", costLevel: 3,
      costs: { stay: 100, food: 50, transport: 12, activities: 35 }
    },
    {
      id: "reykjavik", name: "Reykjavik", country: "Iceland", region: "Europe", activities: ["nature", "adventure", "relax"],
      blurb: "A small, colorful capital that doubles as a base for glaciers, geysers and hot springs. Daylight swings from nearly endless to a few hours depending on the season.",
      highlights: ["Golden Circle: Thingvellir, Geysir, Gullfoss", "Geothermal lagoons", "Northern lights, September to March", "South coast waterfalls and black-sand beaches"],
      bestTime: "June to August for long days, September to March for auroras", idealStay: "4 to 6 days", currency: "ISK", costLevel: 4,
      costs: { stay: 20000, food: 11000, transport: 4000, activities: 12000 }
    },
    {
      id: "tokyo", name: "Tokyo", country: "Japan", region: "Asia", activities: ["city", "food", "culture"],
      blurb: "A huge, orderly city where every neighborhood has its own character. Built for food-driven days, late nights and effortless transit.",
      highlights: ["Senso-ji in Asakusa", "Shibuya Crossing and Shinjuku", "Tsukiji Outer Market", "Day trip to Nikko or Kamakura"],
      bestTime: "March to May, October to November", idealStay: "5 to 7 days", currency: "JPY", costLevel: 3,
      costs: { stay: 9000, food: 5500, transport: 1200, activities: 2500 }
    },
    {
      id: "seoul", name: "Seoul", country: "South Korea", region: "Asia", activities: ["city", "food", "culture"],
      blurb: "Palaces, mountains and a round-the-clock food scene in one compact capital. The subway and your own feet cover almost everything.",
      highlights: ["Gyeongbokgung Palace", "Bukchon Hanok Village", "Gwangjang Market", "Namsan or Bukhansan hikes"],
      bestTime: "April to June, September to November", idealStay: "3 to 5 days", currency: "KRW", costLevel: 2,
      costs: { stay: 60000, food: 40000, transport: 8000, activities: 20000 }
    },
    {
      id: "bangkok", name: "Bangkok", country: "Thailand", region: "Asia", activities: ["food", "culture", "city"],
      blurb: "Fast, hot and full of flavor, with golden temples beside street food carts. River boats are the best way to escape the traffic.",
      highlights: ["Grand Palace and Wat Pho", "Chao Phraya river boats", "Street food and night markets", "Chatuchak Weekend Market"],
      bestTime: "November to February", idealStay: "3 to 5 days", currency: "THB", costLevel: 1,
      costs: { stay: 1100, food: 700, transport: 200, activities: 500 }
    },
    {
      id: "bali", name: "Bali", country: "Indonesia", region: "Asia", activities: ["beach", "nature", "relax"],
      blurb: "Rice terraces, temple gates and surf beaches on one island. Choose a base (Ubud, Canggu or Uluwatu) and keep the transfers short.",
      highlights: ["Tegallalang rice terraces", "Uluwatu Temple at sunset", "Surf lessons at Canggu", "Yoga, spas and cooking classes in Ubud"],
      bestTime: "April to October (dry season)", idealStay: "5 to 8 days", currency: "IDR", costLevel: 1,
      costs: { stay: 500000, food: 250000, transport: 150000, activities: 300000 }
    },
    {
      id: "samarkand", name: "Samarkand", country: "Uzbekistan", region: "Asia", activities: ["culture", "food"],
      blurb: "A Silk Road crossroads of turquoise domes and tiled courtyards. Easy to cover on foot in a few unhurried days.",
      highlights: ["Registan Square", "Shah-i-Zinda necropolis", "Bibi-Khanym Mosque", "Plov and fresh bread at Siyob Bazaar"],
      bestTime: "April to June, September to October", idealStay: "2 to 4 days", currency: "UZS", costLevel: 1,
      costs: { stay: 250000, food: 120000, transport: 40000, activities: 100000 }
    },
    {
      id: "marrakech", name: "Marrakech", country: "Morocco", region: "Africa & Middle East", activities: ["culture", "food"],
      blurb: "A walled medina of souks, riads and courtyards with the Atlas Mountains on the horizon. Plan quiet afternoons, because the evenings are lively.",
      highlights: ["Jemaa el-Fnaa at dusk", "Souks and artisan workshops", "Majorelle Garden", "Atlas Mountains day trip"],
      bestTime: "March to May, October to November", idealStay: "3 to 4 days", currency: "MAD", costLevel: 1,
      costs: { stay: 350, food: 220, transport: 60, activities: 150 }
    },
    {
      id: "cairo", name: "Cairo", country: "Egypt", region: "Africa & Middle East", activities: ["culture"],
      blurb: "The pyramids at Giza are the headline, but the old city and the Nile give the days their rhythm. Go early, because midday heat is serious.",
      highlights: ["Pyramids of Giza and the Sphinx", "Museums such as the Egyptian Museum", "Khan el-Khalili bazaar", "Felucca ride on the Nile at sunset"],
      bestTime: "October to April", idealStay: "3 to 4 days", currency: "EGP", costLevel: 1,
      costs: { stay: 1200, food: 700, transport: 250, activities: 600 }
    },
    {
      id: "cape-town", name: "Cape Town", country: "South Africa", region: "Africa & Middle East", activities: ["nature", "adventure", "beach"],
      blurb: "Mountain, ocean and vineyards within a short drive of the city center. Wind and weather change fast, so keep plans flexible.",
      highlights: ["Table Mountain by cable car or trail", "Cape Peninsula drive to Cape Point", "Stellenbosch and Franschhoek wine day trip", "Penguins at Boulders Beach"],
      bestTime: "November to March", idealStay: "5 to 7 days", currency: "ZAR", costLevel: 2,
      costs: { stay: 900, food: 550, transport: 250, activities: 500 }
    },
    {
      id: "new-york", name: "New York", country: "United States", region: "North America", activities: ["city", "culture", "food"],
      blurb: "Five boroughs of museums, parks, neighborhoods and food from everywhere. Group each day by borough to avoid crisscrossing the subway.",
      highlights: ["Central Park and the High Line", "Museums such as the Met and MoMA", "Walking the Brooklyn Bridge", "Pizza slices, delis and Broadway"],
      bestTime: "April to June, September to November", idealStay: "4 to 6 days", currency: "USD", costLevel: 4,
      costs: { stay: 150, food: 80, transport: 15, activities: 50 }
    },
    {
      id: "banff", name: "Banff", country: "Canada", region: "North America", activities: ["nature", "adventure", "relax"],
      blurb: "Turquoise lakes under jagged peaks, with a small mountain town as your base. Summer is for hiking and canoes, winter for skiing and hot springs.",
      highlights: ["Moraine Lake and Lake Louise", "Banff Gondola and Sulphur Mountain", "Icefields Parkway drive", "Soaking in the Banff Upper Hot Springs"],
      bestTime: "June to September, December to March", idealStay: "4 to 6 days", currency: "CAD", costLevel: 3,
      costs: { stay: 130, food: 65, transport: 20, activities: 55 }
    },
    {
      id: "rio", name: "Rio de Janeiro", country: "Brazil", region: "South America", activities: ["beach", "nature", "adventure"],
      blurb: "Granite peaks rising over city beaches. Hike in the morning, rest on the sand, and save the evenings for live music.",
      highlights: ["Sugarloaf by cable car", "Copacabana and Ipanema beaches", "Tijuca National Park trails", "Live samba in Lapa"],
      bestTime: "April to June, September to October", idealStay: "4 to 6 days", currency: "BRL", costLevel: 2,
      costs: { stay: 300, food: 180, transport: 50, activities: 150 }
    },
    {
      id: "cusco", name: "Cusco", country: "Peru", region: "South America", activities: ["culture", "adventure", "nature"],
      blurb: "A high-altitude Inca capital of stone lanes and Andean markets, and the gateway to Machu Picchu. Plan a gentle first day, because the altitude takes some getting used to.",
      highlights: ["Machu Picchu and the Sacred Valley", "Plaza de Armas and Sacsayhuam\u00e1n", "San Pedro Market", "Rainbow Mountain or Humantay Lake hikes"],
      bestTime: "May to September (dry season)", idealStay: "5 to 7 days", currency: "PEN", costLevel: 2,
      costs: { stay: 120, food: 70, transport: 25, activities: 90 }
    },
    {
      id: "sydney", name: "Sydney", country: "Australia", region: "Oceania", activities: ["beach", "city", "nature"],
      blurb: "Harbour ferries, coastal walks and surf beaches inside one city. Mix a day of sights with a day by the water.",
      highlights: ["Harbour ferries past the Opera House", "Bondi to Coogee coastal walk", "Royal Botanic Garden", "Blue Mountains day trip"],
      bestTime: "September to November, March to May", idealStay: "4 to 6 days", currency: "AUD", costLevel: 3,
      costs: { stay: 120, food: 75, transport: 20, activities: 50 }
    }
  ];

  const CURRENCY_CODES = ["AED", "ARS", "AUD", "BRL", "CAD", "CHF", "CLP", "CNY", "COP", "CZK", "DKK", "EGP", "EUR", "GBP", "HKD", "HUF", "IDR", "INR", "ISK", "JPY", "KRW", "KZT", "MAD", "MXN", "MYR", "NOK", "NZD", "PEN", "PHP", "PLN", "SEK", "SGD", "THB", "TRY", "USD", "UZS", "VND", "ZAR"];

  /* ======================================================================
     Destinations added on the Admin page. They are kept in this browser
     under "tp:destinations" and checked here before any page uses them.
     ====================================================================== */
  const BUILTIN_COUNT = DESTINATIONS.length;
  const BUILTIN_ORIGINALS = DESTINATIONS.slice();
  const BUILTIN_IDS = new Set(BUILTIN_ORIGINALS.map((dest) => dest.id));
  const CUSTOM_KEY = "tp:destinations";
  const CUSTOM_MAX = 60;
  const PHOTO_DATA_MAX = 1600000;
  function cleanText(value, max) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
  }
  function validPhoto(value) {
    if (typeof value !== "string" || !value) return "";
    if (value.length <= 2048 && /^https:\/\/[^\s"'<>()\\]+$/i.test(value)) return value;
    if (value.length <= PHOTO_DATA_MAX && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
    return "";
  }
  function cleanCustomDestination(raw, taken) {
    if (!raw || typeof raw !== "object") return null;
    const id = typeof raw.id === "string" && /^[a-z0-9][a-z0-9-]{0,59}$/.test(raw.id) ? raw.id : "";
    const name = cleanText(raw.name, 60);
    const country = cleanText(raw.country, 60);
    if (!id || !name || !country || taken.has(id)) return null;
    if (!REGIONS.includes(raw.region) || !CURRENCY_CODES.includes(raw.currency)) return null;
    const activities = Array.isArray(raw.activities) ? ACTIVITIES.map((item) => item.id).filter((item) => raw.activities.includes(item)) : [];
    const highlights = Array.isArray(raw.highlights) ? raw.highlights.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 6) : [];
    const blurb = cleanText(raw.blurb, 400);
    const stay = /^(\d{1,2}) to (\d{1,2}) days$/.exec(typeof raw.idealStay === "string" ? raw.idealStay : "");
    const given = raw.costs && typeof raw.costs === "object" ? raw.costs : {};
    const cost = (key) => (typeof given[key] === "number" && Number.isFinite(given[key]) && given[key] >= 0 && given[key] < 1e9 ? Math.round(given[key] * 100) / 100 : -1);
    const costs = { stay: cost("stay"), food: cost("food"), transport: cost("transport"), activities: cost("activities") };
    const level = Number(raw.costLevel);
    if (!activities.length || !highlights.length || !blurb || !stay) return null;
    if (Number(stay[1]) < 1 || Number(stay[1]) > Number(stay[2]) || Number(stay[2]) > 30) return null;
    if (Object.values(costs).some((value) => value < 0) || costs.stay + costs.food + costs.transport + costs.activities <= 0) return null;
    if (!Number.isInteger(level) || level < 1 || level > 4) return null;
    taken.add(id);
    return {
      id, name, country, region: raw.region, activities, blurb, highlights,
      bestTime: cleanText(raw.bestTime, 100) || "Any time of year", idealStay: stay[0],
      currency: raw.currency, costLevel: level, costs, photo: validPhoto(raw.photo), custom: true
    };
  }
  function dedupe(items) {
    const seen = new Set();
    return items.filter((item) => (seen.has(item.id) ? false : seen.add(item.id)));
  }
  /* A stored row with a built-in id is an admin's edit of that destination; any other id is a new one. */
  function applyDestinationRows(items) {
    (items || []).forEach((item) => {
      if (BUILTIN_IDS.has(item.id)) {
        const index = DESTINATIONS.findIndex((dest) => dest.id === item.id);
        DESTINATIONS[index] = Object.assign({}, item, { custom: false, edited: true });
      } else if (!DESTINATIONS.some((dest) => dest.id === item.id)) {
        DESTINATIONS.push(item);
      }
    });
  }
  function readCustomDestinations() {
    const raw = storageGet(CUSTOM_KEY);
    if (!raw.ok) return { items: [], damaged: false, blocked: true };
    if (raw.value === null) return { items: [], damaged: false, blocked: false };
    let doc = null;
    try { doc = JSON.parse(raw.value); } catch (error) { doc = null; }
    const list = doc && Array.isArray(doc.items) ? doc.items : null;
    if (!list) return { items: [], damaged: true, blocked: false };
    const items = list.slice(0, CUSTOM_MAX + BUILTIN_COUNT).map((item) => cleanCustomDestination(item, new Set())).filter(Boolean);
    return { items: dedupe(items), damaged: items.length !== list.length, blocked: false };
  }
  /* With the database on, CUSTOM_KEY is only this browser's copy of the "destinations" table. */
  function fetchCloudDestinations() {
    return cloudFetch("/rest/v1/destinations?select=id,data&order=updated_at.desc").then((rows) => {
      const items = dedupe((Array.isArray(rows) ? rows : []).map((row) => cleanCustomDestination(Object.assign({}, row && row.data, { id: row && row.id }), new Set())).filter(Boolean)).slice(0, CUSTOM_MAX + BUILTIN_COUNT);
      rawSet(CUSTOM_KEY, JSON.stringify({ version: 1, items }));
      return items;
    });
  }
  const CUSTOM_LOAD = readCustomDestinations();
  applyDestinationRows(CUSTOM_LOAD.items);

  /* ======================================================================
     Real photos. A photo added on the Admin page is used as it is. Every
     other destination gets its photo from Wikipedia's public API, which
     allows cross-site reads (origin=*): first the landmark, then the place
     itself. While a photo loads the frame shimmers; if none can load, the
     frame shows the destination's initials. Nothing is ever drawn.
     ====================================================================== */
  const PHOTO_TITLES = {
    paris: ["Eiffel Tower", "Paris"], rome: ["Colosseum", "Rome"], lisbon: ["Belém Tower", "Lisbon"],
    santorini: ["Oia, Greece", "Santorini"], reykjavik: ["Hallgrímskirkja", "Reykjavík"], tokyo: ["Shibuya Crossing", "Tokyo"],
    seoul: ["Gyeongbokgung", "Seoul"], bangkok: ["Wat Arun", "Bangkok"], bali: ["Pura Ulun Danu Bratan", "Bali"],
    samarkand: ["Registan", "Samarkand"], marrakech: ["Jemaa el-Fnaa", "Marrakesh"], cairo: ["Giza pyramid complex", "Great Sphinx of Giza"],
    "cape-town": ["Table Mountain", "Cape Town"], "new-york": ["Manhattan", "New York City"], banff: ["Moraine Lake", "Banff National Park"],
    rio: ["Christ the Redeemer (statue)", "Rio de Janeiro"], cusco: ["Machu Picchu", "Cusco"], sydney: ["Sydney Opera House", "Sydney"]
  };
  const photoJobs = new Map();
  let photoBatch = null;
  function photosAllowed() {
    /* automated test browsers stay offline unless a test turns photos on */
    return window.__tpPhotos === true || !navigator.webdriver;
  }
  const wikiPage = (title) => "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_"));
  const goodImage = (src) => typeof src === "string" && /^https:\/\/upload\.wikimedia\.org\//.test(src);
  /* The API answers in parts: follow "continue" until every page is in. */
  function queryPhotos(titles) {
    const base = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=960&pilimit=50&titles=" + encodeURIComponent(titles.slice(0, 50).join("|"));
    const found = new Map();
    const hops = new Map();
    const round = (extra, count) => fetch(base + extra)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("HTTP " + response.status))))
      .then((data) => {
        const query = (data && data.query) || {};
        (query.normalized || []).concat(query.redirects || []).forEach((item) => hops.set(item.from, item.to));
        (query.pages || []).forEach((page) => {
          if (page.thumbnail && goodImage(page.thumbnail.source)) found.set(page.title, page.thumbnail.source);
        });
        if (data && data.continue && count < 10) {
          const more = Object.keys(data.continue).map((key) => "&" + encodeURIComponent(key) + "=" + encodeURIComponent(data.continue[key])).join("");
          return round(more, count + 1);
        }
        return null;
      });
    return round("", 0).then(() => {
      const result = new Map();
      titles.forEach((title) => {
        let name = title;
        for (let step = 0; step < 3 && hops.has(name); step += 1) name = hops.get(name);
        if (found.has(name)) result.set(title, { src: found.get(name), page: wikiPage(name), title: name });
      });
      return result;
    });
  }
  function loadPhotoBatch() {
    if (!photoBatch) {
      const all = [].concat.apply([], Object.keys(PHOTO_TITLES).map((id) => PHOTO_TITLES[id]));
      photoBatch = queryPhotos(all).catch((error) => {
        console.warn("TravelTogether: the Wikipedia photo list could not load (" + error.message + "). Trying each place on its own.");
        return new Map();
      });
    }
    return photoBatch;
  }
  function photoTitles(dest) {
    return PHOTO_TITLES[dest.id] || [dest.name, dest.name + ", " + dest.country];
  }
  const localPhoto = (dest) => (LOCAL_PHOTOS.has(dest.id) ? "./photos/" + dest.id + ".jpg" : "");
  function photoFor(dest) {
    if (dest.photo) return Promise.resolve({ src: dest.photo, page: "", title: dest.name, own: true });
    if (localPhoto(dest)) return Promise.resolve({ src: localPhoto(dest), page: "", title: dest.name, own: true });
    if (!photosAllowed() || typeof fetch !== "function") return Promise.resolve(null);
    if (photoJobs.has(dest.id)) return photoJobs.get(dest.id);
    const titles = photoTitles(dest);
    const pick = (map) => titles.map((title) => map.get(title)).find(Boolean) || null;
    const first = PHOTO_TITLES[dest.id] ? loadPhotoBatch() : Promise.resolve(new Map());
    const job = first
      .then((map) => pick(map) || queryPhotos(titles).then(pick))
      .catch(() => null)
      .then((photo) => {
        if (!photo) console.warn("TravelTogether: no photo found for " + dest.name + ".");
        return photo;
      });
    photoJobs.set(dest.id, job);
    return job;
  }
  function initialsOf(name) {
    return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
  }
  function setFrame(host, dest) {
    host.replaceChildren();
    host.classList.remove("has-photo", "no-photo");
    host.classList.add("photo-frame");
    host.dataset.initials = initialsOf(dest.name);
    host.dataset.for = dest.id;
    if (!dest.photo && !localPhoto(dest) && !photosAllowed()) host.classList.add("no-photo");
  }
  function showPhoto(host, photo, onReady) {
    host.querySelectorAll(".dest-photo").forEach((node) => node.remove());
    host.classList.remove("has-photo", "no-photo");
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.className = "dest-photo";
    img.addEventListener("load", () => { host.classList.add("has-photo"); if (onReady) onReady(photo); });
    img.addEventListener("error", () => {
      img.remove();
      host.classList.add("no-photo");
      host.dispatchEvent(new CustomEvent("photoerror"));
      console.warn("TravelTogether: a photo did not load: " + String(photo.src).slice(0, 120));
    });
    img.src = photo.src;
    host.append(img);
  }
  function attachPhoto(host, dest, onReady) {
    photoFor(dest).then((photo) => {
      if (!host.isConnected || host.dataset.for !== dest.id) return;
      if (!photo) { host.classList.add("no-photo"); return; }
      showPhoto(host, photo, onReady);
    });
  }

  /* ======================================================================
     Admin: add, edit and delete destinations with real photos.
     They are saved in this browser under "tp:destinations" and appear on
     Explore. Built-in destinations are read-only but can be copied.
     ====================================================================== */
  const $ = (id) => document.getElementById(id);
  const BUILTINS = BUILTIN_ORIGINALS;
  /* admin.custom holds every stored row: new destinations and edits of built-in ones (same id). */
  const overrideOf = (id) => admin.custom.find((item) => item.id === id) || null;
  function viewList() {
    const added = admin.custom.filter((item) => !BUILTIN_IDS.has(item.id));
    const builtins = BUILTINS.map((dest) => { const edit = overrideOf(dest.id); return edit ? Object.assign({}, edit, { custom: false, edited: true }) : dest; });
    return added.concat(builtins);
  }
  const admin = { custom: CUSTOM_LOAD.items.slice(), editing: null, photo: "", show: "all", photoToken: 0 };

  function money(amount, currency) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
    catch (error) { return currency + " " + Math.round(amount); }
  }
  const daily = (dest) => dest.costs.stay + dest.costs.food + dest.costs.transport + dest.costs.activities;
  const fold = (text) => String(text).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

  /* Without the database, this browser's storage is the store. With it, the "destinations" table is,
     and this browser keeps a copy so Explore can start at once. */
  function save() {
    return storageSet(CUSTOM_KEY, JSON.stringify({ version: 1, items: admin.custom }));
  }
  const ONLINE = cloudReady();
  function storeRows(list) {
    if (!ONLINE || !list.length) return Promise.resolve();
    return cloudData("/rest/v1/destinations?on_conflict=id", { method: "POST", body: list.map((dest) => ({ id: dest.id, data: dest })), prefer: "resolution=merge-duplicates,return=minimal" });
  }
  function dropRow(dest) {
    if (!ONLINE) return Promise.resolve();
    return cloudData("/rest/v1/destinations?id=eq." + encodeURIComponent(dest.id), { method: "DELETE", prefer: "return=minimal" });
  }
  function commit(change, revert) {
    /* apply locally, keep the copy; offline mode fails if storage is full */
    change();
    if (!save() && !ONLINE) { revert(); return false; }
    return true;
  }

  /* ---- the table ---- */
  function rowFor(dest) {
    const row = el("tr");
    row.dataset.id = dest.id;
    const thumbCell = el("td", "cell-photo");
    const thumb = el("div", "admin-thumb");
    setFrame(thumb, dest);
    thumbCell.append(thumb);
    const nameCell = el("td", "cell-name");
    nameCell.append(el("strong", "", dest.name), el("span", "muted", dest.country));
    const costCell = el("td", "cell-cost", money(daily(dest), dest.currency));
    const source = el("td");
    source.append(el("span", dest.custom ? "badge badge-teal" : dest.edited ? "badge badge-violet" : "badge", dest.custom ? "Added" : dest.edited ? "Built-in · edited" : "Built-in"));
    const actions = el("td", "cell-actions");
    const action = (label, act, aria, kind) => {
      const button = el("button", "button " + (kind || "button-secondary") + " button-small", label);
      button.type = "button";
      button.dataset.act = act;
      button.setAttribute("aria-label", aria);
      return button;
    };
    if (!dest.custom) {
      actions.append(action("Edit", "edit", "Edit " + dest.name));
      if (dest.edited) actions.append(action("Reset", "reset", "Reset " + dest.name + " to the original", "button-text"));
      else actions.append(action("Template", "copy", "Use " + dest.name + " as a template for a new destination", "button-text"));
    } else {
      const edit = el("button", "button button-secondary button-small", "Edit");
      edit.type = "button";
      edit.dataset.act = "edit";
      edit.setAttribute("aria-label", "Edit " + dest.name);
      const remove = el("button", "button button-danger button-small", "Delete");
      remove.type = "button";
      remove.dataset.act = "delete";
      remove.setAttribute("aria-label", "Delete " + dest.name);
      actions.append(edit, remove);
    }
    row.append(thumbCell, nameCell, el("td", "", dest.region), costCell, source, actions);
    return row;
  }
  function renderTable() {
    const words = fold($("admin-search").value).split(/\s+/).filter(Boolean);
    const all = viewList();
    const list = all.filter((dest) => {
      if (admin.show === "custom" && !dest.custom) return false;
      if (admin.show === "builtin" && dest.custom) return false;
      const text = fold([dest.name, dest.country, dest.region].join(" "));
      return words.every((word) => text.includes(word));
    });
    const body = $("admin-rows");
    body.replaceChildren();
    list.forEach((dest) => {
      const row = rowFor(dest);
      body.append(row);
      attachPhoto(row.querySelector(".admin-thumb"), dest);
    });
    $("admin-empty").hidden = list.length > 0;
    const added = admin.custom.filter((item) => !BUILTIN_IDS.has(item.id)).length;
    const edited = admin.custom.length - added;
    $("admin-count").textContent = plural(BUILTINS.length, "built-in destination", "built-in destinations") + (edited ? " (" + edited + " edited)" : "") + " and " + added + " added. Showing " + list.length + ".";
    document.querySelectorAll(".seg-button").forEach((button) => button.setAttribute("aria-pressed", button.dataset.show === admin.show ? "true" : "false"));
  }

  /* ---- the form ---- */
  const FIELDS = ["name", "country", "activities", "blurb", "highlights", "stay", "costs"];
  function setError(key, message) {
    const box = $("f-" + key + "-error");
    box.textContent = message;
    box.hidden = !message;
    const inputs = { stay: ["f-stay-min", "f-stay-max"], costs: ["f-cost-stay", "f-cost-food", "f-cost-transport", "f-cost-activities"], activities: [] }[key] || ["f-" + key];
    inputs.forEach((id) => { if (message) $(id).setAttribute("aria-invalid", "true"); else $(id).removeAttribute("aria-invalid"); });
  }
  function fillForm(dest, mode) {
    admin.editing = mode === "edit" ? dest : null;
    $("form-title").textContent = mode === "edit" ? "Edit " + dest.name : mode === "copy" ? "New destination from " + dest.name : "Add destination";
    $("form-save").textContent = mode === "edit" ? "Save changes" : "Add destination";
    $("form-error").hidden = true;
    FIELDS.forEach((key) => setError(key, ""));
    const blank = !dest;
    const d = dest || { name: "", country: "", region: REGIONS[0], currency: "EUR", activities: [], blurb: "", highlights: [], bestTime: "", idealStay: "3 to 5 days", costLevel: 2, costs: { stay: "", food: "", transport: "", activities: "" }, photo: "" };
    $("f-name").value = mode === "copy" ? "" : d.name;
    $("f-country").value = mode === "copy" ? "" : d.country;
    $("f-region").value = d.region;
    $("f-currency").value = d.currency;
    document.querySelectorAll("#f-activities input").forEach((input) => { input.checked = d.activities.includes(input.value); });
    $("f-blurb").value = mode === "copy" ? "" : d.blurb;
    $("f-highlights").value = mode === "copy" ? "" : d.highlights.join("\n");
    $("f-best").value = d.bestTime === "Any time of year" ? "" : d.bestTime;
    const stay = /^(\d+) to (\d+) days$/.exec(d.idealStay) || [0, "", ""];
    $("f-stay-min").value = stay[1];
    $("f-stay-max").value = stay[2];
    ["stay", "food", "transport", "activities"].forEach((key) => { $("f-cost-" + key).value = String(d.costs[key]); });
    $("f-level").value = String(d.costLevel);
    $("f-photo-url").value = "";
    setPhoto(mode === "edit" ? d.photo : "", blank ? "" : null);
    if (mode === "edit" && !d.photo && !d.custom) $("f-photo-status").textContent = "Its photo comes from Wikipedia. Drop or upload your own to replace it.";
    $("dest-dialog").showModal();
    $("f-name").focus();
  }
  function previewDest() {
    return { id: "preview", name: $("f-name").value.trim() || "?", country: "", photo: admin.photo };
  }
  function setPhoto(src, status) {
    admin.photo = src || "";
    admin.photoToken += 1;
    const frame = $("f-photo-preview");
    setFrame(frame, previewDest());
    frame.classList.add("no-photo");
    $("f-photo-clear").hidden = !admin.photo;
    if (admin.photo) {
      const token = admin.photoToken;
      showPhoto(frame, { src: admin.photo }, () => {
        if (token === admin.photoToken && status === null) $("f-photo-status").textContent = "This destination's current photo.";
      });
    }
    if (typeof status === "string") $("f-photo-status").textContent = status || "No photo yet. Find one on Wikipedia, upload your own, or paste a link.";
    else if (!admin.photo) $("f-photo-status").textContent = "No photo yet. Find one on Wikipedia, upload your own, or paste a link.";
  }
  function findPhoto() {
    const name = $("f-name").value.trim();
    const country = $("f-country").value.trim();
    if (!name) {
      setError("name", "Enter the name first, so there is something to search for.");
      $("f-name").focus();
      return;
    }
    const button = $("f-photo-find");
    button.disabled = true;
    $("f-photo-status").textContent = "Looking for a photo of " + name + "…";
    const titles = country ? [name, name + ", " + country, name + " (" + country + ")"] : [name];
    queryPhotos(titles)
      .then((map) => {
        const hit = titles.map((title) => map.get(title)).find(Boolean);
        if (hit) setPhoto(hit.src, "Found a photo on Wikipedia: " + hit.title + ".");
        else $("f-photo-status").textContent = "Wikipedia has no photo for “" + name + "”. Try the city's full name, or upload a photo.";
      })
      .catch(() => { $("f-photo-status").textContent = "Couldn't reach Wikipedia. Check the connection, or upload a photo instead."; })
      .then(() => { button.disabled = false; });
  }
  function uploadPhoto(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { $("f-photo-status").textContent = "Choose a JPEG, PNG or WebP image."; return; }
    if (file.size > 20 * 1024 * 1024) { $("f-photo-status").textContent = "That image is over 20 MB. Choose a smaller one."; return; }
    $("f-photo-status").textContent = "Preparing the photo…";
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let out = "";
      for (const [edge, quality] of [[1400, 0.82], [1100, 0.75], [800, 0.7]]) {
        const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        out = canvas.toDataURL("image/jpeg", quality);
        if (out.length <= 600000) break;
      }
      if (!validPhoto(out)) { $("f-photo-status").textContent = "That image couldn't be prepared. Try another one."; return; }
      setPhoto(out, "Uploaded " + file.name + " (" + Math.round(out.length * 0.75 / 1024) + " KB after resizing).");
    };
    img.onerror = () => { URL.revokeObjectURL(url); $("f-photo-status").textContent = "That file couldn't be read as an image."; };
    img.src = url;
  }
  function usePhotoLink() {
    const value = $("f-photo-url").value.trim();
    if (!value) return;
    if (!validPhoto(value)) { $("f-photo-status").textContent = "Use an image link that starts with https://"; return; }
    setPhoto(value, "Using the photo from that link.");
  }

  function readForm(quiet) {
    const errors = {};
    const name = $("f-name").value.trim();
    const country = $("f-country").value.trim();
    const activities = Array.from(document.querySelectorAll("#f-activities input:checked")).map((input) => input.value);
    const blurb = $("f-blurb").value.trim();
    const highlights = $("f-highlights").value.split("\n").map((line) => line.trim()).filter(Boolean);
    const min = Number($("f-stay-min").value);
    const max = Number($("f-stay-max").value);
    const costs = {};
    ["stay", "food", "transport", "activities"].forEach((key) => { costs[key] = $("f-cost-" + key).value.trim() === "" ? NaN : Number($("f-cost-" + key).value); });
    if (!name) errors.name = "Enter a name.";
    else if (!admin.editing && DESTINATIONS.concat(admin.custom).some((dest) => fold(dest.name) === fold(name) && fold(dest.country) === fold(country))) errors.name = "That destination is already on the list.";
    if (!country) errors.country = "Enter a country.";
    if (!activities.length) errors.activities = "Choose at least one.";
    if (!blurb) errors.blurb = "Write a sentence or two.";
    if (!highlights.length) errors.highlights = "Add at least one highlight.";
    else if (highlights.length > 6) errors.highlights = "Keep it to 6 highlights.";
    else if (highlights.some((line) => line.length > 120)) errors.highlights = "Keep each highlight under 120 characters.";
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 30 || min > max) errors.stay = "Enter whole days from 1 to 30, shortest first.";
    if (Object.values(costs).some((value) => !Number.isFinite(value) || value < 0)) errors.costs = "Enter all four costs as numbers (0 is fine).";
    else if (costs.stay + costs.food + costs.transport + costs.activities <= 0) errors.costs = "At least one cost must be above 0.";
    if (quiet) {
      /* while typing: clear the messages that are fixed, never add new ones */
      FIELDS.forEach((key) => { if (!errors[key] && !$("f-" + key + "-error").hidden) setError(key, ""); });
      return null;
    }
    FIELDS.forEach((key) => setError(key, errors[key] || ""));
    const first = FIELDS.find((key) => errors[key]);
    if (first) {
      const target = { activities: "#f-activities input", stay: "#f-stay-min", costs: "#f-cost-stay" }[first] || "#f-" + first;
      document.querySelector(target).focus();
      return null;
    }
    const taken = new Set(BUILTINS.map((dest) => dest.id).concat(admin.custom.map((dest) => dest.id)));
    if (admin.editing) taken.delete(admin.editing.id);
    let id = admin.editing ? admin.editing.id : slugify(name, "place").slice(0, 50);
    if (!admin.editing) for (let n = 2; taken.has(id); n += 1) id = slugify(name, "place").slice(0, 50) + "-" + n;
    return cleanCustomDestination({
      id, name, country, region: $("f-region").value, currency: $("f-currency").value, activities, blurb, highlights,
      bestTime: $("f-best").value, idealStay: min + " to " + max + " days", costLevel: Number($("f-level").value), costs, photo: admin.photo
    }, taken);
  }
  function onSubmit(event) {
    event.preventDefault();
    const dest = readForm();
    if (!dest) return;
    if (!admin.editing && admin.custom.filter((item) => !BUILTIN_IDS.has(item.id)).length >= CUSTOM_MAX) { showFormError("You can add up to " + CUSTOM_MAX + " destinations."); return; }
    const editing = admin.editing;
    const button = $("form-save");
    button.disabled = true;
    storeRows([dest]).then(() => {
      const before = admin.custom.slice();
      const ok = commit(() => {
        const at = admin.custom.findIndex((item) => item.id === dest.id);
        if (at >= 0) admin.custom[at] = dest;
        else admin.custom.unshift(dest);
      }, () => { admin.custom = before; });
      if (!ok) {
        showFormError("This browser's storage is full, so the destination wasn't saved. Use a smaller photo (or a link instead of an upload), or delete another destination.");
        return;
      }
      $("dest-dialog").close();
      renderTable();
      const message = (editing ? "Saved " : "Added ") + dest.name + (ONLINE ? ". Everyone sees it on Explore now." : ". It's on Explore now.");
      showNotice(message, "success");
    }).catch((error) => showFormError("Couldn't save to the database: " + error.message))
      .then(() => { button.disabled = false; });
  }
  function showFormError(message) {
    $("form-error").textContent = message;
    $("form-error").hidden = false;
  }
  function removeDest(dest) {
    const reset = !dest.custom;
    confirmDialog({
      title: reset ? "Reset " + dest.name + "?" : "Delete " + dest.name + "?",
      message: reset ? "Your changes to " + dest.name + " (text, costs and photo) will be undone and the original comes back." : "It will disappear from Explore" + (ONLINE ? " for everyone" : " in this browser") + ". Trips already made for it keep their plans.",
      confirmLabel: reset ? "Reset to original" : "Delete destination",
      danger: true
    }).then((yes) => {
      if (!yes) return;
      dropRow(dest).then(() => {
        const before = admin.custom.slice();
        if (!commit(() => { admin.custom = admin.custom.filter((item) => item.id !== dest.id); }, () => { admin.custom = before; })) {
          showNotice("Couldn't save the change. Storage may be blocked.", "error");
          return;
        }
        renderTable();
        announce((reset ? "Reset " : "Deleted ") + dest.name + ".");
        $("admin-search").focus();
      }).catch((error) => showNotice("Couldn't delete it from the database: " + error.message, "error"));
    });
  }

  /* ---- export / import ---- */
  function exportAll() {
    downloadText("traveltogether-destinations.json", JSON.stringify({ version: 1, items: admin.custom }, null, 2));
    announce("Exported " + plural(admin.custom.length, "destination", "destinations") + ".");
  }
  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let doc = null;
      try { doc = JSON.parse(String(reader.result)); } catch (error) { doc = null; }
      const list = doc && Array.isArray(doc.items) ? doc.items : null;
      if (!list) { showNotice("That file isn't a destinations export. Nothing was changed.", "error"); return; }
      const taken = new Set(admin.custom.map((dest) => dest.id));
      const fresh = list.map((item) => cleanCustomDestination(item, taken)).filter(Boolean).slice(0, CUSTOM_MAX + BUILTIN_COUNT - admin.custom.length);
      storeRows(fresh).then(() => {
        const before = admin.custom.slice();
        if (!commit(() => { admin.custom = admin.custom.concat(fresh); }, () => { admin.custom = before; })) {
          showNotice("Storage is full, so nothing was imported.", "error");
          return;
        }
        renderTable();
        const skipped = list.length - fresh.length;
        showNotice("Imported " + plural(fresh.length, "destination", "destinations") + (skipped ? " and skipped " + skipped + " that were invalid or already here." : "."), "success");
      }).catch((error) => showNotice("Couldn't import into the database: " + error.message, "error"));
    };
    reader.readAsText(file);
  }

  /* ---- start ---- */
  function startAdmin() {
    initTheme();
    wireNotice();
    REGIONS.forEach((name) => { const option = el("option", "", name); option.value = name; $("f-region").append(option); });
    CURRENCY_CODES.forEach((code) => { const option = el("option", "", code); option.value = code; $("f-currency").append(option); });
    [1, 2, 3, 4].forEach((level) => { const option = el("option", "", level + " · " + COST_LEVELS[level]); option.value = String(level); $("f-level").append(option); });
    ACTIVITIES.forEach((item) => {
      const label = el("label", "choice");
      const input = el("input");
      input.type = "checkbox";
      input.value = item.id;
      label.append(input, el("span", "", item.label));
      $("f-activities").append(label);
    });
    if (CUSTOM_LOAD.blocked) showNotice("This browser is blocking storage, so new destinations can't be saved here.", "warning");
    else if (CUSTOM_LOAD.damaged) showNotice("Some saved destinations were damaged and have been left out. Saving again keeps only the good ones.", "warning");
    $("add-dest").addEventListener("click", () => fillForm(null, "add"));
    $("admin-rows").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-act]");
      if (!button) return;
      const id = button.closest("tr").dataset.id;
      const dest = viewList().find((item) => item.id === id);
      if (!dest) return;
      if (button.dataset.act === "edit") fillForm(dest, "edit");
      if (button.dataset.act === "copy") fillForm(dest, "copy");
      if (button.dataset.act === "delete" || button.dataset.act === "reset") removeDest(dest);
    });
    $("admin-search").addEventListener("input", renderTable);
    document.querySelectorAll(".seg-button").forEach((button) => button.addEventListener("click", () => { admin.show = button.dataset.show; renderTable(); }));
    $("dest-form").addEventListener("submit", onSubmit);
    ["input", "change"].forEach((type) => $("dest-form").addEventListener(type, (event) => {
      if (event.target.closest(".form-main")) readForm(true);
    }));
    ["form-close", "form-cancel"].forEach((id) => $(id).addEventListener("click", () => $("dest-dialog").close()));
    $("f-photo-find").addEventListener("click", findPhoto);
    $("f-photo-preview").addEventListener("photoerror", () => {
      if (!admin.photo) return;
      setPhoto("", "That link isn't an image the page can show. Save the picture to your computer and drop the file here instead.");
    });
    /* drag a photo file (or an image from another tab) onto the photo panel */
    const zone = $("photo-zone");
    let depth = 0;
    const dropped = (data) => {
      const file = Array.from(data.files || []).find((item) => /^image\//.test(item.type));
      if (file) { uploadPhoto(file); return; }
      /* an image dragged from another website: use the picture itself, not the page it links to */
      const html = data.getData("text/html") || "";
      const fromHtml = (/<img[^>]+src=["']([^"']+)["']/i.exec(html) || [])[1] || "";
      const link = (fromHtml.replace(/&amp;/g, "&") || data.getData("text/uri-list") || data.getData("text/plain") || "").split("\n")[0].trim();
      if (validPhoto(link)) setPhoto(link, "Using the photo you dropped.");
      else $("f-photo-status").textContent = "That didn't come through as an image. Save the picture to your computer, then drop the file here.";
    };
    zone.addEventListener("dragenter", (event) => { event.preventDefault(); depth += 1; zone.classList.add("is-drag"); });
    zone.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
    zone.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove("is-drag"); });
    zone.addEventListener("drop", (event) => { event.preventDefault(); depth = 0; zone.classList.remove("is-drag"); dropped(event.dataTransfer); });
    /* a file dropped anywhere else in the form must not open in the tab and lose the form */
    $("dest-dialog").addEventListener("dragover", (event) => event.preventDefault());
    $("dest-dialog").addEventListener("drop", (event) => { if (!zone.contains(event.target)) { event.preventDefault(); dropped(event.dataTransfer); } });
    $("dest-dialog").addEventListener("paste", (event) => {
      const file = Array.from((event.clipboardData && event.clipboardData.files) || []).find((item) => /^image\//.test(item.type));
      if (file) { event.preventDefault(); uploadPhoto(file); }
    });
    $("f-photo-file").addEventListener("change", (event) => { uploadPhoto(event.target.files[0]); event.target.value = ""; });
    $("f-photo-url").addEventListener("change", usePhotoLink);
    $("f-photo-clear").addEventListener("click", () => setPhoto("", "Photo removed. Explore will look one up on Wikipedia instead."));
    $("f-name").addEventListener("input", () => { if (!admin.photo) $("f-photo-preview").dataset.initials = initialsOf($("f-name").value) || "?"; });
    $("export-button").addEventListener("click", exportAll);
    $("import-button").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", (event) => { importFile(event.target.files[0]); event.target.value = ""; });
    if (!ONLINE) { renderTable(); return; }
    /* With the database on, only admins may use this page. */
    const gate = (text, linkLabel, href) => {
      $("admin-panel").hidden = true;
      $("admin-toolbar").hidden = true;
      $("gate-text").textContent = text;
      $("gate-link").textContent = linkLabel;
      $("gate-link").href = href;
      $("admin-gate").hidden = false;
    };
    const session = readSession();
    if (!session) { gate("Log in with an admin account to add, edit or delete destinations.", "Log in", "./login.html?next=admin.html"); return; }
    $("admin-panel").hidden = true;
    $("admin-toolbar").hidden = true;
    loadProfile(session).then((current) => {
      if (!current.admin) { gate("Your account (" + current.user.email + ") isn't an admin. An admin can give you access in the database.", "Back to Explore", "./index.html"); return null; }
      return fetchCloudDestinations().then((items) => {
        admin.custom = items;
        $("admin-panel").hidden = false;
        $("admin-toolbar").hidden = false;
        renderTable();
      });
    }).catch((error) => gate("Couldn't check your account: " + error.message, "Try again", "./admin.html"));
  }
  startAdmin();
})();
