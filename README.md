# Appium Test Suite — TMS Transport Order

Automation tests for the **TMS Planner** Android app, built from the test case file
`TO Small scope - Appium - FUNCTIONAL.csv`.

---

## 1. What you need installed

Already on this computer:

- Node.js ✅ (v22.15.0)
- Appium ✅ (3.6.0)
- uiautomator2 driver ✅ (4.2.6)
- Android SDK platform-tools ✅ (adb)

One-time step — install the WebdriverIO library:

```powershell
cd "C:\Users\LENOVO 2023\OneDrive\Desktop\TCL\appium"
npm install
```

---

## 2. How to run a test

You always need **two terminals**.

**Terminal 1 — start Appium, and leave it open:**

```powershell
cd "C:\Users\LENOVO 2023\OneDrive\Desktop\TCL\appium"
.\start-appium.ps1
```

Use the script, **not** plain `appium`. Appium needs to know where your Android
SDK is, and plain `appium` does not set that:

```
ERROR: Neither ANDROID_HOME nor ANDROID_SDK_ROOT environment variable was exported
```

`start-appium.ps1` sets it for you. It also prints your connected device, so you
can confirm the tablet is there before starting a test.

**Terminal 2 — run the test:**

```powershell
cd "C:\Users\LENOVO 2023\OneDrive\Desktop\TCL\appium"
node tests/smoke.js
```

### The tests

| Command | What it does |
|---|---|
| `node tests/smoke.js` | Proves the device + app work. Run this first. ✅ |
| `node tests/test-01-login.js` | Login: empty rejected, real login, board appears ✅ |
| `node tests/test-02-create-transport-order.js` | FULL flow: entry path, validation, Step 1, Fleet and SLA (pickup/standby/drop point/product group), route → Submit gate ✅ |
| `node tests/all.js` | Runs everything in order and prints a summary |
| `node tests/probe-selectors.js` | Throwaway: tests dropdown selectors against the live UI |
| `node tests/explore-picker.js` | Throwaway: works out how the date picker accepts taps |
| `node tests/probe-route-fleet.js` | Throwaway: maps the Route and Fleet controls |
| `node tests/probe-step2.js` | Throwaway: maps Step 2 (Fleet and SLA) |
| `node tests/probe-step2b.js` | Throwaway: maps the location dropdowns, the standby **clock** picker, and the Product Group sub-tab |

> **No tablet attached?** Tests now print a plain-language checklist instead of
> a 20-second timeout and a WebDriver stack trace. It also detects an
> `unauthorized` tablet and a udid mismatch in `config.js`.

> **App looks small and centred?** The tablet is in Android freeform mode.
> `ensureFullscreen()` fixes it automatically. This matters more than it
> sounds — a dialog taller than the floating window gets clipped, and the
> clipped controls vanish from the accessibility tree, which looks exactly
> like a Flutter semantics bug. Two runs were lost chasing that.

> **Resuming after a break? Read `HANDOFF.md` first** — it records the current
> state, the confirmed test data, and the exact next step.

> **Checking a test file without running it:** use `node --check tests\all.js`.
> Do NOT use `node -e "require('./tests/all.js')"` — requiring a test file
> executes it and starts the whole suite.

Always run `smoke.js` first. If it fails, nothing else will work.

---

## 3. Test status

### Test-01 — Login ✅ PASSING

Test case Test-01 from the sheet: sign in with `om@gmail.com` / `Password123!`.

Covers:

1. Reset the app so the login screen appears
2. **Negative:** submit empty credentials → must be rejected
3. Sign in with the test account
4. **Positive:** assert the Transport Order board appears

Verified passing on the real device, v1.0.14.

> **The login screen only appears after a cold start.** The app keeps a session,
> so on a normal launch it goes straight to the board. Test-01 deliberately
> wipes app data to force it. **If you use the app yourself afterwards, log back in.**

### Test-02 — Create new transport order ✅ PASSING (full flow)

Test case Test-02 from the sheet. One file walks the entire flow — parts were
previously split across `test-02b`/`02c`/`02d`/`02e` while each screen was
being worked out; once every step passed, they were consolidated back into
this single test (no coverage was dropped).

Covered, in order:

1. Sign in if needed
2. Open the create menu; verify "Create new transport order" and
   "Convert sales order" exist
