/**
 * probe-step2.js
 * --------------
 * THROWAWAY — not part of the test suite.
 *
 * Step 2 ("Fleet and SLA") is now reachable: fill Step 1 properly and press
 * Next (clicking the tab does NOT work).
 *
 * Test data for step 2, from the sheet:
 *   A. Route and SLA
 *      pick up location  : tirtamas coldstorindo
 *      stand by time    : current hour + 1
 *      drop point        : Hokky buah citraland
 *   B. Product Group
 *      name        : Ayam
 *      quantity    : 10 Karung
 *      weight       : 10 kg
 *      temperature : -18
 *
 * This run completes Step 1, advances, then dumps Step 2 and opens each of
 * its controls so the selectors can be written from evidence.
 *
 * Run:  node tests/probe-step2.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, saveDump,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

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

    const edits = await driver.$$('//android.widget.EditText');
    const editCount = await edits.length;
    if (editCount > 0) {
        console.log(`  TEXT FIELDS (${editCount}):`);
        for (let i = 0; i < editCount; i += 1) {
            const attrs = await edits[i].getAttributes();
            console.log(
                `    bounds=${attrs.bounds} text=${JSON.stringify(attrs.text)}`
                + ` password=${attrs.password} hint=${JSON.stringify(attrs.hint)}`
            );
        }
    }
}

async function closeOverlay(driver) {
    const dismiss = await driver.$('~Dismiss');
    if (await dismiss.isExisting()) {
        await dismiss.click().catch(() => {});
        await driver.pause(1500);
        return true;
    }
    return false;
}

/** Open a control by its label and report what appears. */
async function probeControl(driver, label, controlName) {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`  ${label}  ->  "${controlName}"`);
    console.log('='.repeat(64));

    try {
        const control = await page.scrollToField(driver, controlName);
        await page.press(driver, control);
        await driver.pause(2500);

        const opened = await driver.$('~Dismiss');
        if (!(await opened.isExisting())) {
            console.log('  NO overlay. Probably a text field or a button, not a list.');
            return;
        }

        await dumpLabels(driver, `${label}: overlay contents`);
        await closeOverlay(driver);
    } catch (error) {
        console.log(`  ERROR: ${error.message}`);
    }
}

async function main() {
    console.log('\n=== Probing Step 2: Fleet and SLA ===\n');

    let driver;
    try {
        driver = await connect();
        await restartApp(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);

        // --- Complete Step 1 ---
        console.log('  completing Step 1...');
        await page.selectCustomer(driver, 'PT QA');
        await page.selectOrderDateToday(driver);
        await page.selectCity(driver, 'Origin City', 'Sidoarjo');
        await page.selectCity(driver, 'Destination City', 'Surabaya');
        await page.selectFleetType(driver, 'BUP Freezer');
        await page.advanceToFleetAndSla(driver);
        console.log('  ✅ Step 1 complete, now on "Fleet and SLA".');

        // --- Dump Step 2, top and scrolled ---
        await page.scrollFormToTop(driver);
        await dumpLabels(driver, 'STEP 2 top');
        await page.dragForm(driver, 'below');
        await dumpLabels(driver, 'STEP 2 after scrolling down');
        await page.dragForm(driver, 'below');
        await dumpLabels(driver, 'STEP 2 after scrolling down again');

        // --- Probe the controls the sheet names ---
        for (const [label, name] of [
            ['PICK UP LOCATION', 'Select Pick Up'],
            ['PICK UP (alt)', 'Pick Up Location'],
            ['DROP POINT', 'Select Drop Point'],
            ['DROP POINT (alt)', 'Drop Point Location'],
            ['ADD PRODUCT GROUP', 'Add Product Group'],
            ['ADD (alt)', 'Add'],
        ]) {
            // Only probe names that actually exist on this step.
            const exists = await page.controlExists(driver, name);
            if (!exists) {
                console.log(`\n  (skipping "${name}" — not present on this step)`);
                continue;
            }
            await probeControl(driver, label, name);
        }

        console.log('\n=== probe finished ===\n');
        console.log('If any control above was skipped, its real label is one of the');
        console.log('entries in the STEP 2 dumps printed earlier in this run.\n');

    } catch (error) {
        console.error(`\n❌ probe failed: ${error.message}`);
        if (driver) {
            console.error(`   tree: ${await saveDump(driver, 'probe-step2')}`);
        }
        process.exitCode = 1;
    } finally {
        await quit(driver);
    }
}

main();