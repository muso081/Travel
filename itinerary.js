(function () {
  "use strict";

  const TRIP_KEY = "tp:trip";
  const STORAGE_PREFIX = "tp:itinerary:";
  const elements = {
    app: document.getElementById("itinerary-app"),
    noTrip: document.getElementById("no-trip"),
    notice: document.getElementById("notice"),
    subtitle: document.getElementById("trip-subtitle"),
    destination: document.getElementById("trip-destination"),
    dates: document.getElementById("trip-dates"),
    travelers: document.getElementById("trip-travelers"),
    tripTotal: document.getElementById("trip-total"),
    dayTabs: document.getElementById("day-tabs"),
    dayPanel: document.getElementById("day-panel"),
    selectedDayLabel: document.getElementById("selected-day-label"),
    selectedDayDate: document.getElementById("selected-day-date"),
    selectedDayTotal: document.getElementById("selected-day-total"),
    activityList: document.getElementById("activity-list"),
    outsideSection: document.getElementById("outside-section"),
    outsideCount: document.getElementById("outside-count"),
    outsideList: document.getElementById("outside-list"),
    printItinerary: document.getElementById("print-itinerary"),
    dayCount: document.getElementById("day-count"),
    dayHours: document.getElementById("day-hours"),
    form: document.getElementById("activity-form"),
    formTitle: document.getElementById("form-title"),
    activityId: document.getElementById("activity-id"),
    title: document.getElementById("activity-title"),
    date: document.getElementById("activity-date"),
    time: document.getElementById("activity-time"),
    duration: document.getElementById("activity-duration"),
    location: document.getElementById("activity-location"),
    notes: document.getElementById("activity-notes"),
    formError: document.getElementById("form-error"),
    saveButton: document.getElementById("save-activity"),
    cancelEdit: document.getElementById("cancel-edit"),
    storageNote: document.getElementById("storage-note"),
    importButton: document.getElementById("import-button"),
    importFile: document.getElementById("import-file"),
    exportButton: document.getElementById("export-button"),
    printButton: document.getElementById("print-button")
  };

  let trip = null;
  let tripDays = [];
  let activities = [];
  let selectedDate = "";
  let storageAvailable = true;

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parts = value.split("-").map(Number);
    const date = new Date(0);
    date.setFullYear(parts[0], parts[1] - 1, parts[2]);
    if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null;
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

  function dateKey(date) {
    return [String(date.getFullYear()).padStart(4, "0"), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function formatDate(key, options) {
    const date = parseDate(key);
    if (!date) return "";
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }

  function daysBetween(startKey, endKey) {
    const start = parseDate(startKey);
    const end = parseDate(endKey);
    if (!start || !end || end < start) return [];
    const days = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      days.push(dateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "activity-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
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

  function readActiveTrip() {
    try {
      const raw = localStorage.getItem(TRIP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      storageAvailable = false;
      showNotice("Trip data could not be read from this browser. Check storage settings and reload.", true);
      return null;
    }
  }

  function validateActivity(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const duration = Number(value.duration);
    if (typeof value.id !== "string" || !value.id.trim() ||
      typeof value.title !== "string" || !value.title.trim() || value.title.length > 100 ||
      !parseDate(value.date) || typeof value.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) ||
      !Number.isFinite(duration) || duration < 0.25 || duration > 24 ||
      typeof value.location !== "string" || value.location.length > 120 ||
      typeof value.notes !== "string" || value.notes.length > 1000) return null;
    return {
      id: value.id,
      title: value.title.trim(),
      date: value.date,
      startTime: value.startTime,
      duration,
      location: value.location.trim(),
      notes: value.notes.trim()
    };
  }

  function loadActivities() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + trip.id);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.activities) || parsed.activities.length > 5000) {
        showNotice("Saved itinerary data was invalid. A fresh schedule is ready; saving will replace the invalid data.", true);
        return [];
      }
      const loaded = [];
      const ids = new Set();
      for (const item of parsed.activities) {
        const activity = validateActivity(item);
        if (!activity || ids.has(activity.id)) {
          showNotice("Some saved activities were invalid and were skipped.", true);
          continue;
        }
        ids.add(activity.id);
        loaded.push(activity);
      }
      return loaded;
    } catch (error) {
      showNotice("Saved itinerary data could not be read. A fresh schedule is ready; saving will replace the invalid data.", true);
      return [];
    }
  }

  function saveActivities() {
    if (!storageAvailable || !trip) return false;
    try {
      localStorage.setItem(STORAGE_PREFIX + trip.id, JSON.stringify({ version: 1, activities }));
      elements.storageNote.textContent = "Changes save automatically in this browser.";
      return true;
    } catch (error) {
      elements.storageNote.textContent = "Could not save changes. Check this browser's storage settings.";
      showNotice("Changes could not be saved in this browser.", true);
      return false;
    }
  }

  function hoursLabel(hours) {
    if (!hours) return "0h";
    return Number.isInteger(hours) ? hours + "h" : hours.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "h";
  }

  function activityHoursOn(date) {
    return activities.filter((activity) => activity.date === date).reduce((sum, activity) => sum + activity.duration, 0);
  }

  function startMinutes(activity) {
    const pieces = activity.startTime.split(":").map(Number);
    return pieces[0] * 60 + pieces[1];
  }

  function overlapsWith(activity, other) {
    if (activity.id === other.id || activity.date !== other.date) return false;
    const start = startMinutes(activity);
    const end = start + activity.duration * 60;
    const otherStart = startMinutes(other);
    const otherEnd = otherStart + other.duration * 60;
    return start < otherEnd && otherStart < end;
  }

  function makeIcon(name) {
    const paths = {
      up: '<path d="m4 12 6-6 6 6M10 6v11"/>',
      down: '<path d="m4 8 6 6 6-6M10 14V3"/>',
      edit: '<path d="m12 4 4 4M3 17l3.5-.7L16 6.8 13.2 4 3.7 13.5 3 17z"/>',
      delete: '<path d="M4 6h12M8 6V4h4v2m2 0-.7 11H6.7L6 6m2.5 3v5m3-5v5"/>',
      location: '<path d="M16 8.5c0 4.2-6 9-6 9s-6-4.8-6-9a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8.5" r="2"/>'
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths[name];
    return svg;
  }

  function createActionButton(label, iconName, action, disabled, extraClass) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button" + (extraClass ? " " + extraClass : "");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.disabled = Boolean(disabled);
    button.append(makeIcon(iconName));
    button.addEventListener("click", action);
    return button;
  }

  function renderTabs() {
    elements.dayTabs.replaceChildren();
    tripDays.forEach((date, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "day-tab-" + index;
      button.className = "day-tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(date === selectedDate));
      button.setAttribute("aria-controls", "day-panel");
      button.tabIndex = date === selectedDate ? 0 : -1;
      const weekday = document.createElement("span");
      weekday.textContent = formatDate(date, { weekday: "short" });
      const dayNumber = document.createElement("strong");
      dayNumber.textContent = formatDate(date, { day: "numeric" });
      const count = document.createElement("span");
      const number = activities.filter((activity) => activity.date === date).length;
      count.className = "tab-count";
      count.textContent = number === 1 ? "1 activity" : number + " activities";
      button.append(weekday, dayNumber, count);
      button.addEventListener("click", () => selectDay(date, true));
      button.addEventListener("keydown", onTabKeydown);
      elements.dayTabs.append(button);
    });
  }

  function onTabKeydown(event) {
    const tabs = Array.from(elements.dayTabs.querySelectorAll('[role="tab"]'));
    const current = tabs.indexOf(event.currentTarget);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectDay(tripDays[next], true);
  }

  function selectDay(date, focusTab) {
    selectedDate = date;
    renderTabs();
    renderDay();
    updateDateOptions();
    if (focusTab) document.getElementById("day-tab-" + tripDays.indexOf(date))?.focus();
  }

  function createEmptyDay() {
    const wrapper = document.createElement("div");
    wrapper.className = "empty-day";
    const mark = document.createElement("span");
    mark.className = "empty-day-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "+";
    const heading = document.createElement("h4");
    heading.textContent = "Nothing on the schedule yet";
    const message = document.createElement("p");
    message.textContent = "Add an activity to give this day a starting point.";
    wrapper.append(mark, heading, message);
    return wrapper;
  }

  function createActivityCard(activity, dayActivities, index) {
    const card = document.createElement("article");
    const outsideRange = !tripDays.includes(activity.date);
    const conflicting = dayActivities.some((other) => overlapsWith(activity, other));
    card.className = "activity-card" + (outsideRange ? " is-outside" : "") + (conflicting ? " is-overlap" : "");
    const topLine = document.createElement("div");
    topLine.className = "activity-topline";
    const text = document.createElement("div");
    const time = document.createElement("div");
    time.className = "activity-time";
    const timeStrong = document.createElement("strong");
    timeStrong.textContent = formatTime(activity.startTime);
    const timeDuration = document.createElement("span");
    timeDuration.textContent = hoursLabel(activity.duration) + " duration";
    time.append(timeStrong, timeDuration);
    const title = document.createElement("h4");
    title.className = "activity-title";
    title.textContent = activity.title;
    text.append(time, title);
    topLine.append(text);

    const actions = document.createElement("div");
    actions.className = "activity-actions";
    actions.setAttribute("aria-label", "Activity actions");
    const editButton = createActionButton("Edit " + activity.title, "edit", () => editActivity(activity.id));
    editButton.dataset.activityId = activity.id;
    actions.append(
      createActionButton("Move up", "up", () => moveActivity(activity.id, -1), index === 0),
      createActionButton("Move down", "down", () => moveActivity(activity.id, 1), index === dayActivities.length - 1),
      editButton,
      createActionButton("Delete " + activity.title, "delete", () => deleteActivity(activity.id), false, "delete")
    );
    topLine.append(actions);
    card.append(topLine);

    if (activity.location) {
      const location = document.createElement("p");
      location.className = "activity-location";
      location.append(makeIcon("location"));
      const locationText = document.createElement("span");
      locationText.textContent = activity.location;
      location.append(locationText);
      card.append(location);
    }
    if (activity.notes) {
      const notes = document.createElement("p");
      notes.className = "activity-notes";
      notes.textContent = activity.notes;
      card.append(notes);
    }
    if (outsideRange) {
      const warning = document.createElement("p");
      warning.className = "activity-warning";
      warning.textContent = "Outside this trip's current date range";
      card.append(warning);
    }
    if (conflicting) {
      const warning = document.createElement("p");
      warning.className = "activity-warning overlap-warning";
      warning.textContent = "Overlaps another activity on this date";
      card.append(warning);
    }
    return card;
  }

  function formatTime(value) {
    const parts = value.split(":").map(Number);
    const date = new Date(2000, 0, 1, parts[0], parts[1]);
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function renderDay() {
    const date = selectedDate;
    const dayActivities = activities.filter((activity) => activity.date === date);
    elements.selectedDayLabel.textContent = "Day " + (tripDays.indexOf(date) + 1);
    elements.selectedDayDate.textContent = formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    elements.dayCount.textContent = String(dayActivities.length);
    elements.dayHours.textContent = hoursLabel(activityHoursOn(date));
    elements.selectedDayTotal.textContent = dayActivities.length + (dayActivities.length === 1 ? " activity" : " activities");
    elements.dayPanel.setAttribute("aria-labelledby", "day-tab-" + tripDays.indexOf(date));
    elements.activityList.replaceChildren();
    if (!dayActivities.length) {
      elements.activityList.append(createEmptyDay());
      return;
    }
    dayActivities.forEach((activity, index) => elements.activityList.append(createActivityCard(activity, dayActivities, index)));
  }

  function renderAll() {
    renderTabs();
    renderDay();
    renderOutsideDates();
    renderPrintSchedule();
    const totalHours = activities.reduce((sum, activity) => sum + activity.duration, 0);
    elements.tripTotal.textContent = activities.length + " activities - " + hoursLabel(totalHours);
  }

  function renderOutsideDates() {
    const outsideDates = Array.from(new Set(activities.map((activity) => activity.date).filter((date) => !tripDays.includes(date)))).sort();
    const outsideActivities = activities.filter((activity) => !tripDays.includes(activity.date));
    elements.outsideSection.hidden = outsideActivities.length === 0;
    elements.outsideCount.textContent = outsideActivities.length + (outsideActivities.length === 1 ? " activity" : " activities");
    elements.outsideList.replaceChildren();
    outsideDates.forEach((date) => {
      const dayActivities = outsideActivities.filter((activity) => activity.date === date);
      dayActivities.forEach((activity, index) => elements.outsideList.append(createActivityCard(activity, dayActivities, index)));
    });
  }

  function renderPrintSchedule() {
    elements.printItinerary.replaceChildren();
    const dates = tripDays.concat(Array.from(new Set(activities.map((activity) => activity.date).filter((date) => !tripDays.includes(date)))).sort());
    dates.forEach((date) => {
      const dayActivities = activities.filter((activity) => activity.date === date);
      const section = document.createElement("section");
      section.className = "print-day";
      const heading = document.createElement("h3");
      const dayNumber = tripDays.indexOf(date);
      heading.textContent = (dayNumber >= 0 ? "Day " + (dayNumber + 1) + " - " : "Outside trip dates - ") + formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      section.append(heading);
      const list = document.createElement("div");
      list.className = "activity-list";
      if (dayActivities.length) {
        dayActivities.forEach((activity, index) => list.append(createActivityCard(activity, dayActivities, index)));
      } else {
        const empty = document.createElement("p");
        empty.textContent = "No activities planned.";
        list.append(empty);
      }
      section.append(list);
      elements.printItinerary.append(section);
    });
  }

  function updateDateOptions() {
    const currentValue = elements.date.value;
    const options = tripDays.map((date, index) => {
      return { value: date, label: "Day " + (index + 1) + " - " + formatDate(date, { weekday: "short", month: "short", day: "numeric" }) };
    });
    const existing = activities.map((activity) => activity.date).filter((date) => !tripDays.includes(date));
    const uniqueOutside = Array.from(new Set(existing));
    elements.date.replaceChildren();
    options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;
      elements.date.append(item);
    });
    uniqueOutside.forEach((date) => {
      const item = document.createElement("option");
      item.value = date;
      item.textContent = formatDate(date, { month: "short", day: "numeric", year: "numeric" }) + " - outside trip";
      elements.date.append(item);
    });
    if (Array.from(elements.date.options).some((option) => option.value === currentValue)) elements.date.value = currentValue;
    else elements.date.value = selectedDate;
  }

  function renderTripDetails() {
    const tripDaysCount = tripDays.length;
    elements.subtitle.textContent = trip.title + " - " + tripDaysCount + (tripDaysCount === 1 ? " day" : " days");
    elements.destination.textContent = trip.destination;
    elements.dates.textContent = formatDate(trip.startDate, { month: "short", day: "numeric", year: "numeric" }) + " - " + formatDate(trip.endDate, { month: "short", day: "numeric", year: "numeric" });
    elements.travelers.textContent = trip.travelers + (trip.travelers === 1 ? " traveler" : " travelers");
  }

  function resetForm() {
    elements.form.reset();
    elements.activityId.value = "";
    elements.date.value = selectedDate;
    elements.formTitle.textContent = "Add an activity";
    elements.saveButton.textContent = "Save activity";
    elements.cancelEdit.hidden = true;
    elements.formError.hidden = true;
    elements.formError.textContent = "";
  }

  function editActivity(id) {
    const activity = activities.find((item) => item.id === id);
    if (!activity) return;
    elements.activityId.value = activity.id;
    elements.title.value = activity.title;
    elements.date.value = activity.date;
    elements.time.value = activity.startTime;
    elements.duration.value = String(activity.duration);
    elements.location.value = activity.location;
    elements.notes.value = activity.notes;
    elements.formTitle.textContent = "Edit activity";
    elements.saveButton.textContent = "Save changes";
    elements.cancelEdit.hidden = false;
    elements.formError.hidden = true;
    elements.title.focus();
    elements.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function deleteActivity(id) {
    const activity = activities.find((item) => item.id === id);
    if (!activity || !window.confirm("Delete \"" + activity.title + "\"? This cannot be undone.")) return;
    activities = activities.filter((item) => item.id !== id);
    if (elements.activityId.value === id) resetForm();
    const saved = saveActivities();
    updateDateOptions();
    renderAll();
    if (saved) showNotice("Activity deleted.");
  }

  function moveActivity(id, direction) {
    const targetActivity = activities.find((activity) => activity.id === id);
    if (!targetActivity) return;
    const dayActivities = activities.filter((activity) => activity.date === targetActivity.date);
    const currentIndex = dayActivities.findIndex((activity) => activity.id === id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= dayActivities.length) return;
    const first = dayActivities[currentIndex];
    const second = dayActivities[targetIndex];
    const firstGlobal = activities.indexOf(first);
    const secondGlobal = activities.indexOf(second);
    [activities[firstGlobal], activities[secondGlobal]] = [activities[secondGlobal], activities[firstGlobal]];
    saveActivities();
    renderAll();
    Array.from(document.querySelectorAll(".icon-button[data-activity-id]")).find((button) => button.dataset.activityId === first.id)?.focus();
  }

  function onSubmit(event) {
    event.preventDefault();
    elements.formError.hidden = true;
    const candidate = validateActivity({
      id: elements.activityId.value || makeId(),
      title: elements.title.value,
      date: elements.date.value,
      startTime: elements.time.value,
      duration: elements.duration.value,
      location: elements.location.value,
      notes: elements.notes.value
    });
    if (!candidate) {
      elements.formError.textContent = "Enter a title, valid trip date, start time, and duration between 0.25 and 24 hours.";
      elements.formError.hidden = false;
      return;
    }
    const existingIndex = activities.findIndex((activity) => activity.id === candidate.id);
    if (existingIndex >= 0) activities[existingIndex] = candidate;
    else activities.push(candidate);
    selectedDate = candidate.date;
    const saved = saveActivities();
    updateDateOptions();
    renderAll();
    resetForm();
    if (saved) showNotice(existingIndex >= 0 ? "Activity updated." : "Activity added.");
  }

  function exportItinerary() {
    const payload = { version: 1, tripId: trip.id, exportedAt: new Date().toISOString(), activities };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traveltogether-itinerary-" + safeFilename(trip.title) + ".json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice("Itinerary exported.");
  }

  function safeFilename(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip";
  }

  async function importItinerary(file) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error("This file is too large to import.");
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.activities) || data.activities.length > 5000) {
        throw new Error("The file must contain an activities list.");
      }
      const imported = [];
      const ids = new Set();
      for (const item of data.activities) {
        const activity = validateActivity(item);
        if (!activity || ids.has(activity.id)) throw new Error("The file contains invalid or duplicate activities.");
        ids.add(activity.id);
        imported.push(activity);
      }
      if (!window.confirm("Replace this trip's " + activities.length + " activities with " + imported.length + " imported activities?")) return;
      activities = imported;
      selectedDate = tripDays[0];
      resetForm();
      const saved = saveActivities();
      updateDateOptions();
      renderAll();
      if (saved) showNotice("Itinerary imported.");
    } catch (error) {
      showNotice(error instanceof SyntaxError ? "That file is not valid JSON." : error.message || "Could not import this file.", true);
    } finally {
      elements.importFile.value = "";
    }
  }

  function initialize() {
    trip = readActiveTrip();
    if (!isValidTrip(trip)) {
      elements.noTrip.hidden = false;
      elements.app.hidden = true;
      if (trip !== null && !elements.notice.textContent) showNotice("The saved trip is incomplete or invalid. Update it on Explore to continue.", true);
      return;
    }
    elements.noTrip.hidden = true;
    elements.app.hidden = false;
    tripDays = daysBetween(trip.startDate, trip.endDate);
    selectedDate = tripDays[0];
    activities = loadActivities();
    renderTripDetails();
    updateDateOptions();
    renderAll();
    elements.form.addEventListener("submit", onSubmit);
    elements.cancelEdit.addEventListener("click", resetForm);
    elements.importButton.addEventListener("click", () => elements.importFile.click());
    elements.importFile.addEventListener("change", () => importItinerary(elements.importFile.files[0]));
    elements.exportButton.addEventListener("click", exportItinerary);
    elements.printButton.addEventListener("click", () => window.print());
  }

  initialize();
})();