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
    try { window.localStorage.setItem(key, text); return true; }
    catch (error) { return false; }
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
  function initTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light", false);
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
     Original illustrations: one flat SVG scene per destination, drawn in
     code. The markup is static and built only from constants in this file,
     so it is safe to insert as HTML. Each call gets a unique id suffix so
     the same scene can appear in the grid and in the details dialog.
     ====================================================================== */
  function frame(uid, top, bottom, defs, inner) {
    return '<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="sky-' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/></linearGradient>' + (defs || "") + "</defs>" +
      '<rect width="320" height="200" fill="url(#sky-' + uid + ')"/>' + inner + "</svg>";
  }

  function palm(x, y, scale, trunk, leaf) {
    const leaves = [[-58, 1], [-24, 1], [12, 1], [-58, -1], [-24, -1], [12, -1]].map((spec) =>
      '<path d="M0 0 Q16 -13 38 0 Q18 -4 0 0Z" transform="scale(' + spec[1] + ' 1) rotate(' + spec[0] + ')" fill="' + leaf + '"/>').join("");
    return '<g transform="translate(' + x + " " + y + ") scale(" + scale + ')"><path d="M0 0 Q6 -24 1 -46" stroke="' + trunk + '" stroke-width="3.4" fill="none" stroke-linecap="round"/><g transform="translate(1 -46)">' + leaves + "</g></g>";
  }

  function stonePine(x, y, scale) {
    return '<g transform="translate(' + x + " " + y + ") scale(" + scale + ')"><rect x="-2" y="-46" width="4" height="46" fill="#4a3a2a"/><ellipse cx="0" cy="-50" rx="25" ry="8" fill="#3f6a3a"/><ellipse cx="-8" cy="-57" rx="14" ry="6" fill="#4d7d45"/></g>';
  }

  const SCENES = {
    paris(u) {
      const block = (x, w, h, fill) => '<path d="M' + x + " 150 v-" + h + " l5 -6 h" + (w - 10) + " l5 6 v" + h + 'z" fill="' + fill + '"/>';
      let far = "";
      [[0, 30, 22], [30, 26, 30], [56, 34, 20], [90, 30, 26], [200, 30, 24], [230, 26, 32], [256, 34, 22], [290, 34, 28]].forEach((b) => { far += block(b[0], b[1], b[2], "#d792a6"); });
      let near = "";
      [[0, 38, 26], [38, 30, 34], [68, 40, 24], [250, 36, 28], [286, 40, 36]].forEach((b) => { near += block(b[0], b[1], b[2] + 6, "#6b4a69"); });
      let birds = "";
      [[40, 46], [62, 36], [262, 40]].forEach((b) => { birds += '<path d="M' + b[0] + " " + b[1] + ' q4 -5 8 0 q4 -5 8 0" stroke="#43304f" stroke-width="1.5" fill="none" stroke-linecap="round"/>'; });
      return frame(u, "#fde3c8", "#f4a3a8", "",
        '<circle cx="204" cy="82" r="48" fill="#fff1d2" opacity=".28"/><circle cx="204" cy="82" r="32" fill="#fff1d2"/>' +
        far +
        '<path d="M126 162 L144 116 L152 84 L158 48 L160 20 L162 48 L168 84 L176 116 L194 162 L176 162 Q160 114 144 162Z" fill="#43304f"/>' +
        '<rect x="140" y="113" width="40" height="6" rx="1.5" fill="#43304f"/><rect x="148" y="81" width="24" height="5" rx="1.5" fill="#43304f"/><rect x="154" y="45" width="12" height="4" rx="1.5" fill="#43304f"/>' +
        '<path d="M147 128 L173 114 M144 144 L176 126 M148 140 L172 124" stroke="#f4a3a8" stroke-opacity=".5" stroke-width="1.2" fill="none"/>' +
        near + birds +
        '<rect y="156" width="320" height="44" fill="#5a5a92"/><rect y="156" width="320" height="4" fill="#47477a"/>' +
        '<path d="M22 172 H92 M128 182 H226 M64 191 H150 M206 172 H292 M240 190 H300" stroke="#f4a3a8" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>');
    },

    rome(u) {
      let arches = "";
      for (let i = 0; i < 10; i += 1) {
        const x = 74 + i * 20;
        if (x < 214) arches += '<path d="M' + x + ' 96 v-8 a5 5 0 0 1 10 0 v8z" fill="#7a4632"/>';
        if (x < 250) arches += '<path d="M' + x + ' 118 v-8 a5 5 0 0 1 10 0 v8z" fill="#7a4632"/>';
        arches += '<path d="M' + x + ' 142 v-9 a5 5 0 0 1 10 0 v9z" fill="#7a4632"/>';
      }
      return frame(u, "#ffe3b3", "#f9b384", "",
        '<circle cx="62" cy="54" r="30" fill="#fff0c4" opacity=".35"/><circle cx="62" cy="54" r="20" fill="#fff0c4"/>' +
        '<path d="M176 100 L214 84 L270 96 L284 112 V152 H176Z" fill="#a8683f"/>' +
        '<path d="M66 152 V92 Q66 74 96 72 L214 72 L214 84 L234 84 L234 98 L254 98 L254 112 L272 112 V152Z" fill="#d49a66"/>' +
        '<path d="M66 98 H214 V101 H66Z M66 120 H254 V123 H66Z" fill="#ebb583"/>' +
        arches +
        '<rect x="66" y="144" width="206" height="8" fill="#b9794d"/>' +
        '<rect y="152" width="320" height="48" fill="#b9794d"/><path d="M0 164 H320 M0 178 H320 M0 192 H320" stroke="#a5663f" stroke-width="2"/>' +
        stonePine(32, 172, 1) + stonePine(296, 170, 0.9));
    },

    lisbon(u) {
      const wall = ["#f7dfa0", "#f2b5a6", "#a9d6c8", "#f4efe2", "#c9d8f0"];
      let town = "";
      for (let i = 0; i < 7; i += 1) {
        const x = i * 28;
        const top = 84 + i * 9;
        const w = 30 + (i % 2) * 4;
        town += '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + (160 - top) + '" fill="' + wall[i % wall.length] + '"/>';
        town += '<path d="M' + (x - 2) + " " + top + " L" + (x + 4) + " " + (top - 9) + " H" + (x + w - 4) + " L" + (x + w + 2) + " " + top + 'Z" fill="#d4694b"/>';
        town += '<rect x="' + (x + 5) + '" y="' + (top + 9) + '" width="6" height="9" rx="1" fill="#59708c"/><rect x="' + (x + w - 12) + '" y="' + (top + 9) + '" width="6" height="9" rx="1" fill="#59708c"/>';
        if (160 - top > 44) town += '<rect x="' + (x + 5) + '" y="' + (top + 30) + '" width="6" height="9" rx="1" fill="#59708c"/><rect x="' + (x + w - 12) + '" y="' + (top + 30) + '" width="6" height="9" rx="1" fill="#59708c"/>';
      }
      let hangers = "";
      for (let k = 1; k < 8; k += 1) {
        const t = k / 8;
        hangers += '<path d="M' + (225 + 70 * t).toFixed(1) + " 112 V" + (60 + 116 * t * (1 - t)).toFixed(1) + '"/>';
      }
      return frame(u, "#8fd3f2", "#e6f6f8", "",
        '<circle cx="266" cy="34" r="30" fill="#fff3b0" opacity=".4"/><circle cx="266" cy="34" r="18" fill="#fff3b0"/>' +
        '<path d="M150 124 Q210 96 260 108 T320 102 V130 H150Z" fill="#8cc4a8"/>' +
        '<rect x="150" y="120" width="170" height="42" fill="#3f9bd2"/>' +
        '<rect x="150" y="112" width="170" height="5" fill="#c9473a"/>' +
        '<rect x="222" y="58" width="6" height="56" fill="#d9503f"/><rect x="292" y="58" width="6" height="56" fill="#d9503f"/>' +
        '<path d="M150 110 L225 60 Q260 118 295 60 L320 96" stroke="#d9503f" stroke-width="2" fill="none"/>' +
        '<g stroke="#d9503f" stroke-width=".9" fill="none">' + hangers + "</g>" +
        town +
        '<rect y="160" width="320" height="40" fill="#8e929b"/><rect y="160" width="320" height="3" fill="#b9bcc4"/>' +
        '<g transform="translate(122 144)"><path d="M50 0 l10 -9 l10 9 M60 -9 V-12" stroke="#2b2f3a" fill="none" stroke-width="1.6" stroke-linecap="round"/><rect width="112" height="36" rx="7" fill="#f6c232"/><rect x="8" y="7" width="96" height="14" rx="3" fill="#7fa3bf"/><path d="M36 7 V21 M64 7 V21 M92 7 V21" stroke="#f6c232" stroke-width="3"/><rect y="26" width="112" height="4" fill="#fff6d6"/><circle cx="22" cy="38" r="6" fill="#2b2f3a"/><circle cx="90" cy="38" r="6" fill="#2b2f3a"/></g>');
    },

    santorini(u) {
      const cube = (x, y, w, h) =>
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#f8fafd"/><rect x="' + (x + w * 0.78) + '" y="' + y + '" width="' + (w * 0.22) + '" height="' + h + '" fill="#d8e2f1"/><path d="M' + (x + w * 0.3) + " " + (y + h) + ' v-6 a3 3 0 0 1 6 0 v6z" fill="#2f4d9a"/>';
      const dome = (x, y, w) =>
        '<path d="M' + x + " " + y + " a" + (w / 2) + " " + (w / 2) + ' 0 0 1 ' + w + ' 0z" fill="#2f67d6"/><rect x="' + (x + w / 2 - 1) + '" y="' + (y - w / 2 - 5) + '" width="2" height="5" fill="#f8fafd"/>';
      let houses = "";
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 6; c += 1) {
          const x = 146 + c * 29 + (r % 2) * 12;
          const edge = 118 - (x - 140) * 0.289;
          const w = 22 + ((c + r) % 3) * 3;
          const h = 13 + ((c * 2 + r) % 3) * 3;
          const y = edge + r * 15 - h + 6;
          houses += cube(x, y, w, h);
          if ((r === 0 && c === 3) || (r === 1 && c === 1) || (r === 2 && c === 4)) houses += dome(x, y, w);
        }
      }
      return frame(u, "#6f8fe4", "#ffcfae", "",
        '<circle cx="66" cy="112" r="40" fill="#fff2cf" opacity=".35"/><circle cx="66" cy="112" r="26" fill="#fff2cf"/>' +
        '<rect y="118" width="320" height="82" fill="#2b5db3"/><path d="M0 130 H320 M0 146 H320 M0 164 H320 M0 184 H320" stroke="#4a7fd0" stroke-width="2" opacity=".5"/>' +
        '<path d="M44 124 h44 M52 132 h28 M58 140 h16" stroke="#ffd9b0" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>' +
        '<path d="M140 200 V118 Q190 112 230 96 T320 66 V200Z" fill="#a8745c"/><path d="M140 150 Q200 140 250 122 T320 98 M140 176 Q210 166 260 150 T320 130" stroke="#8c5d49" stroke-width="3" fill="none"/>' +
        houses +
        '<rect x="226" y="34" width="12" height="44" fill="#f8fafd"/><rect x="233" y="34" width="5" height="44" fill="#d8e2f1"/><path d="M226 34 a6 6 0 0 1 12 0z" fill="#2f67d6"/><rect x="231" y="52" width="3" height="8" rx="1.5" fill="#2f4d9a"/>');
    },

    reykjavik(u) {
      const stars = [[18, 22], [44, 48], [78, 16], [110, 36], [150, 14], [206, 20], [238, 44], [268, 16], [300, 34], [292, 64], [30, 78], [130, 62], [190, 58]];
      let marks = "";
      stars.forEach((s, i) => { marks += '<circle cx="' + s[0] + '" cy="' + s[1] + '" r="' + (i % 3 === 0 ? 1.3 : 0.9) + '" fill="#fff" opacity=".85"/>'; });
      const defs = '<linearGradient id="aur-' + u + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cffc0" stop-opacity="0"/><stop offset=".55" stop-color="#5cffc0" stop-opacity=".7"/><stop offset="1" stop-color="#8b7bff" stop-opacity=".12"/></linearGradient>';
      const house = (x, w, h, roof) =>
        '<rect x="' + x + '" y="' + (166 - h) + '" width="' + w + '" height="' + h + '" fill="#f1f5fb"/><path d="M' + (x - 2) + " " + (166 - h) + " l" + (w / 2 + 2) + " -9 l" + (w / 2 + 2) + ' 9z" fill="' + roof + '"/><rect x="' + (x + w / 2 - 3) + '" y="' + (166 - h + 6) + '" width="6" height="7" fill="#f2c14e"/>';
      return frame(u, "#0a1230", "#21496b", defs,
        marks +
        '<path d="M-10 96 C40 30 100 84 160 40 S270 64 330 18 L330 66 C270 100 210 70 160 96 S60 124 -10 120Z" fill="url(#aur-' + u + ')"/>' +
        '<path d="M40 70 C90 30 130 70 190 52 S280 30 330 56 L330 78 C280 60 220 90 180 80 S90 100 40 88Z" fill="url(#aur-' + u + ')" opacity=".55"/>' +
        '<path d="M0 150 L40 110 L70 128 L112 96 L150 130 L190 104 L236 130 L280 100 L320 126 V170 H0Z" fill="#2c4d6e"/>' +
        '<path d="M0 160 L36 134 L70 150 L120 122 L170 152 L222 128 L270 150 L320 132 V170 H0Z" fill="#1b3350"/>' +
        '<rect y="160" width="320" height="40" fill="#dbe6f3"/><path d="M0 176 Q80 168 160 174 T320 172" stroke="#c4d3e6" stroke-width="3" fill="none"/>' +
        '<g fill="#eef3fa"><rect x="150" y="62" width="20" height="100"/><path d="M150 62 L160 26 L170 62Z"/><rect x="141" y="94" width="9" height="68"/><rect x="132" y="110" width="9" height="52"/><rect x="123" y="126" width="9" height="36"/><rect x="170" y="94" width="9" height="68"/><rect x="179" y="110" width="9" height="52"/><rect x="188" y="126" width="9" height="36"/></g>' +
        '<g fill="#b4c4db"><rect x="150" y="62" width="5" height="100"/><path d="M150 62 L160 26 V62Z"/><rect x="141" y="94" width="3" height="68"/><rect x="132" y="110" width="3" height="52"/><rect x="123" y="126" width="3" height="36"/><rect x="170" y="94" width="3" height="68"/><rect x="179" y="110" width="3" height="52"/><rect x="188" y="126" width="3" height="36"/></g>' +
        '<rect x="157" y="74" width="6" height="32" rx="3" fill="#21496b"/>' +
        house(40, 24, 18, "#e4584b") + house(68, 20, 14, "#4a8fe0") + house(236, 22, 16, "#f0b43a") + house(262, 26, 20, "#e4584b"));
    },

    tokyo(u) {
      const heights = [26, 38, 30, 48, 34, 22, 40, 30, 52, 28, 36, 24];
      let city = "";
      let lights = "";
      heights.forEach((h, i) => {
        city += '<rect x="' + (i * 28 - 6) + '" y="' + (166 - h) + '" width="25" height="' + h + '" fill="' + (i % 2 ? "#3c3a66" : "#2f2d55") + '"/>';
        for (let r = 0; r < Math.floor(h / 13); r += 1) {
          lights += '<rect x="' + (i * 28 - 1) + '" y="' + (166 - h + 5 + r * 13) + '" width="4" height="4" fill="#ffd98a" opacity=".85"/><rect x="' + (i * 28 + 10) + '" y="' + (166 - h + 5 + r * 13) + '" width="4" height="4" fill="#ffd98a" opacity=".55"/>';
        }
      });
      return frame(u, "#f9c9d4", "#fde8d2", "",
        '<circle cx="62" cy="62" r="34" fill="#e84a3a" opacity=".25"/><circle cx="62" cy="62" r="22" fill="#e84a3a"/>' +
        '<path d="M70 154 L128 90 L136 82 L150 74 L164 82 L172 90 L230 154Z" fill="#92a5cd"/>' +
        '<path d="M128 90 L136 82 L150 74 L164 82 L172 90 L163 95 L156 88 L149 97 L142 88 L135 96Z" fill="#fff"/>' +
        '<path d="M222 166 L233 108 H247 L258 166 H250 L240 128 L230 166Z" fill="#ee5a3a"/><rect x="228" y="100" width="24" height="9" rx="1.5" fill="#fff"/><rect x="228" y="104" width="24" height="3" fill="#ee5a3a"/><path d="M236 100 L238 66 H242 L244 100Z" fill="#ee5a3a"/><rect x="235" y="64" width="10" height="4" fill="#fff"/><path d="M240 64 V24" stroke="#ee5a3a" stroke-width="2.2"/>' +
        '<path d="M231 142 H249 M233 128 H247" stroke="#fff" stroke-width="2"/>' +
        city + lights +
        '<rect y="166" width="320" height="34" fill="#2a284e"/><path d="M0 184 H320" stroke="#f0d58c" stroke-width="2" stroke-dasharray="16 12"/>');
    },

    seoul(u) {
      let dots = "";
      for (let i = 0; i < 14; i += 1) dots += '<circle cx="' + (84 + i * 12) + '" cy="104" r="1.8" fill="#f6e6a8"/>';
      let columns = "";
      [84, 108, 132, 188, 212, 236].forEach((x) => { columns += '<rect x="' + (x - 2) + '" y="108" width="5" height="32" fill="#8e2a25"/>'; });
      return frame(u, "#cfe6ff", "#f9efdc", "",
        '<path d="M0 130 L34 92 L58 108 L98 66 L140 112 L170 96 L214 124 L250 90 L290 112 L320 100 V150 H0Z" fill="#a4bdb3"/>' +
        '<path d="M0 144 L44 112 L92 134 L150 104 L206 136 L262 110 L320 138 V160 H0Z" fill="#7a9a8d"/>' +
        '<rect x="96.4" y="52" width="3.2" height="16" fill="#fffaf0"/><rect x="97.6" y="32" width=".9" height="22" fill="#fffaf0"/><ellipse cx="98" cy="56" rx="6.5" ry="3.2" fill="#fffaf0"/>' +
        '<rect y="160" width="320" height="40" fill="#efe4cf"/><path d="M0 174 H320 M0 188 H320 M60 160 V174 M150 174 V188 M240 160 V174 M96 174 V188 M210 188 V200 M30 188 V200" stroke="#ddd0b6" stroke-width="2"/>' +
        '<rect x="40" y="152" width="240" height="8" fill="#b4ae9f"/><rect x="52" y="140" width="216" height="12" fill="#c9c3b6"/>' +
        '<g fill="#f2b134"><rect x="22" y="126" width="5" height="36" fill="#6b4a2f"/><circle cx="24" cy="116" r="16"/><circle cx="12" cy="126" r="11"/><circle cx="36" cy="124" r="11"/></g>' +
        '<g fill="#e8742f"><rect x="294" y="130" width="5" height="32" fill="#6b4a2f"/><circle cx="296" cy="120" r="15"/><circle cx="306" cy="130" r="10"/><circle cx="284" cy="128" r="10"/></g>' +
        '<rect x="122" y="72" width="76" height="20" fill="#b5362f"/><rect x="122" y="72" width="76" height="6" fill="#2a8f86"/>' +
        '<rect x="76" y="106" width="168" height="34" fill="#b5362f"/>' + columns +
        '<rect x="140" y="112" width="40" height="28" fill="#4a1f1a"/><rect x="76" y="100" width="168" height="8" fill="#2a8f86"/>' + dots +
        '<path d="M50 100 Q62 100 82 88 H238 Q258 100 270 100 Q252 112 232 109 Q160 115 88 109 Q68 112 50 100Z" fill="#3b4450"/><path d="M84 90 H236" stroke="#657285" stroke-width="2"/>' +
        '<path d="M100 78 Q110 78 122 64 H198 Q210 78 220 78 Q206 87 192 85 Q160 89 128 85 Q114 87 100 78Z" fill="#3b4450"/><path d="M124 66 H196" stroke="#657285" stroke-width="2"/>' +
        '<path d="M320 18 Q290 30 258 22" stroke="#6b4a2f" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<circle cx="300" cy="30" r="8" fill="#e8742f"/><circle cx="286" cy="22" r="7" fill="#f2b134"/><circle cx="272" cy="32" r="8" fill="#d6452f"/><circle cx="262" cy="20" r="6" fill="#e8742f"/><circle cx="308" cy="16" r="6" fill="#f2b134"/>');
    },

    bangkok(u) {
      const defs = '<g id="prang-' + u + '"><path d="M138 150 L140 118 L146 118 L148 92 L152 92 L153 66 L157 66 L157 44 L160 20 L163 44 L163 66 L167 66 L168 92 L172 92 L174 118 L180 118 L182 150Z" fill="#f3e4c8"/><path d="M160 20 L163 44 L163 66 L167 66 L168 92 L172 92 L174 118 L180 118 L182 150 L160 150Z" fill="#dcc79f"/><path d="M139 117 H181 M147 91 H173 M153 65 H167" stroke="#d79b2e" stroke-width="3"/><rect x="157" y="124" width="6" height="14" rx="3" fill="#a8742a"/><rect x="157" y="98" width="6" height="10" rx="3" fill="#a8742a"/><circle cx="160" cy="76" r="2.4" fill="#a8742a"/></g>';
      return frame(u, "#ff8f7a", "#ffd58a", defs,
        '<circle cx="262" cy="70" r="36" fill="#fff2c4" opacity=".3"/><circle cx="262" cy="70" r="22" fill="#fff2c4"/>' +
        '<use href="#prang-' + u + '" transform="translate(98 150) scale(.58) translate(-160 -150)"/><use href="#prang-' + u + '" transform="translate(222 150) scale(.58) translate(-160 -150)"/><use href="#prang-' + u + '"/>' +
        '<rect y="150" width="320" height="50" fill="#1f5a74"/><path d="M148 156 v26 M160 156 v36 M172 156 v26 M96 156 v14 M224 156 v14" stroke="#f0c66a" stroke-width="3" opacity=".35" stroke-linecap="round"/><path d="M12 170 H76 M240 190 H310 M30 188 H100" stroke="#3f8aa3" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>' +
        '<path d="M196 176 h66 l-8 9 h-50z" fill="#3d2a22"/><path d="M214 176 q11 -15 30 0z" fill="#d9503f"/><path d="M260 178 L292 168" stroke="#3d2a22" stroke-width="2" stroke-linecap="round"/><circle cx="294" cy="167" r="2.4" fill="#3d2a22"/>' +
        '<ellipse cx="6" cy="152" rx="36" ry="16" fill="#1d4a3a"/><ellipse cx="316" cy="152" rx="36" ry="16" fill="#1d4a3a"/>');
    },

    bali(u) {
      const terrace = (y, fill, edge) =>
        '<path d="M0 ' + y + " Q70 " + (y - 20) + " 150 " + (y - 6) + " T320 " + (y - 12) + ' V200 H0Z" fill="' + fill + '"/><path d="M0 ' + y + " Q70 " + (y - 20) + " 150 " + (y - 6) + " T320 " + (y - 12) + '" stroke="' + edge + '" stroke-width="2.4" fill="none"/>';
      return frame(u, "#bfeadf", "#fff3c4", "",
        '<circle cx="246" cy="40" r="34" fill="#fff4c2" opacity=".4"/><circle cx="246" cy="40" r="20" fill="#fff4c2"/>' +
        '<path d="M40 126 L120 74 L168 104 L222 58 L320 124 V130 H40Z" fill="#86bfae" opacity=".8"/>' +
        terrace(124, "#b3e08e", "#d9f2b0") + terrace(142, "#8ccf78", "#c5eba0") +
        '<path d="M96 150 V136 H104 V122 H112 V108 H120 V94 H128 V80 H136 V150Z M224 150 V136 H216 V122 H208 V108 H200 V94 H192 V80 H184 V150Z" fill="#9a5b45"/>' +
        '<path d="M96 136 H104 V122 H112 V108 H120 V94 H128 V80 H136 M224 136 H216 V122 H208 V108 H200 V94 H192 V80 H184" stroke="#cf8f6b" stroke-width="2" fill="none"/>' +
        '<rect x="128" y="86" width="8" height="64" fill="#7c4636"/><rect x="184" y="86" width="8" height="64" fill="#7c4636"/>' +
        '<path d="M104 128 H112 M112 114 H120 M120 100 H128 M216 128 H208 M208 114 H200 M200 100 H192" stroke="#7c4636" stroke-width="1.6"/>' +
        '<rect x="140" y="146" width="40" height="4" fill="#c79a78"/><rect x="144" y="142" width="32" height="4" fill="#d6ac8a"/><rect x="148" y="138" width="24" height="4" fill="#e3c0a0"/>' +
        terrace(160, "#5fb35e", "#a7de86") + terrace(178, "#3f9650", "#86cf78") + terrace(196, "#2f7d46", "#68b66a") +
        palm(36, 186, 1.1, "#6b4a2f", "#2d7a3e") + palm(292, 184, 1, "#6b4a2f", "#2d7a3e"));
    },

    samarkand(u) {
      let tiles = "";
      for (let i = 0; i < 9; i += 1) tiles += '<circle cx="' + (128 + i * 8) + '" cy="65" r="1.8" fill="#fff"/>';
      let diamonds = "";
      for (let j = 0; j < 5; j += 1) diamonds += '<path d="M131 ' + (84 + j * 11) + ' l4 4 l-4 4 l-4 -4z M189 ' + (84 + j * 11) + ' l4 4 l-4 4 l-4 -4z" fill="#8fd0e6"/>';
      const minaret = (x) => '<rect x="' + x + '" y="52" width="9" height="100" fill="#dcb07a"/><path d="M' + x + ' 52 a4.5 4.5 0 0 1 9 0z" fill="#17a5b3"/><path d="M' + x + " 70 h9 M" + x + " 84 h9 M" + x + ' 98 h9" stroke="#2a6fb0" stroke-width="3"/>';
      const side = (x) =>
        '<path d="M' + (x + 8) + ' 106 a22 22 0 0 1 44 0z" fill="#17a5b3"/><path d="M' + (x + 30) + " 84 v22 M" + (x + 20) + " 86 q-3 10 0 20 M" + (x + 40) + ' 86 q3 10 0 20" stroke="#0d7f8c" fill="none" stroke-width="1.5"/><rect x="' + (x + 18) + '" y="104" width="24" height="6" fill="#c99a62"/><rect x="' + x + '" y="108" width="60" height="44" fill="#dcb07a"/><path d="M' + (x + 8) + " 140 v-10 a5 5 0 0 1 10 0 v10z M" + (x + 25) + " 140 v-10 a5 5 0 0 1 10 0 v10z M" + (x + 42) + ' 140 v-10 a5 5 0 0 1 10 0 v10z" fill="#25507e"/>';
      return frame(u, "#58b1e6", "#d7eef8", "",
        '<circle cx="270" cy="38" r="28" fill="#fff6c8" opacity=".5"/><circle cx="270" cy="38" r="16" fill="#fff6c8"/>' +
        '<rect y="148" width="320" height="52" fill="#e6c79c"/>' +
        side(48) + side(212) + minaret(36) + minaret(275) +
        '<rect x="122" y="60" width="76" height="92" fill="#d9a86a"/><rect x="122" y="60" width="76" height="12" fill="#1d9aa6"/>' + tiles +
        '<rect x="126" y="76" width="10" height="58" fill="#2a6fb0"/><rect x="184" y="76" width="10" height="58" fill="#2a6fb0"/>' + diamonds +
        '<path d="M140 152 V98 a20 20 0 0 1 40 0 V152z" fill="#25507e"/><path d="M147 152 V100 a13 13 0 0 1 26 0 V152z" fill="#3b7bb5"/>' +
        minaret(112) + minaret(199) +
        '<path d="M0 170 Q80 160 160 168 T320 164 V200 H0Z" fill="#d9b585"/><ellipse cx="14" cy="168" rx="14" ry="22" fill="#2f6b4a"/><ellipse cx="306" cy="168" rx="14" ry="22" fill="#2f6b4a"/>');
    },

    marrakech(u) {
      let merlons = "";
      for (let i = 0; i < 9; i += 1) merlons += '<rect x="' + (i * 12 + 3) + '" y="110" width="7" height="8" fill="#c8643b"/><rect x="' + (210 + i * 12 + 3) + '" y="110" width="7" height="8" fill="#c8643b"/>';
      let windows = "";
      [84, 104, 124].forEach((y) => { [144, 156, 168].forEach((x) => { windows += '<path d="M' + x + " " + (y + 12) + ' v-7 a3.4 3.4 0 0 1 6.8 0 v7z" fill="#6e2f1e"/>'; }); });
      return frame(u, "#f6a96f", "#fde5ba", "",
        '<circle cx="82" cy="62" r="40" fill="#ffe9b8" opacity=".4"/><circle cx="82" cy="62" r="24" fill="#ffe9b8"/>' +
        '<path d="M0 120 L48 84 L72 98 L120 60 L168 100 L214 74 L262 104 L320 80 V154 H0Z" fill="#c18a87"/>' +
        '<path d="M108 70 L120 60 L132 72 L124 70 L120 77 L114 70Z M204 80 L214 74 L224 82 L218 80 L214 85 L209 80Z M300 88 L320 80 V92 L310 90 L305 94Z" fill="#fff7ee"/>' +
        '<rect y="118" width="110" height="36" fill="#c8643b"/><rect x="210" y="118" width="110" height="36" fill="#c8643b"/>' + merlons +
        '<path d="M30 154 V138 a10 10 0 0 1 20 0 V154z" fill="#6e2f1e"/><path d="M262 154 V138 a10 10 0 0 1 20 0 V154z" fill="#6e2f1e"/>' +
        '<rect x="138" y="52" width="44" height="102" fill="#c05a34"/><rect x="172" y="52" width="10" height="102" fill="#a84b2d"/>' +
        '<rect x="138" y="74" width="44" height="6" fill="#e3a06a"/><rect x="138" y="98" width="44" height="6" fill="#e3a06a"/><rect x="138" y="118" width="44" height="6" fill="#e3a06a"/>' + windows +
        '<rect x="148" y="38" width="24" height="14" fill="#c05a34"/><rect x="148" y="38" width="24" height="4" fill="#e3a06a"/>' +
        '<circle cx="160" cy="31" r="5.5" fill="#f3c25b"/><circle cx="160" cy="23" r="3.6" fill="#f3c25b"/><circle cx="160" cy="18" r="2.4" fill="#f3c25b"/>' +
        '<rect y="154" width="320" height="46" fill="#b96e43"/><path d="M0 172 H320 M0 188 H320" stroke="#a95f38" stroke-width="2"/>' +
        palm(82, 172, 1.1, "#5a3d27", "#3c7a3a") + palm(250, 172, 1, "#5a3d27", "#3c7a3a"));
    },

    cairo(u) {
      return frame(u, "#f8cf93", "#fff0d0", "",
        '<circle cx="236" cy="54" r="40" fill="#f7a248" opacity=".3"/><circle cx="236" cy="54" r="26" fill="#f7a248"/>' +
        '<path d="M0 142 Q60 124 120 138 T240 132 T320 138 V160 H0Z" fill="#ebbc77"/>' +
        '<path d="M12 150 L46 112 L80 150Z" fill="#e6b062"/><path d="M46 112 L80 150 H46Z" fill="#bf8540"/>' +
        '<path d="M188 150 L230 96 L272 150Z" fill="#e6b062"/><path d="M230 96 L272 150 H230Z" fill="#bf8540"/>' +
        '<path d="M62 150 L150 64 L238 150Z" fill="#e8b568"/><path d="M150 64 L238 150 H150Z" fill="#c58d44"/>' +
        '<path d="M150 64 L150 150" stroke="#d9a255" stroke-width="1.5"/>' +
        '<rect y="150" width="320" height="50" fill="#e3ae65"/>' +
        '<path d="M0 172 Q70 158 140 170 T320 164 V200 H0Z" fill="#d99a4e"/>' +
        '<g transform="translate(238 134)" fill="#5a3a22"><ellipse cx="30" cy="22" rx="18" ry="8"/><circle cx="30" cy="14" r="6.5"/><path d="M46 20 L56 6" stroke="#5a3a22" stroke-width="6" stroke-linecap="round" fill="none"/><ellipse cx="61" cy="4" rx="7" ry="3.6" transform="rotate(-12 61 4)"/><rect x="18" y="26" width="3" height="16"/><rect x="24" y="26" width="3" height="16"/><rect x="36" y="26" width="3" height="16"/><rect x="42" y="26" width="3" height="16"/><path d="M12 20 q-7 4 -5 14" stroke="#5a3a22" stroke-width="2" fill="none"/></g>');
    },

    "cape-town"(u) {
      return frame(u, "#79c3e8", "#e5f5f8", "",
        '<circle cx="270" cy="34" r="26" fill="#fff6c8" opacity=".5"/><circle cx="270" cy="34" r="14" fill="#fff6c8"/>' +
        '<path d="M0 132 L16 112 L62 100 L74 78 H248 L262 100 L320 118 V150 H0Z" fill="#6b8a9a"/>' +
        '<path d="M80 78 L72 150 M120 78 V150 M168 78 L170 150 M214 78 L222 150" stroke="#587888" stroke-width="3" opacity=".7"/>' +
        '<path d="M0 150 L0 126 Q30 98 62 118 Q78 128 80 150Z" fill="#4a6a5a"/>' +
        '<path d="M0 150 L0 140 Q60 128 140 136 T320 132 V150Z" fill="#4f7a6a" opacity=".55"/>' +
        '<path d="M70 80 Q80 66 96 72 Q104 60 124 66 Q138 56 158 64 Q176 58 192 66 Q210 60 228 70 Q246 70 252 82 Q258 90 250 98 Q238 92 232 102 Q220 94 210 100 Q196 92 184 96 Q170 88 156 92 Q140 86 128 90 Q112 86 100 90 Q84 90 70 80Z" fill="#fff"/>' +
        '<path d="M236 98 Q246 104 244 116 Q236 110 230 114 Q232 104 236 98Z" fill="#fff" opacity=".9"/>' +
        '<rect y="150" width="320" height="50" fill="#1f8aa8"/><path d="M0 160 H320 M0 170 H320" stroke="#52b4cc" stroke-width="2" opacity=".6"/>' +
        '<path d="M0 178 Q80 168 160 174 T320 170 V200 H0Z" fill="#f1d9a8"/><path d="M0 178 Q80 168 160 174 T320 170" stroke="#fff" stroke-width="3" fill="none" opacity=".85"/>' +
        '<g transform="translate(206 168)"><rect x="0" y="8" width="18" height="16" fill="#e4573d"/><path d="M-2 8 L9 -2 L20 8Z" fill="#fff"/><rect x="24" y="8" width="18" height="16" fill="#f2b134"/><path d="M22 8 L33 -2 L44 8Z" fill="#fff"/><rect x="48" y="8" width="18" height="16" fill="#3ba4a0"/><path d="M46 8 L57 -2 L68 8Z" fill="#fff"/></g>');
    },

    "new-york"(u) {
      const defs = '<pattern id="win-' + u + '" width="9" height="11" patternUnits="userSpaceOnUse"><rect x="2.5" y="3" width="3.5" height="4.5" fill="#ffd36b" opacity=".85"/></pattern>';
      const tower = (x, y, w, fill) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (162 - y) + '" fill="' + fill + '"/>';
      const lit = (x, y, w) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (162 - y) + '" fill="url(#win-' + u + ')"/>';
      let far = "";
      [[0, 100, 28], [24, 84, 26], [48, 106, 30], [76, 92, 24], [214, 96, 28], [240, 80, 26], [266, 104, 28], [292, 90, 30]].forEach((b) => { far += tower(b[0], b[1], b[2], "#4a5496"); });
      let near = "";
      [[0, 118, 36], [34, 96, 30], [64, 124, 26], [88, 104, 30], [200, 110, 28], [226, 92, 26], [250, 120, 30], [280, 100, 40]].forEach((b) => { near += tower(b[0], b[1], b[2], "#1f2650") + lit(b[0], b[1], b[2]); });
      return frame(u, "#3b4a8c", "#f2a897", defs,
        '<circle cx="258" cy="46" r="26" fill="#ffeccc" opacity=".28"/><circle cx="258" cy="46" r="14" fill="#ffeccc" opacity=".92"/>' +
        far +
        '<rect x="134" y="100" width="52" height="62" fill="#2b3470"/><rect x="143" y="78" width="34" height="22" fill="#2b3470"/><rect x="150" y="62" width="20" height="16" fill="#2b3470"/><rect x="155" y="48" width="10" height="14" fill="#2b3470"/><rect x="159" y="22" width="2" height="26" fill="#2b3470"/>' +
        lit(134, 100, 52) +
        '<circle cx="160" cy="48" r="2.6" fill="#ffd36b"/><circle cx="160" cy="62" r="2" fill="#ffd36b"/>' +
        near +
        '<rect y="162" width="320" height="38" fill="#151a3a"/><path d="M0 188 H320" stroke="#e9c46a" stroke-width="2" stroke-dasharray="18 14"/>' +
        '<g transform="translate(48 164)"><path d="M12 6 l7 -9 h22 l7 9z" fill="#f7c531"/><rect y="6" width="60" height="13" rx="4" fill="#f7c531"/><path d="M21 6 l5 -6 h7 v6z M35 6 v-6 h6 l4 6z" fill="#2b3470"/><rect x="25" y="-9" width="12" height="4" rx="1" fill="#fff6d6"/><circle cx="14" cy="20" r="5" fill="#0d1130"/><circle cx="46" cy="20" r="5" fill="#0d1130"/></g>');
    },

    banff(u) {
      const cap = (x, y, w) => '<path d="M' + x + " " + y + " L" + (x - w / 2) + " " + (y + w * 0.8) + " L" + (x - w * 0.2) + " " + (y + w * 0.62) + " L" + x + " " + (y + w * 0.86) + " L" + (x + w * 0.2) + " " + (y + w * 0.62) + " L" + (x + w / 2) + " " + (y + w * 0.8) + 'Z" fill="#fff"/>';
      const tree = (x, y, k) => '<g transform="translate(' + x + " " + y + ") scale(" + k + ')"><rect x="-1.6" y="8" width="3.2" height="8" fill="#3b2a1d"/><path d="M0 -34 L8 -18 H4 L11 -4 H5 L14 10 H-14 L-5 -4 H-11 L-4 -18 H-8Z" fill="#1f4a3a"/></g>';
      const peaks = "M0 112 L30 86 L52 98 L88 56 L112 84 L136 68 L168 38 L196 74 L224 52 L258 88 L288 70 L320 98 V134 H0Z";
      return frame(u, "#9ad4f0", "#eaf6fa", "",
        '<circle cx="48" cy="36" r="22" fill="#fff6c8" opacity=".5"/><circle cx="48" cy="36" r="12" fill="#fff6c8"/>' +
        '<path d="' + peaks + '" fill="#8fa9c4"/>' +
        '<path d="M168 38 L196 74 L224 52 L258 88 V134 H168Z" fill="#7a95b3" opacity=".55"/>' +
        cap(88, 56, 30) + cap(168, 38, 36) + cap(224, 52, 30) + cap(136, 68, 18) + cap(288, 70, 20) + cap(30, 86, 16) +
        '<path d="M0 150 V128 Q40 112 80 130 T170 126 T260 128 T320 120 V150Z" fill="#2f5d4a"/>' +
        '<rect y="132" width="320" height="68" fill="#2bb5c9"/>' +
        '<g transform="translate(0 266) scale(1 -1)" opacity=".32"><path d="' + peaks + '" fill="#145f78"/></g>' +
        '<path d="M20 150 H110 M150 158 H300 M60 168 H170 M210 176 H290" stroke="#8fe6ee" stroke-width="2" stroke-linecap="round" opacity=".6"/>' +
        '<g transform="translate(196 160)"><path d="M-24 0 q24 8 48 0 l-7 6 h-34z" fill="#d9503f"/><circle cx="0" cy="-8" r="3.2" fill="#2b2f3a"/><rect x="-2.4" y="-5" width="4.8" height="6" rx="1.5" fill="#f2b134"/><path d="M-12 -2 L10 4" stroke="#6b4a2f" stroke-width="1.4"/></g>' +
        '<path d="M0 200 V176 Q60 164 120 178 T240 176 T320 168 V200Z" fill="#244f3d"/>' +
        tree(18, 176, 1.15) + tree(44, 182, 0.9) + tree(292, 172, 1.2) + tree(268, 180, 0.85));
    },

    cusco(u) {
      let terraces = "";
      [[126, "#7fbb62"], [140, "#6aa856"], [154, "#8cc56d"], [168, "#6aa856"], [182, "#7fbb62"]].forEach((t, i) => {
        terraces += '<path d="M0 ' + t[0] + " Q80 " + (t[0] - 10) + " 170 " + (t[0] - 2) + " T320 " + (t[0] - 8) + " V200 H0Z\" fill=\"" + t[1] + "\"/>";
        terraces += '<path d="M0 ' + t[0] + " Q80 " + (t[0] - 10) + " 170 " + (t[0] - 2) + " T320 " + (t[0] - 8) + '" stroke="#a9a79a" stroke-width="3" fill="none"/>';
      });
      const house = (x, y, w, h) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="#b9b6a8"/><path d="M' + (x - 3) + " " + y + " L" + (x + w / 2) + " " + (y - 12) + " L" + (x + w + 3) + " " + y + 'Z" fill="#c9b172"/><path d="M' + (x + w / 2 - 3) + " " + (y + h) + " L" + (x + w / 2 - 2) + " " + (y + h - 9) + " H" + (x + w / 2 + 2) + " L" + (x + w / 2 + 3) + " " + (y + h) + 'Z" fill="#5f5b50"/>';
      return frame(u, "#9fd6e8", "#f1f6ea", "",
        '<circle cx="262" cy="40" r="24" fill="#fff6c8" opacity=".5"/><circle cx="262" cy="40" r="13" fill="#fff6c8"/>' +
        '<path d="M0 132 L48 78 L88 112 L116 88 L150 132 V150 H0Z" fill="#8fb6a0"/><path d="M200 150 L250 92 L286 122 L320 82 V150Z" fill="#7aa591"/>' +
        '<path d="M110 150 L146 54 Q156 34 168 52 L222 150Z" fill="#4c7a4a"/><path d="M158 44 Q166 40 168 52 L222 150 H164Z" fill="#3b6340"/><path d="M134 100 L146 60 M150 120 L158 74 M184 118 L170 70" stroke="#3b6340" stroke-width="2" opacity=".7"/>' +
        '<ellipse cx="90" cy="130" rx="60" ry="8" fill="#fff" opacity=".65"/><ellipse cx="236" cy="124" rx="52" ry="7" fill="#fff" opacity=".6"/><ellipse cx="170" cy="138" rx="46" ry="6" fill="#fff" opacity=".55"/>' +
        terraces +
        house(28, 118, 28, 18) + house(64, 124, 24, 16) + house(100, 112, 30, 20) +
        '<g transform="translate(252 166)" fill="#e0cfae"><ellipse cx="0" cy="0" rx="22" ry="11"/><path d="M14 -6 L22 -34" stroke="#e0cfae" stroke-width="8" stroke-linecap="round" fill="none"/><ellipse cx="26" cy="-37" rx="8" ry="5.5" transform="rotate(-18 26 -37)"/><path d="M22 -43 l1 -7 l4 6z M29 -43 l2 -7 l3 7z"/><rect x="-14" y="6" width="4" height="18"/><rect x="-6" y="6" width="4" height="18"/><rect x="8" y="6" width="4" height="18"/><rect x="15" y="6" width="4" height="18"/><path d="M-20 -3 q-8 2 -6 10" stroke="#e0cfae" stroke-width="3" fill="none"/><ellipse cx="-4" cy="-3" rx="14" ry="5" fill="#c9b690" opacity=".6"/><circle cx="29" cy="-38" r="1.1" fill="#2b2f3a"/></g>');
    },

    rio(u) {
      return frame(u, "#4fbfe9", "#e3f6fd", "",
        '<circle cx="272" cy="38" r="28" fill="#fff2a8" opacity=".5"/><circle cx="272" cy="38" r="16" fill="#fff2a8"/>' +
        '<path d="M0 156 Q50 120 100 138 T210 128 T320 140 V160 H0Z" fill="#8cc7a0"/>' +
        '<path d="M20 156 L60 98 Q84 64 100 64 Q116 64 130 100 L170 156Z" fill="#4c8a5a"/><path d="M100 64 Q116 64 130 100 L170 156 H100Z" fill="#3c7549"/>' +
        '<g fill="#f6f6ee"><rect x="98.5" y="40" width="3" height="24"/><rect x="86" y="44" width="28" height="3.4" rx="1.5"/><circle cx="100" cy="38" r="3"/></g><rect x="95" y="62" width="10" height="5" fill="#d9d9cf"/>' +
        '<path d="M152 156 C156 128 172 118 188 124 C196 128 198 140 198 156Z" fill="#6aa07a"/>' +
        '<path d="M196 156 C198 118 214 92 242 92 C270 92 284 120 290 156Z" fill="#7c8f8c"/><path d="M242 92 C270 92 284 120 290 156 H242Z" fill="#66797a"/><path d="M214 101 C222 91 262 91 270 103 C256 97 228 97 214 101Z" fill="#5c9a62"/>' +
        '<path d="M188 122 L242 92" stroke="#2f3d48" stroke-width="1.2"/><rect x="210" y="104" width="9" height="6" rx="1.5" fill="#e4483a"/><path d="M214 104 V106" stroke="#2f3d48" stroke-width="1"/>' +
        '<rect y="150" width="320" height="34" fill="#1ea4c9"/><path d="M0 160 H320 M0 170 H320" stroke="#5ac6e2" stroke-width="2" opacity=".6"/>' +
        '<path d="M0 178 Q80 160 160 169 T320 164 V200 H0Z" fill="#f4dfae"/><path d="M0 178 Q80 160 160 169 T320 164" stroke="#fff" stroke-width="3.2" fill="none" opacity=".85"/>' +
        '<g transform="translate(60 190)"><path d="M0 0 V-14" stroke="#6b4a2f" stroke-width="1.6"/><path d="M-10 -14 a10 10 0 0 1 20 0z" fill="#e4483a"/></g><g transform="translate(112 186)"><path d="M0 0 V-14" stroke="#6b4a2f" stroke-width="1.6"/><path d="M-10 -14 a10 10 0 0 1 20 0z" fill="#f2b134"/></g><g transform="translate(240 190)"><path d="M0 0 V-14" stroke="#6b4a2f" stroke-width="1.6"/><path d="M-10 -14 a10 10 0 0 1 20 0z" fill="#2f67d6"/></g>');
    },

    sydney(u) {
      const sail = (x, k, fill) => '<path transform="translate(' + x + " 142) scale(" + k + ')" d="M0 0 C2 -36 20 -58 48 -70 C40 -44 38 -22 36 0Z" fill="' + fill + '"/>';
      let hangers = "";
      for (let t = 0.1; t < 0.95; t += 0.08) {
        const x = (1 - t) * (1 - t) * 204 + 2 * t * (1 - t) * 262 + t * t * 330;
        const y = 126 - 208 * t * (1 - t);
        hangers += '<path d="M' + x.toFixed(1) + " " + y.toFixed(1) + ' V126"/>';
      }
      return frame(u, "#ffb98f", "#ffe9c9", "",
        '<circle cx="70" cy="62" r="40" fill="#fff0cc" opacity=".4"/><circle cx="70" cy="62" r="24" fill="#fff0cc"/>' +
        '<path d="M0 142 V134 H20 V126 H44 V136 H70 V130 H96 V138 H128 V132 H320 V142Z" fill="#cdaaa2"/>' +
        '<rect y="140" width="320" height="60" fill="#2587c6"/><path d="M0 154 H320 M0 170 H320 M0 186 H320" stroke="#6fb7e6" stroke-width="2" opacity=".55"/>' +
        '<path d="M204 126 Q262 22 330 126" stroke="#3a4658" stroke-width="5" fill="none"/><path d="M204 126 Q262 40 330 126" stroke="#3a4658" stroke-width="2" fill="none"/>' +
        '<g stroke="#3a4658" stroke-width="1">' + hangers + "</g>" +
        '<rect x="196" y="124" width="124" height="5" fill="#2f3a4c"/><rect x="198" y="96" width="14" height="40" fill="#b8a48a"/>' +
        '<rect x="82" y="142" width="160" height="10" fill="#e6d8c2"/><path d="M76 152 H248 v6 H76z" fill="#cdbca3"/>' +
        sail(92, 1, "#fbfdff") + sail(116, 0.82, "#e4eef7") + sail(138, 0.66, "#fbfdff") +
        '<g transform="translate(300 0) scale(-1 1)">' + sail(94, 0.74, "#f4f9fd") + sail(114, 0.6, "#dde9f4") + sail(130, 0.46, "#f4f9fd") + "</g>" +
        '<g transform="translate(26 164)"><path d="M0 8 h50 l-6 10 h-38z" fill="#f4f4f0"/><rect x="2" y="8" width="46" height="3" fill="#1f9d6b"/><rect x="10" y="-2" width="28" height="10" rx="2" fill="#fff"/><path d="M15 1 h4 M23 1 h4 M31 1 h4" stroke="#2587c6" stroke-width="3"/></g>');
    }
  };

  function sceneMarkup(destId, uid) {
    const make = SCENES[destId];
    return make ? make(destId + "-" + uid) : "";
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
    filters: { query: "", region: "all", activity: "all" }
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

  function storageRemove(key) {
    try { window.localStorage.removeItem(key); return true; }
    catch (error) { return false; }
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
  const searchText = new Map(DESTINATIONS.map((dest) => [dest.id, strip([dest.name, dest.country, dest.region, dest.blurb, dest.highlights.join(" "), dest.activities.map(activityLabel).join(" ")].join(" "))]));

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
  let sceneCount = 0;
  function renderScene(host, destId) {
    sceneCount += 1;
    host.innerHTML = sceneMarkup(destId, sceneCount);
  }

  function pips(level) {
    const wrap = el("span", "pips");
    wrap.setAttribute("aria-hidden", "true");
    for (let step = 1; step <= 4; step += 1) wrap.append(el("i", step <= level ? "on" : ""));
    return wrap;
  }

  const cardNodes = new Map();

  function buildCards() {
    const grid = $("dest-grid");
    DESTINATIONS.forEach((dest) => {
      const item = el("li", "dest-card");
      const scene = el("div", "dest-scene");
      renderScene(scene, dest.id);

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
      item.append(scene, body);
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
        words.every((word) => text.includes(word));
      cardNodes.get(dest.id).hidden = !visible;
      if (visible) shown += 1;
    });
    const total = DESTINATIONS.length;
    const filtered = Boolean(words.length) || filters.region !== "all" || filters.activity !== "all";
    $("results-count").textContent = shown === total ? "Showing all " + total + " destinations" : shown === 0 ? "No destinations match" : "Showing " + shown + " of " + total + " destinations";
    $("clear-filters").hidden = !filtered;
    $("dest-empty").hidden = shown !== 0;
    $("dest-grid").hidden = shown === 0;
  }

  function clearFilters() {
    state.filters = { query: "", region: "all", activity: "all" };
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
    renderScene($("detail-scene"), dest.id);

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
    $("detail-plan").textContent = "Plan a trip to " + dest.name;

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDetail() {
    const dialog = $("detail-dialog");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
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
      if (target.dataset.action === "plan") planFrom(dest);
    });

    const dialog = $("detail-dialog");
    $("detail-close").addEventListener("click", closeDetail);
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

  start();
})();
