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
| Test-02 Create TO (entry path) | `node tests/test-02-create-transport-order.js` | ✅ passing |
| Test-02b Fill form | `node tests/test-02b-create-to-fill-form.js` | ✅ passing |
| Test-02c Route + Fleet | `node tests/test-02c-create-to-route-fleet.js` | ✅ passing |
| All of the above | `node tests/all.js` | ⚠️ see §7 |

### What the sheet's test case still needs

| Sheet step | Status |
|---|---|
| 1–3 Navigate, open button, Create new transport order | ✅ done |
| 4 Customer `PT QA`, Order date today, Route, Transport condition, Fleet type | ✅ **done** |
| 5A Pick up `tirtamas coldstorindo`, standby time, drop point `Hokky buah citraland` | ❌ not started — layout mapped (§5), being probed |
| 5B Product Group — `Ayam`, `10 Karung`, `10 kg`, `-18` | ❌ not started — sub-tab not opened yet |
| 6 Route → `RECOMENDATION` → Select Route | ❌ not started — now know it's the route page with `Toll` / `Non Toll` |
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

Step 2 is reachable and **already mapped** — `probe-step2.js` ran to completion
and its output is saved in `step2.txt`:

```powershell
Get-Content step2.txt
```

The step has **two sub-tabs**: `Route & SLA` and `Product Group`.

**`Route & SLA` tab:**

```
Pick-Up Location *        -> "Select Location"      autocomplete field
Need Relocation                                  toggle
<selected fleet name>            e.g. "BUP Freezer"
Stand by Time *          -> "Select Date"         clock picker
Drop Point Location 1 *  -> "Select Location"      autocomplete field
Has Deadline                                    toggle
Need Relocation                                  toggle
Add Drop Point                              button (adds another drop point)
```

`Product Group` has not been opened yet — `Add Product Group` does not exist on
the `Route & SLA` tab. **Switch sub-tab first.**

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
- Target hour = **current hour + 1**. Computed at runtime by the probe, never
  hardcoded — so the test stays correct on any day.
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

> **Risk to watch:** `-18` needs a minus sign. Android's numeric soft keyboard
> often has no `-` key, so the test may need `adb shell input text` instead of
> the on-screen keyboard. Verify before assuming.

### 6 — Route page

Reached after the whole form — **including both earlier steps** — is filled.
The page has **`Toll`** and **`Non Toll`** options.

**The tester has already configured the `Sidoarjo → Surabaya` route**, so the
**Recommendation Route should appear** for this test case. If it does not, the
configured route is not being matched — that would be worth raising, not
something to code around.

**Preserve the exact spelling `RECOMENDATION`** if that is what the app
displays. Do not "correct" it to `RECOMMENDATION`; a selector built on the
corrected spelling will never match.

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
6. `test-02d` for Step 5A, then Product Group for 5B, then the route page.

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

## 9. Known open problem — the suite flake

`node tests/all.js` reported **Test-02 FAIL** on one run, while Test-02 passes
standalone and passes immediately after Test-01. So it is not simply an
ordering problem, and the cause is still unknown.

Reproduce with full output captured — do **not** pipe through
`Select-Object -Last N`, that truncates away the failure reason (this mistake
was made once already):

```powershell
node tests/test-01-login.js  2>&1 | Out-File run1.txt
node tests/test-02-create-transport-order.js 2>&1 | Out-File run2.txt
Get-Content run2.txt
```

Best guess: timing under load when four tests run back to back, but that is a
hypothesis, not a diagnosis. Fix it before adding more tests — a suite that
only passes in some conditions is worse than a small one that always passes.

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