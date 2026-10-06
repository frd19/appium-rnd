/**
 * tests/test-02c-create-to-route-fleet.js
 * ---------------------------------------
 * Part 3 of Test-02. Completes Step 1 (Basic Detail) from the test case
 * sheet, then attempts to move on to Step 2 (Fleet and SLA).
 *
 * Test data from "TO Small scope - Appium" FUNCTIONAL sheet:
 *   Customer            : PT QA
 *   Order date          : today
 *   Route               : Sidoarjo - Surabaya
 *   Transport condition : default
 *   Fleet type          : BUP Freezer
 *
 * NOTE on the route order: the sheet reads "Surabaya - Sidoarjo", but the
 * route column actually takes Endpoint 1 in the first field and Endpoint 2
 * in the second. Confirmed with the tester: Origin City = Sidoarjo,
 * Destination City = Surabaya. So the values are entered in that order,
 * which is the reverse of the sheet's wording.
 *
 * Test-02b covers the first three. This file adds Route and Fleet Type,
 * which are the last two required fields on Step 1.
 *
 * Run:  node tests/test-02c-create-to-route-fleet.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, log, saveDump, saveScreenshot,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

async function main() {
    console.log('\n=== Test-02c : Create Transport Order — Route and Fleet Type ===\n');

    let driver;
    try {
        log('INFO', 'Connecting and opening the app...');
        driver = await connect();
        await restartApp(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log('PASS', 'Create Transport Order form is open.');

        // --- Customer ---
        await page.selectCustomer(driver, 'PT QA');
        log('PASS', 'Customer = PT QA');

        // --- Order date ---
        await page.selectOrderDateToday(driver);
        log('PASS', `Order Date = ${await page.readOrderDate(driver)}`);

        // --- Route: origin and destination ---
        // These are SEARCHABLE lists that open at "Abepura, Papua", so we
        // type the city name to filter instead of scrolling to the S's.
        //
        // Order matters: Endpoint 1 goes in Origin City, Endpoint 2 in
        // Destination City. That is the reverse of the sheet's wording.
        log('INFO', 'Setting route Sidoarjo - Surabaya...');
        await page.selectCity(driver, 'Origin City', 'Sidoarjo');
        log('PASS', 'Origin City = Sidoarjo');

        await page.selectCity(driver, 'Destination City', 'Surabaya');
        log('PASS', 'Destination City = Surabaya');

        // --- Fleet type ---
        log('INFO', 'Selecting fleet type BUP Freezer...');
        await page.selectFleetType(driver, 'BUP Freezer');
        log('PASS', 'Fleet Type = BUP Freezer');

        // --- Step 1 is now complete: try to advance ---
        log('INFO', 'Pressing Next to move to "Fleet and SLA"...');
        await page.advanceToFleetAndSla(driver);
        log('PASS', 'Advanced to the "Fleet and SLA" step.');

        console.log('\n=== Test-02c: PASS ✅ ===\n');
        console.log('  Step 1 (Basic Detail) is fully filled:');
        console.log('    Customer            PT QA');
        console.log('    Order Date          today');
        console.log('    Route               Sidoarjo - Surabaya');
        console.log('    Transport Condition Frozen (default)');
        console.log('    Fleet Type          BUP Freezer');
        console.log('');
        console.log('  Reached Step 2 (Fleet and SLA), which holds:');
        console.log('    A. Route and SLA — pick up, standby time, drop point');
        console.log('    B. Product Group  — add Ayam, 10 Karung, 10 kg, -18');
        console.log('');
        console.log('  Those two are NOT automated yet.\n');

    } catch (error) {
        console.error('\n❌ Test-02c FAILED');
        console.error(`   Reason: ${error.message}\n`);

        if (driver) {
            console.error(`   UI tree saved:  ${await saveDump(driver, 'test-02c-failure')}`);
            console.error(`   Screenshot:     ${await saveScreenshot(driver, 'test-02c-failure')}`);
        }

        process.exitCode = 1;

    } finally {
        await quit(driver);
    }
}

main();