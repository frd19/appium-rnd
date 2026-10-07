# HANDOFF — where things stand

Written at the end of the working day so this can be picked up cold.

---

## 1. Read this first

Everything lives in **`C:\Users\LENOVO 2023\OneDrive\Desktop\TCL\appium`**.
Nothing in the Flutter project was modified — this is a separate folder.

**The app is logged out right now.** Test-01 wipes app data on every run to
force the login screen. Sign in manually before using the tablet.

---

## 2. Starting work tomorrow

Two terminals, always.

**Everything was shut down cleanly at the end of the last session:** the Appium
server is stopped, port 4723 is free, and no test processes are left running. So
start from scratch — no cleanup needed.

**Terminal 1 — Appium server, leave it open:**

```powershell
cd "C:\Users\LENOVO 2023\OneDrive\Desktop\TCL\appium"
.\start-appium.ps1
```

Use the script, not plain `appium`. Plain `appium` fails with
`Neither ANDROID_HOME nor ANDROID_SDK_ROOT environment variable was exported`.

> If it ever says **port 4723 already in use**, an old server is still running.
> Stop it with `Get-Process node | Stop-Process -Force`, then start again.

**Terminal 2 — run tests:**

```powershell
cd "C:\Users\LENOVO 2023\OneDrive\Desktop\TCL\appium"
node tests/all.js          # everything, with a summary
```

First check of the day should be:

```powershell
node tests/smoke.js        # fastest proof the device + app + login work
```

If `smoke.js` fails, nothing else will work — fix that before anything else.

---

## 3. Test status

| Test | Command | Status |
|---|---|---|
| Smoke | `node tests/smoke.js` | ✅ passing |
| Test-01 Login | `node tests/test-01-login.js` | ✅ passing |
| Test-02 Create TO (full flow) | `node tests/test-02-create-transport-order.js` | ✅ passing — entry path → validation → Step 1 → Step 2 → Route → Submit gate |
| All of the above | `node tests/all.js` | see §9 |

> The five separate Test-02 files (test-02b … 02e) that used to split up this
> flow staged the work while the screens were being walked. Once every step
> passed they were consolidated back into `test-02-create-transport-order.js`;
> nothing extra was lost — the read-backs and verifications moved in too.

### What the sheet's test case still needs

| Sheet step | Status |
|---|---|
| 1–3 Navigate, open button, Create new transport order | ✅ done |
| 4 Customer `PT QA`, Order date today, Route, Transport condition, Fleet type | ✅ **done** |
| 5A Pick up `tirtamas coldstorindo`, standby time, drop point `Hokky buah citraland` | ✅ encoded (test-02) |
| 5B Product Group — `Ayam`, `10 Karung`, `10 kg`, `-18` | ✅ encoded (test-02) — minus proven typeable, fields found by position |
| 6 Route → `RECOMMENDATION` → Select Route | ✅ encoded (test-02) — two-phase step with a slow map, see §5 |
| — Confirm the order was actually created | ❌ not started |

**Nothing presses the final submit yet.** "Success to create TO" — the sheet's
stated expectation for Test-02 — is therefore **not yet demonstrated**.

---

## 4. Test data (confirmed with the tester)

| Field | Value | Note |
|---|---|---|
| Customer | `PT QA` | ⚠️ `PT QA update` also exists — selector must not confuse them |
| Order date | today | Any date **today or later** is accepted |
| Origin City | `Sidoarjo` | **reverse of the sheet's wording** |
| Destination City | `Surabaya` | |
| Transport condition | default → `Frozen` | pre-filled, nothing to do |
| Fleet type | `BUP Freezer` | ⚠️ `CDDL Freezer` also exists |

> The route order is **Sidoarjo first, Surabaya second** — confirmed twice by
> the tester (5 Oct), and the reverse of how the sheet reads. Don't "fix" it
> back.
>
> **Field positions matter, and this is the trap.** In the Route section the
> **TOP field is the origin/departure city** and the **BOTTOM field is the
> destination**. So:
>
> | Position | Meaning | Value |
> |---|---|---|
> | **Top** | Origin / departure | `Sidoarjo` |
> | **Bottom** | Destination | `Surabaya` |
>
> Never read the bottom field as the departure point. `selectCity()` is called
> with the field's **caption** (`'Origin City'` / `'Destination City'`), not a
> position, so the code is not vulnerable — but a future hand-written test that
> picks "the second dropdown" would be. This note is the guard against that.