3. Enter the Create Transport Order form
4. Confirm both step tabs exist ("Basic Detail", "Fleet and SLA") —
   checked at the top, before any field scrolling
5. Confirm all 6 Basic Detail fields exist (scrolls to reach them)
6. **Negative:** submit an empty form and confirm it is rejected
7. Fill Step 1, verified against the form:

   | Field | Value | Result |
   |---|---|---|
   | Customer | PT QA | ✅ selected |
   | Order Date | today | ✅ set to the **current** date (read back from the field) |
   | Route | Sidoarjo → Surabaya | ✅ (origin first — see route-order note below) |
   | Transport Condition | default | ✅ `Frozen` (pre-filled) |
   | Fleet Type | BUP Freezer | ✅ selected |

8. Advance to "Fleet and SLA"; set Pick-Up Location `tirtamas` →
   Tirtamas Coldstorindo
9. Set Stand by Time to **now + 2h, minutes 00** (clock-face dial) —
   read back from the form field so a non-committed value cannot pass
10. Set Drop Point Location 1 `hokky` → Hokky Buah - Citraland
11. Add Product Group `Ayam` / `10 Karung` / `10 kg` / `-18` (typed as text)
12. Advance to the Route step; select route from the map — card
    "BUP TCL - HOKKY" confirmed
13. Reach the **Submit gate** and stop (shared-tablet rule)

> **The Order Date is computed at runtime**, not hardcoded. `selectOrderDateToday()`
> presses the picker's `Today` shortcut, so the test is correct on any day.
>
> The route order is **Sidoarjo first, Surabaya second** — the reverse of the
> sheet's wording ("Surabaya - Sidoarjo"), confirmed with the tester.
>
> The Stand by Time rule is **now + 2 hours, minutes 00**, matching both manual
> walkthroughs (13:43 → 15:00; 14:41 → 16:00).

```powershell
node tests/test-02-create-transport-order.js
```

### Remaining work

| Item | State |
|---|---|
| Test-01 Login | ✅ passing |
| Smoke test | ✅ passing |
| Test-02 full create-TO flow (entry path → validation → Step 1 → Step 2 → Route → Submit gate) | ✅ passing |
| **Final submit → order actually created** | not started (deliberate — see below) |
| Test-03 Convert sales order | not started (you marked it optional) |

> **The order is still not actually created.** No test presses Submit and
> confirms a new card appears on the board. The shared-tablet rule forbids
> creating orders, so "Success to create TO" is not demonstrated — only that
> the form fills correctly and reaches the Submit gate. If a dedicated, safe
> environment ever appears, the last step would be: press Submit, then find
> the new card by filtering for `PT QA` on the board.

### Test-03 — Convert sales order ⏭ NOT STARTED

Optional per instruction. The entry point **does** exist in the app
("Convert sales order" in the create menu).

### Smoke test

Proves device + app + login + board all work. Useful as a first check.

---

## 3b. Known app behaviours that affect automation

These were found while building the tests. Each one can make tests flaky.

