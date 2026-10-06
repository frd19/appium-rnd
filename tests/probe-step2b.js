/**
 * probe-step2b.js
 * ---------------
 * THROWAWAY — not part of the test suite.
 *
 * probe-step2.js mapped the Step 2 *layout*. This run maps the three
 * controls that were still unknown, using the real labels it found:
 *
 *   1. Pick-Up Location  *  -> "Select Location"   (dropdown)
 *   2. Drop Point Location 1 * -> "Select Location" (dropdown — SAME label)
 *   3. Stand by Time *        -> "Select Date"      (a CLOCK picker, per the
 *                                                   tester: hour hand, then
 *                                                   minute hand, then apply)
 *
 * Plus the "Product Group" sub-tab, which nothing has opened yet.
 *
 * The clock is the risky one. Flutter may not expose the hands as
 * accessibility nodes at all, in which case we have to compute the angle and
 * press a coordinate on the clock face. So this probe dumps the FULL page
 * source XML, not just content-desc labels.
 *
 * Run:  node tests/probe-step2b.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, saveDump,
} = require('../helpers/device');
const page = require('../pages/transportOrder');
const fs = require('fs');
const path = require('path');

const NEWLINE = String.fromCharCode(10);

/** Print every labelled node, with class and bounds. */
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
}

/**
 * Find the "Select Location" that sits BELOW a caption.
 *
 * Both location fields share one label, so `~Select Location` always matches
 * the first. We pick by geometry instead: the field directly under
 * "Pick-Up Location *" is the pick-up, the one under "Drop Point Location 1 *"
 * is the drop point.
 */
async function locationFieldBelow(driver, caption) {
    const captionEl = await page.scrollToField(driver, caption);
    const capY = (await captionEl.getLocation()).y;

    const all = await driver.$$('~Select Location');
    const total = await all.length;

    let best = null;
    for (let i = 0; i < total; i += 1) {
        const shown = await all[i].isDisplayed().catch(() => false);
        if (!shown) continue;
        const y = (await all[i].getLocation()).y;
        if (y > capY && (!best || y < best.y)) {
            best = { el: all[i], y, index: i };
        }
    }

    if (!best) {
        throw new Error(
            `No visible "Select Location" below "${caption}" `
            + `(caption y=${capY}, ${total} found).`
        );
    }
    return best;
}

/** Save and print the raw XML, which shows nodes that have no content-desc. */
async function dumpSource(driver, name) {
    const xml = await driver.getPageSource();
    const dir = path.join(__dirname, '..', 'dumps');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.xml`);
    fs.writeFileSync(file, xml, 'utf8');

    // Report anything clickable/focusable, which is what a clock hand would be.
    const clickable = xml.match(/clickable="true"[^>]*bounds="[^"]*"/g) || [];
    console.log(`  full XML -> ${file} (${xml.length} bytes)`);
    console.log(`  clickable nodes: ${clickable.length}`);
    for (const c of clickable.slice(0, 40)) console.log(`    ${c}`);

    return xml;
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

async function main() {
    console.log('\n=== Probing Step 2 controls: locations, clock, product group ===\n');

    let driver;
    try {
        driver = await connect();
        await restartApp(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);

        console.log('  completing Step 1...');
        await page.selectCustomer(driver, 'PT QA');
        await page.selectOrderDateToday(driver);
        await page.selectCity(driver, 'Origin City', 'Sidoarjo');
        await page.selectCity(driver, 'Destination City', 'Surabaya');
        await page.selectFleetType(driver, 'BUP Freezer');
        await page.advanceToFleetAndSla(driver);
        console.log('  ✅ on "Fleet and SLA".\n');

        // ---------------------------------------------------------------
        // 1. Pick-Up Location
        // ---------------------------------------------------------------
        console.log(`${'='.repeat(64)}\n  1. PICK-UP LOCATION\n${'='.repeat(64)}`);
        try {
            const { el, y, index } = await locationFieldBelow(driver, 'Pick-Up Location *');
            console.log(`  field at y=${y} (index ${index})`);
            await page.press(driver, el);
            await driver.pause(2500);

            const opened = await driver.$('~Dismiss');
            if (await opened.isExisting()) {
                await dumpLabels(driver, 'pick-up overlay');
                const edits = await driver.$$('//android.widget.EditText');
                console.log(`  search boxes: ${await edits.length}`);
                if ((await edits.length) > 0) {
                    console.log('  --> SEARCHABLE, typing to filter');
                    await edits[0].setValue('tirtamas');
                    await driver.pause(2500);
                    await dumpLabels(driver, 'pick-up overlay after typing "tirtamas"');
                }
                await closeOverlay(driver);
            } else {
                console.log('  no overlay appeared');
            }
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        // ---------------------------------------------------------------
        // 2. Stand by Time — the clock
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  2. STAND BY TIME (clock picker)\n${'='.repeat(64)}`);
        try {
            const clock = await page.scrollToField(driver, 'Select Date');
            await page.press(driver, clock);
            await driver.pause(3000);

            await dumpLabels(driver, 'stand-by-time picker');
            await dumpSource(driver, 'standby-clock');
            console.log('\n  NOTE: look for hour/minute hand nodes above.');
            console.log('  If there are none, we must press a coordinate on the face.');
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        // ---------------------------------------------------------------
        // 3. Product Group sub-tab
        // ---------------------------------------------------------------
        console.log(`\n${'='.repeat(64)}\n  3. PRODUCT GROUP SUB-TAB\n${'='.repeat(64)}`);
        try {
            // The picker may still be open — close it first.
            if (!(await closeOverlay(driver))) {
                const outside = await driver.$('~Dismiss');
                if (await outside.isExisting()) {
                    await outside.click().catch(() => {});
                    await driver.pause(1500);
                }
            }

            const tab = await page.scrollToField(driver, 'Product Group');
            await page.press(driver, tab);
            await driver.pause(2500);

            await dumpLabels(driver, 'Product Group tab (top)');
            await page.dragForm(driver, 'below');
            await dumpLabels(driver, 'Product Group tab (scrolled)');
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }

        console.log('\n=== probe finished ===\n');

    } catch (error) {
        console.error(`\n❌ probe failed: ${error.message}`);
        if (driver) {
            console.error(`   tree: ${await saveDump(driver, 'probe-step2b')}`);
        }
        process.exitCode = 1;
    } finally {
        await quit(driver);
    }
}

main();