---

## 5. Steps 5, 6 and the submit — layout and behaviour

### Step 2 layout, as captured from the device

Step 2 reachable and mapped twice: `probe-step2.js` (output in `step2.txt`) and,
definitively, the 6 Oct manual walkthrough recorded in
`fleet-sla-record.txt` (29 states, every control with bounds).

The step has **two sub-tabs**: `Route & SLA` and `Product Group`.

**`Route & SLA` tab** (recorded states 11–24):

```
Pick-Up Location *        -> "Select Location"      autocomplete field
Need Relocation                                  toggle
<selected fleet name>            e.g. "BUP Freezer"
Stand by Time *          -> "Select Date"         date + TIME picker
Drop Point Location 1 *  -> "Select Location"      autocomplete field
```

**`Product Group` tab** (recorded states 24–27) — press the tab, then:

```
No Product Group Yet / Enter your product group      empty state
[Add Product Group]  row                             (android.view.View)
```

Pressing the row opens a bottom sheet (`CreateTOSlideOut`), recorded bounds:

```
"Add Product Group" header           [1305,30][1512,63]
Name *         EditText  [1259,214][1862,239]
Quantity *     EditText  [1238,324][1766,393]    unit "Karung" (default)
Weight *       EditText  [1238,456][1781,525]    unit "Kg"     (default)
Temperature *  EditText  [1238,588][1804,657]    unit "°C"     (default)
[Button] "Cancel"              [1543,1098][1660,1170]
[Button] "Add Product Group"   [1678,1098][1896,1170]
```

⚠️ **The default units already match the test data** (Karung/Kg/°C) — the
walkthrough never opened a unit dropdown. ⚠️ **"Add Product Group" is a
duplicate label**: the empty-state row is a `View`, the slide-out confirm is a
`Button`. Scope by class. ⚠️ **The panel position shifts between runs**
(~165px lower in one run) — never use the recorded Y values as constants; find
the fields by Y *ordering* within `CreateTOSlideOut`.

### Step 3 (Route) layout, as captured from the device

Two live recordings: `fleet-sla-record.txt` (29 states) and
`fleet-sla-record-2.txt` (19 states, 6 Oct — **source of truth for this
step**). The Route step is **two-phase**; it does not always open straight to
a map.

**Phase 1 — the form panel.** After `Next` on Fleet & SLA the step can land
on a plain form (recording 2, state 16):

```
"Select Route"    [View]  [1326,713][1434,738]     label, NOT clickable
"Add your drop point to continue"                  ⚠️ warning — shows even
                                                   with a committed drop point
[ImageView] "Select Route" button [1275,794][1485,866]   MID-SCREEN button
[Cancel]  [Submit]
```

Pressing the MID-SCREEN `Select Route` opens the **Google Map** (state 17 —
took **~85 s** to appear; the route computation is slow):

```
TextureView "Google Map"     [390,327][1290,1128]   + Zoom in / Zoom out
"Select Route" header        [View]  [1556,411][1656,435]
"Route List"                 [View]  [1322,526][1406,551]
"Toll" / "Non-Toll" filters  [1322,587][1538,651]
[ImageView] "Select Route"   button  [1322,1032][1890,1098]  BOTTOM-RIGHT
```

While the route computes, a **recommendation card** appears as a map overlay
(state 18): `BUP TCL - HOKKY | 12.0 Jam | 24.6 Km | Rp 15.000 |
RECOMMENDATION` at [1322,671][1890,825]. **"RECOMMENDATION" is spelled with two
M's on the device** (the earlier one-M question is resolved). The numbers come
from the route engine — **assert the card exists, never the exact values.**

Pressing the BOTTOM-RIGHT `Select Route` returns to the form and shows the
chosen route card and the final gate (state 19):

```
<fleet>            e.g. "BUP Freezer"
"BUP TCL - HOKKY"  |  "12.0 Jam"  |  "24.6 Km"  |  "Rp 15.000"
[Cancel]  [Submit]
```

⚠️ **Never press Submit.** Test-02 stops at this gate (shared-device rule —
no TO may be created or deleted).

