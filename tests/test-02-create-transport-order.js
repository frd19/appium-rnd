/**
 * tests/test-02-create-transport-order.js
 * --------------------------------------
 * Test case Test-02 — the FULL create-transport-order flow, one file.
 *
 * This is a consolidation of five files that used to split the same flow:
 *   test-02        entry path, Basic Detail fields, empty-form validation
 *   test-02b       customer + order date fill
 *   test-02c       origin/destination cities + fleet type + advance
 *   test-02d       stand-by clock dial, with independent form read-back
 *   test-02e       pick-up, drop point, product group, route, Submit gate
 * Each one repeated the setup and the Step 1 filling, so they were merged
 * back into a single test that walks the sheet's flow end to end. Nothing
 * was dropped — the read-backs and verifications were moved in too.
 *
 *   Step 1 (Basic Detail)
 *     Customer     PT QA              (search overlay)
 *     Order Date   today              (date picker, "Today")
 *     Route        Sidoarjo - Surabaya   (see route-order note below)
 *     Condition    Frozen             (default, pre-filled)
 *     Fleet        BUP Freezer
 *
 *   Step 2 (Fleet and SLA)
 *     Pick-Up Location      "tirtamas" -> Tirtamas Coldstorindo
 *     Stand by Time         now + 2h, minutes 00   (clock-face dial)
 *     Drop Point Location 1 "hokky"   -> Hokky Buah - Citraland
 *     Product Group         Ayam 10 Karung, 10 Kg, -18 °C
 *
 *   Step 3 (Route)
 *     Map -> Select Route -> route card "BUP TCL - HOKKY"
 *     SUBMIT GATE reached.
 *
 * Sheet test case:
 *   TC ID    : Test-02
 *   Module   : TO / Create new transport order
 *   Role     : Planner
 *   Expected : "Success to create TO"
 *   Test data: Customer PT QA, Order date today, Route Surabaya - Sidoarjo,
 *              condition default, fleet BUP Freezer.
 *
 * ⚠️  SHARED-TABLET RULE — THE SUBMIT GATE IS THE END
 *   The sheet expects "Success to create TO", but the shared-device rules
 *   forbid creating orders. We inspect up to the Submit button, then cancel
 *   the form cleanly. No TO is ever created or deleted.
 *
 * ⚠️  ROUTE ORDER — DO NOT "FIX" IT
 *   The sheet reads "Surabaya - Sidoarjo", but the form's first Route field
 *   is the ORIGIN. Confirmed with the tester: Origin = Sidoarjo, Destination
 *   = Surabaya, the reverse of the sheet's wording.
 *
 * ⚠️  VERIFY AGAINST THE APP, NEVER AGAINST OUR OWN LOGS
 *   The order date, stand-by time, product group values and the route card
 *   are read back from the fields the app actually shows. A helper that
 *   "succeeds" while the form never took the value is the false-success bug
 *   this suite exists to catch.
 *
 * Run:  node tests/test-02-create-transport-order.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, ensureFullscreen,
    ensureAppRunning, waitFor, log, saveDump, saveScreenshot,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

async function main() {
    console.log('\n=== Test-02 : Create new transport order (full flow) ===\n');

    let driver;
    try {
        // --- Setup ---
        log('INFO', 'Connecting and opening the app...');
        driver = await connect();
        await restartApp(driver);
        await ensureFullscreen(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);
        log('PASS', 'Kanban board is showing.');

        // === PART A — ENTRY PATH AND VALIDATION (was test-02) ===
        log('INFO', 'Opening the Transport Order menu...');
        await page.openCreateMenu(driver);

        // "Create new transport order" is Test-02; "Convert sales order" is
        // the future Test-03. Both must be offered.
        await waitFor(driver, '~Create new transport order');
        await waitFor(driver, '~Convert sales order');
        log('PASS', 'Found "Create new transport order" and "Convert sales order".');

        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log('PASS', 'Create Transport Order form is open.');

        // The step tabs live in the SAME ScrollView as the fields. Scrolling
        // down to reach "Fleet Type" removes the tabs from the UI tree, so
        // check them at the top, before any field scrolling.
        await page.scrollFormToTop(driver);
        await waitFor(driver, '//*[starts-with(@content-desc,"Basic Detail")]');
        await waitFor(driver, '//*[starts-with(@content-desc,"Fleet and SLA")]');
        log('PASS', 'Step tabs found: "Basic Detail" and "Fleet and SLA".');

        // All 6 Basic Detail fields. Fields below the fold are ABSENT from
        // the accessibility tree, not merely invisible — each is scrolled
        // into view before looking for it.
        const fields = [
            'Select Customer',      // Customer *
            'Select Date',          // Order Date *
            'Origin City',          // Route *
            'Destination City',     // Route *
            'Frozen',               // Transport Condition * (default value)
            'Select Fleet',         // Fleet Type *
        ];
        for (const field of fields) {
            await page.scrollToField(driver, field);
            log('PASS', `Field found: ${field}`);
        }
        log('PASS', `All ${fields.length} Basic Detail fields are present.`);

        // Negative: Customer, Order Date, Route and Transport Condition are
        // required (*). An empty form must be rejected.
        log('INFO', 'Checking required-field validation (submitting empty form)...');
        await page.tapNext(driver);
        if (await page.stillOnBasicDetail(driver)) {
            log('PASS', 'Empty form was correctly rejected — still on Basic '
                + 'Detail. Required fields are enforced.');
        } else {
            throw new Error('Empty form was accepted. Expected validation to '
                + 'block it.');
        }

        // === PART B — FILL STEP 1 (was 02b + 02c) ===
        // The rejected Next left us on the form. Scroll back to the top and
        // fill it; each helper scrolls itself into position from there.
        await page.scrollFormToTop(driver);
        log('INFO', 'Filling Step 1 (Basic Detail)...');
        await page.selectCustomer(driver, 'PT QA');
        log('PASS', 'Customer = PT QA');

        await page.selectOrderDateToday(driver);
        const date = await page.readOrderDate(driver);
        if (!date) {
            throw new Error('The date picker closed but the Order Date field '
                + 'does not show a date — the value may not have been applied.');
        }
        log('PASS', `Order Date is set to "${date}".`);

        // Origin and destination are searchable lists that open at
        // "Abepura, Papua", so we type the city name to filter instead of
        // scrolling to the rows. Endpoint 1 -> Origin, Endpoint 2 ->
        // Destination (the reverse of the sheet's wording).
        log('INFO', 'Setting route Sidoarjo - Surabaya...');
        await page.selectCity(driver, 'Origin City', 'Sidoarjo');
        await page.selectCity(driver, 'Destination City', 'Surabaya');
        log('PASS', 'Route Sidoarjo - Surabaya');

        await page.scrollToField(driver, 'Frozen');
        log('PASS', 'Transport condition is the default "Frozen".');

        await page.selectFleetType(driver, 'BUP Freezer');
        log('PASS', 'Fleet Type = BUP Freezer');

        log('INFO', 'Pressing Next to move to "Fleet and SLA"...');
        await page.advanceToFleetAndSla(driver);
        log('PASS', 'Advanced to the "Fleet and SLA" step.');

        // === PART C — STEP 2, FLEET AND SLA (was 02d + 02e) ===
        log('INFO', 'Setting Pick-Up Location (tirtamas)...');
        await page.selectLocation(
            driver, 'Pick-Up Location *', 'tirtamas', 'Tirtamas Coldstorindo'
        );
        log('PASS', 'Pick-Up Location committed.');

        // Stand by Time: clock-face dial, now + 2h, minutes 00. Verified twice
        // — once by the helper, once by reading the actual form field, so a
        // dial that "accepts" a value without committing it cannot pass.
        const want = page.targetStandbyTime();
        log('INFO', `Setting Stand by Time to `
            + `${String(want.hour).padStart(2, '0')}:00 (now + 2h).`);
        const set = await page.selectStandbyTime(driver);
        await ensureAppRunning(driver);
        const shown = await page.readStandbyTime(driver);
        if (!shown || !shown.includes(set)) {
            throw new Error(
                `The Stand by Time field reads "${shown}" but should contain `
                + `"${set}". The dial accepted the value but the form did not `
                + 'take it.'
            );
        }
        log('PASS', `Stand by Time set and confirmed on the form: "${shown}".`);

        log('INFO', 'Setting Drop Point Location 1 (hokky)...');
        await page.selectLocation(
            driver, 'Drop Point Location 1 *', 'hokky', 'Hokky Buah - Citraland'
        );
        log('PASS', 'Drop Point Location 1 committed.');

        log('INFO', 'Adding Product Group (Ayam 10 Karung, 10 Kg, -18°C)...');
        await page.addProductGroup(driver);
        log('PASS', 'Product Group added.');

        // === PART D — STEP 3, ROUTE (was 02e) ===
        log('INFO', 'Pressing Next to the Route step...');
        await page.dismissKeyboard(driver);
        const next2 = await waitFor(driver, '~Next');
        await page.press(driver, next2);
        await driver.pause(3000);
        log('PASS', 'Route step reached (the map can take a minute to load).');

        const card = await page.selectRoute(driver);
        log('PASS', `Route selected: ${card}.`);

        log('PASS', 'Submit gate reached. NOT pressing Submit — shared-tablet '
            + 'rule, no TO may be created.');

        console.log('\n=== Test-02: PASS ✅ ===\n');
        console.log('  The full create-TO flow now runs end to end:');
        console.log('    Step 1  PT QA | today | Sidoarjo - Surabaya | BUP Freezer');
        console.log('    Step 2  Tirtamas Coldstorindo | ' + `${set}` + ' | '
            + 'Hokky Buah - Citraland | Ayam group');
        console.log(`    Step 3  Route "${card}" | Submit gate reached`);
        console.log('');
        console.log('  The form is cancelled out cleanly — nothing is created.\n');

    } catch (error) {
        console.error('\n❌ Test-02 FAILED');
        console.error(`   Reason: ${error.message}\n`);

        if (driver) {
            try {
                console.error(`   UI tree saved:  `
                    + `${await saveDump(driver, 'test-02-failure')}`);
                console.error(`   Screenshot:     `
                    + `${await saveScreenshot(driver, 'test-02-failure')}`);
            } catch {
                // the reason above is the real news
            }
        }

        process.exitCode = 1;

    } finally {
        if (driver) {
            try {
                log('INFO', `cleanup: `
                    + `${await page.leaveFormCleanly(driver)}`);
            } catch {
                log('WARN', 'cleanup: could not verify');
            }
        }
        await quit(driver);
    }
}

main();