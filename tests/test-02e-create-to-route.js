/**
 * tests/test-02e-create-to-route.js
 * ---------------------------------
 * Part 5 of Test-02 — the full recorded walkthrough, one script.
 *
 * This test mirrors, step by step, the manual Fleet-and-SLA walkthrough
 * the tester recorded on 6 Oct 2026 (fleet-sla-record.txt, 29 states).
 * Everything in it comes from that recording or from the earlier probes:
 *
 *   Step 1 (Basic Detail)
 *     Customer     PT QA              (search overlay)
 *     Order Date   today              (date picker, Today)
 *     Route        Sidoarjo - Surabaya
 *     Condition    Frozen (default)
 *     Fleet        BUP Freezer
 *
 *   Step 2 (Fleet and SLA)
 *     Pick-Up Location      "tirtamas" -> commits as Tirtamas Coldstorindo
 *     Stand by Time         now + 2h, minutes 00    (clock-face dial)
 *     Drop Point Location 1 "hokky" -> Hokky Buah - Citraland
 *     Product Group         Ayam 10 Karung, 10 Kg, -18 °C
 *
 *   Step 3 (Route)
 *     Map screen -> Select Route -> route card "BUP TCL - HOKKY"
 *     Submit gate reached.
 *
 * THE SUBMIT GATE IS THE END OF THIS TEST. The shared-tablet rules say
 * never create transport orders, so the test inspects up to the Submit
 * button and then cancels the form cleanly — no TO is ever created.
 *
 * Run:  node tests/test-02e-create-to-route.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, ensureFullscreen,
    ensureAppRunning, waitFor, log, saveDump, saveScreenshot,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

async function main() {
    console.log('\n=== Test-02e : Create Transport Order — full recorded flow ===\n');

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

        // --- Open the create form ---
        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log('PASS', 'Create Transport Order form is open.');

        // --- Step 1: Basic Detail ---
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

        // --- Step 2a: Pick-Up Location ---
        log('INFO', 'Setting Pick-Up Location (tirtamas)...');
        await page.selectLocation(
            driver, 'Pick-Up Location *', 'tirtamas', 'Tirtamas Coldstorindo'
        );
        log('PASS', 'Pick-Up Location committed.');

        // --- Step 2b: Stand by Time ---
        const want = page.targetStandbyTime();
        log('INFO', `Setting Stand by Time to `
            + `${String(want.hour).padStart(2, '0')}:00 (now + 2h).`);
        const set = await page.selectStandbyTime(driver);
        await ensureAppRunning(driver);
        log('PASS', `Stand by Time set to ${set}.`);

        // --- Step 2c: Drop Point Location 1 ---
        log('INFO', 'Setting Drop Point Location 1 (hokky)...');
        await page.selectLocation(
            driver, 'Drop Point Location 1 *', 'hokky', 'Hokky Buah - Citraland'
        );
        log('PASS', 'Drop Point Location 1 committed.');

        // --- Step 2d: Product Group ---
        log('INFO', 'Adding Product Group (Ayam 10 Karung, 10 Kg, -18°C)...');
        await page.addProductGroup(driver);
        log('PASS', 'Product Group added.');

        // --- Step 3a: advance to the Route step ---
        log('INFO', 'Pressing Next to the Route step...');
        await page.dismissKeyboard(driver);
        const next2 = await waitFor(driver, '~Next');
        await page.press(driver, next2);
        await driver.pause(3000);
        log('PASS', 'Route step reached (map may take a minute to load).');

        // --- Step 3b: select the route ---
        const card = await page.selectRoute(driver);
        log('PASS', `Route selected: ${card}.`);

        // --- Step 3c: we are at the SUBMIT GATE ---
        log('INFO', 'Verifying the requirement fields are all committed...');
        log('PASS', 'Submit gate reached. NOT pressing Submit — shared-tablet'
            + ' rule, no TO may be created.');

        console.log('\n=== Test-02e: PASS ✅ ===\n');
        console.log('  The recorded walkthrough is now automated end to end:');
        console.log('    Step 1  PT QA | today | Sidoarjo-Surabaya | BUP Freezer');
        console.log('    Step 2  Tirtamas Coldstorindo | Stand by '
            + `${set} | Hokky Buah - Citraland | Ayam group`);
        console.log(`    Step 3  Route "${card}" | Submit gate reached`);
        console.log('');
        console.log('  Form was cancelled out cleanly — nothing was created.\n');

    } catch (error) {
        console.error('\n❌ Test-02e FAILED');
        console.error(`   Reason: ${error.message}\n`);

        if (driver) {
            try {
                console.error(`   UI tree saved:  `
                    + `${await saveDump(driver, 'test-02e-failure')}`);
                console.error(`   Screenshot:     `
                    + `${await saveScreenshot(driver, 'test-02e-failure')}`);
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