**How `selectRoute()` tells the buttons apart:** both "Select Route" buttons
are `ImageView`s with the same content-desc, separated by Y band (mid-screen
top≈794, bottom-right top≈1032). Non-clickable `Select Route` header/label
`View`s are skipped via the `clickable` attribute. The map wait is **150 s**
because of the slow route load.

### Two traps on this step

1. **`Stand by Time` is labelled `"Select Date"`** — the exact same label as
   Step 1's Order Date. It is unambiguous *within* Step 2 (Order Date is a
   Step 1 field and is not present here), but `~Select Date` is now a
   step-dependent selector. Do not reuse a Step 1 helper that assumes it.
2. **Both `Select Location` controls share one label.** Pick-Up Location and
   Drop Point Location 1 are both `"Select Location"`, so `~Select Location`
   matches the first one only. Reach the second by position relative to its
   caption — `probe-step2c.js` has a `fieldBelowCaption()` helper for exactly
   this.

---

## 6. Confirmed behaviour for steps 5, 6 and the submit

All of this was confirmed by the tester on **5 Oct 2026**. It replaces the
open questions below.

### 5A — Route & SLA tab

**Pick-up and Drop Point are searchable AUTOCOMPLETE fields.** Typing into the
field shows matching locations **below** it, and you pick from the results.
This is a different interaction from the city dropdowns (which open an overlay
with its own search box).

| Field | Value to type |
|---|---|
| Pick-Up Location | `tirtamas coldstorindo` (search `tirtamas`) |
| Drop Point Location 1 | `Hokky buah citraland` (search `Hokky buah`) |

**Stand by Time is a clock picker.** The **small hand sets the hour**, the
**large hand sets the minute**.

- **Minutes are always `00`.** This is a deliberate simplification, and it
  helps a lot: the minute hand always points at 12, so only the hour hand
  needs placing. One coordinate to compute instead of two.
- Target hour = **current hour + 2**, minutes always 00. Confirmed by the
  tester 6 Oct: both manual walkthroughs dialed hour + 2 (13:43→15:00,
  14:41→16:00). Computed at runtime, never hardcoded — the test stays correct
  on any day.
- **Edge case:** if the suite happens to run at **23:xx**, the target becomes
  `00:00`. On a 12-hour clock that is `12:00 AM`, which *is* later than 23:00
  so it remains valid — but only if the picker exposes an AM/PM control. If it
  does not, either avoid running late in the day or clamp the target. Confirm
  from the clock dump.
- Date: **today or any future date** is acceptable. If `Today` is hard to find,
  any future date will do.
- **Do not assume the apply button is called "Confirm"** — read it off the live
  UI. It may be `Next` or something else.

### 5B — Product Group tab

| Field | Type | Value |
|---|---|---|
| Product | free text | `Ayam` |
| Quantity | free text, **numbers only** | `10` |
| — unit | **separate dropdown** | `Karung` |
| Weight | free text, **numbers only** | `10` |
| — unit | **separate dropdown** | `kg` |
| Temperature | free text, **numbers only** | `-18` |

Product and Temperature are **not** dropdowns. Quantity and Weight are each
**two** fields — a number box followed by a unit dropdown — which is a
different interaction from anything on step 1.

> **Note:** these are the wizard's first real text fields. Earlier steps had
> none, which is why `selectCity()` could assume "the only EditText on screen
> is the overlay's search box". **That assumption is now scoped to step 1**
> and must not be reused on the Product Group tab.

> **RESOLVED 6 Oct (recording 2, states 13–14):** the minus sign IS typeable —
> `-` enters the Temperature field directly and the test types `-18` as plain
> text. No `adb shell input text` needed.
>
> **Live-recorded panel facts (recording 2, states 13–14):** the slide-out has
> exactly four EditTexts, found by **position** (0 = Name, 1 = Quantity,
> 2 = Weight, 3 = Temperature) — never by `CreateTOSlideOut` scoping, since
> that overlay node is a **sibling**, not the fields' ancestor. Empty text
> `hint` attributes: `Enter product group name`, `input quantity`,
> `input weight`, `input temperature`. Unit buttons default to
> `Karung`/`Kg`/`°C` — matching the test data, so no unit interaction needed.

### 6 — Route page

Reached after the whole form — **including both earlier steps** — is filled.
The page has **`Toll`** and **`Non Toll`** options.

