/**
 * pages/transportOrder.js
 * -----------------------
 * "Page object" = the actions you can do on one screen.
 *
 * Tests call these functions (readable) instead of repeating
 * selectors and waits (messy).
 *
 * Every selector below was verified against the real app
 * (com.stc.tms.stg.planner v1.0.14, Samsung Tab S9 FE).
 */

const { waitFor, tapById, isDisplayed, log } = require('../helpers/device');

const TransportOrderPage = {
    // ---------------------------------------------------------
    // Kanban board (landing screen)
    // ---------------------------------------------------------

    /**
     * Wait until the Transport Order board is showing.
     *
     * IMPORTANT — why we do NOT anchor on "Sales Order":
     *   The board is wider than the screen (5 columns) and it
     *   horizontally scrolls. On launch it sometimes rests with the
     *   first column off-screen, so "Sales Order" is NOT always
     *   present in the UI tree, even though the board is fine.
     *
     *   We anchor on "Dispatching" instead, which sits in the middle
     *   of the board and is visible in every scroll position.
     */
    async waitForBoard(driver, timeout) {
        return waitFor(driver, '~Dispatching', timeout);
    },

    /**
     * True when a transport-order card is on screen.
     *
     * Cards are one big node whose content-desc starts with the customer
     * name and contains a "TO-YYYYMMDD-####" number. Android UiSelector
     * has no wildcard syntax, so we ask for every View and filter in
     * JavaScript by looking for "TO-" in the description.
     */
    async hasTransportOrder(driver) {
        try {
            // NOTE: XPath is used deliberately. The shorthand
            // "android=android.view.View" is parsed as a method name by
            // UiSelector, and "className=..." is treated as CSS.
            const views = await driver.$$('//android.view.View');
            const count = await views.length;

            for (let i = 0; i < count; i += 1) {
                try {
                    const desc = await views[i].getAttribute('content-desc');
                    if (desc && desc.includes('TO-')) {
                        return true;
                    }
                } catch {
                    // ignore nodes that vanished between listing and reading
                }
            }
            return false;
        } catch {
            return false;
        }
    },

    /** Return the card descriptions that contain a "TO-" number. */
    async listTransportOrderCards(driver) {
        const results = [];
        try {
            const views = await driver.$$('//android.view.View');
            const count = await views.length;

            for (let i = 0; i < count; i += 1) {
                try {
                    const desc = await views[i].getAttribute('content-desc');
                    if (desc && desc.includes('TO-')) {
                        results.push(desc.replace(/\n/g, ' | '));
                    }
                } catch {
                    // ignore
                }
            }
        } catch {
            // ignore
        }
        return results;
    },

    /**
     * Open the "+ Transport Order" menu in the header.
     *
     * There are TWO elements named "Transport Order":
     *   - the sidebar nav item  (class android.view.View)
     *   - the header button      (class android.widget.Button)
     * so we select by BOTH the class and the description using XPath.
     *
     * NOTE: the shorthand 'android=Button desc="Transport Order"' is
     * parsed as a method name by UiSelector and throws
     * "Could not parse selector expression". XPath works.
     */
    async openCreateMenu(driver) {
        const button = await waitFor(
            driver,
            '//android.widget.Button[@content-desc="Transport Order"]',
            15000
        );
        await button.click();
        await driver.pause(1500);
        return button;
    },

    /** Tap "Create new transport order" in the menu. */
    async tapCreateNew(driver) {
        const item = await waitFor(driver, '~Create new transport order');
        await item.click();
        await driver.pause(2000);
        return item;
    },

    /** Tap "Convert sales order" in the menu. (Test-03, optional) */
    async tapConvertSalesOrder(driver) {
        const item = await waitFor(driver, '~Convert sales order');
        await item.click();
        await driver.pause(2000);
        return item;
    },

    // ---------------------------------------------------------
    // Pressing controls that need a real hold
    // ---------------------------------------------------------
    //
    // WHY THIS EXISTS — a hard-won finding
    //   The Order Date picker would not respond to `adb shell input tap`
    //   NOR to a normal Appium element.click(). Not the day cells, not
    //   "Today", not even "Cancel". Tapping OUTSIDE the picker dismissed
    //   it, which made the picker look broken.
    //
    //   It is not broken. Flutter's day cells use a gesture detector that
    //   ignores a zero-duration press. A real finger tap always has some
    //   duration, which is why manual testers never see the problem.
    //
    //   VERIFIED on the device (v1.0.14, Samsung Tab S9 FE):
    //     element.click()      -> picker stayed open, date NOT set
    //     150ms press + Apply  -> picker closed, date set to 3 Oct 2026
    //
    //   So: anything inside a Flutter overlay (date picker, dropdowns)
    //   must be pressed with a hold, not clicked.

    /**
     * Press an element with a real hold.
     *
     * This is the reliable way to activate a Flutter control. Use it
     * instead of click() for calendar cells, dropdown options, and
     * anything else inside a Flutter overlay.
     *
     * @param holdMs how long to hold. 150ms is proven to work; do not go
     *               below ~100ms or the gesture is ignored again.
     */
    async press(driver, element, holdMs = 150) {
        const location = await element.getLocation();
        const size = await element.getSize();
        const x = Math.round(location.x + size.width / 2);
        const y = Math.round(location.y + size.height / 2);

        await driver.performActions([
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x, y },
                    { type: 'pointerDown', button: 0 },
                    { type: 'pause', duration: holdMs },
                    { type: 'pointerUp', button: 0 },
                ],
            },
        ]);
        await driver.releaseActions();
        await driver.pause(700);
    },

    // ---------------------------------------------------------
    // Create Transport Order — Step 1: Basic Detail
    // ---------------------------------------------------------
    async waitForCreateForm(driver, timeout) {
        return waitFor(driver, '~Create Transport Order', timeout);
    },

    /**
     * Choose a customer from the dropdown.
     *
     * TWO TRAPS HERE, both found on the real app by probing the live UI:
     *
     * 1. The option label is "NAME\nCUST-ID" — separated by a NEWLINE,
     *    not a space or a pipe:
     *      "PT QA\nCUST-1790135906434241572"
     *    (Easy to get wrong: pretty-printed dumps render that newline as
     *    " | ", which looks like part of the data but is not.)
     *
     * 2. "PT QA update" also exists, so any selector without the newline
     *    matches TWO options:
     *      //*[starts-with(@content-desc,"PT QA")]     -> 2 matches
     *      //*[contains(@content-desc,"PT QA")]        -> 2 matches
     *      //*[starts-with(@content-desc,"PT QA\n")]   -> 1 match  ✅
     *
     *    That matters: the loose versions could silently pick
     *    "PT QA update", create the order for the wrong customer, and the
     *    test would still report success. Verified by scrolling the list
     *    until both names were rendered — with the list at the top the
     *    loose selector matches only one, purely because the other row is
     *    not in the tree yet.
     *
     * Note the field label CHANGES once chosen ("Select Customer" becomes
     * "PT QA"), so do not assert on "~Select Customer" afterwards.
     */
    async selectCustomer(driver, customerName = 'PT QA') {
        // A real newline character inside the XPath string literal.
        const NEWLINE = String.fromCharCode(10);

        const field = await this.scrollToField(driver, 'Select Customer');
        await this.press(driver, field);
        await driver.pause(1500);

        const option = await waitFor(
            driver,
            `//*[starts-with(@content-desc,"${customerName}${NEWLINE}")]`
        );
        await this.press(driver, option);
        await driver.pause(1500);

        // Confirm the choice landed: the field must now show the name.
        const chosen = await driver.$(`~${customerName}`);
        if (!(await chosen.isDisplayed())) {
            throw new Error(
                `Customer "${customerName}" was tapped but the field does not `
                + `show it. The dropdown may have selected a different `
                + `customer with a similar name.`
            );
        }
        return option;
    },

    /**
     * Set the Order Date to today.
     *
     * Uses the picker's "Today" shortcut.
     *
     * IMPORTANT — this function had a misleading check that made it fail on
     * 6 Oct 2026. It used to verify "the picker opened" by looking for an
     * `~Apply` button. On this build the picker can be wide open with the
     * calendar fully rendered and **no Apply, Cancel, Next, OK or Done button
     * anywhere in the accessibility tree** — that whole dump held 58 nodes,
     * not one of them a Button, and no node had a text attribute.
     *
     * Verified on the device when it failed (dumps/probe-step2c.xml):
     *     "October 2026 | Oct 6, 2026 | Mo | Tu | We | Th | Fr | Sa | Su"
     *     "Today"
     *     28 29 30 1 2 3 4 ... 1 2 3 4 5
     *     "Dismiss"
     * and nothing else. The old error said "The Order Date picker did not
     * open" while the picker was plainly open — a message that sends you
     * hunting for the wrong bug entirely.
     *
     * So the picker is now detected by the CALENDAR ("Today" plus the day
     * grid), never by an action button, and afterwards we press whichever
     * action button appears if any. That works whether or not this build
     * shows one.
     *
     * Uses press-with-hold throughout: a normal click() does NOT register
     * inside this picker (Flutter ignores zero-duration taps).
     */
    async selectOrderDateToday(driver) {
        const field = await this.scrollToField(driver, 'Select Date');
        await this.press(driver, field);
        await driver.pause(2000);

        // Detect the picker by the calendar itself. "Today" only exists
        // inside it, so its presence means the overlay is up.
        const today = await driver.$('~Today');
        if (!(await today.isDisplayed())) {
            throw new Error(
                'The Order Date picker did not open — no "Today" shortcut is '
                + 'on screen. (Do NOT check for an Apply button here: this '
                + 'build often shows no action buttons at all.)'
            );
        }

        await this.press(driver, today);
        await driver.pause(1500);

        // The confirm button IS "Apply" — confirmed on the device once the
        // window was full screen. Before that it was invisible and we were
        // reduced to guessing names.
        //
        // IMPORTANT: the apply button is NOT always on screen. This picker's
        // button row is at the very bottom of a dialog that is taller than
        // some window sizes, so in a shrunken freeform window it is clipped
        // away and `~Apply` does not exist at all. Verified both ways:
        //
        //   window 1038x780 (freeform) -> 58 nodes, zero Buttons, no Apply
        //   window 1920x1083 (full)    -> 47 nodes, Apply AND Cancel present
        //
        // So: if Apply is missing, this is a WINDOW SIZE problem, not a
        // missing selector. Do not add more button names to the search —
        // call ensureFullscreen() instead.
        const apply = await driver.$('~Apply');
        if (!(await apply.isDisplayed().catch(() => false))) {
            throw new Error(
                'The date picker has no "Apply" button. This almost always '
                + 'means the app window is too small and the button row is '
                + 'clipped off. Run ensureFullscreen() first — do not guess '
                + 'other button names.'
            );
        }

        await this.press(driver, apply);
        await driver.pause(2000);

        // Final check: the picker must be gone. This is the only reliable
        // proof the date was accepted.
        if (await isDisplayed(driver, '~Today', 1500)) {
            throw new Error(
                'The date picker stayed open after pressing Apply. '
                + 'The date was probably not accepted.'
            );
        }

        log('INFO', 'Order Date set to today via Today + Apply.');
        return true;
    },

    // ---------------------------------------------------------
    // Fleet and SLA — searchable location fields
    // ---------------------------------------------------------
    //
    // MEASURED on the device (6 Oct), searching "tirtamas" returns FOUR
    // suggestions, and one is a trap:
    //
    //   PT TIRTAMAS BANGUN KARYA   CitraLand CBD, Mulung, GREKIK
    //   Tirtamas Coldstorindo      Bakalan, Wringinpitu, SIDOARJO   <- want
    //   Tirtamas Gemilang Waterpark Pantura Cirebon, Kebonturi
    //   PT Tirtamas Lestari        Lidah Kulon, Surabaya
    //
    // Matching on "tirtamas" alone would happily pick a different company at
    // a different site, so matchSuggestion() requires the full depot name.
    //
    // Suggestions are rendered as NAME\nADDRESS (an escaped &#10; in the XML) —
    // the same convention as the customer dropdown, so a fragment match on
    // the name must stop before the newline.

    /**
     * Find the visible control with this label BELOW a caption.
     *
     * Both location fields are labelled "Select Location", so the caption
     * above them is the only way to tell them apart.
     *
     * @returns the element, or throws
     */
    async fieldBelowCaption(driver, caption, controlName) {
        const captionEl = await this.scrollToField(driver, caption);
        const capY = (await captionEl.getLocation()).y;

        const all = await driver.$$(`~${controlName}`);
        const total = await all.length;
        let best = null;
        for (let i = 0; i < total; i += 1) {
            // Pick by POSITION, not by isDisplayed().
            //
            // WHY: on this step the location fields are rendered as
            // android.widget.ImageView, not Button:
            //     "Pick-Up Location *"  [v.View]      [965,507][1118,531]
            //     "Select Location"    [ImageView]   [965,540][1487,618]
            //     "Stand by Time *"    [v.View]      [990,420][1121,444]
            //     "Select Date"        [ImageView]   [1007,454][1445,529]
            //     "Drop Point Location 1 *" [v.View]  [990,558][1176,582]
            //     "Select Location"    [ImageView]   [990,591][1461,669]
            //
            // ImageViews can report isDisplayed() false even while plainly on
            // screen, and the earlier run failed with 'Form field "Select
            // Location" was not found' for exactly that reason. Y position is
            // reliable, so use it.
            const y = (await all[i].getLocation().catch(() => null))?.y;
            if (y === undefined || y === null) continue;
            if (y <= capY) continue;
            if (!best || y < best.y) best = { el: all[i], y };
        }

        if (!best) {
            const positions = [];
            for (let i = 0; i < total; i += 1) {
                const loc = await all[i].getLocation().catch(() => null);
                positions.push(loc ? `y=${loc.y}` : 'unreadable');
            }
            throw new Error(
                `No "${controlName}" below "${caption}" (caption at `
                + `y=${capY}; ${total} on screen at ${positions.join(', ')}). `
                + 'The window may be too small — call ensureFullscreen() first.'
            );
        }
        return best.el;
    },

    /**
     * Click the suggestion whose name matches, ignoring the address.
     *
     * @param expectedName  the depot name, e.g. "Tirtamas Coldstorindo"
     * @returns the matched text, or null when nothing matched
     */
    async matchSuggestion(driver, expectedName) {
        const want = expectedName.toLowerCase();
        const nodes = await driver.$$('//*[@content-desc != ""]');
        const total = await nodes.length;

        for (let i = 0; i < total; i += 1) {
            const desc = await nodes[i].getAttribute('content-desc')
                .catch(() => null);
            if (!desc) continue;
            // Compare only the NAME half, so an address that happens to
            // contain the company name cannot cause a false match.
            const name = desc.split('\n')[0].toLowerCase();
            if (!name.includes(want)) continue;
            if (!(await nodes[i].isDisplayed().catch(() => false))) continue;

            await this.press(driver, nodes[i]);
            await driver.pause(1500);
            return desc.replace(/\n/g, ' | ');
        }
        return null;
    },

    /**
     * Fill one searchable location field, fully.
     *
     * Three steps, all required (confirmed by the tester, 6 Oct):
     *   1. press the field and type the query
     *   2. click the wanted suggestion in the list below it
     *   3. press "Select Location" to CONFIRM
     *
     * Step 3 is the one that is easy to miss. Choosing a suggestion only
     * fills the field — nothing is committed to the form until the button is
     * pressed. Verified by reading the field's caption afterwards.
     *
     * @param caption   the field caption, e.g. "Pick-Up Location *"
     * @param query     what to type, e.g. "tirtamas"
     * @param depotName the exact suggestion to choose, e.g.
     *                  "Tirtamas Coldstorindo"
     */
    async selectLocation(driver, caption, query, depotName) {
        const field = await this.fieldBelowCaption(driver, caption, 'Select Location');
        await this.press(driver, field);
        await driver.pause(2000);

        // The search box is the only EditText in this overlay, so type into it.
        const edits = await driver.$$('//android.widget.EditText');
        const n = await edits.length;
        if (n === 0) {
            throw new Error(
                `No search box appeared for "${caption}". The field may not `
                + 'be a searchable location, or the window is too small.'
            );
        }
        await edits[0].setValue(query);
        await driver.pause(3000);

        // DO NOT dismiss the keyboard here.
        //
        // The 6 Oct run failed with "No suggestion matched ..." and the dump
        // showed the STEP TABS, not the suggestion list — the whole overlay
        // had been dismissed. Cause: dismissKeyboard() falls back to the BACK
        // key, and while the search box still held focus, BACK closed the
        // overlay instead of just the keyboard. That one mistake then caused
        // four separate errors across the run (both location fields, Next,
        // and Product Group all "not found").
        //
        // The suggestions are readable while the keyboard is up — they sit
        // above it. So: read and press the suggestion FIRST, and only touch
        // the keyboard afterwards, when focus has left the search box.
        const picked = await this.matchSuggestion(driver, depotName);
        if (!picked) {
            const seen = await this.visibleFormLabels(driver);
            throw new Error(
                `No suggestion matched "${depotName}" for query "${query}". `
                + `Suggestions on screen:\n    - ${seen.join('\n    - ')}`
            );
        }
        log('INFO', `${caption}: selected "${picked}".`);

        // Step 3 — commit it.
        //
        // Deliberately NOT scoped by caption here: while the overlay is open
        // the form behind it (and therefore the caption) is not in the tree.
        // Inside the overlay there is exactly one "Select Location", so the
        // scoping that matters was already applied when we found the field.
        const confirm = await driver.$('~Select Location');
        if (!(await confirm.isExisting().catch(() => false))) {
            throw new Error(
                `Chose "${depotName}" but could not find the "Select Location" `
                + `button to confirm it. The value is NOT committed yet.`
            );
        }
        await this.press(driver, confirm);
        await driver.pause(2000);

        // The overlay must be gone, otherwise nothing was committed.
        if (await isDisplayed(driver, '~Select Location', 1500)) {
            throw new Error(
                `The location overlay is still open after confirming `
                + `"${depotName}". The value was probably not saved.`
            );
        }

        log('INFO', `${caption}: confirmed with Select Location.`);
        return true;
    },

    // ---------------------------------------------------------
    // Fleet and SLA — Stand by Time
    // ---------------------------------------------------------
    //
    // MEASURED on the device (6 Oct). NOT a drawn clock face, and not one
    // dialog — it is a date-time picker in TWO stages:
    //
    //   Stage 1  "October 2026\nOct 6, 2026\nMo..Su"  header
    //            "Today"         [1097,325][1199,382]
    //            "09:28"         [722,397][1199,454]  clickable="true"
    //            day grid        7 cols x 6 rows
    //            "Cancel"/"Apply"
    //
    //   Stage 2  (after pressing the HH:mm field)
    //            "09:28\nSelect time"                        [646,441][970,780]
    //            [SeekBar] "Select hours 09"                 [646,551][790,671]
    //            [SeekBar] "Select minutes 28"               [826,551][970,671]
    //            [Button]  "Switch to text input mode"       [646,780][718,852]
    //            [Button]  "Cancel"                          [1070,780][1166,852]
    //            [Button]  "OK"                               [1178,780][1274,852]
    //
    // WHY THIS MATTERS
    //   - The two SeekBar nodes report their values ("Select hours 09"), which
    //     makes the dial readable and verifiable. Read them; never aim at them.
    //     Their advertised bounds [826,551][970,671] sit inside a dead zone —
    //     a 385-tap grid scan found x 646..1046 responds to nothing at all. The
    //     real widget is a clock FACE; see the geometry notes at DIAL, far
    //     below, and the four dead ends that this one fact explains.
    //   - setValue() on those nodes reports a changed progress and looks like a
    //     success, but the value never enters app state — only the
    //     accessibility label moves. Do not verify an edit by reading a label
    //     back; that proves the label moved, never that the widget reacted.
    //   - The confirm button is "OK". It is NOT "Confirm" and NOT "Apply" —
    //     assuming either would have failed here.
    //   - There is NO AM/PM toggle, so hours read 0-23, but hour 0 shares the
    //     0° face position with hour 12 and so cannot be set unambiguously.
    //     setClockTime() throws rather than committing 12:00 at 23:xx.

    /** The stand-by time this test should set: (now + 1h), minutes 00. */
    targetStandbyTime() {
        const now = new Date();
        return { hour: (now.getHours() + 1) % 24, minute: 0 };
    },




    /**
     * Read the value the form's Stand by Time field actually shows.
     *
     * WHY THIS EXISTS — a false success, 6 Oct
     *   The time dialog accepted "10:00" in text mode and read it back
     *   correctly, so the code reported success. But the form field showed
     *
     *       [ImageView] "6 Oct 2026 09:59"
     *
     *   — the CURRENT time, not 10:00. Typing into the dialog is not the same
     *   as committing to the form, and verifying our own input proved
     *   nothing.
     *
     *   Same mistake class as trusting the newest card on the board instead of
     *   filtering for our own. The proof has to come from the app's own state.
     *
     * @returns the field's text, e.g. "6 Oct 2026 10:00", or null
     */
    async readStandbyTime(driver) {
        try {
            // The caption is a View; the value sits in the ImageView below it.
            const captionEl = await driver.$('~Stand by Time *');
            if (!(await captionEl.isExisting().catch(() => false))) return null;
            const capY = (await captionEl.getLocation()).y;

            const nodes = await driver.$$('//*[@content-desc != ""]');
            const total = await nodes.length;
            for (let i = 0; i < total; i += 1) {
                const desc = await nodes[i].getAttribute('content-desc');
                // "6 Oct 2026 10:00" — a real date plus a real time.
                if (!desc || !/\d{1,2}:\d{2}/.test(desc)) continue;
                const y = (await nodes[i].getLocation().catch(() => null))?.y;
                if (y === undefined || y === null || y <= capY) continue;
                return desc;
            }
            return null;
        } catch {
            return null;
        }
    },

    /**
     * Read a node's displayed value, whichever attribute carries it.
     *
     * WHY THIS EXISTS — a wasted run, 6 Oct
     *   Flutter publishes one value per node type, and the attribute matters:
     *
     *     a SeekBar / Text node  -> value in CONTENT-DESC, `text` is ""
     *     "Select hours 10"        <-- content-desc
     *     "10:22\nSelect time"     <-- content-desc
     *
     *     an EditText           -> value in TEXT, content-desc is ""
     *
     *   Reading the wrong one returns an empty string, which is
     *   indistinguishable from "the widget has not rendered yet". That is
     *   exactly what happened: the dial was open the whole time, but
     *   readText() made it look like empty stubs and the probe kept
     *   "retrying" against a dialog that was already up.
     *
     *   So check both, preferring content-desc.
     *
     * @returns the value, or null when neither attribute carries one
     */
    async readNodeValue(el) {
        const desc = await el.getAttribute('content-desc').catch(() => null);
        if (desc !== null && desc !== undefined && String(desc).trim() !== '') {
            return desc;
        }
        const text = await el.getAttribute('text').catch(() => null);
        if (text !== null && text !== undefined && String(text).trim() !== '') {
            return text;
        }
        return null;
    },

    /** Read an element's text attribute, or null. */
    async readText(el) {
        const t = await el.getAttribute('text').catch(() => null);
        return t;
    },

    /** Read an element's value as a number, or null. */
    async readNumber(el) {
        const raw = await this.readText(el);
        if (raw === null || raw === undefined) return null;
        const m = String(raw).match(/\d+/);
        return m ? Number(m[0]) : null;
    },

    /**
     * Set Stand by Time to (current hour + 1), minutes 00, today.
     *
     * @returns the time that was set, as "HH:mm"
     */
    async selectStandbyTime(driver, hourOverride) {
        const target = hourOverride !== undefined
            ? { hour: hourOverride, minute: 0 }
            : this.targetStandbyTime();

        const field = await this.scrollToField(driver, 'Select Date');
        await this.press(driver, field);
        await driver.pause(2500);

        // --- Stage 1: the calendar --------------------------------------
        // "Today" is the picker marker; minutes are always 00 so the date only
        // has to be today-or-later, which Today guarantees.
        const today = await driver.$('~Today');
        if (!(await today.isDisplayed().catch(() => false))) {
            throw new Error(
                'The Stand by Time picker did not open — no "Today" shortcut '
                + 'on screen. If the app window is small the dialog can be '
                + 'clipped; call ensureFullscreen() first.'
            );
        }
        await this.press(driver, today);
        await driver.pause(1500);

        // --- Stage 2: the time ------------------------------------------
        // The HH:mm field has no label of its own, only its value, so find it
        // by content. It sits above the day grid.
        const labelled = await driver.$$('//*[@content-desc != ""]');
        const total = await labelled.length;
        let timeField = null;
        for (let i = 0; i < total; i += 1) {
            const desc = await labelled[i].getAttribute('content-desc');
            if (!desc || !/^\d{1,2}:\d{2}$/.test(desc)) continue;
            const y = (await labelled[i].getLocation().catch(() => null))?.y;
            if (y === undefined || y === null || y >= 520) continue;
            timeField = labelled[i];
        }
        if (!timeField) {
            throw new Error(
                'No "HH:mm" field found above the calendar. The picker layout '
                + 'may have changed — dump the tree instead of guessing.'
            );
        }
        await this.press(driver, timeField);
        await driver.pause(2500);

        // The dial must be open before we touch either slider.
        const hourSlider = await driver.$('//*[starts-with(@content-desc,"Select hours ")]');
        if (!(await hourSlider.isExisting().catch(() => false))) {
            throw new Error(
                'The time dialog did not open after pressing the HH:mm field. '
                + 'Expected a "Select hours" dial. Labels on screen:\n    - '
                + (await this.visibleFormLabels(driver)).join('\n    - ')
            );
        }

        const want = { hours: target.hour, minutes: target.minute };

        // STRICT ORDER: hour, then minute, then the confirm button. Never the
        // other way round — the tester was explicit about this.
        //
        //   1. HOUR    -> current hour + 1   (e.g. 09 -> 10)
        //   2. MINUTE  -> always 00, i.e. 12 o'clock
        //   3. CONFIRM -> the button the picker actually shows ("OK")
        //
        // HOW EACH IS SET — NOT YET SOLVED. See the note below before
        // changing anything here.
        await this.setClockTime(driver, want.hours, want.minutes);

        const hhmmWanted = this.hhmm(want);
        log('INFO', `Clock reads ${hhmmWanted} and is verified. `
            + 'NOT committed yet — still needs OK and Apply.');

        // --- Confirm ----------------------------------------------------
        // The button is "OK" — measured, not assumed.
        const ok = await driver.$('~OK');
        if (!(await ok.isDisplayed().catch(() => false))) {
            throw new Error(
                'The time dialog has no "OK" button. Do not guess other names — '
                + 'dump the tree and check what it really shows. Labels now:\n    - '
                + (await this.visibleFormLabels(driver)).join('\n    - ')
            );
        }
        await this.press(driver, ok);
        await driver.pause(2000);

        // After OK we are back on the calendar. Its HH:mm line must now show
        // the new time — if it still shows the old one, OK did not carry the
        // typed value across and pressing Apply would silently commit the
        // ORIGINAL time. That is exactly the false success recorded above.
        const calendarTime = await this.timeShownInCalendar(driver);
        log('INFO', `after OK, the calendar reads "${calendarTime}".`);
        if (calendarTime && calendarTime !== this.hhmm(want)) {
            throw new Error(
                `OK did not carry the typed time across: the calendar still `
                + `reads "${calendarTime}" instead of `
                + `"${this.hhmm(want)}". Pressing Apply now would commit the `
                + 'WRONG time, so stopping here.'
            );
        }

        // --- Apply commits the date+time to the form --------------------
        const apply = await driver.$('~Apply');
        if (!(await apply.isDisplayed().catch(() => false))) {
            throw new Error(
                'The calendar has no "Apply" button. The app window may be too '
                + 'small — call ensureFullscreen() first.'
            );
        }
        await this.press(driver, apply);
        await driver.pause(2500);

        // --- The only proof that counts: read the FORM FIELD ------------
        const shown = await this.readStandbyTime(driver);
        const wanted = this.hhmm(want);
        if (!shown) {
            throw new Error(
                'Apply was pressed but the Stand by Time field cannot be read, '
                + 'so the value is unverified. Do not report this as a pass.'
            );
        }
        if (!shown.includes(wanted)) {
            throw new Error(
                `The Stand by Time field reads "${shown}" but should show `
                + `"${wanted}". The dialog accepted the value but the form did `
                + 'not take it.'
            );
        }
        log('INFO', `Stand by Time field shows "${shown}" — committed.`);

        const text = this.hhmm(want);
        log('INFO', `Stand by Time set to ${text}.`);
        return text;
    },

    // -------------------------------------------------------------
    /**
     * The Stand by Time dial — a CLOCK FACE, not two sliders.
     * -------------------------------------------------------------
    //
    // SOLVED 6 Oct by measurement. Read this before changing the geometry.
    //
    // The dial is ONE circular face centred at DIAL.cx/DIAL.cy. DIAL.r is a
    // radius proven to sit inside the responsive band; anything beyond
    // DIAL.maxR lands OFF the face and dismisses the dialog, which cost a run.
    //
    //   0° = straight up = 12 o'clock = hour 12, minute 00
    //   30° = one hour later, or five minutes later
    //
    // Measured across two independent runs:
    //
    //   hour:   0°->12  30°->13  60°->14  90°->15  120°->16
    //   minute: 0°->0   30°->5   60°->10  90°->15  180°->30  270°->45  330°->55
    //
    // WHY EVERY EARLIER APPROACH FAILED
    //   The accessibility nodes advertise "Select hours"/"Select minutes" at
    //   [826,551][970,671]. A 385-tap grid scan across the whole dialog showed
    //   that x 646..1046 responds to NOTHING — the advertised rectangle sits
    //   inside that dead zone. All four earlier attempts were aimed at a region
    //   where no gesture can land. The gesture was never the problem; the
    //   ADDRESS was.
    //
    //   The four, briefly:
    //     1. drag as ONE pointerMove of duration 0 — never crossed touch slop,
    //        so Android delivered a tap or nothing at all
    //     2. arrow keys — Flutter's Slider binds no key handlers
    //     3. "Switch to text input mode" — types and reads back fine, then OK
    //        reverts the calendar to the LIVE current time
    //     4. setValue() — reported "11"/"00" and looked like a success, but
    //        Cancel-then-reopen showed the value never entered app state. Only
    //        the ACCESSIBILITY LABEL moved. Verifying an edit by reading a label
    //        back proves the label moved, never that the widget reacted.
    //
    // ONE FACE, TWO MODES
    //   The dial opens in HOUR mode and hands over to MINUTES once an hour is
    //   chosen. So when the wanted hour already equals the current hour no drag
    //   happens and the face stays in hour mode; setClockTime() nudges the hand
    //   to trigger the hand-over rather than assuming it.
    //
    // MIDNIGHT IS UNREACHABLE
    //   No AM/PM toggle, and hour 0 shares the 0° position with hour 12, so
    //   00:00 cannot be told apart from 12:00. setClockTime() throws instead of
    //   committing 12:00 while reporting a pass. Only matters at 23:xx.
     */

    /** Dial centre, and the radius proven to sit inside the responsive band. */
    DIAL: { cx: 1166, cy: 611, r: 40, maxR: 55 },

    /**
     * Set the dial's hour and minute by dragging the hand.
     *
     * This is the manual gesture the tester used: drag to the hour, drag the
     * minute to 00, and the caller presses OK then Apply.
     *
     * Both values are read back off the dial and a mismatch throws BEFORE
     * anything is committed. The dial opens on the live time, so an unverified
     * set would commit "now" and then look almost right — which is the false
     * success this whole problem started with.
     *
     * @returns {{hours:number, minutes:number}} what the dial reads afterwards
     */
    async setClockTime(driver, hour, minute) {
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
            throw new Error(`setClockTime: hour ${hour} is not 0-23.`);
        }
        if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
            throw new Error(`setClockTime: minute ${minute} is not 0-59.`);
        }
        if (hour === 0) {
            throw new Error(
                'Cannot set hour 00: this dial has no AM/PM toggle, so 00 and 12 '
                + 'share one face position and 00:00 cannot be told apart from '
                + '12:00. Refusing to commit 12:00 while reporting a pass. Only '
                + 'reached when the run starts at 23:xx.'
            );
        }

        const want = { hours: hour, minutes: minute };

        // --- 1. HOUR, by dragging the hand (the manual step) ------------
        const curH = await this.readDialValue(driver, 'hours');
        if (curH === null) {
            throw new Error('The dial is not open — no "Select hours" node.');
        }
        if (curH !== hour) {
            await this.dragFace(driver, this.hourAngle(curH), this.hourAngle(hour));
            const got = await this.readDialValue(driver, 'hours');
            if (got !== hour) {
                // A first tap/drag on a freshly opened dial is consumed while
                // the face is still in HOUR mode; try once more before failing.
                await this.dragFace(
                    driver,
                    this.hourAngle(got === null ? curH : got),
                    this.hourAngle(hour)
                );
                const got2 = await this.readDialValue(driver, 'hours');
                if (got2 !== hour) {
                    throw new Error(
                        `Dragged the hour to ${hour} but the dial reads ${got2}. `
                        + 'Nothing has been committed — stopping rather than '
                        + 'pressing OK on a wrong value. If this keeps '
                        + 'happening the face has moved; re-measure with '
                        + 'tests/probe-clock-hour.js rather than nudging DIAL '
                        + 'by guesswork.'
                    );
                }
            }
            log('INFO', `Hour dragged to ${hour}.`);
        }

        // --- 2. MINUTE, by dragging the hand to 12 o'clock ---------------
        // The manual step: minute always goes to 00, which is straight up.
        const curM = await this.readDialValue(driver, 'minutes');
        if (curM === null) {
            throw new Error('The dial is not open — no "Select minutes" node.');
        }
        if (curM !== minute) {
            await this.dragFace(
                driver,
                this.minuteAngle(curM),
                this.minuteAngle(minute)
            );
            let gotM = await this.readDialValue(driver, 'minutes');
            if (gotM !== minute) {
                // The face only hands over to minutes once an hour is chosen.
                // If the hour was already correct no drag happened, so nudge
                // the hand onto the hour position first, then back to 00.
                await this.dragFace(
                    driver,
                    this.minuteAngle(gotM === null ? curM : gotM),
                    this.minuteAngle(minute)
                );
                gotM = await this.readDialValue(driver, 'minutes');
                if (gotM !== minute) {
                    throw new Error(
                        `Dragged the minute to ${minute} but the dial reads `
                        + `${gotM}. Nothing has been committed — stopping rather `
                        + 'than pressing OK on a wrong value.'
                    );
                }
            }
        }
        log('INFO', `Minute dragged to `
            + `${String(minute).padStart(2, '0')}. Dial reads `
            + `${this.hhmm(want)}.`);

        // --- 3. the CALLER presses OK, then Apply ------------------------
        // Deliberately not here. The tester asked for these to stay visible
        // steps, and selectStandbyTime() verifies between them.
        return want;
    },

    /**
     * Drag the clock's hand from one angle to another — the manual gesture.
     *
     * Delivered as a real finger: pointer down, many small moves with time
     * between them, pointer up. A single pointerMove of duration 0 never
     * crosses the touch slop threshold, so Android hands the app a tap or
     * nothing at all.
     *
     * All taps and drags stay on the face at radius DIAL.r. Beyond DIAL.maxR
     * the drag lands off the face and DISMISSES the dialog — that cost a run.
     */
    async dragFace(driver, fromDeg, toDeg) {
        const { cx, cy, r } = this.DIAL;
        const at = (deg) => {
            const rad = (deg * Math.PI) / 180;
            return {
                x: Math.round(cx + r * Math.sin(rad)),
                y: Math.round(cy - r * Math.cos(rad)),
            };
        };

        const from = at(fromDeg);
        const to = at(toDeg);
        const steps = 16;

        const actions = [
            { type: 'pointerMove', duration: 0, x: from.x, y: from.y },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 120 },
        ];
        for (let i = 1; i <= steps; i += 1) {
            actions.push({
                type: 'pointerMove',
                duration: 16,
                x: Math.round(from.x + ((to.x - from.x) * i) / steps),
                y: Math.round(from.y + ((to.y - from.y) * i) / steps),
            });
        }
        actions.push({ type: 'pause', duration: 120 });
        actions.push({ type: 'pointerUp', button: 0 });

        await driver.performActions([{
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions,
        }]);
        await driver.releaseActions();
        await driver.pause(1000);
    },

    /** Read "Select hours N" or "Select minutes N", or null. */
    async readDialValue(driver, kind) {
        const el = await driver.$(
            `//*[starts-with(@content-desc,"Select ${kind} ")]`
        );
        if (!(await el.isExisting().catch(() => false))) return null;
        const raw = await this.readNodeValue(el).catch(() => null);
        if (raw === null) return null;
        const m = String(raw).match(/(\d+)\s*$/);
        return m ? Number(m[1]) : null;
    },

    /**
     * Angle in degrees clockwise from 12 that selects `hour`.
     *
     * The face has twelve positions but reports 24-hour values, so hours 1-23
     * map one-to-one at 30° apart and only hour 0 is unreachable.
     */
    hourAngle(hour) {
        const pos = hour === 0 ? 12 : hour;
        const steps = pos >= 12 ? pos - 12 : pos + 12;
        return (steps * 30) % 360;
    },

    /** Angle in degrees clockwise from 12 that selects `minute`. */
    minuteAngle(minute) {
        return (minute * 6) % 360;   // 6° per minute
    },

    /** "HH:mm" from an hour/minute pair. */
    hhmm({ hours, minutes }) {
        return `${String(hours).padStart(2, '0')}:`
            + `${String(minutes).padStart(2, '0')}`;
    },

    /** The HH:mm text currently shown in the calendar's time line, or null. */
    async timeShownInCalendar(driver) {
        try {
            const nodes = await driver.$$('//*[@content-desc != ""]');
            const total = await nodes.length;
            for (let i = 0; i < total; i += 1) {
                const desc = await nodes[i].getAttribute('content-desc');
                if (desc && /^\d{1,2}:\d{2}$/.test(desc)) {
                    const y = (await nodes[i].getLocation().catch(() => null))?.y;
                    if (y !== undefined && y !== null && y < 520) return desc;
                }
            }
            return null;
        } catch {
            return null;
        }
    },

    /** The date the Order Date field currently shows, or null. */
    async readOrderDate(driver) {
        try {
            await this.scrollFormToTop(driver, 3);
            const el = await driver.$(
                '//android.widget.ImageView[contains(@content-desc,"20")]'
            );
            if (await el.isDisplayed()) {
                return await el.getAttribute('content-desc');
            }
        } catch {
            // ignore
        }
        return null;
    },

    /**
     * Choose a Fleet Type from the dropdown.
     *
     * The options read "NAME\nN Available", e.g. "BUP Freezer\n1 Available".
     * The newline matters: "CDDL Freezer" also contains "Freezer", so a
     * "contains" selector would match two options and could pick the wrong
     * fleet. Verified live:
     *      //*[contains(@content-desc,"Freezer")]         -> 2 matches  (ambiguous)
     *      //*[starts-with(@content-desc,"BUP Freezer\n")] -> 1 match  ✅
     */
    async selectFleetType(driver, fleetName = 'BUP Freezer') {
        const NEWLINE = String.fromCharCode(10);

        const field = await this.scrollToField(driver, 'Select Fleet');
        await this.press(driver, field);
        await driver.pause(1500);

        const option = await waitFor(
            driver,
            `//*[starts-with(@content-desc,"${fleetName}${NEWLINE}")]`
        );
        await this.press(driver, option);
        await driver.pause(1500);

        // The field label becomes the chosen fleet name.
        const chosen = await driver.$(`~${fleetName}`);
        if (!(await chosen.isDisplayed())) {
            throw new Error(
                `Fleet "${fleetName}" was tapped but the field does not show `
                + `it. A similarly named fleet may have been selected.`
            );
        }
        return option;
    },

    /**
     * Choose Origin City or Destination City.
     *
     * IMPORTANT — these are SEARCHABLE dropdowns, not plain lists.
     * Opening one shows a text field plus an alphabetical list starting at
     * "Abepura, Papua". Reaching "Surabaya" by scrolling would mean
     * dragging through hundreds of entries, so we type the name to filter
     * instead.
     *
     * Verified on the device: the opened overlay contains exactly one
     * EditText (the search box) and one scrollable list. On STEP 1 the form
     * itself has no EditText fields, so any EditText on screen belongs to
     * this overlay.
     *
     * CAREFUL — that shortcut is only valid on step 1. The Product Group tab
     * on step 2 introduces the wizard's first real text fields (Product,
     * Quantity, Weight, Temperature), so "the only EditText on screen" is no
     * longer safe as a general rule. Scope this reasoning to step 1.
     *
     * Option labels are "City, Province", e.g. "Surabaya, Jawa Timur", so
     * we match "City," to avoid catching a different city with the same
     * first letters.
     *
     * NOTE on verifying the result: the field ends up showing the FULL
     * "Surabaya, Jawa Timur", not just "Surabaya". An earlier version
     * checked for `~Surabaya` and reported a failure even though the city
     * had been selected correctly — the assertion, not the action, was
     * wrong. So we check for the same prefix we searched on.
     */
    async selectCity(driver, controlName, cityName) {
        const control = await this.scrollToField(driver, controlName);
        await this.press(driver, control);
        await driver.pause(2000);

        // The search box is the only EditText in the overlay.
        const search = await driver.$('//android.widget.EditText');
        if (!(await search.isExisting())) {
            throw new Error(
                `The ${controlName} list opened without a search box. `
                + `This control may have changed.`
            );
        }

        await search.setValue(cityName);
        await driver.pause(2000);

        // "Surabaya, Jawa Timur" — match on "City," so we never catch a
        // different city whose name merely starts the same way.
        const chosenPrefix = `//*[starts-with(@content-desc,"${cityName},")]`;

        const option = await waitFor(driver, chosenPrefix);
        await this.press(driver, option);
        await driver.pause(1500);

        // Confirm the choice landed. The field shows "City, Province", so
        // verify on the same prefix rather than the bare city name.
        const applied = await driver.$(chosenPrefix);
        if (!(await applied.isDisplayed())) {
            throw new Error(
                `${controlName} was set to "${cityName}" but the field does `
                + `not show it.`
            );
        }
        return option;
    },

