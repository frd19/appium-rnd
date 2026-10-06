/**
 * probe-step2c.js
 * ---------------
 * THROWAWAY — not part of the test suite.
 *
 * One device session, one Step-1 setup, then EVERY remaining unknown for the
 * sheet's steps 5, 6 and the final submit. Doing it in a single run matters
 * because filling Step 1 takes minutes and the tablet is shared.
 *
 * Confirmed by the tester (5 Oct, refined 6 Oct) before this run:
 *
 *   5A  Pick-Up / Drop Point -> a SEARCHABLE location field, three steps:
 *         1. type the query
 *         2. matching locations appear BELOW — click the wanted one
 *         3. press "Select Location" to CONFIRM it
 *      Step 3 is easy to miss: picking from the list only fills the field.
 *      pick up:   query "tirtamas"  -> "Tirtamas Coldstorindo"
 *      drop point: query "Hokky buah" -> "Hokky Buah - Citraland"
*
*      Both lists contain decoys, so match the full name:
*        Hokky Buah - Citraland            <- want
*        Hokky Buah Darmo Harapan
*        Hokky Buah Graha Family
*        Hokky buah Panglima Sudirman
*      Note the app capitalises as "Hokky Buah - Citraland" with a spaced
*      hyphen, NOT "Hokky buah citraland". Matching is case-insensitive but
*      the hyphen is a real character, so a missing one matches nothing.
 *
 *      Both suggestions are rendered as NAME\nADDRESS, the same convention as
 *      the customer dropdown. MEASURED — searching "tirtamas" returns FOUR
 *      results, and one of them is a decoy at a different site:
 *
 *        PT TIRTAMAS BANGUN KARYA  CitraLand CBD, Mulung, GREKIK
 *        Tirtamas Coldstorindo     Bakalan, Wringinpitu, SIDOARJO   <- want
 *        Tirtamas Gemilang Waterpark  Pantura Cirebon, Kebonturi
 *        PT Tirtamas Lestari       Lidah Kulon, Surabaya
 *
 *      So never match on "tirtamas" alone. Also note the app renders
 *      "Tirtamas Coldstorindo" WITHOUT the "Logistic" suffix.
 *
 *      Stand by Time -> NOT a bare clock face. MEASURED structure:
 *        "October 2026\nOct 6, 2026\nMo..Su"   header
 *        "Today"           [1097,325][1199,382]
 *        "09:21"           [722,397][1199,454]  clickable="true"
 *        day grid          7 columns x 6 rows
 *        "Cancel"/"Apply"  [722,980] / [969,980]
 *      So it is TWO stages: choose the day on the calendar, then press the
 *      HH:mm field to open a second dialog for the time. Minutes are always
 *      00 for this test.
 *   5B  Product Group fields
 *         Product      free text           "Ayam"
 *         Quantity     free text, numbers  "10"  + unit dropdown "Karung"
 *         Weight       free text, numbers  "10"  + unit dropdown "kg"
 *         Temperature  free text, numbers  "-18"
 *
 *   6   Route page has Toll / Non Toll. The tester HAS configured
 *       Sidoarjo -> Surabaya, so Recommendation Route should appear.
 *       Preserve the spelling "RECOMENDATION" if that is what the app shows.
 *
 * Still UNKNOWN, and this probe is how we find out — do not guess these:
 *   - The exact captions of the Product Group fields and their unit dropdowns
 *   - Whether the clock's hands are pressable nodes or drawn graphics needing
 *     computed coordinates (the answer decides the implementation)
 *   - The name of the clock's apply button — NOT assumed to be "Confirm"
 *   - What happens after the last Next, and how success is confirmed
 *   - Whether the board has a customer filter/search to identify our TO
 *
 * Run:  node tests/probe-step2c.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, ensureAppRunning,
    ensureFullscreen, saveDump, log,
} = require('../helpers/device');
const page = require('../pages/transportOrder');
const fs = require('fs');
const path = require('path');

const DUMP_DIR = path.join(__dirname, '..', 'dumps');

/** Print every labelled node with class and bounds. */
async function dumpLabels(driver, title) {
    console.log(`\n--- ${title} ---`);
    const nodes = await driver.$$('//*[@content-desc != ""]');
    const count = await nodes.length;
    for (let i = 0; i < count; i += 1) {
        const desc = await nodes[i].getAttribute('content-desc');
        if (!desc) continue;
        const cls = (await nodes[i].getAttribute('class')) || '';
        const shown = await nodes[i].isDisplayed().catch(() => false);
        const bounds = (await nodes[i].getAttribute('bounds')) || '';
        console.log(
            `  ${shown ? ' ' : 'x'}`
            + ` [${cls.replace('android.widget.', '').replace('android.view.', 'v.')}]`
            + ` ${bounds.padEnd(22)} ${JSON.stringify(desc)}`
        );
    }
    console.log(`  (${count} labelled nodes)`);

    // Free-text fields are the new territory on this step — the rest of the
    // wizard so far has had none, which is what let us treat "any EditText on
    // screen" as an overlay search box. That shortcut is NO LONGER SAFE.
    const edits = await driver.$$('//android.widget.EditText');
    const n = await edits.length;
    console.log(`  EDITTEXT FIELDS (${n}):`);
    for (let i = 0; i < n; i += 1) {
        // WDIO 8 removed getAttributes() — it throws
        // "edits[i].getAttributes is not a function". Attributes are fetched
        // one at a time instead.
        const bounds = await edits[i].getAttribute('bounds');
        const text = await edits[i].getAttribute('text');
        const hint = await edits[i].getAttribute('hint');
        const desc = await edits[i].getAttribute('content-desc');
        console.log(
            `    [${i}] bounds=${bounds}`
            + ` text=${JSON.stringify(text)}`
            + ` hint=${JSON.stringify(hint)}`
            + ` desc=${JSON.stringify(desc)}`
        );
    }
}