**The tester has already configured the `Sidoarjo → Surabaya` route**, so the
**Recommendation Route should appear** for this test case. If it does not, the
configured route is not being matched — that would be worth raising, not
something to code around.

**Spelling resolved 6 Oct (recording 2, state 18):** the recommendation chip on
the map overlay reads **`RECOMMENDATION`** (two M's). It is decoration on the
route card, not a control — assert the route card `BUP TCL - HOKKY` exists
instead of matching that text.

### Final submit and success

The tester has **not** confirmed this, so it must be mapped from the live UI:

- What the final button is called
- How success is signalled — toast, dialog, redirect, or nothing visible
- **How we identify our own order.** Prefer a customer **filter/search on the
  board using `PT QA`**, not "trust the newest card", since the tablet is
  shared and other orders will appear.

This is the sheet's actual goal (*"Success to create TO"*), so it is worth
getting right rather than asserting on a toast.

### The clock is still the main technical unknown

Hours need a coordinate or a node. Two very different implementations:

- **Pressable nodes** for the hands → find them, press them.
- **Drawn graphics** → compute the angle (`hour → 30°`, `minute → 6°` from 12
  o'clock) and press a point on the clock face, which needs its centre and
  radius from the UI dump.

Minutes being `00` halves the work either way. `probe-step2c.js` dumps the full
page-source XML for the clock **and** counts `hour`/`minute` mentions in it,
which answers this on the first run.

### Suggested order of work tomorrow

1. `node tests/smoke.js` — confirm the environment still works
2. `node tests/all.js` — see whether the §9 flake reproduces
3. Read `step2b.txt` — `probe-step2b.js` maps the pick-up / drop-point
   dropdowns, dumps the clock picker's full XML, and opens the Product Group
   sub-tab.
4. From the clock dump, decide the interaction: pressable hand nodes, or
   computed coordinates on the clock face. **Do not guess** — write the action
   only once the dump shows which it is.
5. Write `selectLocation()`, `setStandByTime()` in `pages/transportOrder.js`.
6. All of §3's steps (standby 5A, Product Group 5B, the route page) were
   encoded incrementally as test-02b…02e, then **consolidated into**
   `tests/test-02-create-transport-order.js` (7 Oct).

---

## 7. Shared device — do not disturb the other project

The tablet is **shared with another project**. Agreed rules (tester, 5 Oct):

1. **Do not change device configuration** unnecessarily.
2. If a test fails mid-form, **cancel or back out** per the app's actual
   behaviour.
3. **Do not create extra data just to clean up.**
4. **Do not delete a created TO** — there is no known safe cleanup mechanism.
5. **No wireless debugging** for now.

`page.leaveFormCleanly()` implements exactly this: it closes the form if one
is open and touches nothing else. It is safe in a `finally` block and is a
no-op when no form is open. `probe-step2c.js` calls it both at the end and on
the error path.

It handles `Cancel` opening a confirmation dialog, but deliberately **will not
blind-press an unknown control** — if the form is still open afterwards it logs
and leaves it for manual cleanup. On a shared device, guessing is worse than
reporting.

**Still to verify:** whether `Cancel` closes the form outright or asks first.
`probe-step2c.js` phase 0 tests this before doing anything else, because the
cleanup path depends on it.

**Wireless debugging is deliberately not set up.** If it becomes necessary for
productivity, it needs the tablet's IP from *Settings → About tablet*, and
`device.udid` in `config.js` would need a network-address option added
alongside the USB udid.

## 8. App behaviours that will bite you

Full detail in `README.md` §"Known app behaviours". The short version:

1. **Press, don't click, inside Flutter overlays.** `element.click()` is
   silently ignored by dropdown options and calendar cells. Use
   `page.press(driver, el)` (150ms hold). This is proven and cost several runs.
2. **Fields below the fold are ABSENT from the UI tree**, not just invisible.
   Always `page.scrollToField()`, never a bare `waitFor()`.
3. **The step tabs scroll away too.** They're inside the same ScrollView. Check
   them *before* scrolling the fields.
4. **You cannot click into Step 2.** Clicking the "Fleet and SLA" tab just
   re-runs Step 1 validation. Only `Next` advances, and only when Step 1 is
   valid. Use `advanceToFleetAndSla()`.
5. **Dropdown options are `"NAME\nCUST-ID"`** — newline separated. The trailing
   `\n` in the selector is what stops `PT QA` matching `PT QA update`.
6. **Dropdowns only render visible rows.** A loose selector may match exactly
   1 only because the rival row is scrolled out of the tree. Test selectors
   with the rival row on screen.
7. **BACK exits the app** (no back handler). Only send BACK when
   `isKeyboardShown()` is true — this is already handled in
   `pages/login.js`.
8. **Login screen renders in stages** — one field at first, then two plus the
   button. `waitForScreen()` waits for the full form.
9. **Soft keyboard covers the Sign in button.** Dismiss before submitting.
10. **Field references go stale after a resize** — re-find, never reuse.
11. **The Kanban board scrolls horizontally.** Anchor on `~Dispatching`, which
    is always visible; "Sales Order" is often off-screen.
12. **"Transport Order" is ambiguous** — sidebar item and header button share
    the name. The header button is `android.widget.Button`.
13. **The tablet is in Android freeform/desktop mode.** The app opens in a
    floating window, not full screen:

    ```
    Task{...} mode=freeform
        mBounds    = Rect(441, 157 - 1479, 937)   <- ~1038 x 780
        mMaxBounds = Rect(0, 0 - 1920, 1200)       <- the real screen
    ```

    **`ensureFullscreen()` handles this** by swiping the window title bar to
    the screen edge, which makes Android snap it to full size. Verified:

    ```
    before   mBounds=Rect(441, 157 - 1479, 937)
    after    mBounds=Rect(0, 45 - 1920, 1128)
    ```

    **Why this cost two runs (5-6 Oct):** a dialog taller than the floating
    window is **clipped**, and clipped controls disappear from the
    accessibility tree. The date picker showed 58 nodes and not one `Button`,
    which looked exactly like a Flutter semantics failure. It was the window
    size. **Check this first whenever a control appears to not exist.**

    Two fixes that do **not** work, recorded so nobody repeats them:
    - `am start --windowingMode 1` → *"intent has been delivered to currently
      running top-most instance"*; the freeform task is reused, flag ignored
    - `am start --task-bound 1920x1200+0+0` → throws inside
      `ActivityManagerService`
14. **Overlapping freeform windows.** Chrome was found sitting on top of our
    app, so `dumpsys` reported `mCurrentFocus` as Chrome and a UI dump returned
    137 Chrome nodes and zero of ours. If `mCurrentFocus` names the wrong app,
    another app's window is covering it. Fullscreen mode clears this.
15. **Never tap outside a dialog's measured bounds.** The date picker's
    `Dismiss` barrier only covers the dialog area, so a tap below it landed on
    the live form underneath and **closed the app**. On a shared tablet this
    is a real hazard — read the bounds first, never blind-tap.

### Selector syntax that works here

| Purpose | ✅ Use | ❌ Avoid |
|---|---|---|
| Accessibility id | `~Sign in` | — |
| Class | `//android.widget.EditText` | `android=android.widget.EditText`, `className=…` |
| Exact dropdown option | `//*[starts-with(@content-desc,"PT QA\n")]` | `contains(…, "PT QA")` |
| Read a value | `getAttribute('text')` | `getValue()` — not supported |
| Appium args | `execute('mobile: x', { key: val })` | `execute('mobile: x', 'string')` |

---

## 9. Run history and past flakes

`node tests/all.js` — every failure so far has been diagnosed and fixed; none
is open. Capture full output when re-running (`node tests/all.js 2>&1 |
Tee-Object runs\runN.txt`) and read `runs\runN.txt`, not a `Select-Object
-Last N` truncation — that mistake was made once and hid the failure reason.

| Run | Suite | Result |
|---|---|---|
| #1 (6 Oct) | all.js (7 files) | ❌ derailed — Chrome/freeform window covered the app (§8.14). Environmental, not a test bug. |
| #2 (7 Oct) | all.js (7 files) | ❌ 5/7 — Test-02e: bottom-right "Select Route" was `enabled="false"` while the route was still computing. **Fixed:** `selectRoute()` polls up to 120 s for it to become enabled (the app's own "route ready" gate). |
| #3 (7 Oct) | — | stopped on user request mid-run |
| #4 (7 Oct) | all.js (7 files) | ✅ 7/7 — see `runs/run4.txt` |
| #5 (7 Oct) | all.js (3 files, consolidated) | ❌ 2/3 — Test-02 failed at Pick-Up Location. **Root cause:** the suggestion list was read ONCE, 3 s after typing, and that read caught the Google autocomplete before it rendered. The code then fell into the "empty list" fallback and pressed a **disabled** `Select Location` button (`enabled="false"` in the dump — no row had been selected). **Fixed:** `selectLocation()` now polls up to 12 s for the wanted row, falls back to the direct-commit path only when the list is genuinely empty, refuses to guess when rows exist but none matches, and never presses "Select Location" until it is `enabled` (`anySuggestionRow()` added for the empty-list check). |
| #6 (7 Oct) | all.js (3 files) | ✅ 3/3 — see `runs/run6.txt` |
| #7 (7 Oct) | all.js (3 files) | ❌ 2/3 — *the first fix's own bug.* The new poll loop broke out after its FIRST read if the list looked empty, so the slow load (~8-13 s on throttled autocomplete) triggered the fallback again and "Select Location" never enabled. **Fixed:** the loop now never exits on a transient empty read — it polls the full 15 s and only exits early when the APP signals readiness (the wanted row appears, or the button enables itself = the recorded no-suggestions path). |
| #8 (7 Oct) | all.js (3 files) | ✅ 3/3 — see `runs/run8.txt` |

Why run #5 only surfaced now: in the seven-file suite, `test-02d` and
`test-02e` ran their own location steps moments before, which by luck gave the
autocomplete a few extra seconds to render. The consolidated test removed that
accidental delay and exposed the race for what it was; the fix makes the wait
explicit instead of relying on luck.

---

## 10. Housekeeping

**Checking a test file without running it** — use `node --check`:

```powershell
node --check tests/all.js
```

Do **not** use `node -e "require('./tests/all.js')"`. Requiring a test file
executes it, which starts the whole suite. That mistake was made once.

**Throwaway probes** — these are exploration tools, not tests. Keep using them
rather than guessing selectors; every field mapped so far came from a probe.

| Script | Purpose |
|---|---|
| `tests/probe-selectors.js` | tests dropdown selector variants against the live UI |
| `tests/probe-route-fleet.js` | maps Origin/Destination/Fleet controls |
| `tests/explore-picker.js` | worked out how the date picker accepts input |
| `tests/probe-step2.js` | maps Step 2 (Fleet and SLA) layout |
| `tests/probe-step2b.js` | maps the two location dropdowns, the standby clock picker (full XML), and the Product Group sub-tab |
| `tests/record-user-steps.js` | read-only screen recorder for guided walkthroughs — set `RECORD_LOG` to a log file, pass minutes, then watch (e.g. `$env:RECORD_LOG='fleet-sla-record-2.txt'; node tests/record-user-steps.js 45`) |

**Failed-test artefacts** land in `dumps/` as XML + PNG. Read the XML first —
it is faster and more precise than a screenshot. Prefer `JSON.stringify` on
`content-desc` when exact text matters, since pretty-printed dumps flatten
newlines and that has already caused one wrong selector.

**Config** — device, app id, and credentials are in `config.js`. Credentials are
in plain text there; fine for a test account, worth moving to environment
variables before this ever reaches a shared machine.

---

## 11. Environment

| Item | Value |
|---|---|
| Device | Samsung Tab S9 FE (SM-X230), udid `RRGL707WSTA` |
| Android | 16 / SDK 36, 1200×1920 @ density 240, **landscape only** |
| App under test | `com.stc.tms.stg.planner` v1.0.14 (versionCode 50) |
| Appium | 3.6.0 + uiautomator2 4.2.6 |
| Node | 22.15.0 |
| adb | `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` |

Flutter is **not** installed on this machine and isn't needed.

> Note: the Flutter repo in this workspace is v1.0.0 and refers to a different
> package (`com.example.transport_order_mobile`). The app on the device is
> `com.stc.tms.stg.planner` v1.0.14. **Trust the device, not the repo** — the
> repo's test cases were stale.

> The app header shows `Rusli Junaidi | ruslijun@gmail.com` even after logging
> in as `om@gmail.com`. **Answered 5 Oct:** only two emails are valid —
> `om@gmail.com` and `ruslijun@gmail.com` — and they are now hardcoded in
> `config.js` (`user.validEmails`). The header mismatch is a staging quirk;
> login does succeed. It is a minor caveat on Test-01's positive path, not a
> blocker.