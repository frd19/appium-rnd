/**
 * tests/cleanup-form.js
 * ---------------------
 * THROWAWAY utility, not part of the suite. Run it when a test has left the
 * Create form open on the SHARED tablet.
 *
 *   node tests/cleanup-form.js
 *
 * WHY IT EXISTS AS A SCRIPT
 *   leaveFormCleanly() deliberately stops after one Cancel and reports
 *   "could-not-close" rather than pressing anything it has not identified. That
 *   is the right behaviour inside a test, where an unknown tap could do real
 *   damage, but it leaves the tablet messy and the cleanup unfinished.
 *
 *   This walks the layers deliberately instead. At the point it ran, the
 *   screen held a LOCATION SEARCH OVERLAY, not the form:
 *
 *       Tirtamas Coldstorindo / Bakalan, ... Sidoarjo
 *       Tirtamaya Inside / Sumber Bening, ... Malang
 *       Cancel   Select Location   Dismiss
 *
 *   So there are two nested things to close, and "the form is still open" was
 *   never a failure to close the form — it was a picker sitting on top of it.
 *
 * SAFETY RULES THIS KEEPS
 *   - Never press BACK. With a search overlay open, BACK closes the whole
 *     overlay, not just the keyboard.
 *   - Only ever press a button whose label was read off the screen first.
 *   - Every press is press() (a 150ms hold), because Flutter swallows clicks.
 *   - Nothing is typed and nothing is submitted. No order can be created here.
 */

const { connect, quit, log, saveDump } = require('../helpers/device');
const page = require('../pages/transportOrder');

/** Every label currently on screen, for reporting. */
async function screen(driver) {
    try {
        const nodes = await driver.$$('//*[@content-desc != ""]');
        const total = await nodes.length;
        const out = [];
        for (let i = 0; i < total; i += 1) {
            const d = await nodes[i].getAttribute('content-desc');
            if (d && d.trim() !== '') out.push(d.split('\n')[0]);
        }
        return out;
    } catch {
        return [];
    }
}

/** True when the location search overlay is showing. */
async function overlayOpen(driver) {
    return (await driver.$('~Select Location').isExisting().catch(() => false))
        || (await driver.$('~Dismiss').isExisting().catch(() => false));
}

async function pressIfPresent(driver, label) {
    const el = await driver.$(`~${label}`);
    if (!(await el.isExisting().catch(() => false))) return false;
    log('INFO', `pressing "${label}"`);
    await page.press(driver, el);
    await driver.pause(2000);
    return true;
}

async function main() {
    console.log('\n=== Tidying the shared tablet ===\n');

    let driver;
    try {
        driver = await connect();
        log('INFO', 'closing the dialogs the app left open...');

        // Layer 1: the location search overlay, if one is up.
        if (await overlayOpen(driver)) {
            log('INFO', 'a location search overlay is open — closing it');
            // Cancel before Dismiss: Dismiss may leave the picker open.
            await pressIfPresent(driver, 'Cancel');
            await driver.pause(1500);
            if (await overlayOpen(driver)) {
                await pressIfPresent(driver, 'Dismiss');
            }
        }

        // Layer 2: the Create form. Cancel is NOT a single press — the app
        // raises a confirmation, and answering it drops the form back to
        // Step 1 (Basic Detail) rather than closing it. Only a SECOND Cancel
        // closes it. Measured: after one Cancel + confirm the screen showed
        //     Basic Detail / Customer * / PT QA / Route * / Cancel / Next
        // so loop until the form is actually gone.
        let rounds = 0;
        while (await page.createFormOpen(driver) && rounds < 4) {
            rounds += 1;
            log('INFO', `round ${rounds}: the Create form is open — pressing Cancel`);
            await pressIfPresent(driver, 'Cancel');
            await driver.pause(1500);

            // Answer a confirmation only when one is really on screen — names
            // read off the tree, never assumed.
            for (const label of ['Yes', 'Confirm', 'Discard', 'OK']) {
                const el = await driver.$(`~${label}`);
                if (await el.isExisting().catch(() => false)) {
                    log('INFO', `answering "${label}"`);
                    await page.press(driver, el);
                    await driver.pause(2000);
                    break;
                }
            }
            await driver.pause(1000);
        }

        await driver.pause(1500);

        // Report what is actually left, rather than claiming success.
        if (await page.createFormOpen(driver)) {
            const labels = await screen(driver);
            log('WARN', 'the Create form is STILL open. Labels on screen:');
            labels.forEach((l) => console.log(`      - ${l}`));
            log('INFO', `tree saved: ${await saveDump(driver, 'cleanup-leftover')}`);
            console.log('\n  left for manual cleanup — no unknown button was pressed.\n');
            process.exitCode = 1;
        } else {
            console.log('\n=== tablet is tidy ✅ ===\n');
        }
    } catch (error) {
        console.error(`\n❌ cleanup failed: ${error.message}\n`);
        process.exitCode = 1;
    } finally {
        await quit(driver);
    }
}

main();
