/**
 * tests/test-02b-create-to-fill-form.js
 * ------------------------------------
 * Part 2 of Test-02. Test-02 itself only proves the form OPENS and blocks
 * an empty submit. Its stated expectation in the sheet is "Success to
 * create TO" — so this file does the actual filling.
 *
 * Test data (from "TO Small scope - Appium" FUNCTIONAL sheet):
 *   Customer            : PT QA
 *   Order date          : today
 *   Transport condition : default  (the form pre-fills "Frozen")
 *   Fleet type          : BUP Freezer
 *
 * WHAT IS COVERED TODAY
 *   Step 1 (Basic Detail) — customer and order date.
 *   Those two are verified working. Origin City, Destination City,
 *   Fleet Type and the whole "Fleet and SLA" step are NOT yet automated:
 *   their dropdowns have not been walked. See the notes at the bottom.
 *
 * Run:  node tests/test-02b-create-to-fill-form.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, log, saveDump, saveScreenshot,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

async function main() {
    console.log('\n=== Test-02b : Create Transport Order — fill the form ===\n');

    let driver;
    try {
        log('INFO', 'Connecting and opening the app...');
        driver = await connect();
        await restartApp(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);
        log('PASS', 'Kanban board is showing.');

        // --- Open the form ---
        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log('PASS', 'Create Transport Order form is open.');

        // --- Customer ---
        log('INFO', 'Selecting customer "PT QA"...');
        await page.selectCustomer(driver, 'PT QA');
        log('PASS', 'Customer field now shows "PT QA".');

        // --- Order date ---
        log('INFO', 'Setting the order date to today...');
        await page.selectOrderDateToday(driver);
        const date = await page.readOrderDate(driver);
        if (!date) {
            throw new Error(
                'The date picker closed, but the Order Date field does not '
                + 'show a date. The value may not have been applied.'
            );
        }
        log('PASS', `Order Date is set to "${date}".`);

        // --- Transport condition is pre-filled ---
        // The sheet says the transport condition stays at its default.
        // The form pre-fills this, so we only confirm it is present.
        log('INFO', 'Checking the default transport condition...');
        await page.scrollToField(driver, 'Frozen');
        log('PASS', 'Transport condition is the default "Frozen".');

        console.log('\n=== Test-02b: PASS ✅ ===\n');
        console.log('  Filled: Customer (PT QA), Order Date (today),');
        console.log('          Transport Condition (default Frozen).');
        console.log('');
        console.log('  NOT yet automated:');
        console.log('    - Origin City / Destination City (Route section)');
        console.log('    - Fleet Type (dropdown not walked)');
        console.log('    - Step 2: "Fleet and SLA"');
        console.log('    - Pressing Next and confirming the order is created\n');

    } catch (error) {
        console.error('\n❌ Test-02b FAILED');
        console.error(`   Reason: ${error.message}\n`);

        if (driver) {
            console.error(`   UI tree saved:  ${await saveDump(driver, 'test-02b-failure')}`);
            console.error(`   Screenshot:     ${await saveScreenshot(driver, 'test-02b-failure')}`);
        }

        process.exitCode = 1;

    } finally {
        await quit(driver);
    }
}

main();