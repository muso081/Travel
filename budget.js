(function () {
  "use strict";

  const TRIP_KEY = "tp:trip";
  const STORAGE_PREFIX = "tp:budget:";
  const CATEGORIES = ["transport", "accommodation", "food", "activities", "shopping", "other"];
  const CATEGORY_COLORS = {
    transport: "#0284c7",
    accommodation: "#7c3aed",
    food: "#ea580c",
    activities: "#0d9488",
    shopping: "#db2777",
    other: "#64748b"
  };
  const MAX_AMOUNT_MINOR = 1000000000000;
  const elements = {
    app: document.getElementById("budget-app"),
    noTrip: document.getElementById("no-trip"),
    notice: document.getElementById("notice"),
    subtitle: document.getElementById("trip-subtitle"),
    currencyPrefix: document.getElementById("currency-prefix"),
    currencyLabel: document.getElementById("currency-label"),
    totalBudget: document.getElementById("total-budget"),
    saveBudget: document.getElementById("save-budget"),
    budgetError: document.getElementById("budget-error"),
    remaining: document.getElementById("remaining-total"),
    remainingCaption: document.getElementById("remaining-caption"),
    planned: document.getElementById("planned-total"),
    paid: document.getElementById("paid-total"),
    perTraveler: document.getElementById("traveler-total"),
    chartTotal: document.getElementById("chart-total"),
    chart: document.getElementById("category-chart"),
    expenseCount: document.getElementById("expense-count"),
    expenseList: document.getElementById("expense-list"),
    filterStatus: document.getElementById("filter-status"),
    filterCategory: document.getElementById("filter-category"),
    form: document.getElementById("expense-form"),
    formTitle: document.getElementById("form-title"),
    expenseId: document.getElementById("expense-id"),
    description: document.getElementById("description"),
    amount: document.getElementById("amount"),
    category: document.getElementById("category"),
    date: document.getElementById("expense-date"),
    formError: document.getElementById("form-error"),
    saveExpense: document.getElementById("save-expense"),
    cancelEdit: document.getElementById("cancel-edit"),
    storageNote: document.getElementById("storage-note"),
    importButton: document.getElementById("import-button"),
    importFile: document.getElementById("import-file"),
    exportButton: document.getElementById("export-button")
  };

  let trip = null;
  let expenses = [];
  let totalBudgetMinor = null;
  let fractionDigits = 2;
  let storageAvailable = true;

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function isValidTrip(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const start = parseDate(value.startDate);
    const end = parseDate(value.endDate);
    return typeof value.id === "string" && value.id.trim().length > 0 &&
      typeof value.title === "string" && value.title.trim().length > 0 &&
      typeof value.destination === "string" && value.destination.trim().length > 0 &&
      start !== null && end !== null && end >= start &&
      typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency) &&
      Number.isInteger(value.travelers) && value.travelers > 0;
  }

  function amountToMinor(value, allowZero) {
    const text = String(value).trim();
    const decimalPattern = fractionDigits === 0 ? /^\d+$/ : new RegExp("^\\d+(?:\\.\\d{1," + fractionDigits + "})?$");
    if (!decimalPattern.test(text)) return null;
    const [wholeText, fractionText = ""] = text.split(".");
    const factor = 10 ** fractionDigits;
    const whole = Number(wholeText);
    const fraction = fractionDigits ? Number(fractionText.padEnd(fractionDigits, "0")) : 0;
    const amount = whole * factor + fraction;
    if (!Number.isSafeInteger(amount) || amount > MAX_AMOUNT_MINOR || (!allowZero && amount <= 0)) return null;
    return amount;
  }

  function formatMinor(amount) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: trip.currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    }).format(amount / (10 ** fractionDigits));
  }

  function formatDate(key) {
    const date = parseDate(key);
    return date ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date) : key;
  }

  function showNotice(message, warning) {
    elements.notice.textContent = message;
    elements.notice.classList.toggle("is-warning", Boolean(warning));
    elements.notice.hidden = false;
  }

  function setError(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function validateExpense(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.id !== "string" || !value.id.trim() || value.id.length > 100 ||
      typeof value.description !== "string" || !value.description.trim() || value.description.length > 100 ||
      !Number.isSafeInteger(value.amountMinor) || value.amountMinor <= 0 || value.amountMinor > MAX_AMOUNT_MINOR ||
      !CATEGORIES.includes(value.category) || !parseDate(value.date) ||
      (value.status !== "planned" && value.status !== "paid")) return null;
    return {
      id: value.id,
      description: value.description.trim(),
      amountMinor: value.amountMinor,
      category: value.category,
      date: value.date,
      status: value.status
    };
  }

  function loadBudget() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + trip.id);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        parsed.version !== 1 || !Array.isArray(parsed.expenses) || parsed.expenses.length > 5000 ||
        (parsed.totalBudgetMinor !== null && (!Number.isSafeInteger(parsed.totalBudgetMinor) || parsed.totalBudgetMinor < 0 || parsed.totalBudgetMinor > MAX_AMOUNT_MINOR))) {
        showNotice("Saved budget data was invalid. A fresh budget is ready; saving will replace the invalid data.", true);
        return;
      }
      totalBudgetMinor = parsed.totalBudgetMinor;
      const ids = new Set();
      for (const item of parsed.expenses) {
        const expense = validateExpense(item);
        if (!expense || ids.has(expense.id)) {
          showNotice("Some saved expenses were invalid and were skipped.", true);
          continue;
        }
        ids.add(expense.id);
        expenses.push(expense);
      }
    } catch (error) {
      showNotice("Saved budget data could not be read. A fresh budget is ready; saving will replace the invalid data.", true);
    }
  }

  function saveBudgetData() {
    if (!storageAvailable || !trip) return false;
    try {
      localStorage.setItem(STORAGE_PREFIX + trip.id, JSON.stringify({ version: 1, totalBudgetMinor, expenses }));
      elements.storageNote.textContent = "Changes save automatically in this browser.";
      return true;
    } catch (error) {
      elements.storageNote.textContent = "Could not save changes. Check this browser's storage settings.";
      showNotice("Changes could not be saved in this browser.", true);
      return false;
    }
  }

  function sumExpenses(status) {
    return expenses.reduce((sum, expense) => sum + (status && expense.status !== status ? 0 : expense.amountMinor), 0);
  }

  function makeIcon(name) {
    const paths = {
      edit: '<path d="m12 4 4 4M3 17l3.5-.7L16 6.8 13.2 4 3.7 13.5 3 17z"/>',
      delete: '<path d="M4 6h12M8 6V4h4v2m2 0-.7 11H6.7L6 6m2.5 3v5m3-5v5"/>'
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths[name];
    return svg;
  }

  function createActionButton(label, iconName, action, extraClass) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button" + (extraClass ? " " + extraClass : "");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.append(makeIcon(iconName));
    button.addEventListener("click", action);
    return button;
  }

  function renderChart() {
    elements.chart.replaceChildren();
    const totals = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
    expenses.forEach((expense) => { totals[expense.category] += expense.amountMinor; });
    const allTotal = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
    elements.chartTotal.textContent = formatMinor(allTotal);
    if (!allTotal) {
      const empty = document.createElement("p");
      empty.className = "chart-empty";
      empty.textContent = "Category totals will appear when you add expenses.";
      elements.chart.append(empty);
      return;
    }
    CATEGORIES.forEach((category) => {
      const row = document.createElement("div");
      row.className = "chart-row";
      row.setAttribute("role", "listitem");
      row.setAttribute("aria-label", categoryLabel(category) + ": " + formatMinor(totals[category]));
      row.style.setProperty("--category-color", CATEGORY_COLORS[category]);
      const label = document.createElement("span");
      label.className = "chart-label";
      const swatch = document.createElement("span");
      swatch.className = "chart-swatch";
      swatch.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.textContent = categoryLabel(category);
      label.append(swatch, name);
      const track = document.createElement("span");
      track.className = "chart-track";
      track.setAttribute("aria-hidden", "true");
      const bar = document.createElement("span");
      bar.className = "chart-bar";
      bar.style.setProperty("--bar-width", (totals[category] / allTotal * 100) + "%");
      track.append(bar);
      const amount = document.createElement("span");
      amount.className = "chart-amount";
      amount.textContent = formatMinor(totals[category]);
      row.append(label, track, amount);
      elements.chart.append(row);
    });
  }

  function renderExpenses() {
    const statusFilter = elements.filterStatus.value;
    const categoryFilter = elements.filterCategory.value;
    const filtered = expenses.filter((expense) =>
      (statusFilter === "all" || expense.status === statusFilter) &&
      (categoryFilter === "all" || expense.category === categoryFilter)
    ).sort((first, second) => second.date.localeCompare(first.date) || first.description.localeCompare(second.description));
    elements.expenseCount.textContent = String(filtered.length);
    elements.expenseList.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-list";
      const mark = document.createElement("span");
      mark.className = "empty-list-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = expenses.length ? "?" : "+";
      const title = document.createElement("strong");
      title.textContent = expenses.length ? "No expenses match these filters" : "No expenses yet";
      const detail = document.createElement("p");
      detail.textContent = expenses.length ? "Try a different status or category." : "Add your first cost to see how the trip budget takes shape.";
      empty.append(mark, title, detail);
      elements.expenseList.append(empty);
      return;
    }
    filtered.forEach((expense) => {
      const row = document.createElement("article");
      row.className = "expense-item";
      const main = document.createElement("div");
      main.className = "expense-main";
      const titleLine = document.createElement("div");
      titleLine.className = "expense-title-line";
      const title = document.createElement("h3");
      title.className = "expense-title";
      title.textContent = expense.description;
      const status = document.createElement("span");
      status.className = "status-tag" + (expense.status === "paid" ? " is-paid" : "");
      status.textContent = expense.status === "paid" ? "Paid" : "Planned";
      titleLine.append(title, status);
      const meta = document.createElement("p");
      meta.className = "expense-meta";
      const category = document.createElement("span");
      category.textContent = categoryLabel(expense.category);
      const date = document.createElement("span");
      date.textContent = formatDate(expense.date);
      meta.append(category, date);
      main.append(titleLine, meta);
      const trailing = document.createElement("div");
      trailing.className = "expense-trailing";
      const amount = document.createElement("strong");
      amount.className = "expense-amount";
      amount.textContent = formatMinor(expense.amountMinor);
      const actions = document.createElement("div");
      actions.className = "expense-actions";
      actions.append(
        createActionButton("Edit " + expense.description, "edit", () => beginEdit(expense.id)),
        createActionButton("Delete " + expense.description, "delete", () => deleteExpense(expense.id), "delete")
      );
      trailing.append(amount, actions);
      row.append(main, trailing);
      elements.expenseList.append(row);
    });
  }

  function categoryLabel(category) {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  function renderSummary() {
    const planned = sumExpenses("planned");
    const paid = sumExpenses("paid");
    const total = planned + paid;
    elements.planned.textContent = formatMinor(planned);
    elements.paid.textContent = formatMinor(paid);
    elements.perTraveler.textContent = formatMinor(Math.round(total / trip.travelers));
    if (totalBudgetMinor === null) {
      elements.remaining.textContent = "Set a budget";
      elements.remainingCaption.textContent = "Add your trip limit above";
      elements.remaining.parentElement.classList.remove("is-over-budget");
    } else {
      const remaining = totalBudgetMinor - total;
      elements.remaining.textContent = formatMinor(remaining);
      elements.remainingCaption.textContent = remaining < 0 ? "Over budget by " + formatMinor(Math.abs(remaining)) : "After planned and paid expenses";
      elements.remaining.parentElement.classList.toggle("is-over-budget", remaining < 0);
    }
    renderChart();
    renderExpenses();
  }

  function resetForm() {
    elements.form.reset();
    elements.expenseId.value = "";
    elements.category.value = "transport";
    elements.formTitle.textContent = "Add an expense";
    elements.saveExpense.textContent = "Save expense";
    elements.cancelEdit.hidden = true;
    setError(elements.formError, "");
  }

  function beginEdit(id) {
    const expense = expenses.find((item) => item.id === id);
    if (!expense) return;
    elements.expenseId.value = expense.id;
    elements.description.value = expense.description;
    elements.amount.value = (expense.amountMinor / (10 ** fractionDigits)).toFixed(fractionDigits);
    elements.category.value = expense.category;
    elements.date.value = expense.date;
    elements.form.querySelector('input[name="status"][value="' + expense.status + '"]').checked = true;
    elements.formTitle.textContent = "Edit expense";
    elements.saveExpense.textContent = "Save changes";
    elements.cancelEdit.hidden = false;
    setError(elements.formError, "");
    elements.description.focus();
  }

  function deleteExpense(id) {
    const expense = expenses.find((item) => item.id === id);
    if (!expense || !window.confirm("Delete \"" + expense.description + "\"?")) return;
    expenses = expenses.filter((item) => item.id !== id);
    saveBudgetData();
    renderSummary();
    if (elements.expenseId.value === id) resetForm();
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "expense-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function saveExpense(event) {
    event.preventDefault();
    const description = elements.description.value.trim();
    const amountMinor = amountToMinor(elements.amount.value, false);
    if (!description || description.length > 100) {
      setError(elements.formError, "Enter a description up to 100 characters.");
      elements.description.focus();
      return;
    }
    if (amountMinor === null) {
      setError(elements.formError, "Enter a valid positive amount with up to " + fractionDigits + " decimal places.");
      elements.amount.focus();
      return;
    }
    if (!CATEGORIES.includes(elements.category.value) || !parseDate(elements.date.value)) {
      setError(elements.formError, "Choose a valid category and date.");
      return;
    }
    const status = elements.form.querySelector('input[name="status"]:checked')?.value;
    const expense = {
      id: elements.expenseId.value || makeId(),
      description,
      amountMinor,
      category: elements.category.value,
      date: elements.date.value,
      status
    };
    if (!validateExpense(expense)) {
      setError(elements.formError, "That expense is not valid. Check the fields and try again.");
      return;
    }
    const existingIndex = expenses.findIndex((item) => item.id === expense.id);
    if (existingIndex < 0 && expenses.length >= 5000) {
      setError(elements.formError, "This budget has reached the 5,000 expense limit.");
      return;
    }
    if (existingIndex >= 0) expenses[existingIndex] = expense;
    else expenses.push(expense);
    saveBudgetData();
    resetForm();
    renderSummary();
  }

  function saveTotalBudget() {
    if (!elements.totalBudget.value.trim()) {
      totalBudgetMinor = null;
      setError(elements.budgetError, "");
      saveBudgetData();
      renderSummary();
      return;
    }
    const amount = amountToMinor(elements.totalBudget.value, true);
    if (amount === null) {
      setError(elements.budgetError, "Enter a valid budget with up to " + fractionDigits + " decimal places.");
      elements.totalBudget.focus();
      return;
    }
    totalBudgetMinor = amount;
    setError(elements.budgetError, "");
    saveBudgetData();
    renderSummary();
  }

  function exportData() {
    const content = JSON.stringify({ version: 1, tripId: trip.id, currency: trip.currency, totalBudgetMinor, expenses }, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traveltogether-budget-" + trip.id.replace(/[^a-z0-9_-]/gi, "-") + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function validateImport(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.version !== 1 ||
      parsed.tripId !== trip.id || parsed.currency !== trip.currency || !Array.isArray(parsed.expenses) || parsed.expenses.length > 5000 ||
      (parsed.totalBudgetMinor !== null && (!Number.isSafeInteger(parsed.totalBudgetMinor) || parsed.totalBudgetMinor < 0 || parsed.totalBudgetMinor > MAX_AMOUNT_MINOR))) return null;
    const imported = [];
    const ids = new Set();
    for (const item of parsed.expenses) {
      const expense = validateExpense(item);
      if (!expense || ids.has(expense.id)) return null;
      ids.add(expense.id);
      imported.push(expense);
    }
    return { expenses: imported, totalBudgetMinor: parsed.totalBudgetMinor };
  }

  async function importData(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showNotice("That file is too large to import (2 MB maximum).", true);
      return;
    }
    try {
      const imported = validateImport(JSON.parse(await file.text()));
      if (!imported) {
        showNotice("This file is invalid or belongs to a different trip or currency. Nothing was imported.", true);
        return;
      }
      expenses = imported.expenses;
      totalBudgetMinor = imported.totalBudgetMinor;
      elements.totalBudget.value = totalBudgetMinor === null ? "" : (totalBudgetMinor / (10 ** fractionDigits)).toFixed(fractionDigits);
      resetForm();
      saveBudgetData();
      renderSummary();
      showNotice("Budget imported successfully.", false);
    } catch (error) {
      showNotice("The selected file could not be read as valid budget JSON.", true);
    }
  }

  function initialize() {
    let activeTrip;
    try {
      const raw = localStorage.getItem(TRIP_KEY);
      activeTrip = raw ? JSON.parse(raw) : null;
    } catch (error) {
      storageAvailable = false;
      elements.noTrip.hidden = false;
      showNotice("Trip data could not be read from this browser. Check storage settings and reload.", true);
      return;
    }
    if (!isValidTrip(activeTrip)) {
      elements.noTrip.hidden = false;
      return;
    }
    trip = activeTrip;
    try {
      fractionDigits = new Intl.NumberFormat(undefined, { style: "currency", currency: trip.currency }).resolvedOptions().maximumFractionDigits;
    } catch (error) {
      elements.noTrip.hidden = false;
      return;
    }
    elements.app.hidden = false;
    elements.subtitle.textContent = trip.destination + " | " + trip.travelers + (trip.travelers === 1 ? " traveler" : " travelers");
    elements.currencyPrefix.textContent = trip.currency;
    elements.currencyLabel.textContent = trip.currency;
    elements.totalBudget.step = fractionDigits === 0 ? "1" : "0." + "0".repeat(Math.max(0, fractionDigits - 1)) + "1";
    elements.amount.step = elements.totalBudget.step;
    elements.amount.min = fractionDigits === 0 ? "1" : elements.totalBudget.step;
    elements.amount.placeholder = fractionDigits ? "0." + "0".repeat(Math.max(0, fractionDigits - 1)) + "1" : "1";
    loadBudget();
    elements.totalBudget.value = totalBudgetMinor === null ? "" : (totalBudgetMinor / (10 ** fractionDigits)).toFixed(fractionDigits);
    elements.form.addEventListener("submit", saveExpense);
    elements.saveBudget.addEventListener("click", saveTotalBudget);
    elements.totalBudget.addEventListener("change", saveTotalBudget);
    elements.cancelEdit.addEventListener("click", resetForm);
    elements.filterStatus.addEventListener("change", renderExpenses);
    elements.filterCategory.addEventListener("change", renderExpenses);
    elements.importButton.addEventListener("click", () => elements.importFile.click());
    elements.importFile.addEventListener("change", () => {
      importData(elements.importFile.files[0]);
      elements.importFile.value = "";
    });
    elements.exportButton.addEventListener("click", exportData);
    renderSummary();
  }

  initialize();
}());