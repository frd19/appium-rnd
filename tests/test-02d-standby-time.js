/**
 * tests/test-02d-standby-time.js
 * --------------------------------
 * Part 4 of Test-02. Fills Step 1, advances to Step 2, and sets the
 * Stand by Time to (current hour + 1) : 00 using the drag gesture.
 *
 * This is the first test to exercise setClockTime(), which was previously a
 * deliberate throw. It exists on its own so the clock can be proven in
 * isolation, before Drop Point and Product Group are layered on top — if this
 * fails, nothing else in Test-02 is worth debugging yet.
 *
 * Test data:
 *   Customer    PT QA
 *   Order date  today
 *   Route       Sidoarjo - Surabaya
 *   Fleet       BUP Freezer
 *   Stand by    now + 1h, minutes 00
 *
 * The manual sequence, unchanged:
 *   1. drag the HOUR to the target
 *   2. drag the MINUTE to 00
 *   3. OK
 *   4. Apply
 * Steps 3 and 4 are deliberate separate checkpoints, so the test can tell
 * which one dropped the value instead of just reporting a wrong final time.
 *
 * Run:  node tests/test-02d-standby-time.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, ensureFullscreen,
    ensureAppRunning, log, saveDump, saveScreenshot,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

async function main() {
    console.log('\n=== Test-02d : Create Transport Order — Stand by Time ===\n');

    let driver;
    try {
        log('INFO', 'Connecting and opening the app...');
        driver = await connect();
        await restartApp(driver);
        await ensureFullscreen(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log('PASS', 'Create Transport Order form is open.');

        // --- Step 1, all five required fields ---
        log('INFO', 'Filling Step 1 (Basic Detail)...');
        await page.selectCustomer(driver, 'PT QA');
        await page.selectOrderDateToday(driver);
        await page.selectCity(driver, 'Origin City', 'Sidoarjo');
        await page.selectCity(driver, 'Destination City', 'Surabaya');
        await page.selectFleetType(driver, 'BUP Freezer');
        log('PASS', 'Step 1 filled (PT QA, today, Sidoarjo - Surabaya,'
            + ' BUP Freezer).');

        await page.advanceToFleetAndSla(driver);
        log('PASS', 'Advanced to the "Fleet and SLA" step.');

        // --- Step 2: Stand by Time ---
        const want = page.targetStandbyTime();
        log('INFO', `Setting Stand by Time to `
            + `${String(want.hour).padStart(2, '0')}:00 `
            + `(current hour + 1, minutes always 00).`);

        const set = await page.selectStandbyTime(driver);
        log('PASS', `Stand by Time set to ${set}.`);

        // --- Independent read-back -------------------------------------
        // selectStandbyTime() already checks this, so it must be true twice.
        // A field that reads correctly by accident is exactly the failure this
        // whole test exists to rule out.
        await ensureAppRunning(driver);
        const shown = await page.readStandbyTime(driver);
        if (!shown || !shown.includes(set)) {
            throw new Error(
                `The Stand by Time field reads "${shown}" but should contain `
                + `"${set}". The dial accepted the value but the form did not `
                + 'take it.'
            );
        }
        log('PASS', `Form field independently confirms "${shown}".`);

        console.log('\n=== Test-02d: PASS ✅ ===\n');
        console.log('  Stand by Time is set and verified against the form field:');
        console.log(`    wanted  ${set}`);
        console.log(`    form    ${shown}`);
        console.log('');
        console.log('  The dial is now driven by dragging its hand:');
        console.log('    hour   30° per hour, from 0° = 12 o\'clock');
        console.log('    minute 30° per 5-minute step');
        console.log('');
        console.log('  Still not automated on Step 2:');
        console.log('    - Pick-Up Location / Drop Point Location 1');
        console.log('    - Product Group (Ayam, 10 Karung, 10 kg, -18)');
        console.log('    - the final submit and its success signal\n');

    } catch (error) {
        console.error('\n❌ Test-02d FAILED');
        console.error(`   Reason: ${error.message}\n`);

        if (driver) {
            try {
                console.error(`   UI tree saved:  `
                    + `${await saveDump(driver, 'test-02d-failure')}`);
                console.error(`   Screenshot:     `
                    + `${await saveScreenshot(driver, 'test-02d-failure')}`);
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