/** Save the raw XML — shows nodes that carry no content-desc at all. */
async function dumpSource(driver, name) {
    const xml = await driver.getPageSource();
    if (!fs.existsSync(DUMP_DIR)) fs.mkdirSync(DUMP_DIR, { recursive: true });
    const file = path.join(DUMP_DIR, `${name}.xml`);
    fs.writeFileSync(file, xml, 'utf8');
    console.log(`  full XML -> ${file} (${xml.length} bytes)`);
    return xml;
}

/**
 * The target standby time.
 *
 * Minutes are always 00 (tester decision), so only the hour is worth setting.
 * Computed at runtime — never hardcode the date or the hour.
 */
function targetStandby() {
    const now = new Date();
    const hour = (now.getHours() + 1) % 24;
    const pad = (n) => String(n).padStart(2, '0');
    return { hour, minute: 0, text: `${pad(hour)}:00` };
}

/**
 * The searchable-location flow, as confirmed by the tester (6 Oct).
 *
 * Three distinct steps — NOT one:
 *   1. type the query into the field
 *   2. matching locations appear BELOW it — click the one you want
 *   3. click the "Select Location" button to CONFIRM the choice
 *
 * Step 3 is the part that is easy to miss. Choosing from the suggestion list
 * only fills the field; nothing is committed to the form until "Select
 * Location" is pressed.
 *
 * This function stops after step 1+2 and reports what appeared, because the
 * exact result-node shape is still being confirmed. Confirmation (step 3) is
 * proven separately by confirmLocation() below so a guess about the button
 * cannot be mistaken for a working suggestion list.
 */
async function autocomplete(driver, caption, query, expectedMatch) {
    console.log(`\n  [location search] caption="${caption}" `
        + `query="${query}" expect="${expectedMatch}"`);

    // The implementation lives in the page object (selectLocation) so the
    // real test uses the exact same code path that is proven here.
    await page.selectLocation(driver, caption, query, expectedMatch);

    console.log(`  ✅ "${caption}" fully set and confirmed.`);
    await dumpLabels(driver, `after confirming "${caption}"`);
    return { picked: true, confirmed: true };
}

