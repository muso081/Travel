(function () {
  "use strict";

  const TRIP_KEY = "tp:trip";
  const STORAGE_PREFIX = "tp:packing:";
  const SAMPLE_TRIP = {
    id: "sample-lisbon",
    title: "Lisbon Escape",
    destination: "Lisbon, Portugal",
    startDate: "2026-11-17",
    endDate: "2026-11-22",
    currency: "EUR",
    travelers: 2
  };
  const SAMPLE_ITEMS = [
    { id: "sample-pack-1", name: "Passport", category: "documents", quantity: 2, traveler: "Traveler 1", packed: true },
    { id: "sample-pack-2", name: "Flight tickets", category: "documents", quantity: 1, traveler: "Traveler 2", packed: true },
    { id: "sample-pack-3", name: "Comfortable walking shoes", category: "clothing", quantity: 2, traveler: "Traveler 1", packed: false },
    { id: "sample-pack-4", name: "Light jacket", category: "clothing", quantity: 1, traveler: "Traveler 2", packed: false },
    { id: "sample-pack-5", name: "Toothbrush", category: "toiletries", quantity: 2, traveler: "Traveler 1", packed: true },
    { id: "sample-pack-6", name: "Phone charger", category: "electronics", quantity: 2, traveler: "Traveler 2", packed: false },
    { id: "sample-pack-7", name: "Sunscreen", category: "health", quantity: 1, traveler: "Traveler 1", packed: false }
  ];
  const CATEGORY_LABELS = {
    documents: "Documents",
    clothing: "Clothing",
    toiletries: "Toiletries",
    electronics: "Electronics",
    health: "Health",
    other: "Other"
  };
  const CATEGORIES = Object.keys(CATEGORY_LABELS);
  const TEMPLATE_ITEMS = {
    city: [
      { name: "Passport", category: "documents", quantity: 1 },
      { name: "Travel insurance", category: "documents", quantity: 1 },
      { name: "Comfortable walking shoes", category: "clothing", quantity: 1 },
      { name: "Toiletry bag", category: "toiletries", quantity: 1 },
      { name: "Phone charger", category: "electronics", quantity: 1 },
      { name: "Snacks", category: "other", quantity: 1 }
    ],
    beach: [
      { name: "Swimwear", category: "clothing", quantity: 2 },
      { name: "Beach towel", category: "clothing", quantity: 1 },
      { name: "Sunscreen", category: "toiletries", quantity: 1 },
      { name: "Water bottle", category: "other", quantity: 1 },
      { name: "Sunglasses", category: "other", quantity: 1 },
      { name: "Travel towel", category: "toiletries", quantity: 1 }
    ],
    hiking: [
      { name: "Trail snacks", category: "other", quantity: 1 },
      { name: "Hiking shoes", category: "clothing", quantity: 1 },
      { name: "Water filter bottle", category: "other", quantity: 1 },
      { name: "First aid kit", category: "health", quantity: 1 },
      { name: "Rain jacket", category: "clothing", quantity: 1 },
      { name: "Headlamp", category: "electronics", quantity: 1 }
    ],
    winter: [
      { name: "Thermal layers", category: "clothing", quantity: 2 },
      { name: "Winter coat", category: "clothing", quantity: 1 },
      { name: "Lip balm", category: "toiletries", quantity: 1 },
      { name: "Hand warmers", category: "health", quantity: 1 },
      { name: "Portable charger", category: "electronics", quantity: 1 },
      { name: "Gloves", category: "clothing", quantity: 1 }
    ]
  };

  const elements = {
    app: document.getElementById("packing-app"),
    noTrip: document.getElementById("no-trip"),
    notice: document.getElementById("notice"),
    subtitle: document.getElementById("trip-subtitle"),
    overallProgressValue: document.getElementById("overall-progress-value"),
    overallProgressCaption: document.getElementById("overall-progress-caption"),
    totalItemsValue: document.getElementById("total-items-value"),
    packedItemsValue: document.getElementById("packed-items-value"),
    remainingItemsValue: document.getElementById("remaining-items-value"),
    travelerProgress: document.getElementById("traveler-progress"),
    itemCount: document.getElementById("item-count"),
    packingList: document.getElementById("packing-list"),
    search: document.getElementById("search-items"),
    travelerFilter: document.getElementById("filter-traveler"),
    categoryFilter: document.getElementById("filter-category"),
    packedFilter: document.getElementById("filter-packed"),
    form: document.getElementById("packing-form"),
    formTitle: document.getElementById("form-title"),
    itemId: document.getElementById("item-id"),
    itemName: document.getElementById("item-name"),
    itemCategory: document.getElementById("item-category"),
    itemQuantity: document.getElementById("item-quantity"),
    itemTraveler: document.getElementById("item-traveler"),
    itemPacked: document.getElementById("item-packed"),
    formError: document.getElementById("form-error"),
    cancelEdit: document.getElementById("cancel-edit"),
    storageNote: document.getElementById("storage-note"),
    importButton: document.getElementById("import-button"),
    importFile: document.getElementById("import-file"),
    exportButton: document.getElementById("export-button"),
    printButton: document.getElementById("print-button"),
    clearButton: document.getElementById("clear-button"),
    travelerSuggestions: document.getElementById("traveler-suggestions")
  };

  let trip = null;
  let items = [];
  let storageAvailable = true;

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function isValidTrip(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const start = parseDate(value.startDate);
    const end = parseDate(value.endDate);
    return typeof value.id === "string" && value.id.trim().length > 0 &&
      typeof value.title === "string" && value.title.trim().length > 0 &&
      typeof value.destination === "string" && value.destination.trim().length > 0 &&
      start !== null && end !== null && end >= start &&
      typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency) &&
      Number.isInteger(value.travelers) && value.travelers > 0;
  }

  function showNotice(message, warning) {
    elements.notice.textContent = message;
    elements.notice.classList.toggle("is-warning", Boolean(warning));
    elements.notice.hidden = false;
  }

  function hideNotice() {
    elements.notice.hidden = true;
    elements.notice.textContent = "";
  }

  function setError(message) {
    elements.formError.textContent = message;
    elements.formError.hidden = !message;
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "item-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function safeText(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
  }

  function formatDate(dateString) {
    const date = parseDate(dateString);
    if (!date) {
      return dateString || "";
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(date);
  }

  function getDefaultTravelerNames() {
    if (!trip || !Number.isInteger(trip.travelers)) {
      return ["Traveler 1"];
    }
    const list = [];
    for (let index = 1; index <= trip.travelers; index += 1) {
      list.push("Traveler " + index);
    }
    return list;
  }

  function getTravelerNames() {
    const defaults = getDefaultTravelerNames();
    const existing = items.map((item) => item.traveler).filter((traveler) => traveler && traveler.trim().length > 0);
    const names = [...new Set([...defaults, ...existing])];
    return names.filter((name) => name && name.trim().length > 0);
  }

  function updateTravelerSuggestions() {
    const names = getTravelerNames();
    elements.travelerSuggestions.replaceChildren();
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      elements.travelerSuggestions.append(option);
    });

    const travelerOptions = ["All travelers", ...names];
    const current = elements.travelerFilter.value;
    elements.travelerFilter.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All travelers";
    elements.travelerFilter.append(allOption);

    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      elements.travelerFilter.append(option);
    });

    if (travelerOptions.includes(current) || !current) {
      elements.travelerFilter.value = current && current !== "all" && names.includes(current) ? current : "all";
    } else {
      elements.travelerFilter.value = "all";
    }
  }

  function readActiveTrip() {
    try {
      const raw = localStorage.getItem(TRIP_KEY);
      if (!raw) {
        localStorage.setItem(TRIP_KEY, JSON.stringify(SAMPLE_TRIP));
        return SAMPLE_TRIP;
      }
      const parsed = JSON.parse(raw);
      if (!isValidTrip(parsed)) {
        localStorage.setItem(TRIP_KEY, JSON.stringify(SAMPLE_TRIP));
        return SAMPLE_TRIP;
      }
      return parsed;
    } catch (error) {
      storageAvailable = false;
      showNotice("Trip data could not be read in this browser. Check storage settings and reload.", true);
      return null;
    }
  }

  function validateItem(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const name = safeText(value.name);
    const traveler = safeText(value.traveler);
    const category = value.category;
    const quantity = Number(value.quantity);

    if (!name || name.length > 120) {
      return null;
    }
    if (!traveler || traveler.length > 80) {
      return null;
    }
    if (!CATEGORIES.includes(category)) {
      return null;
    }
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
      return null;
    }
    if (typeof value.packed !== "boolean") {
      return null;
    }

    return {
      id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : makeId(),
      name,
      category,
      quantity,
      traveler,
      packed: Boolean(value.packed)
    };
  }

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + trip.id);
      if (!raw) {
        const sample = SAMPLE_ITEMS.map((item) => ({ ...item }));
        localStorage.setItem(STORAGE_PREFIX + trip.id, JSON.stringify({ version: 1, items: sample }));
        return sample;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        showNotice("Saved packing data was invalid. A fresh list is ready; saving will replace the invalid data.", true);
        const sample = SAMPLE_ITEMS.map((item) => ({ ...item }));
        localStorage.setItem(STORAGE_PREFIX + trip.id, JSON.stringify({ version: 1, items: sample }));
        return sample;
      }

      const source = Array.isArray(parsed.items) ? parsed.items : [];
      const next = [];
      const seen = new Set();
      source.forEach((entry) => {
        const valid = validateItem(entry);
        if (!valid || seen.has(valid.id)) {
          showNotice("Some saved packing items were invalid and were skipped.", true);
          return;
        }
        seen.add(valid.id);
        next.push(valid);
      });

      if (!next.length && source.length) {
        const sample = SAMPLE_ITEMS.map((item) => ({ ...item }));
        localStorage.setItem(STORAGE_PREFIX + trip.id, JSON.stringify({ version: 1, items: sample }));
        return sample;
      }

      return next;
    } catch (error) {
      showNotice("Saved packing data could not be read. A fresh list is ready; saving will replace the invalid data.", true);
      const sample = SAMPLE_ITEMS.map((item) => ({ ...item }));
      localStorage.setItem(STORAGE_PREFIX + trip.id, JSON.stringify({ version: 1, items: sample }));
      return sample;
    }
  }

  function saveItems() {
    if (!storageAvailable || !trip) {
      return false;
    }

    try {
      localStorage.setItem(STORAGE_PREFIX + trip.id, JSON.stringify({ version: 1, items }));
      elements.storageNote.textContent = "Changes save automatically in this browser.";
      return true;
    } catch (error) {
      elements.storageNote.textContent = "Could not save changes. Check this browser's storage settings.";
      showNotice("Changes could not be saved in this browser.", true);
      return false;
    }
  }

  function renderTripMeta() {
    if (!trip) {
      return;
    }

    const destination = trip.destination ? trip.destination.trim() : "Your destination";
    const dates = [trip.startDate, trip.endDate].filter(Boolean).map(formatDate).join(" – ");
    elements.subtitle.textContent = destination + " • " + (dates || "Dates not set") + " • " + trip.travelers + " traveler" + (trip.travelers === 1 ? "" : "s");
  }

  function getFilteredItems() {
    const search = safeText(elements.search.value).toLowerCase();
    const travelerValue = elements.travelerFilter.value;
    const categoryValue = elements.categoryFilter.value;
    const packedValue = elements.packedFilter.value;

    return items.filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search) || item.traveler.toLowerCase().includes(search);
      const matchesTraveler = travelerValue === "all" || item.traveler === travelerValue;
      const matchesCategory = categoryValue === "all" || item.category === categoryValue;
      const matchesPacked = packedValue === "all" || (packedValue === "packed" && item.packed) || (packedValue === "unpacked" && !item.packed);
      return matchesSearch && matchesTraveler && matchesCategory && matchesPacked;
    }).sort((first, second) => {
      if (first.packed !== second.packed) {
        return Number(first.packed) - Number(second.packed);
      }
      return first.name.localeCompare(second.name) || first.traveler.localeCompare(second.traveler);
    });
  }

  function renderProgress() {
    const total = items.length;
    const packed = items.filter((item) => item.packed).length;
    const percent = total ? Math.round((packed / total) * 100) : 0;

    elements.totalItemsValue.textContent = String(total);
    elements.packedItemsValue.textContent = String(packed);
    elements.remainingItemsValue.textContent = String(total - packed);
    elements.overallProgressValue.textContent = percent + "%";
    elements.overallProgressCaption.textContent = packed + " of " + total + " items packed";
    elements.itemCount.textContent = String(total);

    const travelerMap = new Map();
    getTravelerNames().forEach((traveler) => travelerMap.set(traveler, { total: 0, packed: 0 }));

    items.forEach((item) => {
      const traveler = travelerMap.get(item.traveler) || { total: 0, packed: 0 };
      traveler.total += 1;
      if (item.packed) {
        traveler.packed += 1;
      }
      travelerMap.set(item.traveler, traveler);
    });

    elements.travelerProgress.replaceChildren();
    if (!travelerMap.size) {
      const empty = document.createElement("p");
      empty.className = "empty-list";
      empty.textContent = "Traveler progress will appear as soon as you add items.";
      elements.travelerProgress.append(empty);
      return;
    }

    const travelerNames = Array.from(travelerMap.keys());
    travelerNames.forEach((traveler) => {
      const row = document.createElement("div");
      row.className = "traveler-row";

      const head = document.createElement("div");
      head.className = "traveler-row-head";

      const label = document.createElement("span");
      label.className = "traveler-label";
      label.textContent = traveler;

      const percent = document.createElement("span");
      percent.className = "traveler-percent";
      const travelerTotal = travelerMap.get(traveler).total;
      const travelerPacked = travelerMap.get(traveler).packed;
      const travelerRate = travelerTotal ? Math.round((travelerPacked / travelerTotal) * 100) : 0;
      percent.textContent = travelerRate + "%";

      head.append(label, percent);

      const track = document.createElement("div");
      track.className = "progress-track";
      const bar = document.createElement("span");
      bar.className = "progress-bar";
      bar.style.width = travelerRate + "%";
      track.append(bar);

      const summary = document.createElement("div");
      summary.className = "summary-caption";
      summary.textContent = travelerPacked + " of " + travelerTotal + " items packed";

      row.append(head, track, summary);
      elements.travelerProgress.append(row);
    });
  }

  function renderList() {
    const filtered = getFilteredItems();
    elements.packingList.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      const mark = document.createElement("span");
      mark.className = "empty-list-mark";
      mark.textContent = "+";
      const title = document.createElement("strong");
      title.textContent = "No items yet";
      const text = document.createElement("p");
      text.textContent = "Add your first item or apply a trip template.";
      empty.append(mark, title, text);
      elements.packingList.append(empty);
      return;
    }

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      const mark = document.createElement("span");
      mark.className = "empty-list-mark";
      mark.textContent = "?";
      const title = document.createElement("strong");
      title.textContent = "No matching items";
      const text = document.createElement("p");
      text.textContent = "Try another search, traveler, or status filter.";
      empty.append(mark, title, text);
      elements.packingList.append(empty);
      return;
    }

    filtered.forEach((item) => {
      const row = document.createElement("article");
      row.className = "packing-item" + (item.packed ? " is-packed" : "");

      const main = document.createElement("div");
      main.className = "item-main";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.packed;
      checkbox.setAttribute("aria-label", "Mark " + item.name + " as packed");
      checkbox.addEventListener("change", () => {
        item.packed = checkbox.checked;
        saveItems();
        render();
      });

      const copy = document.createElement("div");
      copy.className = "item-copy";

      const nameRow = document.createElement("div");
      nameRow.className = "item-name";

      const name = document.createElement("strong");
      name.textContent = item.name;
      nameRow.append(name);

      const badge = document.createElement("span");
      badge.className = "category-pill";
      badge.textContent = CATEGORY_LABELS[item.category] || "Other";
      nameRow.append(badge);

      const meta = document.createElement("div");
      meta.className = "item-muted";
      const quantity = document.createElement("span");
      quantity.textContent = "Qty: " + item.quantity;
      const traveler = document.createElement("span");
      traveler.textContent = item.traveler;
      meta.append(quantity, traveler);

      copy.append(nameRow, meta);
      main.append(checkbox, copy);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button button-secondary small";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => populateForm(item));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "button button-ghost small";
      del.textContent = "Delete";
      del.addEventListener("click", () => deleteItem(item.id));

      actions.append(edit, del);
      row.append(main, actions);
      elements.packingList.append(row);
    });
  }

  function render() {
    updateTravelerSuggestions();
    renderTripMeta();
    renderProgress();
    renderList();
  }

  function populateForm(item) {
    elements.itemId.value = item.id;
    elements.itemName.value = item.name;
    elements.itemCategory.value = item.category;
    elements.itemQuantity.value = String(item.quantity);
    elements.itemTraveler.value = item.traveler;
    elements.itemPacked.checked = item.packed;
    elements.formTitle.textContent = "Edit item";
    elements.cancelEdit.hidden = false;
    setError("");
    elements.itemName.focus();
  }

  function resetForm() {
    elements.form.reset();
    elements.itemId.value = "";
    elements.itemCategory.value = "documents";
    elements.itemPacked.checked = false;
    elements.formTitle.textContent = "Add an item";
    elements.cancelEdit.hidden = true;
    setError("");
  }

  function createItemFromForm() {
    const name = safeText(elements.itemName.value);
    const category = elements.itemCategory.value;
    const quantity = Number(elements.itemQuantity.value);
    const traveler = safeText(elements.itemTraveler.value);
    const packed = Boolean(elements.itemPacked.checked);

    if (!name) {
      throw new Error("Item name is required.");
    }
    if (!CATEGORIES.includes(category)) {
      throw new Error("Choose a valid category.");
    }
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
      throw new Error("Quantity must be a positive whole number.");
    }
    if (!traveler) {
      throw new Error("Traveler name is required.");
    }

    return {
      id: elements.itemId.value || makeId(),
      name,
      category,
      quantity,
      traveler,
      packed
    };
  }

  function handleSubmit(event) {
    event.preventDefault();

    try {
      const item = createItemFromForm();
      const existingIndex = items.findIndex((entry) => entry.id === item.id);

      if (existingIndex >= 0) {
        items[existingIndex] = item;
      } else {
        items.push(item);
      }

      saveItems();
      render();
      resetForm();
      hideNotice();
    } catch (error) {
      setError(error.message || "Please review the item details.");
    }
  }

  function deleteItem(id) {
    const target = items.find((item) => item.id === id);
    if (!target) {
      return;
    }

    const message = 'Delete "' + target.name + '" from the checklist?';
    if (!window.confirm(message)) {
      return;
    }

    items = items.filter((item) => item.id !== id);
    saveItems();
    render();
    if (elements.itemId.value === id) {
      resetForm();
    }
  }

  function clearChecklist() {
    if (!items.length) {
      showNotice("The checklist is already empty.", false);
      return;
    }

    if (!window.confirm("Clear the entire checklist? This cannot be undone.")) {
      return;
    }

    items = [];
    saveItems();
    render();
    resetForm();
    hideNotice();
  }

  function exportData() {
    const payload = {
      version: 1,
      tripId: trip.id,
      exportedAt: new Date().toISOString(),
      items
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (trip.title || "travel") + "-packing.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice("Packing checklist exported.", false);
  }

  function importData(file) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : null;

        if (!candidates) {
          throw new Error("The imported file does not contain a valid packing list.");
        }

        const next = [];
        const seen = new Set();
        candidates.forEach((entry) => {
          const item = validateItem(entry);
          if (!item || seen.has(item.id)) {
            return;
          }
          seen.add(item.id);
          next.push(item);
        });

        items = next;
        saveItems();
        render();
        resetForm();
        hideNotice();
        showNotice("Packing checklist imported successfully.", false);
      } catch (error) {
        showNotice("Import failed: the JSON file is missing valid packing items.", true);
      }
    };

    reader.onerror = () => {
      showNotice("Import failed while reading the selected file.", true);
    };

    reader.readAsText(file);
  }

  function applyTemplate(templateName) {
    const template = TEMPLATE_ITEMS[templateName];
    if (!template) {
      return;
    }

    const travelerNames = getTravelerNames();
    const seen = new Set(items.map((item) => item.name.toLowerCase() + "|" + item.category + "|" + item.traveler.toLowerCase()));

    template.forEach((entry, index) => {
      const traveler = travelerNames[(index % travelerNames.length)] || "Traveler 1";
      const candidate = {
        id: makeId(),
        name: safeText(entry.name),
        category: CATEGORIES.includes(entry.category) ? entry.category : "other",
        quantity: Number(entry.quantity) || 1,
        traveler,
        packed: false
      };

      const signature = candidate.name.toLowerCase() + "|" + candidate.category + "|" + candidate.traveler.toLowerCase();
      if (!candidate.name || seen.has(signature)) {
        return;
      }

      seen.add(signature);
      items.push(candidate);
    });

    saveItems();
    render();
    hideNotice();
    showNotice("Template applied without duplicating existing items.", false);
  }

  function attachListeners() {
    elements.form.addEventListener("submit", handleSubmit);
    elements.cancelEdit.addEventListener("click", () => {
      resetForm();
      hideNotice();
    });
    elements.search.addEventListener("input", renderList);
    elements.travelerFilter.addEventListener("change", renderList);
    elements.categoryFilter.addEventListener("change", renderList);
    elements.packedFilter.addEventListener("change", renderList);

    document.querySelectorAll(".template-button").forEach((button) => {
      button.addEventListener("click", () => {
        const templateName = button.getAttribute("data-template");
        applyTemplate(templateName);
      });
    });

    elements.importButton.addEventListener("click", () => elements.importFile.click());
    elements.importFile.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      importData(file);
      event.target.value = "";
    });
    elements.exportButton.addEventListener("click", exportData);
    elements.printButton.addEventListener("click", () => window.print());
    elements.clearButton.addEventListener("click", clearChecklist);
  }

  function init() {
    trip = readActiveTrip();
    if (!trip) {
      elements.noTrip.hidden = false;
      elements.app.hidden = true;
      return;
    }

    elements.noTrip.hidden = true;
    elements.app.hidden = false;
    items = loadItems();
    elements.travelerFilter.value = "all";
    elements.categoryFilter.value = "all";
    elements.packedFilter.value = "all";
    attachListeners();
    resetForm();
    render();
  }

  init();
})();
