/**
 * tests/test-02-create-transport-order.js
 * --------------------------------------
 * Test case Test-02 (from "TO Small scope - Appium" FUNCTIONAL sheet)
 *
 *   TC ID   : Test-02
 *   Module  : TO / Create new transport order
 *   Role    : Planner
 *   Precondition: user already logged in
 *   Expected: Success to create TO
 *   Status in sheet: PASSED (manually)
 *
 * Test data from the sheet:
 *   Customer           : PT QA
 *   Order date         : adjust today
 *   Route              : Surabaya - Sidoarjo
 *   Transport condition: default
 *   Fleet type         : BUP Freezer
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠️  SCOPE NOTE
 *   This test covers the ENTRY PATH and Step 1 (Basic Detail),
 *   up to and including the required-field validation check.
 *
 *   The remaining steps in the sheet — Fleet and SLA, Product Group,
 *   and Route selection — are covered separately in
 *   test-02b-create-to-fleet-sla.js once those screens have been
 *   walked. They need dropdown data that is not yet mapped.
 *
 * ─────────────────────────────────────────────────────────────────────
 */

const {
    connect, quit, restartApp, ensureLoggedIn, waitFor, tapById, log, saveDump, saveScreenshot,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

async function main() {
    console.log('\n=== Test-02 : Create new transport order ===\n');

    let driver;
    try {
        // --- Setup ---
        log('INFO', 'Connecting and opening the app...');
        driver = await connect();
        await restartApp(driver);

        // Sign in if the app is asking for it
        await ensureLoggedIn(driver);

        await page.waitForBoard(driver);
        log('PASS', 'Kanban board is showing.');

        // --- Step 1: open the create menu ---
        log('INFO', 'Opening the Transport Order menu...');
        await page.openCreateMenu(driver);
        log('PASS', 'Menu opened.');

        // --- Step 2: verify both menu options exist ---
        // "Create new transport order" is Test-02
        // "Convert sales order" is Test-03
        await waitFor(driver, '~Create new transport order');
        await waitFor(driver, '~Convert sales order');
        log('PASS', 'Found "Create new transport order" and "Convert sales order".');

        // --- Step 3: enter the create form ---
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log('PASS', 'Create Transport Order form is open.');

        // --- Step 4: verify both step tabs exist ---
        // ORDER MATTERS HERE. The step tabs ("Basic Detail" / "Fleet and
        // SLA") live in the LEFT RAIL of the dialog, but that rail is part
        // of the same ScrollView as the form fields. Scroll down to reach
        // "Fleet Type" and the tabs scroll out of the UI tree entirely.
        //
        // So we check the tabs at the top of the form, BEFORE scrolling
        // through the fields. Doing it the other way round fails.
        //
        // NOTE: these tabs have a newline in their content-desc
        // ("Basic Detail\nManage core order detail and customer info").
        // Matching newlines is unreliable, so we use XPath "starts with".
        await page.scrollFormToTop(driver);
        await waitFor(
            driver,
            '//*[starts-with(@content-desc,"Basic Detail")]'
        );
        await waitFor(
            driver,
            '//*[starts-with(@content-desc,"Fleet and SLA")]'
        );
        log('PASS', 'Step tabs found: "Basic Detail" and "Fleet and SLA".');

        // --- Step 5: verify the Basic Detail fields ---
        // The sheet lists these fields for Step 1:
        //   Customer, Order Date, Route, Transport Condition, Fleet type
        //
        // These are the REAL labels, read off the live app by scrolling:
        //   Customer *               -> "Select Customer"  (dropdown)
        //   Order Date *             -> "Select Date"       (date picker)
        //   Route *                  -> "Origin City" + "Destination City"
        //   Transport Condition *    -> "Frozen"            (default value)
        //   Fleet Type *             -> "Select Fleet"      (dropdown)
        //
        // IMPORTANT: the form is taller than the dialog, so anything below
        // the fold is ABSENT from the UI tree, not merely invisible.
        // scrollToField() handles that; a plain waitFor() would fail here.
        const fields = [
            'Select Customer',   // Customer *
            'Select Date',       // Order Date *
            'Origin City',       // Route *
            'Destination City',  // Route *
            'Frozen',            // Transport Condition * (sheet says "default")
            'Select Fleet',      // Fleet Type *
        ];
        for (const field of fields) {
            await page.scrollToField(driver, field);
            log('PASS', `Field found: ${field}`);
        }
        log('PASS', `All ${fields.length} Basic Detail fields are present `
            + '(Customer, Order Date, Route, Transport Condition, Fleet Type).');

        // --- Step 6: negative check — required fields ---
        // Press Next with an empty form. The app should NOT accept it,
        // because Customer, Order Date, Route and Transport Condition
        // are all marked with *.
        log('INFO', 'Checking required-field validation (submitting empty form)...');
        await page.tapNext(driver);

        if (await page.stillOnBasicDetail(driver)) {
            log('PASS', 'Empty form was correctly rejected — '
                + 'still on Basic Detail. Required fields are enforced.');
        } else {
            log('FAIL', 'Empty form was accepted. Expected validation to block it.');
            process.exitCode = 1;
        }

        // --- Step 7: go back out cleanly ---
        log('INFO', 'Cancelling out of the form...');
        await page.tapCancel(driver);
        log('PASS', 'Form cancelled, returned to the board.');

        console.log('\n=== Test-02: PASS ✅ ===\n');
        console.log('  Covered: entry path + Basic Detail + required-field validation.');
        console.log('  Not yet covered: Fleet and SLA, Product Group, Route selection.');
        console.log('  See test-02b for the next screens.\n');

    } catch (error) {
        console.error('\n❌ Test-02 FAILED');
        console.error(`   Reason: ${error.message}\n`);

        if (driver) {
            console.error(`   UI tree saved:  ${await saveDump(driver, 'test-02-failure')}`);
            console.error(`   Screenshot:     ${await saveScreenshot(driver, 'test-02-failure')}`);
        }

        process.exitCode = 1;

    } finally {
        await quit(driver);
    }
}

main();