/**
 * Recover the form when a phase fails.
 *
 * WHY THIS EXISTS — the 6 Oct run
 *   The autocomplete helper threw a coding error mid-interaction, leaving a
 *   focused text field and a keyboard on screen. Every later phase then
 *   failed in its own way ("Select Date not found", "Product Group not
 *   found", "~Next not displayed") — three misleading errors for one cause.
 *
 *   So each phase closes the keyboard before it starts, and this reports what
 *   is actually on screen instead of letting the failures cascade.
 */
async function resetBeforePhase(driver, name) {
    await page.dismissKeyboard(driver);
    if (!(await page.createFormOpen(driver))) {
        console.log(`  NOTE: the Create form is not open before "${name}". `
            + 'The app may have navigated away — stopping here.');
        return false;
    }
    return true;
}

async function main() {
    console.log('\n=== Full walkthrough probe: steps 5, 6 and final submit ===\n');
    const standby = targetStandby();
    console.log(`  target standby time: ${standby.text}`
        + `  (current hour + 1, minutes 00)\n`);

    let driver;
    try {
        driver = await connect();
        await restartApp(driver);

        // MANDATORY on this tablet: it runs in Android freeform mode, so the
        // app opens in a small floating window. Dialogs taller than that get
        // clipped, and clipped controls vanish from the accessibility tree —
        // which looks exactly like a Flutter semantics bug. Two runs were lost
        // chasing that before this was spotted. Always do this first.
        await ensureFullscreen(driver);

        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        // ---------------------------------------------------------------
        // Step 1, then the walkthrough.
        //
        // NOTE: an earlier version of this probe ran a Cancel-behaviour test
        // FIRST, then reopened the form. That double open/close is what put
        // the app in a bad state, and it wasted the run. The Cancel question
        // is now answered — Cancel closes the form outright, no confirmation
        // dialog — so that phase has been removed. Verify with:
        //     page.leaveFormCleanly()  -> "closed"
        // ---------------------------------------------------------------
        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);

        console.log('\n  completing Step 1...');
        await page.selectCustomer(driver, 'PT QA');
        await page.selectOrderDateToday(driver);
        await page.selectCity(driver, 'Origin City', 'Sidoarjo');
        await page.selectCity(driver, 'Destination City', 'Surabaya');
        await page.selectFleetType(driver, 'BUP Freezer');
        await page.advanceToFleetAndSla(driver);
        console.log('  ✅ on "Fleet and SLA".');

        // ---------------------------------------------------------------
        // 1. Pick-Up Location — autocomplete
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  1. PICK-UP LOCATION (autocomplete)\n${'='.repeat(64)}`);
        try {
            await ensureAppRunning(driver);
            if (!(await resetBeforePhase(driver, 'pick-up location'))) return;
            await page.scrollFormToTop(driver);
            await autocomplete(
                driver, 'Pick-Up Location *', 'tirtamas',
                'Tirtamas Coldstorindo'
            );
            await dumpSource(driver, 'pickup-location');
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        // ---------------------------------------------------------------
        // 2. Stand by Time — a DATE-TIME picker, not a bare clock.
        //
        // MEASURED (6 Oct): stage 1 is a calendar with a clickable "HH:mm"
        // field under the header. So the interaction is:
        //     press field -> stage 1 (calendar) -> press "HH:mm" -> stage 2
        // This phase captures stage 1, then presses "HH:mm" and captures
        // stage 2, which is the still-unknown part: whether the clock is a
        // graphic face or real nodes, and what its confirm button is called.
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  2. STAND BY TIME (date-time picker)\n${'='.repeat(64)}`);
        try {
            if (!(await resetBeforePhase(driver, 'stand by time'))) return;
            await page.scrollFormToTop(driver);

            // The two-stage structure is now measured, so this runs the real
            // implementation instead of probing blind. The probe's remaining
            // job here is only to capture whatever it leaves behind.
            const set = await page.selectStandbyTime(driver);
            console.log(`  ✅ Stand by Time set to ${set}.`);
            await dumpLabels(driver, 'after Stand by Time');
            await dumpSource(driver, 'standby-done');
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
            await dumpLabels(driver, 'stand-by-time FAILURE state');
            await dumpSource(driver, 'standby-failure');
        }

            // ---------------------------------------------------------------
        // 3. Drop Point — autocomplete
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  3. DROP POINT (autocomplete)\n${'='.repeat(64)}`);
        try {
            if (!(await resetBeforePhase(driver, 'drop point'))) return;
            await page.scrollFormToTop(driver);
            await autocomplete(
                driver, 'Drop Point Location 1 *', 'Hokky buah',
                'Hokky Buah - Citraland'
            );
            await dumpSource(driver, 'droppoint-location');
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        // ---------------------------------------------------------------
        // 4. Next from Route & SLA
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  4. NEXT from "Route & SLA"\n${'='.repeat(64)}`);
        try {
            if (!(await resetBeforePhase(driver, 'next from Route & SLA'))) return;
            // Does Next actually exist? Saying so is more useful than a 20s
            // timeout that looks like an app failure.
            console.log(`  Next present: ${await page.controlExists(driver, 'Next')}`);
            await page.tapNext(driver);
            await dumpLabels(driver, 'after Next on Route & SLA');
            await page.scrollFormToTop(driver);
            await dumpLabels(driver, 'after Next, scrolled to top');
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        // ---------------------------------------------------------------
        // 5. Product Group sub-tab — captions + unit dropdowns unknown
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  5. PRODUCT GROUP TAB\n${'='.repeat(64)}`);
        try {
            if (!(await resetBeforePhase(driver, 'product group'))) return;
            await page.scrollFormToTop(driver);
            const tab = await page.scrollToField(driver, 'Product Group');
            await page.press(driver, tab);
            await driver.pause(2500);
            await dumpLabels(driver, 'Product Group (top)');
            await page.dragForm(driver, 'below');
            await dumpLabels(driver, 'Product Group (scrolled)');
            await dumpSource(driver, 'product-group');
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        // ---------------------------------------------------------------
        // 6. Where are we now? Route page / final submit
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  6. NEXT AGAIN -> route page?\n${'='.repeat(64)}`);
        try {
            await page.dismissKeyboard(driver);
            console.log(`  Next present: ${await page.controlExists(driver, 'Next')}`);
            await page.tapNext(driver);
            await driver.pause(3000);
            await dumpLabels(driver, 'after Next from Product Group');
            await dumpSource(driver, 'after-next-product-group');

            // The tester expects RECOMENDATION here, spelled exactly that way.
            const rec = await page.controlExists(driver, 'RECOMENDATION');
            const recAlt = await page.controlExists(driver, 'RECOMMENDATION');
            console.log(`\n  "RECOMENDATION" present: ${rec}`);
            console.log(`  "RECOMMENDATION" present: ${recAlt}`);
            console.log('  Toll / Non Toll:');
            console.log(`    Toll     ${await page.controlExists(driver, 'Toll')}`);
            console.log(`    Non Toll ${await page.controlExists(driver, 'Non Toll')}`);
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        // ---------------------------------------------------------------
        // 7. Board: is there a filter/search to find our TO?
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  7. BOARD — customer filter / search\n${'='.repeat(64)}`);
        try {
            const cleanedNow = await page.leaveFormCleanly(driver);
            console.log(`  left the form: "${cleanedNow}"`);
            await page.waitForBoard(driver);
            await dumpLabels(driver, 'board top');
            console.log('\n  Existing TO cards:');
            for (const card of await page.listTransportOrderCards(driver)) {
                console.log(`    ${card}`);
            }
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        console.log('\n=== probe finished ===\n');

    } catch (error) {
        console.error(`\n❌ probe failed: ${error.message}`);
        if (driver) {
            console.error(`   tree: ${await saveDump(driver, 'probe-step2c')}`);
        }
        process.exitCode = 1;
    } finally {
        // Shared device: never leave a half-filled form behind.
        if (driver) {
            try {
                console.log(`  cleanup: ${await page.leaveFormCleanly(driver)}`);
            } catch {
                console.log('  cleanup: could not verify (session may be gone)');
            }
        }
        await quit(driver);
    }
}

main();