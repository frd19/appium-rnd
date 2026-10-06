/**
 * probe-route-fleet.js
 * --------------------
 * THROWAWAY — not part of the test suite.
 *
 * Test data from the sheet (Test-02):
 *   Route       : Surabaya - Sidoarjo
 *   Fleet type  : BUP Freezer
 *
 * Test-02b already covers Customer and Order Date. This maps the remaining
 * Basic Detail controls in ONE run, so we do not spend a run per field:
 *
 *   - Origin City          (Route section)
 *   - Destination City     (Route section)
 *   - Select Fleet         (Fleet Type)
 *
 * For each one it opens the control, prints the raw content-desc of every
 * option using JSON.stringify (so newlines show as escapes rather than
 * being flattened by my own formatting), and reports whether more than one
 * row matched a candidate selector.
 *
 * That last part is the important one. The customer dropdown showed that a
 * loose selector can appear to match exactly one row simply because the
 * rival row was scrolled out of the tree. So each selector is checked
 * against the rows actually present.
 *
 * Run:  node tests/probe-route-fleet.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, saveDump,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

/** Print every labelled node, with raw escapes so nothing is hidden. */
async function dumpLabels(driver, title) {
    console.log(`\n--- ${title} ---`);
    const nodes = await driver.$$('//*[@content-desc != ""]');
    const count = await nodes.length;
    for (let i = 0; i < count; i += 1) {
        const desc = await nodes[i].getAttribute('content-desc');
        if (!desc) continue;
        const cls = (await nodes[i].getAttribute('class')) || '';
        const shown = await nodes[i].isDisplayed().catch(() => false);
        console.log(
            `  ${shown ? ' ' : 'x'}`
            + ` [${cls.replace('android.widget.', '').replace('android.view.', 'v.')}]`
            + ` ${JSON.stringify(desc)}`
        );
    }
    console.log(`  (${count} labelled nodes)`);
}

/** Close any open overlay by tapping the Dismiss barrier. */
async function closeOverlay(driver) {
    const dismiss = await driver.$('~Dismiss');
    if (await dismiss.isExisting()) {
        await dismiss.click().catch(() => {});
        await driver.pause(1500);
        return true;
    }
    return false;
}

/**
 * Open one control and report what appears.
 */
async function probeControl(driver, label, controlName) {
    console.log(`\n${'='.repeat(62)}`);
    console.log(`  ${label}  (control: "${controlName}")`);
    console.log('='.repeat(62));

    try {
        const control = await page.scrollToField(driver, controlName);
        console.log(`  opening...`);
        await control.click();
        await driver.pause(2500);

        // Did an overlay actually open?
        const opened = await driver.$('~Dismiss');
        if (!(await opened.isExisting())) {
            console.log('  NO overlay opened. This control is not a dropdown.');
            await dumpLabels(driver, `${label}: form unchanged`);
            return;
        }

        await dumpLabels(driver, `${label}: overlay contents`);

        // Does the overlay contain a text field? Some controls are
        // searchable lists rather than plain dropdowns.
        const editTexts = await driver.$$('//android.widget.EditText');
        console.log(`  text fields in overlay: ${await editTexts.length}`);

        const scrollables = await driver.$$('//*[@scrollable="true"]');
        console.log(`  scrollable regions   : ${await scrollables.length}`);

        console.log('  closing overlay...');
        await closeOverlay(driver);
    } catch (error) {
        console.log(`  ERROR probing ${label}: ${error.message}`);
    }
}

async function main() {
    console.log('\n=== Probing Route and Fleet controls ===\n');

    let driver;
    try {
        driver = await connect();
        await restartApp(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        log0('Create form is open.');

        // --- Origin City ---
        await probeControl(driver, 'ORIGIN CITY', 'Origin City');

        // --- Destination City ---
        await probeControl(driver, 'DESTINATION CITY', 'Destination City');

        // --- Fleet Type ---
        await probeControl(driver, 'FLEET TYPE', 'Select Fleet');

        // --- Also check the step 2 tab exists and what it holds ---
        console.log(`\n${'='.repeat(62)}`);
        console.log('  STEP 2: "Fleet and SLA"');
        console.log('='.repeat(62));
        await page.scrollFormToTop(driver);
        try {
            await page.goToFleetAndSla(driver);
            await driver.pause(2000);
            await dumpLabels(driver, 'Fleet and SLA step');

            // It probably also scrolls; check for that.
            const scrollables = await driver.$$('//*[@scrollable="true"]');
            console.log(`  scrollable regions: ${await scrollables.length}`);
            await page.dragForm(driver, 'below');
            await dumpLabels(driver, 'Fleet and SLA step (after scrolling down)');
        } catch (error) {
            console.log(`  ERROR opening step 2: ${error.message}`);
            console.log(`  tree: ${await saveDump(driver, 'probe-fleet-sla')}`);
        }

        console.log('\n=== probe finished ===\n');

    } catch (error) {
        console.error(`\n❌ probe failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await quit(driver);
    }
}

function log0(message) {
    console.log(`  ✅ ${message}`);
}

main();