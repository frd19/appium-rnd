/**
 * tests/smoke.js
 * --------------
 * The first test to run. Its only job is to prove that:
 *   1. Appium can reach your device
 *   2. The app can be opened
 *   3. The Kanban board appears
 *
 * If this passes, everything else is possible.
 * If this fails, nothing else matters — fix this first.
 *
 * HOW TO RUN:
 *   Terminal 1:  appium          (leave it running)
 *   Terminal 2:  cd ...\TCL\appium
 *                npm install
 *                node tests/smoke.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, waitFor, log, saveDump, saveScreenshot,
} = require('../helpers/device');

async function main() {
    console.log('\n=== SMOKE TEST ===');
    console.log('Checking that the app opens and shows the Kanban board.\n');

    let driver;
    try {
        // --- 1. Connect ---
        log('INFO', 'Connecting to Appium and the device...');
        driver = await connect();
        log('PASS', 'Connected to device.');

        // --- 2. Open the app ---
        log('INFO', 'Opening the app...');
        await restartApp(driver);
        log('PASS', 'App opened.');

        // --- 3. Be on the board, logged in ---
        // The app keeps its session, but smoke is also the very first test
        // after Test-01 has wiped app data, so the login screen is a legal
        // state here. ensureLoggedIn signs in when it is showing.
        log('INFO', 'Making sure we are on the board...');
        if (!(await ensureLoggedIn(driver))) {
            throw new Error('The app is neither on the board nor at the '
                + 'login screen — cannot start the smoke test.');
        }

        // --- 4. Check the board ---
        // We anchor on "Dispatching" because it is always visible.
        // The first column ("Sales Order") can scroll off-screen.
        log('INFO', 'Looking for the Kanban board...');
        await waitFor(driver, '~Dispatching');
        log('PASS', 'Found the Kanban board ("Dispatching" column).');

        // --- 5. Check that real order data loaded ---
        const page = require('../pages/transportOrder');
        if (await page.hasTransportOrder(driver)) {
            log('PASS', 'Transport Order cards are loaded (found a "TO-" record).');
        } else {
            log('FAIL', 'Board is showing but no Transport Order cards were found.');
            process.exitCode = 1;
        }

        console.log('\n=== SMOKE TEST: PASS ✅ ===\n');

    } catch (error) {
        console.error('\n❌ SMOKE TEST FAILED');
        console.error(`   Reason: ${error.message}\n`);

        if (driver) {
            const dump = await saveDump(driver, 'smoke-failure');
            const shot = await saveScreenshot(driver, 'smoke-failure');
            console.error(`   UI tree saved:  ${dump}`);
            console.error(`   Screenshot:     ${shot}\n`);
            console.error('   Open the XML to see what was on screen at the moment of failure.');
            console.error('   Most common causes:');
            console.error('     - Appium server not running  -> run "appium" in terminal 1');
            console.error('     - Wrong UDID in config.js     -> run "adb devices"');
            console.error('     - Phone locked / screen off   -> unlock it');
            console.error('     - App crashed on launch\n');
        }

        process.exitCode = 1;

    } finally {
        await quit(driver);
    }
}

main();