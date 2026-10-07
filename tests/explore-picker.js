/**
 * explore-picker.js
 * -----------------
 * THROWAWAY exploration script — not part of the test suite.
 *
 * The Order Date picker would not select a day via `adb input tap` or via a
 * normal Appium click. Before writing test-02 we need to know whether the
 * picker is genuinely broken, or whether we were simply checking the wrong
 * thing.
 *
 * IMPORTANT LESSON FROM THE FIRST ATTEMPT
 *   The first run asserted on `//*[@selected="true"]` and found nothing,
 *   which LOOKED like the click failed. But Flutter does not necessarily
 *   report a selected day via the `selected` attribute. Checking a guessed
 *   attribute proves nothing.
 *
 *   So this run checks the OUTCOME instead, which is what actually matters:
 *     1. click a day cell      -> does the picker respond at all?
 *     2. click Apply           -> does the picker CLOSE?
 *     3. read the Order Date   -> does it show a date now?
 *
 *   Also compares three input methods:
 *     A. element.click()
 *     B. press with a 150ms hold
 *     C. the "Today" shortcut
 *
 * Run:  node tests/explore-picker.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, waitFor, log, saveDump, saveScreenshot,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

/** Centre point of an element. */
async function centreOf(driver, el) {
    const location = await el.getLocation();
    const size = await el.getSize();
    return {
        x: Math.round(location.x + size.width / 2),
        y: Math.round(location.y + size.height / 2),
    };
}

/** A press with a real hold, using W3C pointer actions. */
async function pressAndHold(driver, x, y, holdMs = 150) {
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
}

async function pickerIsOpen(driver) {
    try {
        return await driver.$('~Apply').isDisplayed();
    } catch {
        return false;
    }
}

/**
 * Report the current state in plain language:
 * is the picker still open, and what does the Order Date field show?
 */
async function report(driver, label) {
    const open = await pickerIsOpen(driver);
    let dateText = '(field not visible)';

    try {
        await page.scrollFormToTop(driver, 3);
        const field = await driver.$('~Select Date');
        if (await field.isDisplayed()) {
            dateText = 'still says "Select Date"';
        }
    } catch {
        // field may have become something else entirely
    }

    // The field label changes once a date is chosen, so look for any
    // date-like label near the "Order Date *" caption.
    const chosen = await driver.$(
        '//android.widget.ImageView[contains(@content-desc,"202")]'
    );
    if (await chosen.isExisting()) {
        dateText = `field now shows '${await chosen.getAttribute('content-desc')}'`;
    }

    console.log(`  ${label}`);
    console.log(`     picker still open : ${open}`);
    console.log(`     order date field  : ${dateText}`);
    return open;
}

/** Try one input method on the day "3" cell, then Apply, then report. */
async function tryMethod(driver, name, method) {
    console.log(`\n=== ${name} ===`);

    // Make sure we are in a clean picker.
    if (!(await pickerIsOpen(driver))) {
        console.log('  picker is not open — cannot test');
        return false;
    }

    const cell = await driver.$('//android.view.View[@content-desc="3"]');
    if (!(await cell.isExisting())) {
        console.log('  day cell "3" not found');
        return false;
    }

    const { x, y } = await centreOf(driver, cell);
    console.log(`  day "3" centre: ${x},${y}`);

    try {
        await method(driver, cell, x, y);
    } catch (error) {
        console.log(`  ${name} threw: ${error.message}`);
        return false;
    }

    await driver.pause(2000);
    const stillOpen = await report(driver, 'after touching the day cell');

    // Now press Apply and see whether that closes it.
    const apply = await driver.$('~Apply');
    if (await apply.isDisplayed()) {
        await apply.click();
        await driver.pause(2500);
        await report(driver, 'after pressing Apply');
    }

    return !stillOpen;
}

async function main() {
    console.log('\n=== Exploring the Order Date picker ===\n');

    let driver;
    try {
        driver = await connect();
        await restartApp(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log('PASS', 'Create form is open.');

        // --- Approach A: normal element.click() ---
        await page.scrollToField(driver, 'Select Date');
        await (await driver.$('~Select Date')).click();
        await driver.pause(2500);
        log('PASS', 'Date picker opened.');
        await report(driver, 'initial state');

        await tryMethod(
            driver,
            'A: normal element.click() on day "3"',
            async (d, cell) => cell.click()
        );

        // --- Approach B: press and hold ---
        if (!(await pickerIsOpen(driver))) {
            // A worked, so reopen the picker to test B.
            console.log('\n  (picker closed after A — reopening to test B)');
            await page.scrollToField(driver, 'Select Date');
            const field = await driver.$('~Select Date');
            if (await field.isDisplayed()) {
                await field.click();
                await driver.pause(2500);
            }
        }

        await tryMethod(
            driver,
            'B: 150ms press on day "3"',
            async (d, cell, x, y) => pressAndHold(d, x, y, 150)
        );

        // --- Approach C: the Today shortcut ---
        if (!(await pickerIsOpen(driver))) {
            console.log('\n  (picker closed after B — reopening to test C)');
            await page.scrollToField(driver, 'Select Date');
            const field = await driver.$('~Select Date');
            if (await field.isDisplayed()) {
                await field.click();
                await driver.pause(2500);
            }
        }

        if (await pickerIsOpen(driver)) {
            await tryMethod(
                driver,
                'C: the "Today" shortcut button',
                async (d) => (await d.$('~Today')).click()
            );
        } else {
            console.log('\n=== C: Today shortcut === (picker already closed, skipped)');
        }

        // Leave the app tidy
        if (await pickerIsOpen(driver)) {
            await (await driver.$('~Dismiss')).click().catch(() => {});
            await driver.pause(1500);
        }

        console.log('\n=== Exploration finished ===\n');
        console.log('Read the results above: if any approach closed the picker and');
        console.log('set the date, that is the approach test-02 must use.\n');

    } catch (error) {
        console.error(`\n❌ Exploration failed: ${error.message}`);
        if (driver) {
            console.error(`   tree: ${await saveDump(driver, 'explore-picker')}`);
            console.error(`   shot: ${await saveScreenshot(driver, 'explore-picker')}`);
        }
        process.exitCode = 1;
    } finally {
        await quit(driver);
    }
}

main();