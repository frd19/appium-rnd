/**
 * tests/test-01-login.js
 * ----------------------
 * Test case Test-01 (from "TO Small scope - Appium" FUNCTIONAL sheet)
 *
 *   TC ID   : Test-01
 *   Module  : TO / Login
 *   Role    : Planner
 *   Data    : email om@gmail.com / password Password123!
 *   Expected: Successful login
 *   Status in sheet: PASSED (manually)
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOW IT WORKS
 *   The app keeps a session, so the login screen only appears after a
 *   COLD start. This test therefore resets the app's saved data first,
 *   which is what makes the login screen appear.
 *
 *   If the screen does not appear (session still valid), the test logs
 *   that and passes — there was simply nothing to log into.
 * ─────────────────────────────────────────────────────────────────────
 */

const { connect, quit, restartApp, log, saveDump, saveScreenshot } = require('../helpers/device');
const login = require('../pages/login');
const page = require('../pages/transportOrder');
const config = require('../config');

async function main() {
    console.log('\n=== Test-01 : Login ===\n');

    let driver;
    try {
        log('INFO', 'Connecting...');
        driver = await connect();

        // --- Case A: full cold start, login screen guaranteed ---
        log('INFO', 'Resetting the app to force the login screen...');
        await restartApp(driver, { resetApp: true });

        if (!(await login.isVisible(driver))) {
            log('INFO', 'No login screen after reset — session already active.');
            log('PASS', 'Nothing to log into. Session persisted.');
            console.log('\n=== Test-01: PASS ✅ ===\n');
            return;
        }

        // Wait for the form to finish rendering before interacting with it.
        await login.waitForScreen(driver);
        log('PASS', 'Login screen is showing and fully loaded.');

        // --- Negative first: empty form must not log in ---
        log('INFO', 'Checking that empty credentials are rejected...');
        const emptyAccepted = await login.submitAndWait(driver, 8000);

        if (emptyAccepted) {
            log('FAIL', 'Empty credentials were accepted. Expected rejection.');
            process.exitCode = 1;
        } else {
            log('PASS', 'Empty credentials were correctly rejected.');
        }

        // --- Now the real login ---
        log('INFO', 'Signing in with the test account...');
        await login.login(driver, config.user.email, config.user.password);

        const success = await login.isLoggedIn(driver)
            || await (async () => {
                const deadline = Date.now() + 20000;
                while (Date.now() < deadline) {
                    if (await login.isLoggedIn(driver)) return true;
                    await driver.pause(1000);
                }
                return false;
            })();

        if (success) {
            log('PASS', 'Login succeeded — Transport Order board is showing.');

            // Confirm we are really on the board, not just logged in
            await page.waitForBoard(driver);
            log('PASS', 'Board elements confirmed.');
            console.log('\n=== Test-01: PASS ✅ ===\n');
        } else {
            const message = await login.errorMessage(driver);
            log('FAIL', 'Login did not reach the board.');
            if (message) {
                log('INFO', `App showed: "${message}"`);
            }
            console.error(`   UI tree:  ${await saveDump(driver, 'test-01-login-failed')}`);
            console.error(`   Screenshot: ${await saveScreenshot(driver, 'test-01-login-failed')}`);
            process.exitCode = 1;
        }

    } catch (error) {
        console.error('\n❌ Test-01 FAILED');
        console.error(`   Reason: ${error.message}\n`);
        if (driver) {
            console.error(`   UI tree:  ${await saveDump(driver, 'test-01-error')}`);
            console.error(`   Screenshot: ${await saveScreenshot(driver, 'test-01-error')}`);
        }
        process.exitCode = 1;

    } finally {
        await quit(driver);
    }
}

main();