| Behaviour | Effect | How the tests handle it |
|---|---|---|
| Login screen renders in stages | A dump taken immediately shows only 1 text field, not 2 | `waitForScreen()` waits for both fields **and** the button |
| Soft keyboard covers the Sign in button | Tapping a field resizes the page and the button disappears from the UI tree | Keyboard is dismissed before every submit |
| Element references go stale after a resize | Writing to a cached field silently does nothing | Fields are re-found before each write |
| Kanban board scrolls horizontally | The first column ("Sales Order") is not always on screen | Tests anchor on "Dispatching", mid-board |
| "Transport Order" is an ambiguous name | Matches both the sidebar item and the header button | Header button is targeted by class |
| Login fields have no accessibility ids | They cannot be selected by name | Selected by `password="true"` / `false` |
| **The Create form scrolls** | Fields below the fold are **absent from the UI tree**, not merely invisible — a 20s wait will never find them | `scrollToField()` scrolls then looks |
| **The step tabs scroll away too** | "Basic Detail" / "Fleet and SLA" sit in the left rail, which is *inside* the same ScrollView. Scroll down to reach "Fleet Type" and the tabs vanish | Check the tabs **before** scrolling the fields |
| **Dropdown option labels carry the ID** | An option reads `"PT QA\nCUST-179013..."` — the separator is a **newline**, not a space or pipe | Match on `starts-with(@content-desc,"PT QA\n")` |
| **Customer names overlap** | `PT QA` **and** `PT QA update` both exist, so `starts-with "PT QA"` and `contains "PT QA"` both match **two** rows | The trailing `\n` in the selector is what pins it to the exact name |
| **Dropdowns only render visible rows** | A loose selector matched exactly 1 — but only because the other row was scrolled out of the tree. Scroll it in and it matches 2 | Always test a selector with the rival row **on screen**, or "1 match" is luck |
| **Dropdown field labels change** | `Select Customer` becomes `PT QA` once chosen, so `~Select Customer` then fails | Assert on the chosen value |
| **BACK exits the app** | There is no back handler, so BACK with no keyboard showing drops you at the launcher | Only send BACK when `isKeyboardShown()` is true |
| **Step 2 cannot be clicked into** | Clicking the "Fleet and SLA" tab just re-runs Step 1 validation and leaves you there | Only `Next` advances, and only when Step 1 is valid — use `advanceToFleetAndSla()` |
| **City / fleet lists are searchable** | Origin & Destination City open at "Abepura, Papua"; reaching Surabaya by scrolling means dragging past hundreds of rows | Type the name into the overlay's search box, then press the match |
| **City fields show "City, Province"** | The field ends up as `Surabaya, Jawa Timur`, not `Surabaya`, so a bare-name assertion can never pass | Verify on the same prefix used to search: `starts-with(@content-desc,"Surabaya,")` |
| **Step 2 has two sub-tabs** | `Route & SLA` and `Product Group`. "Add product group" is not on the Route & SLA tab | Switch sub-tab before looking for Add |
| **"Select Date" is reused** | Step 2's `Stand by Time` carries the same `"Select Date"` label as Step 1's Order Date | Fine within a step, but never reuse a Step 1 helper that assumes it |
| **Two "Select Location" controls** | Pick-Up Location and Drop Point Location 1 share one label; `~Select Location` always matches the first | Reach the second by index or relative position, never by label alone |
| **The tablet is in freeform/desktop mode** | The app opens in a floating window (`mBounds=Rect(441,157 - 1479,937)`) not filling the 1920x1200 screen, so tall dialogs get **clipped** | `ensureFullscreen()` swipes the title bar to the edge to snap it full-screen. A clipped dialog looks exactly like a missing accessibility node — check this first |
| **Stand by Time is a clock** | A radial picker: set the hour with the **small** hand, the minute with the **large** hand, then press apply. The apply button's name is **not** guaranteed to be "Confirm" | Read the button name from a live dump; compute hand angles from the face's centre and radius if the hands expose no nodes |
| **Date pickers have Cancel + Next** | Two blue buttons at the bottom. Order Date must be **today or later** | Press `Next` to advance — don't assume the button is called `Apply` |
| **Recommended routes need ~20 km** | Recommendation appears only if the route already has a config, else it matches same-origin or ~20 km. `Sidoarjo → Surabaya` may legitimately have **none** | Treat "no recommendation" as a valid outcome and create the route manually — do not fail |
| **Route field order** | In the Route section the **TOP field is origin**, the **BOTTOM is destination** | `selectCity()` targets by caption (`Origin City` / `Destination City`), never by position |

### The Create Transport Order form, as it actually is

```
Customer *              -> "Select Customer"    dropdown
Relocation                                    toggle
Order Date *            -> "Select Date"        date picker
Priority                                       (beside the date)
Route *
  Origin City
  Destination City
Transport Condition *   -> "Frozen"             already the default value
Fleet Type *            -> "Select Fleet"       dropdown
```

`Cancel` and `Next` sit **outside** the ScrollView, so they are always tappable
no matter how far the form is scrolled.

> The dropdown labels (`Select Customer`, `Select Fleet`) show the *prompt*, not
> the chosen value. Once you pick something, the label changes to it. That makes
> `~Select Customer` a poor check afterwards — assert on the value instead.

### Activating Flutter controls — use `press()`, not `click()`

The Order Date picker ignores a normal `click()`. Verified on the device:

