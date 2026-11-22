# TravelTogether

A small travel planner that runs entirely in the browser. Pick a destination, create a trip, then plan the days, the money and the packing list in one place. It is plain HTML, CSS and JavaScript: no frameworks, no build step, no server, no API keys. Everything you enter stays in your own browser.

| Page | What it does | Files |
| --- | --- | --- |
| **Explore** | Browse 18 destinations, create and manage trips, pick the active trip | `index.html`, `destinations.css`, `destinations.js` |
| **Itinerary** | Day-by-day plan with a timeline, overlap warnings, print view | `itinerary.html`, `itinerary.css`, `itinerary.js` |
| **Budget** | Total budget, planned and paid expenses, category chart, per-traveler cost | `budget.html`, `budget.css`, `budget.js` |
| **Admin** | Add, edit and delete your own destinations with a real photo | `admin.html`, `admin.css`, `admin.js` |
| **Packing** | Shared checklist with per-traveler progress, templates, print view | `packing.html`, `packing.css`, `packing.js` |

Shared by all pages: `logo.svg` (logo and favicon) and this `README.md`.

## Quick start

1. Put all the files in one folder, side by side (the repository root). Do not move them into subfolders: every link is relative (`./index.html`, `./budget.css`, ...).
2. Serve the folder and open `index.html` (see [Run it locally](#run-it-locally)).
3. On **Explore**, choose a destination (or press **Create a trip**), set the dates and save. The other three pages now use that trip.

## File assembly

Each page is self-contained: **one HTML file, one CSS file, one JS file, and nothing shared at runtime.** A page loads only its own stylesheet and script, so any teammate can change their page without touching the others.

The pages work together through one agreement, the browser's `localStorage`:

| Key | Written by | Holds |
| --- | --- | --- |
| `tp:trip` | **Explore only** | The active trip: `{ id, title, destination, startDate, endDate, currency, travelers }` |
| `tp:trips` | **Explore only** | The list of saved trips (same shape) |
| `tp:itinerary:<trip id>` | Itinerary | `{ version, activities[] }` |
| `tp:budget:<trip id>` | Budget | `{ version, currency, totalBudgetMinor, expenses[] }` (money as whole minor units, e.g. cents) |
| `tp:packing:<trip id>` | Packing | `{ version, travelers[], items[] }` |
| `tp:destinations` | Admin only | `{ version, items[] }`: destinations added on the Admin page, with their photo (a link or a compressed image) |
| `tp:theme` | any page | `"light"` or `"dark"` (only if the visitor switched it) |

Rules every page follows:

- **Dates** are `YYYY-MM-DD` calendar dates and are never converted through time zones. **Currency** is an ISO code (`EUR`, `USD`, ...). **Travelers** is a positive whole number.
- Only Explore writes `tp:trip` and `tp:trips`. When a visitor chooses a plan, Explore also writes `tp:itinerary:<id>` and `tp:budget:<id>` for that brand-new trip only, in exactly the formats those pages save, and never touches an existing trip's plans. The other pages read the active trip and never modify it. Editing a trip keeps its `id`; a new trip gets a new `id`. A trip's currency is fixed once it is created. Deleting a trip on Explore (after a confirmation) also removes that trip's itinerary, budget and packing data.
- Each planning page stores its data under its own key plus the trip `id`, so every trip has its own itinerary, budget and packing list.
- With no valid active trip, a planning page shows **Create a trip first** with a link to `./index.html`.
- Missing, damaged or blocked storage never crashes a page: it says what happened and keeps working.

**Shared look.** To keep the pages independent, the same "shared foundation" (colours, header, buttons, forms, dialogs) is repeated at the top of every stylesheet, and the same helper functions at the top of every script. The part that belongs to one page starts at the heading comment with that page's name. If you change a shared colour or component, make the same change in all four stylesheets (search for `--teal` to find the colours).

## Run it locally

Browsers treat `file://` pages differently (some keep storage separate for every file, which would stop the pages from sharing the trip), so use a tiny local server instead of double-clicking `index.html`.

```bash
cd path/to/your/repo
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Any static server works equally well, for example the **Live Server** extension in VS Code.

Your data is stored per browser and per address. A trip created at `localhost:8000` will not appear on the deployed site, and the other way round.

## Deploy to GitHub Pages (main branch, root)

1. Commit and push every file to the `main` branch, with `index.html` at the top level of the repository.
2. On GitHub open the repository, then **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose **Branch: `main`** and **Folder: `/ (root)`**, then press **Save**.
5. Wait a minute or two. The **Actions** tab shows a "pages build and deployment" run; when it is green the address appears at the top of the Pages settings, in the form `https://<user>.github.io/<repository>/` (for the repository `muso081/Travel`: <https://muso081.github.io/Travel/>).
6. From now on every push to `main` updates the site.

If something looks wrong:

- **404 page:** check that `index.html` is in the repository root (not in a folder) and that step 4 was saved.
- **Page without styling or scripts:** file names are case-sensitive on GitHub Pages. Keep them exactly as listed above.
- **Old version still showing:** wait for the Actions run to finish, then hard-refresh (Ctrl/Cmd + Shift + R).
- **"Create a trip first" on a planning page:** create a trip on Explore first, using the same address you are visiting.

## Using the app

**Explore.** 18 bundled destinations with search (also from the hero), a region filter, an activity filter, a heart to save favourites (with a "Saved" filter, remembered under `tp:favorites`) and a **Surprise me** button. Cards and details show a real photo, loaded in the visitor's browser from Wikipedia's public API (the landmark first, then the place itself; this is the only outside request the site makes). While a photo loads the frame shimmers, and if none can load it shows the destination's initials. Each card opens a detail view with highlights, practical facts and **sample daily costs**. Those costs are rounded, illustrative figures in each place's own currency, not live prices. Each destination also offers ready-made plans, cheapest first (Saver, Classic, Comfort, Luxury). Choosing one asks for a start date and the number of travelers, then creates the trip with its itinerary (flights there and back, sights, meals) and its budget (flights, stay, meals, transport, activities, insurance) already filled in. Plan prices are rough samples built from the daily costs, not live fares. You can also create a trip from scratch or from a destination, then edit, select or delete saved trips (deleting asks first and also removes that trip's plans); the active trip card shows a countdown to the trip (or which day you are on), how far the itinerary, budget and packing list have come, and links to the three planning pages. A trip can last up to 90 days.

**Itinerary.** One tab per day of the trip. Add activities with a title, date, start time, duration, location and notes. The timeline flags overlaps, shows the number of activities and the planned hours for each day, and has move up / move down buttons for reordering. If you shorten the trip, activities outside the new dates are kept and listed separately instead of being deleted. A time ribbon shows the shape of each day at a glance, and the list points out the free time between activities. Export and import JSON, or print the schedule.

**Budget.** Set a total budget, then add expenses with a description, amount, category (transport, accommodation, food, activities, shopping, other), date and planned/paid status. The page shows the planned total, the paid total, what remains after all expenses, and the cost per traveler, and makes an overspend obvious with text and an icon, not colour alone. The category chart is a list that spells out each category's amount and share, so it never depends on colour or bar length. Amounts use the trip's currency with `Intl.NumberFormat`; nothing is ever converted. A second chart shows when the money is spent, day by day (week by week on long trips), with the average cost per day. Filter the list, export or import JSON.

**Packing.** Add items with a category (documents, clothing, toiletries, electronics, health, other), quantity, traveler and packed status. Travelers start as "Traveler 1, 2, ..." and can be renamed. City, beach, hiking and winter templates add what is missing without duplicating or changing anything you already have. Search and filter by traveler, category or status, follow overall, per-traveler and per-category progress (choosing a category filters the checklist), export or import JSON, print the checklist per traveler, and clear the whole list only after a confirmation.

**Admin.** The **Destination admin** page (linked in every page's footer) lists every destination in a table with its photo. Add your own with a name, country, region, currency, activities, description, highlights, ideal stay and sample costs, plus a photo: **Find a real photo** looks one up on Wikipedia, or upload your own (it is resized and compressed), or paste an image link. Added destinations can be edited, deleted (after a confirmation), exported and imported as JSON, and built-in ones can be used as a template. They appear on Explore with details and plans, in this browser only: export them to share with teammates.

**Back up your data.** Itinerary, Budget and Packing each have **Export** and **Import** (JSON). Importing validates the file first and never changes anything if the file is not valid. Clearing your browser's site data removes the plans, so export what you want to keep.

## Themes and accessibility

- The site follows the visitor's light or dark preference and has a toggle in the header; the choice is remembered. Light uses the original palette (`#f8fafc`, `#0f172a`, teal `#0d9488`); dark is the deep-navy look.
- Moving between pages and switching the theme animate softly in browsers that support view transitions (current Chrome, Edge and Safari). Everywhere else, and when the visitor asks for reduced motion, the change is simply instant.
- Everything works with the keyboard. There is a skip link, a visible focus ring, labelled form fields with inline error messages, and a polite live region that announces actions such as adding, deleting or importing.
- Text and controls meet WCAG 2.2 AA contrast in both themes, targets are at least 24 px (most 44 px), the layout works down to 320 px wide and with enlarged text, and animations stop when the visitor asks for reduced motion.
- Anything a visitor types is shown as plain text, never as HTML.

## Privacy

The only outside requests are the destination photos from Wikipedia. There are no analytics, no web fonts and no CDNs, and nothing you enter leaves your device.

## Browser support

It uses only standard web features (`localStorage`, `<dialog>`, `Intl`, CSS custom properties) and is meant for current versions of Chrome, Edge, Firefox and Safari. The automated checks behind this version ran in Chromium, so give Firefox and Safari a quick manual look before you hand it in.

## Working on it as a team

- Keep to your own files. Explore owns `index.html`, `destinations.css`, `destinations.js`; each planning page owns its three files.
- Do not write `tp:trip` or `tp:trips` from a planning page, and do not read another page's data key. If the shared trip shape has to change, agree on it as a team and update every page in the same commit.
- Before you push, try each page three ways: with no trip, with a normal trip, and with the browser's storage cleared mid-way. Then check one page on a phone-sized window and with the keyboard only.
