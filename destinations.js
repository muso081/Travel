/* TravelTogether: Explore script.
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

  function initTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light", false);
    cloudBoot();
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
  function photoFor(dest) {
    if (dest.photo) return Promise.resolve({ src: dest.photo, page: "", title: dest.name, own: true });
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
    if (!dest.photo && !photosAllowed()) host.classList.add("no-photo");
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
     Explore: the only page that writes the shared trip contract.
       localStorage["tp:trip"]   the active trip (7 keys, see README)
       localStorage["tp:trips"]  every saved trip
     Everything user-typed is inserted with textContent, never as HTML.
     ====================================================================== */
  const TRIPS_KEY = "tp:trips";
  const MAX_CREATE_DAYS = 90;
  const MAX_TRAVELERS = 20;
  const MODULE_KEY_PREFIXES = ["tp:itinerary:", "tp:budget:", "tp:packing:"];

  const state = {
    trips: [],
    activeId: null,
    activeStatus: "none",
    editingId: null,
    currencyTouched: false,
    storageOk: true,
    listUnreadable: false,
    skipped: 0,
    detailDest: null,
    filters: { query: "", region: "all", activity: "all", saved: false },
    favorites: new Set()
  };

  const $ = (id) => document.getElementById(id);
  const form = {
    root: $("trip-form"),
    title: $("trip-title"),
    destination: $("trip-destination"),
    startDate: $("trip-start"),
    endDate: $("trip-end"),
    travelers: $("trip-travelers"),
    currency: $("trip-currency")
  };
  const FIELD_ORDER = ["title", "destination", "startDate", "endDate", "travelers", "currency"];

  function reduceMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }


  function readJson(key) {
    const raw = storageGet(key);
    if (!raw.ok || raw.value === null) return null;
    try { return JSON.parse(raw.value); }
    catch (error) { return null; }
  }

  function strip(text) {
    return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function button(label, className) {
    const node = el("button", className, label);
    node.type = "button";
    return node;
  }

  /* ---- money (sample figures are never converted) ---- */
  function money(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    } catch (error) {
      return currency + " " + Math.round(amount).toLocaleString();
    }
  }
  function dailyTotal(dest) {
    return COST_ROWS.reduce((sum, row) => sum + dest.costs[row.key], 0);
  }

  /* ---- destination lookups ---- */
  const destinationLabel = (dest) => dest.name + ", " + dest.country;
  const activityLabel = (id) => (ACTIVITIES.find((item) => item.id === id) || { label: id }).label;
  /* search text per destination, worked out on first use (destinations can arrive from the database after load) */
  const searchCache = new Map();
  const searchText = {
    get(id) {
      if (!searchCache.has(id)) {
        const dest = DESTINATIONS.find((item) => item.id === id);
        searchCache.set(id, dest ? strip([dest.name, dest.country, dest.region, dest.blurb, dest.highlights.join(" "), dest.activities.map(activityLabel).join(" ")].join(" ")) : "");
      }
      return searchCache.get(id);
    }
  };

  function findDestinationByText(text) {
    const key = strip(text).trim();
    if (!key) return null;
    return DESTINATIONS.find((dest) => strip(destinationLabel(dest)) === key || strip(dest.name) === key) || null;
  }

  /* ======================================================================
     Trips: validation, storage, reconciliation
     ====================================================================== */
  function normalizeTrip(value) {
    if (!isValidTrip(value)) return null;
    return {
      id: value.id,
      title: value.title.trim(),
      destination: value.destination.trim(),
      startDate: value.startDate,
      endDate: value.endDate,
      currency: value.currency,
      travelers: value.travelers
    };
  }

  function loadSavedTrips() {
    const raw = storageGet(TRIPS_KEY);
    if (!raw.ok) { state.storageOk = false; return []; }
    if (raw.value === null) return [];
    try {
      const parsed = JSON.parse(raw.value);
      if (!Array.isArray(parsed)) throw new Error("not a list");
      const seen = new Set();
      const trips = [];
      parsed.forEach((item) => {
        const trip = normalizeTrip(item);
        if (trip && !seen.has(trip.id)) { seen.add(trip.id); trips.push(trip); }
      });
      state.skipped = parsed.length - trips.length;
      return trips;
    } catch (error) {
      state.listUnreadable = true;
      return [];
    }
  }

  function saveTrips() {
    return storageSet(TRIPS_KEY, JSON.stringify(state.trips));
  }

  function writeActive(trip) {
    return storageSet(TRIP_KEY, JSON.stringify(normalizeTrip(trip)));
  }

  function syncState() {
    state.storageOk = true;
    state.listUnreadable = false;
    state.skipped = 0;
    state.trips = loadSavedTrips();
    const active = readActiveTrip();
    state.activeStatus = active.status;
    if (active.status === "unavailable") state.storageOk = false;
    if (active.status === "ok") {
      const clean = normalizeTrip(active.trip);
      state.activeId = clean.id;
      const index = state.trips.findIndex((trip) => trip.id === clean.id);
      if (index === -1) {
        state.trips.unshift(clean);
        saveTrips();
      } else if (JSON.stringify(state.trips[index]) !== JSON.stringify(clean)) {
        state.trips[index] = clean;
        saveTrips();
      }
    } else {
      state.activeId = null;
    }
  }

  function activeTrip() {
    return state.trips.find((trip) => trip.id === state.activeId) || null;
  }

  function reportStorageProblems() {
    if (!state.storageOk) {
      showNotice("This browser is blocking local storage, so trips can't be saved. You can still browse destinations.", "warning");
    } else if (state.listUnreadable) {
      showNotice("Your saved trips list couldn't be read, so it starts empty.", "warning");
    } else if (state.activeStatus === "invalid") {
      showNotice("The active trip's data couldn't be read, so no trip is selected. Pick a saved trip or create a new one.", "warning");
    } else if (state.skipped > 0) {
      showNotice(plural(state.skipped, "saved trip was", "saved trips were") + " skipped because the data was incomplete.", "warning");
    }
  }

  /* ======================================================================
     Moving around the page
     ====================================================================== */
  function jumpTo(target, focusTarget) {
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    const focusNode = focusTarget || target;
    if (!focusNode.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(focusNode.tagName)) focusNode.setAttribute("tabindex", "-1");
    focusNode.focus({ preventScroll: true });
  }

  const JUMP_TARGETS = {
    destinations: ["destinations", "destinations-title"],
    trips: ["trips", "trips-title"],
    "trip-form": ["trip-panel", "form-title"],
    "saved-trips": ["saved-trips", "saved-title"]
  };

  function onJumpClick(event) {
    const link = event.target.closest("a[data-jump]");
    if (!link) return;
    const id = (link.getAttribute("href") || "").replace("#", "");
    const spec = JUMP_TARGETS[id];
    if (!spec) return;
    event.preventDefault();
    jumpTo($(spec[0]), $(spec[1]));
  }

  /* ======================================================================
     Destinations
     ====================================================================== */

  function pips(level) {
    const wrap = el("span", "pips");
    wrap.setAttribute("aria-hidden", "true");
    for (let step = 1; step <= 4; step += 1) wrap.append(el("i", step <= level ? "on" : ""));
    return wrap;
  }

  const cardNodes = new Map();


  function watchPhotos() {
    const load = (card) => {
      const dest = DESTINATIONS.find((item) => item.id === card.dataset.dest);
      if (dest) attachPhoto(card.querySelector(".dest-scene"), dest);
    };
    const cards = Array.from(document.querySelectorAll("#dest-grid .dest-card"));
    if (typeof IntersectionObserver !== "function") { cards.forEach(load); return; }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        load(entry.target);
      });
    }, { rootMargin: "600px 0px" });
    cards.forEach((card) => observer.observe(card));
  }

  /* ---- saved destinations (a heart on each card) ---- */
  const FAVORITES_KEY = "tp:favorites";
  function loadFavorites() {
    const list = readJson(FAVORITES_KEY);
    return new Set(Array.isArray(list) ? list.filter((id) => DESTINATIONS.some((dest) => dest.id === id)) : []);
  }
  function syncSaved() {
    $("saved-count").textContent = String(state.favorites.size);
    document.querySelectorAll("#dest-grid .fav-button").forEach((node) => node.setAttribute("aria-pressed", state.favorites.has(node.dataset.dest) ? "true" : "false"));
  }
  function toggleFavorite(dest) {
    const had = state.favorites.has(dest.id);
    if (had) state.favorites.delete(dest.id);
    else state.favorites.add(dest.id);
    storageSet(FAVORITES_KEY, JSON.stringify(Array.from(state.favorites)));
    syncSaved();
    if (state.filters.saved) applyFilters();
    announce(had ? "Removed " + dest.name + " from saved." : "Saved " + dest.name + ".");
  }
  function surprise() {
    const pool = DESTINATIONS.filter((dest) => !cardNodes.get(dest.id).hidden);
    const list = pool.length ? pool : DESTINATIONS;
    const avoid = state.detailDest ? state.detailDest.id : "";
    const options = list.length > 1 ? list.filter((dest) => dest.id !== avoid) : list;
    openDetail(options[Math.floor(Math.random() * options.length)]);
  }

  function buildCards() {
    const grid = $("dest-grid");
    DESTINATIONS.forEach((dest) => {
      const item = el("li", "dest-card");
      item.dataset.dest = dest.id;
      const media = el("div", "dest-media");
      const scene = el("div", "dest-scene");
      setFrame(scene, dest);
      const overlay = el("div", "dest-overlay");
      overlay.setAttribute("aria-hidden", "true");
      overlay.append(el("b", "", dest.name), el("span", "", dest.country));
      const region = el("span", "dest-region", dest.custom ? dest.region + " · Added" : dest.region);
      region.setAttribute("aria-hidden", "true");
      const fav = el("button", "fav-button");
      fav.type = "button";
      fav.dataset.action = "fav";
      fav.dataset.dest = dest.id;
      fav.setAttribute("aria-pressed", "false");
      fav.setAttribute("aria-label", "Save " + dest.name);
      fav.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>';
      media.append(scene, overlay, region, fav);

      const body = el("div", "dest-body");
      const head = el("div", "dest-head");
      head.append(el("h3", "", dest.name), el("p", "dest-country", dest.country));

      const tags = el("ul", "tag-list");
      tags.setAttribute("role", "list");
      dest.activities.forEach((id) => tags.append(el("li", "tag", activityLabel(id))));

      const cost = el("div", "dest-cost");
      const amount = el("p", "dest-cost-amount");
      amount.append(el("strong", "tnum", "About " + money(dailyTotal(dest), dest.currency)), el("span", "muted", " per person, a day"));
      const level = el("p", "dest-cost-level");
      level.append(pips(dest.costLevel), el("span", "", COST_LEVELS[dest.costLevel] + " · sample figure"));
      cost.append(amount, level);

      const actions = el("div", "dest-actions");
      const more = button("View details", "button button-secondary button-small");
      more.dataset.action = "details";
      more.dataset.dest = dest.id;
      more.setAttribute("aria-label", "View details for " + dest.name);
      const plan = button("Plan a trip", "button button-primary button-small");
      plan.dataset.action = "plan";
      plan.dataset.dest = dest.id;
      plan.setAttribute("aria-label", "Plan a trip to " + dest.name);
      actions.append(more, plan);

      body.append(head, el("p", "dest-blurb", dest.blurb), tags, cost, actions);
      item.append(media, body);
      grid.append(item);
      cardNodes.set(dest.id, item);
    });
  }

  function buildFilterControls() {
    const region = $("region");
    REGIONS.forEach((name) => {
      const option = el("option", "", name);
      option.value = name;
      region.append(option);
    });
    const group = $("activity-group");
    [{ id: "all", label: "All" }].concat(ACTIVITIES).forEach((item, index) => {
      const label = el("label", "choice");
      const input = el("input");
      input.type = "radio";
      input.name = "activity";
      input.value = item.id;
      input.checked = index === 0;
      label.append(input, el("span", "", item.label));
      group.append(label);
    });
  }

  function applyFilters() {
    const filters = state.filters;
    const words = strip(filters.query).trim().split(/\s+/).filter(Boolean);
    let shown = 0;
    DESTINATIONS.forEach((dest) => {
      const text = searchText.get(dest.id);
      const visible =
        (filters.region === "all" || dest.region === filters.region) &&
        (filters.activity === "all" || dest.activities.includes(filters.activity)) &&
        words.every((word) => text.includes(word)) &&
        (!filters.saved || state.favorites.has(dest.id));
      cardNodes.get(dest.id).hidden = !visible;
      if (visible) shown += 1;
    });
    const total = DESTINATIONS.length;
    const filtered = Boolean(words.length) || filters.region !== "all" || filters.activity !== "all" || filters.saved === true;
    $("saved-only").setAttribute("aria-pressed", filters.saved ? "true" : "false");
    $("results-count").textContent = shown === total ? "Showing all " + total + " destinations" : shown === 0 ? "No destinations match" : "Showing " + shown + " of " + total + " destinations";
    $("clear-filters").hidden = !filtered;
    $("dest-empty").hidden = shown !== 0;
    $("dest-grid").hidden = shown === 0;
  }

  function clearFilters() {
    state.filters = { query: "", region: "all", activity: "all", saved: false };
    $("search").value = "";
    $("region").value = "all";
    const all = document.querySelector('#activity-group input[value="all"]');
    if (all) all.checked = true;
    applyFilters();
  }

  let searchTimer = 0;
  function onFilterInput(event) {
    const target = event.target;
    if (target.id === "search") {
      state.filters.query = target.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyFilters, 160);
      return;
    }
    if (target.id === "region") state.filters.region = target.value;
    if (target.name === "activity") state.filters.activity = target.value;
    applyFilters();
  }

  /* ---- details dialog ---- */
  function fact(list, term, value) {
    const row = el("div");
    row.append(el("dt", "", term), el("dd", "", value));
    list.append(row);
  }

  function openDetail(dest) {
    const dialog = $("detail-dialog");
    state.detailDest = dest;
    $("detail-title").textContent = dest.name;
    $("detail-sub").textContent = dest.country + " · " + dest.region;
    $("detail-blurb").textContent = dest.blurb;
    setFrame($("detail-scene"), dest);
    $("detail-credit").hidden = true;
    attachPhoto($("detail-scene"), dest, (photo) => {
      if (state.detailDest !== dest || !photo.page) return;
      $("detail-credit").href = photo.page;
      $("detail-credit").textContent = "Photo: " + photo.title + ", Wikipedia";
      $("detail-credit").hidden = false;
    });

    const highlights = $("detail-highlights");
    highlights.replaceChildren();
    dest.highlights.forEach((text) => highlights.append(el("li", "", text)));

    const facts = $("detail-facts");
    facts.replaceChildren();
    fact(facts, "Best time", dest.bestTime);
    fact(facts, "Ideal stay", dest.idealStay);
    fact(facts, "Cost level", COST_LEVELS[dest.costLevel]);
    fact(facts, "Currency", dest.currency);
    fact(facts, "Good for", dest.activities.map(activityLabel).join(", "));

    $("detail-cost-note").textContent = "Rounded mid-range figures for one traveler, in " + dest.currency + ". They are illustrative, not live prices, and shift with season and travel style.";
    $("detail-cost-caption").textContent = "Sample daily costs for " + dest.name + " in " + dest.currency;
    const rows = $("detail-cost-rows");
    rows.replaceChildren();
    COST_ROWS.forEach((row) => {
      const tr = el("tr");
      const th = el("th", "", row.label);
      th.scope = "row";
      tr.append(th, el("td", "tnum", money(dest.costs[row.key], dest.currency)));
      rows.append(tr);
    });
    $("detail-cost-total").textContent = money(dailyTotal(dest), dest.currency);
    $("detail-plan").textContent = "Plan it myself";
    plan.dest = dest;
    plan.tier = null;
    if ($("plan-list")) {
      renderPriceBox(dest);
      resetPlans();
    }

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDetail() {
    const dialog = $("detail-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }


  /* ======================================================================
     Plans: sample packages, cheapest first. Choosing one creates a new trip
     and fills in its itinerary and budget in one step. Prices are rough
     samples built from the destination's daily costs, never live fares.
     Explore writes the itinerary and budget keys only for the brand-new
     trip it has just created, in exactly the formats those pages save.
     ====================================================================== */
  const TIERS = [
    { id: "saver", name: "Saver", length: "min", stay: 0.6, food: 0.7, transport: 1, fun: 0.5, flight: 3, flightLabel: "Economy flights", stayLabel: "Guesthouse room", busy: false, extras: [] },
    { id: "classic", name: "Classic", length: "mid", stay: 1, food: 1, transport: 1, fun: 1, flight: 4, flightLabel: "Economy flights with a checked bag", stayLabel: "3-star hotel", busy: false, extras: ["Guided walking tour"] },
    { id: "comfort", name: "Comfort", length: "max", stay: 1.6, food: 1.4, transport: 1.3, fun: 1.6, flight: 6, flightLabel: "Premium economy flights", stayLabel: "4-star hotel", busy: true, extras: ["Guided day trip"], transfer: true },
    { id: "luxury", name: "Luxury", length: "max", stay: 3, food: 2.2, transport: 2, fun: 2.6, flight: 12, flightLabel: "Business class flights", stayLabel: "5-star hotel", busy: true, extras: ["Private guide for the day", "Spa afternoon"], transfer: true }
  ];
  const plan = { dest: null, tier: null };

  function stayRange(dest) {
    const match = /(\d+)\s*to\s*(\d+)/.exec(dest.idealStay || "");
    const low = match ? Number(match[1]) : 4;
    const high = match ? Number(match[2]) : 6;
    return { min: Math.max(2, low), mid: Math.max(2, Math.round((low + high) / 2)), max: Math.max(2, high) };
  }
  function tierDays(dest, tier) { return stayRange(dest)[tier.length]; }
  function currencyDigits(code) {
    try { return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits; }
    catch (error) { return 2; }
  }
  /* Cost for one traveler, in whole units of the destination's currency. */
  function planCost(dest, tier) {
    const days = tierDays(dest, tier);
    const c = dest.costs;
    const per = {
      flight: Math.round(dailyTotal(dest) * tier.flight),
      stayNight: Math.round(c.stay * tier.stay),
      foodDay: Math.round(c.food * tier.food),
      transportDay: Math.round(c.transport * tier.transport),
      funDay: Math.round(c.activities * tier.fun)
    };
    const parts = {
      flight: per.flight,
      stay: per.stayNight * (days - 1),
      food: per.foodDay * days,
      transport: per.transportDay * days,
      fun: per.funDay * days
    };
    const subtotal = parts.flight + parts.stay + parts.food + parts.transport + parts.fun;
    parts.insurance = Math.round(subtotal * 0.04);
    return { days, nights: days - 1, per, parts, total: subtotal + parts.insurance };
  }
  function plansFor(dest) {
    return TIERS.map((tier) => ({ tier, cost: planCost(dest, tier) })).sort((a, b) => a.cost.total - b.cost.total);
  }
  function planIncludes(tier, cost) {
    return [
      tier.flightLabel + ", there and back",
      tier.stayLabel + ", " + plural(cost.nights, "night", "nights"),
      tier.busy ? "Two sights a day" : "One sight a day, free afternoons",
      "Meals, local transport and travel insurance"
    ].concat(tier.extras, tier.transfer ? ["Airport transfers"] : []);
  }

  function addDaysKey(key, count) {
    const date = parseDate(key);
    date.setDate(date.getDate() + count);
    return dateKey(date);
  }

  function buildPlanTrip(dest, tier, startDate, travelers) {
    const cost = planCost(dest, tier);
    const endDate = addDaysKey(startDate, cost.days - 1);
    const days = daysBetween(startDate, endDate);
    const trip = { id: makeId("trip"), title: dest.name + " · " + tier.name, destination: destinationLabel(dest), startDate, endDate, currency: dest.currency, travelers };

    const activities = [];
    const act = (date, startTime, duration, title, location, notes) => activities.push({ id: makeId("act"), title, date, startTime, duration, location: location || "", notes: notes || "" });
    let next = 0;
    const sight = () => dest.highlights[next++ % dest.highlights.length];
    const extras = tier.extras.slice();
    const middle = days.slice(1, -1);
    days.forEach((date, index) => {
      if (index === 0) {
        act(date, "08:00", 4, "Flight to " + dest.name, dest.name + " airport", tier.flightLabel + ". Sample time: change it to your real booking.");
        act(date, "12:30", 1, tier.transfer ? "Private transfer to the hotel" : "Get to the hotel", dest.name, "");
        act(date, "14:00", 1, "Check in: " + tier.stayLabel, dest.name, "");
        if (!middle.length && extras.length) act(date, "16:00", 2, extras.shift(), dest.name, "Included in the " + tier.name + " plan.");
        act(date, "19:30", 1.5, "Welcome dinner", dest.name, "");
      } else if (index === days.length - 1) {
        act(date, "09:00", 0.5, "Check out", dest.name, "");
        act(date, "10:00", 2, "Last walk and souvenirs", dest.name, "");
        act(date, "15:00", 4, "Flight home", dest.name + " airport", tier.flightLabel + ". Be at the airport two hours before.");
      } else {
        act(date, "09:30", 2.5, sight(), dest.name, "");
        act(date, "13:00", 1, "Lunch", dest.name, "");
        act(date, "15:00", 2.5, tier.busy ? sight() : "Free time to explore", dest.name, "");
        if (extras.length) act(date, "17:45", 1.5, extras.shift(), dest.name, "Included in the " + tier.name + " plan.");
        act(date, "19:30", 1.5, "Dinner", dest.name, "");
      }
    });

    const factor = Math.pow(10, currencyDigits(dest.currency));
    const expenses = [];
    const spend = (description, category, date, major) => {
      const amountMinor = Math.round(major * travelers * factor);
      if (amountMinor > 0) expenses.push({ id: makeId("exp"), description, amountMinor, category, date, status: "planned" });
    };
    const who = travelers === 1 ? "" : " (" + plural(travelers, "traveler", "travelers") + ")";
    spend(tier.flightLabel + ", round trip" + who, "transport", startDate, cost.parts.flight);
    spend(tier.stayLabel + ", " + plural(cost.nights, "night", "nights") + who, "accommodation", startDate, cost.parts.stay);
    spend("Local transport" + who, "transport", startDate, cost.parts.transport);
    spend("Travel insurance" + who, "other", startDate, cost.parts.insurance);
    days.forEach((date) => {
      const label = formatDate(date, { weekday: "short", month: "short", day: "numeric" });
      spend("Meals, " + label, "food", date, cost.per.foodDay);
      spend("Sights and activities, " + label, "activities", date, cost.per.funDay);
    });
    const spent = expenses.reduce((sum, expense) => sum + expense.amountMinor, 0);
    const budget = { version: 1, currency: dest.currency, totalBudgetMinor: Math.ceil(spent * 1.1 / factor) * factor, expenses };
    return { trip, itinerary: { version: 1, activities }, budget, spent: spent / factor };
  }

  function createFromPlan(dest, tier, startDate, travelers) {
    const built = buildPlanTrip(dest, tier, startDate, travelers);
    const keys = ["tp:itinerary:" + built.trip.id, "tp:budget:" + built.trip.id];
    const previous = state.trips;
    state.trips = [built.trip].concat(previous);
    const ok = storageSet(keys[0], JSON.stringify(built.itinerary)) && storageSet(keys[1], JSON.stringify(built.budget)) && saveTrips() && writeActive(built.trip);
    if (!ok) {
      keys.forEach(storageRemove);
      state.trips = previous;
      saveTrips();
      return null;
    }
    state.activeId = built.trip.id;
    state.activeStatus = "ok";
    renderActive();
    renderTrips();
    return built;
  }

  function renderPriceBox(dest) {
    const list = plansFor(dest);
    const cheapest = list[0];
    $("price-from").textContent = money(cheapest.cost.total, dest.currency);
    $("price-note").textContent = cheapest.tier.name + " plan, " + plural(cheapest.cost.days, "day", "days") + ". Sample price, not a live fare.";
    const includes = $("price-includes");
    includes.replaceChildren();
    planIncludes(cheapest.tier, cheapest.cost).slice(0, 3).forEach((text) => includes.append(el("li", "", text)));
    const listNode = $("plan-list");
    listNode.replaceChildren();
    list.forEach(({ tier, cost }, index) => {
      const card = el("li", "plan-card");
      card.dataset.tier = tier.id;
      const info = el("div", "plan-info");
      const name = el("h4", "plan-name", tier.name);
      if (index === 0) name.append(el("span", "badge badge-teal", "Lowest price"));
      const items = el("ul", "plan-includes");
      items.setAttribute("role", "list");
      planIncludes(tier, cost).forEach((text) => items.append(el("li", "", text)));
      info.append(name, el("p", "plan-meta", plural(cost.days, "day", "days") + " · " + plural(cost.nights, "night", "nights")), items);
      const price = el("div", "plan-price");
      const choose = button("Choose " + tier.name, "button button-primary");
      choose.dataset.plan = tier.id;
      price.append(el("b", "", money(cost.total, dest.currency)), el("span", "", "per person"), el("span", "plan-pair", money(cost.total * 2, dest.currency) + " for 2 travelers"), choose);
      card.append(info, price);
      listNode.append(card);
    });
  }

  function resetPlans() {
    $("detail-plans").hidden = true;
    $("plans-open").setAttribute("aria-expanded", "false");
    $("plans-open").textContent = "Other plans";
    $("plan-list").hidden = false;
    $("plan-book").hidden = true;
    $("plan-done").hidden = true;
  }
  function togglePlans() {
    const open = $("detail-plans").hidden;
    resetPlans();
    if (!open) return;
    $("detail-plans").hidden = false;
    $("plans-open").setAttribute("aria-expanded", "true");
    $("plans-open").textContent = "Hide plans";
    $("plans-title").scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
    $("plans-title").focus({ preventScroll: true });
  }
  function setBookError(id, message) {
    const input = $(id);
    const error = $(id + "-error");
    error.textContent = message;
    error.hidden = !message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }
  function updateBookTotal() {
    if (!plan.tier) return;
    const count = Number($("book-travelers").value);
    const cost = planCost(plan.dest, plan.tier);
    $("book-total").textContent = Number.isInteger(count) && count >= 1 && count <= MAX_TRAVELERS
      ? "Total: " + money(cost.total * count, plan.dest.currency) + " for " + plural(count, "traveler", "travelers") + "."
      : "";
  }
  function choosePlan(tierId) {
    const tier = TIERS.find((item) => item.id === tierId);
    if (!tier || !plan.dest) return;
    plan.tier = tier;
    const cost = planCost(plan.dest, tier);
    $("plan-list").hidden = true;
    $("plan-book").hidden = false;
    $("book-title").textContent = tier.name + " plan for " + plan.dest.name;
    $("book-summary").textContent = plural(cost.days, "day", "days") + ", " + money(cost.total, plan.dest.currency) + " per person. Pick a start date and say how many are going.";
    $("book-start").min = todayKey();
    if (!$("book-start").value) $("book-start").value = addDaysKey(todayKey(), 30);
    if (!$("book-travelers").value) $("book-travelers").value = "2";
    setBookError("book-start", "");
    setBookError("book-travelers", "");
    updateBookTotal();
    $("book-title").focus();
  }
  function onBookSubmit(event) {
    event.preventDefault();
    const start = $("book-start").value;
    const count = Number($("book-travelers").value);
    const startError = !parseDate(start) ? "Choose a start date." : start < todayKey() ? "Choose today or a later date." : "";
    const countError = $("book-travelers").value.trim() === "" || !Number.isInteger(count) || count < 1 || count > MAX_TRAVELERS ? "Enter a whole number from 1 to " + MAX_TRAVELERS + "." : "";
    setBookError("book-start", startError);
    setBookError("book-travelers", countError);
    if (startError || countError) {
      $(startError ? "book-start" : "book-travelers").focus();
      return;
    }
    const built = createFromPlan(plan.dest, plan.tier, start, count);
    if (!built) {
      setBookError("book-start", "This browser couldn't save the trip. Storage may be full or blocked.");
      return;
    }
    $("plan-book").hidden = true;
    $("plan-done").hidden = false;
    $("done-title").textContent = "“" + built.trip.title + "” is ready";
    $("done-text").textContent = formatRange(built.trip.startDate, built.trip.endDate) + ". The itinerary has " + plural(built.itinerary.activities.length, "activity", "activities") + " with flights there and back, and the budget lists " + plural(built.budget.expenses.length, "expense", "expenses") + " (" + money(built.spent, plan.dest.currency) + ", plus 10% spare in the limit). These are samples, so swap in your real bookings as you make them.";
    $("done-title").focus();
    announce("Created " + built.trip.title + " with its itinerary and budget.");
  }

  /* ======================================================================
     Active trip card (hero)
     ====================================================================== */
  const EMPTY_ART =
    '<svg viewBox="0 0 220 84" aria-hidden="true" focusable="false"><mask id="route-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="220" height="84"><path class="route-draw" d="M22 62 C58 8 118 96 192 22" fill="none" stroke="#fff" stroke-width="10" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></mask><path d="M22 62 C58 8 118 96 192 22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="5 7" stroke-linecap="round" mask="url(#route-reveal)"/><circle cx="22" cy="62" r="7" fill="none" stroke="var(--teal)" stroke-width="3"/><g class="route-drop"><path d="M192 36s10-8 10-15a10 10 0 1 0-20 0c0 7 10 15 10 15z" fill="var(--teal)"/><circle cx="192" cy="21" r="3.6" fill="var(--surface)"/></g></svg>';

  function planPeeks(trip) {
    const itinerary = readJson("tp:itinerary:" + trip.id);
    const budget = readJson("tp:budget:" + trip.id);
    const packing = readJson("tp:packing:" + trip.id);

    /* Itinerary: how many of the trip's days have at least one activity. */
    const acts = itinerary && Array.isArray(itinerary.activities) ? itinerary.activities : [];
    const days = daysBetween(trip.startDate, trip.endDate);
    const planned = days.filter((day) => acts.some((activity) => activity && activity.date === day)).length;
    let itineraryPeek = { text: "Nothing planned yet", ratio: 0 };
    if (acts.length && planned) itineraryPeek = { text: planned + " of " + plural(days.length, "day", "days") + " planned", ratio: planned / days.length };
    else if (acts.length) itineraryPeek = { text: plural(acts.length, "activity", "activities"), ratio: 0 };

    /* Budget: share of the total budget taken by all expenses. A plain ratio of two amounts saved in the same currency: nothing is converted. */
    const expenses = budget && Array.isArray(budget.expenses) ? budget.expenses : [];
    const total = expenses.reduce((sum, expense) => sum + (expense && Number.isSafeInteger(expense.amountMinor) && expense.amountMinor > 0 ? expense.amountMinor : 0), 0);
    const limit = budget && Number.isSafeInteger(budget.totalBudgetMinor) && budget.totalBudgetMinor > 0 ? budget.totalBudgetMinor : 0;
    let budgetPeek = { text: "No expenses yet", ratio: 0 };
    if (expenses.length && !limit) budgetPeek = { text: plural(expenses.length, "expense", "expenses"), ratio: null };
    else if (expenses.length && total > limit) budgetPeek = { text: "Over budget", ratio: 1, over: true };
    else if (expenses.length) {
      const share = total === limit ? 100 : Math.min(99, Math.max(total ? 1 : 0, Math.round((total / limit) * 100)));
      budgetPeek = { text: share + "% of budget used", ratio: total / limit };
    }

    /* Packing: items ticked off. */
    const items = packing && Array.isArray(packing.items) ? packing.items : [];
    const packed = items.filter((item) => item && item.packed === true).length;
    const packingPeek = items.length ? { text: packed + " of " + items.length + " packed", ratio: packed / items.length } : { text: "Empty list", ratio: 0 };

    return [itineraryPeek, budgetPeek, packingPeek];
  }

  function renderActive() {
    const host = $("active-trip");
    host.replaceChildren();
    const trip = activeTrip();

    if (!trip) {
      const box = el("section", "hero-empty");
      box.setAttribute("aria-labelledby", "active-title");
      const art = el("div", "hero-empty-art");
      art.innerHTML = EMPTY_ART;
      const heading = el("h2", "", "No active trip yet");
      heading.id = "active-title";
      const hasSaved = state.trips.length > 0;
      const text = el("p", "", hasSaved
        ? "Choose one of your saved trips below, or create a new one. The Itinerary, Budget and Packing pages follow the active trip."
        : "Create one below, or start from a destination. The Itinerary, Budget and Packing pages all follow the active trip.");
      const link = el("a", "button button-primary", hasSaved ? "Choose a trip" : "Create a trip");
      link.href = hasSaved ? "#saved-trips" : "#trip-form";
      link.dataset.jump = "";
      box.append(art, heading, text, link);
      host.append(box);
      return;
    }

    const ticket = el("section", "ticket");
    ticket.setAttribute("aria-labelledby", "active-title");

    const main = el("div", "ticket-main");
    const label = el("h2", "ticket-label", "Active trip");
    label.id = "active-title";
    const when = tripWhen(trip);
    const whenChip = el("p", "badge trip-when", when.text);
    whenChip.dataset.phase = when.phase;
    const top = el("div", "ticket-top");
    top.append(label, whenChip);
    const where = el("p", "ticket-where");
    where.append(icon("location"), el("span", "", trip.destination));

    const days = tripLength(trip);
    const spoken = el("p", "visually-hidden", formatDate(trip.startDate, { dateStyle: "long" }) + " to " + formatDate(trip.endDate, { dateStyle: "long" }) + ", " + plural(days, "day", "days"));
    const route = el("div", "route");
    route.setAttribute("aria-hidden", "true");
    const from = el("div", "route-end");
    from.append(el("b", "", formatDate(trip.startDate, { month: "short", day: "numeric" })), el("span", "", formatDate(trip.startDate, { year: "numeric" })));
    const line = el("div", "route-line");
    const pin = el("span", "route-pin");
    pin.append(icon("location"));
    line.append(el("span", "route-dot"), el("span", "route-dash"), el("span", "route-days", plural(days, "day", "days")), el("span", "route-dash"), pin);
    const to = el("div", "route-end");
    to.append(el("b", "", formatDate(trip.endDate, { month: "short", day: "numeric" })), el("span", "", formatDate(trip.endDate, { year: "numeric" })));
    route.append(from, line, to);

    const meta = el("div", "ticket-meta");
    meta.append(el("span", "badge badge-teal", plural(trip.travelers, "traveler", "travelers")), el("span", "badge", "Budget in " + trip.currency));
    main.append(top, el("p", "ticket-title", trip.title), where, spoken, route, meta);

    const stub = el("div", "ticket-stub");
    const peeks = planPeeks(trip);
    const tiles = el("div", "plan-tiles");
    [["./itinerary.html", "Itinerary"], ["./budget.html", "Budget"], ["./packing.html", "Packing"]].forEach((page, index) => {
      const tile = el("a", "plan-tile");
      tile.href = page[0];
      const peek = peeks[index];
      tile.append(el("strong", "", page[1]), el("span", "", peek.text));
      if (peek.ratio !== null) {
        const meter = el("i", "tile-meter");
        meter.setAttribute("aria-hidden", "true");
        if (peek.over) meter.dataset.over = "true";
        const fill = el("b", "");
        fill.style.width = Math.round(Math.min(1, Math.max(0, peek.ratio)) * 100) + "%";
        meter.append(fill);
        tile.append(meter);
      }
      tiles.append(tile);
    });
    const actions = el("div", "ticket-actions");
    const edit = button("Edit trip", "button button-secondary button-small");
    edit.dataset.action = "edit-active";
    edit.prepend(icon("edit"));
    actions.append(edit);
    if (state.trips.length > 1) {
      const switcher = el("a", "button button-text button-small", "Switch trip");
      switcher.href = "#saved-trips";
      switcher.dataset.jump = "";
      actions.append(switcher);
    }
    stub.append(tiles, actions);

    ticket.append(main, stub);
    host.append(ticket);
  }

  /* ======================================================================
     Saved trips
     ====================================================================== */
  function tripCard(trip) {
    const isActive = trip.id === state.activeId;
    const item = el("li", "trip-card");
    item.dataset.tripId = trip.id;
    item.dataset.active = String(isActive);

    const heading = el("h4", "", trip.title);
    heading.tabIndex = -1;
    if (isActive) heading.append(el("span", "badge badge-teal", "Active"));
    const where = el("p", "trip-where", trip.destination);
    const meta = el("p", "trip-meta", formatRange(trip.startDate, trip.endDate) + " · " + plural(tripLength(trip), "day", "days") + " · " + plural(trip.travelers, "traveler", "travelers") + " · " + trip.currency);

    const actions = el("div", "trip-card-actions");
    if (!isActive) {
      const use = button("Use this trip", "button button-primary button-small");
      use.dataset.action = "select";
      use.setAttribute("aria-label", "Use this trip: " + trip.title);
      actions.append(use);
    }
    const edit = button("Edit", "button button-secondary button-small");
    edit.dataset.action = "edit";
    edit.setAttribute("aria-label", "Edit " + trip.title);
    const remove = button("", "icon-button delete");
    remove.dataset.action = "delete";
    remove.setAttribute("aria-label", "Delete " + trip.title);
    remove.append(icon("delete"));
    const spacer = el("span", "spacer");
    actions.append(edit, spacer, remove);

    item.append(heading, where, meta, actions);
    return item;
  }

  function renderTrips() {
    const list = $("trip-list");
    list.replaceChildren();
    state.trips.forEach((trip) => list.append(tripCard(trip)));
    $("trip-count").textContent = String(state.trips.length);
    $("trip-empty").hidden = state.trips.length > 0;
  }

  function focusTrip(id) {
    const heading = document.querySelector('.trip-card[data-trip-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"] h4');
    if (heading) heading.focus();
  }

  function selectTrip(id) {
    const trip = state.trips.find((item) => item.id === id);
    if (!trip) return false;
    if (!writeActive(trip)) {
      showNotice("This browser couldn't switch the active trip. Storage may be full or blocked.", "warning");
      return false;
    }
    state.activeId = trip.id;
    state.activeStatus = "ok";
    renderActive();
    renderTrips();
    return true;
  }

  async function deleteTrip(id) {
    const trip = state.trips.find((item) => item.id === id);
    if (!trip) return;
    const sure = await confirmDialog({
      title: "Delete this trip?",
      message: "“" + trip.title + "” and its itinerary, budget and packing list will be removed from this browser. This can't be undone.",
      confirmLabel: "Delete trip",
      danger: true
    });
    if (!sure) return;
    const previous = state.trips;
    state.trips = previous.filter((item) => item.id !== id);
    if (!saveTrips()) {
      state.trips = previous;
      showNotice("This browser couldn't delete the trip. Storage may be blocked.", "warning");
      return;
    }
    MODULE_KEY_PREFIXES.forEach((prefix) => storageRemove(prefix + id));
    if (state.activeId === id) {
      storageRemove(TRIP_KEY);
      state.activeId = null;
      state.activeStatus = "none";
    }
    if (state.editingId === id) { clearForm(); setFormMode(null); }
    hideSuccess();
    renderActive();
    renderTrips();
    announce("Deleted " + trip.title + ".");
    const heading = $("saved-title");
    heading.focus();
  }

  /* ======================================================================
     Trip form
     ====================================================================== */
  function fieldNode(name) { return form[name]; }

  function showFieldError(name, message) {
    const input = fieldNode(name);
    const error = $(input.id + "-error");
    if (message) {
      input.setAttribute("aria-invalid", "true");
      error.textContent = message;
      error.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      error.textContent = "";
      error.hidden = true;
    }
  }

  function clearErrors() {
    FIELD_ORDER.forEach((name) => showFieldError(name, ""));
    const banner = $("form-error");
    banner.textContent = "";
    banner.hidden = true;
  }

  function showFormError(message) {
    const banner = $("form-error");
    banner.textContent = message;
    banner.hidden = false;
  }

  function readForm() {
    const editing = state.trips.find((trip) => trip.id === state.editingId);
    return {
      title: form.title.value,
      destination: form.destination.value,
      startDate: form.startDate.value,
      endDate: form.endDate.value,
      travelers: form.travelers.value,
      currency: editing ? editing.currency : form.currency.value
    };
  }

  function validateTrip(values) {
    const errors = {};
    const title = values.title.trim();
    const destination = values.destination.trim();
    if (!title) errors.title = "Enter a trip name.";
    else if (title.length > 80) errors.title = "Use 80 characters or fewer.";
    if (!destination) errors.destination = "Enter a destination.";
    else if (destination.length > 100) errors.destination = "Use 100 characters or fewer.";

    const start = parseDate(values.startDate);
    const end = parseDate(values.endDate);
    if (!values.startDate) errors.startDate = "Choose a start date.";
    else if (!start) errors.startDate = "Enter a real date, like 2027-06-03.";
    else if (start.getFullYear() < 1900 || start.getFullYear() > 2100) errors.startDate = "Choose a date between 1900 and 2100.";
    if (!values.endDate) errors.endDate = "Choose an end date.";
    else if (!end) errors.endDate = "Enter a real date, like 2027-06-09.";
    else if (end.getFullYear() < 1900 || end.getFullYear() > 2100) errors.endDate = "Choose a date between 1900 and 2100.";
    if (!errors.startDate && !errors.endDate) {
      if (values.endDate < values.startDate) errors.endDate = "The end date can't be before the start date.";
      else if (tripLength(values) > MAX_CREATE_DAYS) errors.endDate = "Trips can be up to " + MAX_CREATE_DAYS + " days long. Check the dates.";
    }

    const count = Number(values.travelers);
    if (String(values.travelers).trim() === "" || !Number.isInteger(count) || count < 1 || count > MAX_TRAVELERS) errors.travelers = "Enter a whole number from 1 to " + MAX_TRAVELERS + ".";
    if (!/^[A-Z]{3}$/.test(values.currency)) errors.currency = "Choose a currency.";
    return errors;
  }

  let currencyNames = null;
  function currencyLabel(code) {
    try {
      if (!currencyNames) currencyNames = new Intl.DisplayNames(undefined, { type: "currency" });
      const name = currencyNames.of(code);
      return name && name !== code ? code + " · " + name : code;
    } catch (error) {
      return code;
    }
  }

  function ensureCurrencyOption(code) {
    if (!Array.from(form.currency.options).some((option) => option.value === code)) {
      const option = el("option", "", currencyLabel(code));
      option.value = code;
      form.currency.append(option);
    }
  }

  function buildFormOptions() {
    const first = el("option", "", "Choose a currency");
    first.value = "";
    form.currency.append(first);
    CURRENCY_CODES.forEach((code) => {
      const option = el("option", "", currencyLabel(code));
      option.value = code;
      form.currency.append(option);
    });
    const list = $("destination-options");
    DESTINATIONS.forEach((dest) => {
      const option = el("option");
      option.value = destinationLabel(dest);
      list.append(option);
    });
  }

  function updateHints() {
    const dest = findDestinationByText(form.destination.value);
    $("trip-destination-hint").textContent = dest
      ? "Best time to go: " + dest.bestTime + ". Most people stay " + dest.idealStay + "."
      : "Pick a suggestion or type any place.";
    const box = $("estimate");
    if (!dest) { box.hidden = true; return; }
    const start = form.startDate.value;
    const end = form.endDate.value;
    const usable = parseDate(start) && parseDate(end) && end >= start && tripLength({ startDate: start, endDate: end }) <= MAX_CREATE_DAYS;
    const daily = dailyTotal(dest);
    if (usable) {
      const days = tripLength({ startDate: start, endDate: end });
      const each = daily * days;
      const count = Number(form.travelers.value);
      let text = "Sample estimate for " + plural(days, "day", "days") + ": about " + money(each, dest.currency) + " per person";
      if (Number.isInteger(count) && count > 1 && count <= MAX_TRAVELERS) text += ", or " + money(each * count, dest.currency) + " for " + count + " travelers";
      box.textContent = text + ". Illustrative mid-range costs in " + dest.currency + ", not live prices.";
    } else {
      box.textContent = "Sample cost: about " + money(daily, dest.currency) + " per person, per day, in " + dest.currency + ". Add your dates for a trip estimate.";
    }
    box.hidden = false;
  }

  function syncEndMin() {
    form.endDate.min = form.startDate.value && parseDate(form.startDate.value) ? form.startDate.value : "1900-01-01";
  }

  function setFormMode(trip) {
    state.editingId = trip ? trip.id : null;
    $("form-title").textContent = trip ? "Edit trip" : "Create a trip";
    $("form-sub").textContent = trip
      ? "Changing the dates keeps your itinerary activities. Any that fall outside the new range are flagged."
      : "Start from a destination above, or type your own.";
    $("save-trip").textContent = trip ? "Save changes" : "Save trip";
    $("reset-form").textContent = trip ? "Cancel editing" : "Clear form";
    form.currency.disabled = Boolean(trip);
    $("trip-currency-hint").textContent = trip ? "Fixed after creation so budget amounts keep their meaning." : "Choose carefully: it can't change once the trip is saved.";
  }

  function fillForm(values) {
    form.title.value = values.title || "";
    form.destination.value = values.destination || "";
    form.startDate.value = values.startDate || "";
    form.endDate.value = values.endDate || "";
    form.travelers.value = values.travelers === undefined ? "2" : String(values.travelers);
    if (values.currency) ensureCurrencyOption(values.currency);
    form.currency.value = values.currency || "";
    syncEndMin();
    updateHints();
  }

  function clearForm() {
    clearErrors();
    state.currencyTouched = false;
    fillForm({});
  }

  function showSuccess(message, options) {
    const box = $("form-success");
    $("form-success-text").textContent = message;
    box.querySelectorAll("a").forEach((link) => { link.hidden = !options.links; });
    $("make-active").hidden = !options.makeActive;
    box.dataset.tripId = options.tripId || "";
    box.hidden = false;
    box.focus();
  }

  function hideSuccess() {
    $("form-success").hidden = true;
  }

  function planFrom(dest) {
    hideSuccess();
    clearErrors();
    setFormMode(null);
    fillForm({
      title: dest.name + " trip",
      destination: destinationLabel(dest),
      travelers: 2,
      currency: dest.currency
    });
    state.currencyTouched = false;
    jumpTo($("trip-panel"), $("form-title"));
    announce("Trip form started for " + dest.name + ". Choose your dates, then save.");
  }

  function beginEdit(id) {
    const trip = state.trips.find((item) => item.id === id);
    if (!trip) return;
    hideSuccess();
    clearErrors();
    setFormMode(trip);
    fillForm(trip);
    jumpTo($("trip-panel"), $("form-title"));
    announce("Editing " + trip.title + ". Change the details, then save.");
  }

  function onSubmit(event) {
    event.preventDefault();
    hideSuccess();
    clearErrors();
    const values = readForm();
    const errors = validateTrip(values);
    FIELD_ORDER.forEach((name) => showFieldError(name, errors[name] || ""));
    const firstBad = FIELD_ORDER.find((name) => errors[name]);
    if (firstBad) {
      fieldNode(firstBad).focus();
      return;
    }

    const existing = state.trips.find((trip) => trip.id === state.editingId);
    const trip = {
      id: existing ? existing.id : makeId("trip"),
      title: values.title.trim(),
      destination: values.destination.trim(),
      startDate: values.startDate,
      endDate: values.endDate,
      currency: existing ? existing.currency : values.currency,
      travelers: Number(values.travelers)
    };

    const previous = state.trips;
    state.trips = existing ? previous.map((item) => (item.id === trip.id ? trip : item)) : [trip].concat(previous);
    if (!saveTrips()) {
      state.trips = previous;
      showFormError("This browser couldn't save the trip. Storage may be full or blocked.");
      return;
    }

    const makeActive = !existing || state.activeId === trip.id;
    if (makeActive) {
      if (!writeActive(trip)) {
        state.trips = previous;
        saveTrips();
        showFormError("This browser couldn't select the trip. Storage may be full or blocked.");
        return;
      }
      state.activeId = trip.id;
      state.activeStatus = "ok";
    }

    clearForm();
    setFormMode(null);
    renderActive();
    renderTrips();
    if (!existing) showSuccess("Saved “" + trip.title + "” and made it your active trip.", { links: true, makeActive: false, tripId: trip.id });
    else if (makeActive) showSuccess("Saved your changes to “" + trip.title + "”.", { links: true, makeActive: false, tripId: trip.id });
    else showSuccess("Saved your changes to “" + trip.title + "”.", { links: false, makeActive: true, tripId: trip.id });
  }

  function onMakeActive() {
    const id = $("form-success").dataset.tripId;
    const trip = state.trips.find((item) => item.id === id);
    if (!trip || !selectTrip(id)) return;
    showSuccess("“" + trip.title + "” is now your active trip.", { links: true, makeActive: false, tripId: id });
  }

  function onResetClick() {
    const wasEditing = Boolean(state.editingId);
    clearForm();
    setFormMode(null);
    announce(wasEditing ? "Editing cancelled." : "Form cleared.");
  }

  /* ======================================================================
     Wiring
     ====================================================================== */
  function refreshAll(message) {
    syncState();
    if (state.editingId && !state.trips.some((trip) => trip.id === state.editingId)) { clearForm(); setFormMode(null); }
    renderActive();
    renderTrips();
    if (message) showNotice(message, "info");
  }

  function wire() {
    document.addEventListener("click", onJumpClick);

    const filters = $("filters");
    filters.addEventListener("submit", (event) => event.preventDefault());
    filters.addEventListener("input", onFilterInput);
    filters.addEventListener("change", onFilterInput);
    $("clear-filters").addEventListener("click", () => { clearFilters(); $("search").focus(); });
    $("dest-empty-clear").addEventListener("click", () => { clearFilters(); $("search").focus(); });

    $("dest-grid").addEventListener("click", (event) => {
      const target = event.target.closest("button[data-action]");
      if (!target) return;
      const dest = DESTINATIONS.find((item) => item.id === target.dataset.dest);
      if (!dest) return;
      if (target.dataset.action === "details") openDetail(dest);
      if (target.dataset.action === "fav") toggleFavorite(dest);
      if (target.dataset.action === "plan") planFrom(dest);
    });

    const dialog = $("detail-dialog");
    $("detail-close").addEventListener("click", closeDetail);
    $("saved-only").addEventListener("click", () => {
      state.filters.saved = !state.filters.saved;
      applyFilters();
    });
    $("surprise").addEventListener("click", surprise);
    $("hero-search").addEventListener("submit", (event) => {
      event.preventDefault();
      const search = $("search");
      search.value = $("hero-q").value.trim();
      search.dispatchEvent(new Event("input", { bubbles: true }));
      jumpTo($("destinations"), $("destinations-title"));
    });
    $("dest-grid").addEventListener("pointermove", (event) => {
      const card = event.target.closest(".dest-card");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", (event.clientX - box.left) + "px");
      card.style.setProperty("--my", (event.clientY - box.top) + "px");
    });
    if ($("plans-open") && $("plan-book")) {
    $("plans-open").addEventListener("click", togglePlans);
    $("plan-list").addEventListener("click", (event) => {
      const chosen = event.target.closest("[data-plan]");
      if (chosen) choosePlan(chosen.dataset.plan);
    });
    $("book-back").addEventListener("click", () => {
      $("plan-book").hidden = true;
      $("plan-list").hidden = false;
      const again = document.querySelector('#plan-list [data-plan="' + (plan.tier ? plan.tier.id : "") + '"]');
      if (again) again.focus();
    });
    $("book-travelers").addEventListener("input", updateBookTotal);
    $("plan-book").addEventListener("submit", onBookSubmit);
    }
    $("detail-dismiss").addEventListener("click", closeDetail);
    $("detail-plan").addEventListener("click", () => {
      const dest = state.detailDest;
      closeDetail();
      if (dest) planFrom(dest);
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDetail(); });
    dialog.addEventListener("close", () => { $("detail-scene").replaceChildren(); });

    $("active-trip").addEventListener("click", (event) => {
      const target = event.target.closest("button[data-action]");
      if (target && target.dataset.action === "edit-active" && state.activeId) beginEdit(state.activeId);
    });

    $("trip-list").addEventListener("click", (event) => {
      const target = event.target.closest("button[data-action]");
      if (!target) return;
      const card = target.closest(".trip-card");
      if (!card) return;
      const id = card.dataset.tripId;
      if (target.dataset.action === "select") {
        const trip = state.trips.find((item) => item.id === id);
        if (trip && selectTrip(id)) { focusTrip(id); announce(trip.title + " is now your active trip."); }
      }
      if (target.dataset.action === "edit") beginEdit(id);
      if (target.dataset.action === "delete") deleteTrip(id);
    });

    form.root.addEventListener("submit", onSubmit);
    $("reset-form").addEventListener("click", onResetClick);
    $("make-active").addEventListener("click", onMakeActive);

    form.title.addEventListener("input", () => showFieldError("title", ""));
    form.destination.addEventListener("input", () => { showFieldError("destination", ""); updateHints(); });
    form.destination.addEventListener("change", () => {
      const dest = findDestinationByText(form.destination.value);
      if (dest && !state.editingId && !state.currencyTouched) form.currency.value = dest.currency;
      updateHints();
    });
    ["startDate", "endDate"].forEach((name) => {
      const handler = () => { showFieldError("startDate", ""); showFieldError("endDate", ""); syncEndMin(); updateHints(); };
      form[name].addEventListener("input", handler);
      form[name].addEventListener("change", handler);
    });
    form.travelers.addEventListener("input", () => { showFieldError("travelers", ""); updateHints(); });
    form.currency.addEventListener("change", () => { state.currencyTouched = true; showFieldError("currency", ""); });

    window.addEventListener("storage", (event) => {
      if (event.key === null || event.key === TRIP_KEY || event.key === TRIPS_KEY) refreshAll("Your trips were updated in another tab.");
      else if (event.key && event.key.indexOf("tp:") === 0) renderActive();
    });
    window.addEventListener("pageshow", (event) => { if (event.persisted) refreshAll(); });
  }

  function start() {
    initTheme();
    wireNotice();
    $("dest-lede").textContent = DESTINATIONS.length + " places to start from. Sample daily costs are rounded, illustrative figures in each place's own currency, not live prices.";
    buildFilterControls();
    buildCards();
    state.favorites = loadFavorites();
    syncSaved();
    watchPhotos();
    buildFormOptions();
    applyFilters();
    syncState();
    setFormMode(null);
    clearForm();
    renderActive();
    renderTrips();
    wire();
    reportStorageProblems();
  }

  /* With the database switched on, destinations added by admins come from it. The last copy is kept in
     this browser, so the page starts at once; the very first visit waits up to 3 seconds for the list. */
  if (cloudReady()) {
    let applied = CUSTOM_LOAD.items;
    const job = fetchCloudDestinations();
    const compareLater = () => job.then((items) => {
      if (canonical(items) !== canonical(applied)) {
        showNotice("An admin updated the destinations.", "info", { label: "Show them", onClick: () => window.location.reload() });
      }
    }).catch(() => null);
    if (CUSTOM_LOAD.items.length) {
      start();
      compareLater();
    } else {
      Promise.race([job, new Promise((resolve) => setTimeout(() => resolve(null), 3000))]).catch(() => null).then((items) => {
        if (items) { applyDestinationRows(items); applied = items; }
        start();
        compareLater();
      });
    }
  } else {
    start();
  }
})();