| Method | Result |
|---|---|
| `element.click()` | picker stayed open, date **not** set |
| `press()` — 150ms hold | picker closed, date applied ✅ (verified 3 Oct 2026; the test uses the picker's `Today`, so it is not pinned to that date) |

Flutter's gesture detectors ignore a zero-duration press. A real finger tap
always has duration, which is why **manual testers never see this and the app is
not broken.** Use `page.press(driver, element)` for calendar cells, dropdown
options, and anything else inside a Flutter overlay.

### Reading dumps without inventing data

Flutter puts newlines inside `content-desc`. When reading a dump, newlines are
often *rendered* as `" | "` for readability:

```
real value : "PT QA\nCUST-1790135906434241572"
displayed  : PT QA | CUST-1790135906434241572
```

That display formatting looks like part of the data but is not, and building a
selector from it fails mysteriously. **Print `JSON.stringify(desc)` when the exact
bytes matter** — it shows escapes instead of guessing.

**If you write your own tests, respect these.** They are the difference between a
suite that passes once and one that passes every time.

---

## 3c. Selector syntax that actually works

This cost several runs to work out. Use these forms:

| Purpose | ✅ Use | ❌ Avoid |
|---|---|---|
| By accessibility id | `~Sign in` | — |
| By class name | `//android.widget.EditText` | `android=android.widget.EditText` → parses as a method name |
| Same | `//android.view.View` | `className=android.view.View` → treated as CSS |
| Read a value | `getAttribute('text')` | `getValue()` → not supported |
| Appium command args | `execute('mobile: x', { key: val })` | `execute('mobile: x', 'string')` → WDIO 8 needs an object |

---

## 4. Folder structure

```
appium/
├── config.js        All settings. Edit this if the phone or app changes.
├── package.json
├── README.md        This file
├── start-appium.ps1 Starts Appium with the right SDK settings
│
├── helpers/
│   └── device.js    Connect, open app, sign in if needed, save screenshots
│
├── pages/
│   ├── login.js          Actions on the login screen
│   └── transportOrder.js Actions on the board and create form
│
├── tests/
│   ├── smoke.js
│   ├── test-01-login.js
│   └── test-02-create-transport-order.js
│
└── dumps/           Created automatically when a test fails
```

---

## 5. When a test fails

The failing screen is saved automatically to `dumps/`:

- `.xml` — the full UI tree (every element Appium can see)
- `.png` — a screenshot

Open the `.xml` to see exactly what was on screen when it failed. This is the
fastest way to find a wrong selector.

Common causes:

| Problem | Fix |
|---|---|
| `ANDROID_HOME ... was exported` | Use `.\start-appium.ps1`, not plain `appium` |
| `session not created` | Is Appium running in terminal 1? |
| `Could not find element` | Check `dumps/*.xml` for the real text |
| `invalid selector` | Class names must be full: `android.view.View`, not `View` |
| Test hangs | Phone locked or screen off. Enable "Don't sleep" in Developer Options. |

### Flutter selector notes

Learned while building these tests — useful for writing your own:

- **Anchor on what is always visible.** The Kanban board scrolls horizontally,
  so the first column ("Sales Order") is sometimes off-screen even when the app
  is working. These tests anchor on "Dispatching", which sits mid-board.
- **Full class names only.** `android=android.view.View` works;
  `android=View` throws `invalid selector`.
- **No wildcards in UiSelector.** There is no `desc*TO-*`. To match by content,
  fetch the elements and filter in JavaScript (see `hasTransportOrder`).
- **Watch for duplicate names.** Both the sidebar and the header button are
  called "Transport Order". Target them by class to disambiguate.
- **`content-desc` carries most of the data.** A whole card collapses into one
  node, so a single attribute read confirms customer, TO number, dates, and
  destination.

---

## 6. If you connect a different device

Run `adb devices` and copy the ID, then open `config.js` and change:

```js
udid: 'RRGL707WSTA',   // put your new device ID here
```

---

## 7. Notes for later

- **App package:** `com.stc.tms.stg.planner` / activity `com.stc.tms.planner.MainActivity`
- **Version tested:** v1.0.14 (versionCode 50), updated 2026-10-03
- **Device tested:** Samsung Tab S9 FE (SM-X230), Android 16, landscape 1920×1200
- Login credentials in `config.js` are kept for when login is implemented
- The app is landscape-only, so keep the tablet in landscape during tests