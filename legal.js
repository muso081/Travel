/* TravelTogether: Privacy and terms script.
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
    const who = el("div", "account-head");
    const words = el("div", "account-words");
    words.append(el("p", "account-who", name), el("p", "account-email", session.user.email));
    who.append(el("span", "account-avatar account-avatar-lg", initialsFor(name)), words);
    panel.append(who);
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

  /* Liquid Glass highlight: a soft light follows the mouse across glass surfaces */
  function initGlint() {
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const GLASS = ".button, .choice, .theme-toggle, .account-button, .account-login, .header-inner, .header-cta, .hero-pick";
    let lit = null;
    let frame = 0;
    let last = null;
    const dim = () => { if (lit) { lit.classList.remove("glint"); lit = null; } };
    const paint = () => {
      frame = 0;
      const event = last;
      const target = event.target instanceof Element ? event.target.closest(GLASS) : null;
      if (target !== lit) { dim(); if (target) { lit = target; lit.classList.add("glint"); } }
      if (!lit) return;
      const box = lit.getBoundingClientRect();
      lit.style.setProperty("--gx", Math.round(event.clientX - box.left) + "px");
      lit.style.setProperty("--gy", Math.round(event.clientY - box.top) + "px");
    };
    document.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      last = event;
      if (!frame) frame = window.requestAnimationFrame(paint);
    }, { passive: true });
    document.addEventListener("pointerleave", dim);
    window.addEventListener("blur", dim);
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
    initGlint();
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
     Privacy Policy and Terms of Use: static text, plus the shared header
     (theme switch and account menu) and an "on this page" highlight.
     ====================================================================== */
  function startLegal() {
    initTheme();
    const links = Array.from(document.querySelectorAll(".legal-toc a"));
    if (!links.length || !("IntersectionObserver" in window)) return;
    const byId = new Map(links.map((link) => [link.getAttribute("href").slice(1), link]));
    const seen = new Set();
    const mark = () => {
      const first = Array.from(byId.keys()).find((id) => seen.has(id));
      links.forEach((link) => link.removeAttribute("aria-current"));
      if (first) byId.get(first).setAttribute("aria-current", "true");
    };
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) seen.add(entry.target.id); else seen.delete(entry.target.id); });
      mark();
    }, { rootMargin: "-90px 0px -55% 0px" });
    byId.forEach((_, id) => { const section = document.getElementById(id); if (section) watcher.observe(section); });
  }
  startLegal();
})();