/** Switch to the "Fleet and SLA" step. */
    async goToFleetAndSla(driver) {
        // NOTE — this does NOT work, and that is an app behaviour, not a bug
        // in our code. Clicking the "Fleet and SLA" tab does not advance the
        // wizard. It re-runs validation on Basic Detail and leaves you there,
        // showing messages like "Customer is required".
        //
        // Verified on the device: after clicking the tab the form still shows
        // the Basic Detail fields, plus:
        //     "Customer is required"   "Order Date is required"
        //     "Route is required"       "Fleet Type is required"
        //
        // So the ONLY way into step 2 is to fill every required field on
        // step 1 and press Next. That means this method is only useful after
        // step 1 is complete — see advanceToFleetAndSla().
        const tab = await waitFor(
            driver,
            '//*[starts-with(@content-desc,"Fleet and SLA")]'
        );
        await tab.click();
        await driver.pause(2000);
        return tab;
    },

    /**
     * Advance from Basic Detail to Fleet and SLA by pressing Next.
     *
     * This is the only route into step 2 — clicking the tab does not work.
     * Pressing Next while required fields are empty is rejected, so this
     * throws a clear error rather than silently staying on step 1.
     *
     * @returns true when the form moved on to step 2
     */
    async advanceToFleetAndSla(driver) {
        // Real validation messages, read off the live app. These are what the
        // app actually says — the earlier guessed strings in
        // validationMessagesVisible() were never confirmed.
        const VALIDATION_MESSAGES = [
            'Customer is required',
            'Order Date is required',
            'Route is required',
            'Fleet Type is required',
        ];

        const next = await this.scrollToField(driver, 'Next');
        await next.click();
        await driver.pause(3000);

        const blocked = [];
        for (const message of VALIDATION_MESSAGES) {
            if (await isDisplayed(driver, `~${message}`)) {
                blocked.push(message);
            }
        }

        if (blocked.length > 0) {
            throw new Error(
                `Could not move to "Fleet and SLA". The form is still missing: `
                + blocked.join(', ')
            );
        }

        // Still on step 1?
        await this.scrollFormToTop(driver, 3);
        if (await isDisplayed(driver, '~Select Customer')) {
            throw new Error(
                'Next was pressed and no validation message appeared, but the '
                + 'form is still on Basic Detail. The step did not change.'
            );
        }
        return true;
    },

    /** Press Next. Returns the element so the caller can check the result. */
    async tapNext(driver) {
        // Same keyboard hazard as scrollToField — a keyboard can cover the
        // Next button at the bottom of the form.
        await this.dismissKeyboard(driver);

        const next = await waitFor(driver, '~Next');
        await next.click();
        await driver.pause(2500);
        return next;
    },

    /**
     * Press Cancel.
     *
     * Uses press(), not click(). Flutter's buttons need a held touch — a bare
     * click is frequently swallowed, which is why press() exists here at all.
     * Cancel was still using click() and so cleanup was silently failing:
     *
     *     cleanup: could-not-close
     *
     * on every run, leaving a half-filled form on a shared tablet. Same
     * override, same measured-bounds discipline, every other control in this
     * file.
     */
    async tapCancel(driver) {
        const cancel = await waitFor(driver, '~Cancel');
        await this.press(driver, cancel);
        await driver.pause(2000);
        return cancel;
    },

    // ---------------------------------------------------------
    // Shared-device cleanup
    // ---------------------------------------------------------
    //
    // WHY THIS EXISTS
    //   The tablet is shared with another project, so a test that dies
    //   half-way through the Create form leaves the app in a state another
    //   team will trip over. Agreed rules (tester, 5 Oct):
    //     - cancel/back out of a half-filled form
    //     - do NOT create extra data just to clean up
    //     - do NOT delete a created TO (no known safe mechanism yet)
    //
    //   So cleanup means exactly one thing: close the form. Nothing else.
    //
    //   NOTE: whether Cancel closes the form outright, or shows a
    //   confirmation dialog first, is NOT yet verified. leaveFormCleanly()
    //   handles both so we do not have to know in advance.

    /**
     * True when the Create Transport Order form is showing.
     *
     * "Cancel" only exists while a form is open, so it is the reliable
     * marker. We do not check for "Create Transport Order" because that
     * header is also present behind the form in some scroll positions.
     */
    async createFormOpen(driver) {
        try {
            const cancel = await driver.$('~Cancel');
            return await cancel.isExisting();
        } catch {
            return false;
        }
    },

    /**
     * Leave the app in a clean state: close the form if one is open.
     *
     * Safe to call in a `finally` block on a shared device. It is a no-op
     * when no form is open, and it deliberately does NOT touch any created
     * order.
     *
     * @returns 'closed' | 'already-closed' | 'could-not-close'
     */
    async leaveFormCleanly(driver) {
        if (!(await this.createFormOpen(driver))) {
            return 'already-closed';
        }

        log('INFO', 'Closing the Create form so the tablet is left tidy...');

        // A keyboard can cover the Cancel button, which made Cancel "press"
        // without reaching it — the form then stayed open and the tablet was
        // left in a messy state. Close the keyboard first.
        await this.dismissKeyboard(driver);

        try {
            await this.tapCancel(driver);
        } catch {
            return 'could-not-close';
        }

        // Cancel may open a confirmation dialog. Dismiss it if it appeared,
        // but never blind-press anything — we would rather report a stuck
        // form than tap an unknown control on a shared device.
        await driver.pause(1500);

        const confirmLabels = ['Yes', 'Confirm', 'OK', 'Discard'];
        for (const label of confirmLabels) {
            if (await isDisplayed(driver, `~${label}`, 1500)) {
                log('INFO', `Cancel asked for confirmation — pressing "${label}".`);
                const btn = await driver.$(`~${label}`);
                await btn.click().catch(() => {});
                await driver.pause(1500);
                break;
            }
        }

        if (await this.createFormOpen(driver)) {
            log(
                'INFO',
                'The form is still open after Cancel. Not pressing anything '
                + 'else — leaving it for manual cleanup.'
            );
            return 'could-not-close';
        }

        return 'closed';
    },

    /**
     * Check for required-field validation messages.
     *
     * These are the EXACT strings the app displays, captured from the live
     * form after pressing Next with an empty Step 1:
     *     "Customer is required"
     *     "Order Date is required"
     *     "Route is required"
     *     "Fleet Type is required"
     *
     * @returns an array of the messages currently shown (empty when valid)
     */
    async validationMessagesVisible(driver) {
        const messages = [
            'Customer is required',
            'Order Date is required',
            'Route is required',
            'Fleet Type is required',
        ];

        // Messages can sit below the fold, so scan from the top down.
        await this.scrollFormToTop(driver, 4);

        const found = [];
        for (const message of messages) {
            if (await isDisplayed(driver, `~${message}`)) {
                found.push(message);
            }
        }
        return found;
    },

    /**
     * True when we are still on the Basic Detail form,
     * false when the app moved on (which means validation passed).
     *
     * We scroll back to the TOP first: after tapping Next the form may be
     * scrolled down, and "Select Customer" is a top-of-form field that is
     * then absent from the UI tree entirely. Checking without scrolling
     * would wrongly report that we had left the step.
     */
    async stillOnBasicDetail(driver) {
        await this.scrollFormToTop(driver);
        return isDisplayed(driver, '~Select Customer');
    },

    // ---------------------------------------------------------
    // Scrolling inside the Create form
    // ---------------------------------------------------------
    //
    // WHY THIS EXISTS
    //   The Create Transport Order form is taller than the dialog. Only
    //   the top part is in the UI tree at any one time — everything below
    //   the fold is genuinely ABSENT, not just invisible.
    //
    //   Real layout, top to bottom (verified by scrolling the live app):
    //     Customer *          -> Select Customer
    //     Relocation
    //     Order Date *        -> Select Date        Priority
    //     Route *
    //       Origin City
    //       Destination City
    //     Transport Condition *  -> Frozen          (default value)
    //     Fleet Type *        -> Select Fleet
    //
    //   So a test that looks for "Origin City" without scrolling first
    //   will FAIL even on a perfectly healthy app. Always use
    //   scrollToField() instead of waitFor() for anything below the fold.

    // ---------------------------------------------------------
    // Soft keyboard
    // ---------------------------------------------------------
    //
    // WHY THIS EXISTS — measured on the tablet, 6 Oct 2026
    //   After typing into an autocomplete field the soft keyboard stays up
    //   (`dumpsys input_method` -> `mInputShown=true`). It covers the lower
    //   half of the form, so everything below it leaves the accessibility
    //   tree. That is exactly the "field does not exist / renamed" error
    //   scrollToField() reports:
    //
    //     ERROR: Form field "Select Date" was not found after scrolling
    //     ERROR: element ("~Next") still not displayed after 20000ms
    //     ERROR: Form field "Product Group" was not found
    //
    //   All three were ONE cause — the keyboard — not three missing fields.
    //   Any test that types must close the keyboard before looking for the
    //   next control.

    /** True when the soft keyboard is on screen. Never throws. */
    async keyboardShown(driver) {
        try {
            return await driver.isKeyboardShown();
        } catch {
            return false;
        }
    },

    /**
     * Close the soft keyboard if it is open.
     *
     * THE BACK-KEY HAZARD
     *   This app has no back handler — pressing BACK with no keyboard on
     *   screen EXITS the app and lands on the launcher. Verified on the
     *   device. So BACK is only ever sent when a keyboard is genuinely
     *   showing. Prefer 'mobile: hideKeyboard' and only fall back to BACK.
     *
     * @returns true if a keyboard was actually showing
     */
    async dismissKeyboard(driver) {
        if (!(await this.keyboardShown(driver))) return false;

        log('INFO', 'Closing the soft keyboard so the form below it is '
            + 'reachable again.');
        try {
            await driver.execute('mobile: hideKeyboard');
        } catch {
            try {
                await driver.back();
            } catch {
                // ignore — callers just proceed and report what they see
            }
        }
        await driver.pause(1000);
        return true;
    },

    /**
     * Drag the form's scroll area one step.
     *
     * @param towards 'below' to reveal lower content (finger moves up)
     *                'above' to reveal higher content (finger moves down)
     */
    async dragForm(driver, towards = 'below') {
        // A keyboard covering the form half makes scrolling useless, so close
        // it first. No-op when no keyboard is up.
        await this.dismissKeyboard(driver);

        const area = await this.formScrollArea(driver);
        if (!area) {
            // Nothing scrollable — just wait, so callers behave the same.
            await driver.pause(600);
            return false;
        }

        const cx = Math.round((area.x1 + area.x2) / 2);
        const inset = 30;
        const fromY = towards === 'below' ? area.y2 - inset : area.y1 + inset;
        const toY = towards === 'below' ? area.y1 + inset : area.y2 - inset;

        // A W3C touch drag, the same gesture as "adb shell input swipe".
        await driver.performActions([
            {
                type: 'pointer',
                id: 'finger1',
                parameters: { pointerType: 'touch' },
                actions: [
                    { type: 'pointerMove', duration: 0, x: cx, y: fromY },
                    { type: 'pointerDown', button: 0 },
                    { type: 'pause', duration: 150 },
                    { type: 'pointerMove', duration: 400, x: cx, y: toY },
                    { type: 'pointerUp', button: 0 },
                ],
            },
        ]);
        await driver.releaseActions();
        await driver.pause(900);
        return true;
    },

    /** Bounds of the form's ScrollView, or null if there isn't one. */
    async formScrollArea(driver) {
        try {
            const scrollView = await driver.$('//android.widget.ScrollView');
            const raw = await scrollView.getAttribute('bounds');
            if (!raw) return null;

            // Format: "[left,top][right,bottom]"
            const nums = raw.match(/-?\d+/g);
            if (!nums || nums.length < 4) return null;

            return {
                x1: Number(nums[0]),
                y1: Number(nums[1]),
                x2: Number(nums[2]),
                y2: Number(nums[3]),
            };
        } catch {
            return null;
        }
    },

    /**
     * Find a field, scrolling the form down until it appears.
     *
     * Use this for EVERY field in the Create form. waitFor() alone only
     * works for fields that happen to be in view at the current scroll
     * position.
     *
     * @returns the element
     * @throws  if the field is not found after maxDrags attempts
     */
    async scrollToField(driver, fieldName, maxDrags = 6) {
        const selector = `~${fieldName}`;

        // Check the top of the form BEFORE scrolling. If the keyboard is up it
        // hides everything below the midpoint, and scrolling blindly then
        // reports a perfectly good field as "not found".
        await this.dismissKeyboard(driver);

        for (let attempt = 0; attempt <= maxDrags; attempt += 1) {
            try {
                const el = await driver.$(selector);
                if (await el.isDisplayed()) {
                    return el;
                }
            } catch {
                // not on screen yet
            }

            if (attempt < maxDrags) {
                await this.dragForm(driver, 'below');
            }
        }

        throw new Error(
            `Form field "${fieldName}" was not found after scrolling `
            + `to the bottom of the form. It may have been renamed, or it `
            + `may not exist on this build.`
        );
    },

    /**
     * Scroll the form back to the top.
     * Used before checking "am I still on this step?", so the answer does
     * not depend on where the previous action left the scroll position.
     */
    async scrollFormToTop(driver, maxDrags = 6) {
        for (let attempt = 0; attempt < maxDrags; attempt += 1) {
            await this.dragForm(driver, 'above');
        }
    },

    /**
     * True when a control with this label exists on the current screen,
     * whether or not it is scrolled into view.
     *
     * Used by the probe scripts to decide whether a control is worth
     * opening, so we do not have to guess names.
     */
    async controlExists(driver, label) {
        try {
            const el = await driver.$(`//*[contains(@content-desc,"${label}")]`);
            return await el.isExisting();
        } catch {
            return false;
        }
    },

    /**
     * List every labelled control currently in the UI tree.
     * Useful when a selector breaks, to see what the app actually shows.
     */
    async visibleFormLabels(driver) {
        const labels = [];
        try {
            const nodes = await driver.$$('//*[@content-desc != ""]');
            const count = await nodes.length;
            for (let i = 0; i < count; i += 1) {
                try {
                    const desc = await nodes[i].getAttribute('content-desc');
                    if (desc) labels.push(desc.replace(/\n/g, ' | '));
                } catch {
                    // ignore
                }
            }
        } catch {
            // ignore
        }
        return labels;
    },

    // ---------------------------------------------------------
    // Sidebar navigation
    // ---------------------------------------------------------
    async openMenuItem(driver, itemName) {
        const item = await waitFor(driver, `~${itemName}`);
        await item.click();
        await driver.pause(2500);
        return item;
    },
};

module.exports = TransportOrderPage;
