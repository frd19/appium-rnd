/**
 * probe-datepicker.js
 * -------------------
 * THROWAWAY — not part of the test suite.
 *
 * A fast, focused probe for ONE control: the date picker.
 *
 * WHY A SEPARATE PROBE
 *   Order Date is the second field on the form, so this needs no Step 1
 *   setup. The full walkthrough probe spends several minutes filling Step 1
 *   before it ever reaches this, which is a lot of device time to spend
 *   learning about a date picker.
 *
 * THE PROBLEM BEING SOLVED
 *   selectOrderDateToday() presses "Today" and the picker does NOT close. No
 *   apply button appears. The accessibility tree contains no Button at all.
 *
 *   From the full dump of that picker (58 nodes, every one listed):
 *
 *     FrameLayout/View  [441,217][1479,937]  the dialog
 *     View  [722,345][776,399]   clk=true  NO desc   <- month nav?
 *     View  [1145,345][1199,399] clk=true  NO desc   <- month nav?
 *     View  [1097,423][1199,480] clk=true  "Today"
 *     ... day cells ...
 *     View  [722,894][785,937]   clk=true  "2"      <- NOTE
 *     View  [441,217][1479,937]  clk=true  "Dismiss"
 *
 *   Every day row is 63px tall EXCEPT the last one, which is 43px
 *   (894 -> 937). That is the row being clipped by the dialog edge. So the
 *   grid overflows, and whatever sits below it — the Cancel / Next row the
 *   tester remembers — is pushed outside the dialog and never rendered.
 *
 *   So the question this probe answers is not "what is the button called" but
 *   "HOW does this picker get confirmed at all".
 *
 * Run:  node tests/probe-datepicker.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, ensureFullscreen, saveDump, log,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

async function state(driver, title) {
    console.log(`\n--- ${title} ---`);

    const today = await driver.$('~Today');
    console.log(`  picker open ("Today" present): ${await today.isDisplayed().catch(() => false)}`);

    // What is under the dialog? A few buttons down, past the clipped row.
    for (const name of ['Cancel', 'Next', 'Apply', 'OK', 'Done', 'Select Customer']) {
        const el = await driver.$(`~${name}`);
        console.log(`  ~${name.padEnd(16)} ${await el.isDisplayed().catch(() => false)}`);
    }

    const nodes = await driver.$$('//*[@content-desc != ""]');
    const n = await nodes.length;
    const interesting = [];
    for (let i = 0; i < n; i += 1) {
        const d = await nodes[i].getAttribute('content-desc');
        if (!d) continue;
        const b = (await nodes[i].getAttribute('bounds')) || '';
        interesting.push(`${b}  ${JSON.stringify(d)}`);
    }
    console.log(`  labelled nodes: ${n}`);
    for (const s of interesting.slice(0, 12)) console.log(`    ${s}`);
    if (n > 12) console.log(`    ... and ${n - 12} more`);
}

/** Press a raw coordinate with a real hold. */
async function pressAt(driver, x, y, holdMs = 150) {
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
    await driver.pause(900);
}

async function main() {
    console.log('\n=== Focused probe: how does the date picker get confirmed? ===\n');

    let driver;
    try {
        driver = await connect();
        await restartApp(driver);

        // MANDATORY on this tablet: it is in Android freeform/desktop mode, so
        // the app opens in a ~1038x780 floating window. The date picker is
        // taller than that, which is why Cancel/Next were clipped away and
        // looked like missing accessibility nodes.
        await ensureFullscreen(driver);
        log('INFO', 'Continuing with the app full screen.');

        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);
        console.log('  ✅ form open (no Step 1 fill needed — Order Date is early).');

        // The picker is anchored to the form's scroll area, which is below
        // the Customer field. Nudge it into view first.
        const field = await page.scrollToField(driver, 'Select Date');
        const fy = (await field.getLocation()).y;
        console.log(`  "Select Date" at y=${fy}`);

        await page.press(driver, field);
        await driver.pause(2500);
        await state(driver, 'A. picker just opened');
        await saveDump(driver, 'datepicker-a-open');

        // --- 1. Press "Today" ---
        console.log('\n  [1] pressing "Today"...');
        const today = await driver.$('~Today');
        if (await today.isDisplayed().catch(() => false)) {
            await page.press(driver, today);
        }
        await state(driver, 'B. after pressing Today');
        await saveDump(driver, 'datepicker-b-today');

        // --- 2. Press an actual DAY CELL ---
        //
        // A NOTE ON WHAT WENT WRONG HERE FIRST TIME
        //   An earlier version of this probe assumed the missing action
        //   buttons might be hiding just below the dialog, and blind-tapped
        //   (820, 990). That CLOSED THE APP — we landed on the launcher.
        //
        //   Reason: the dialog's "Dismiss" barrier only covers
        //   [441,217][1479,937]. Below y=937 the barrier does not extend, so
        //   the tap landed on the live form underneath. The form then
        //   navigated away and, with nothing behind it, the app exited.
        //
        //   Two lessons, both now baked in:
        //     1. NEVER tap outside a dialog's known bounds. If the bounds are
        //        unknown, read them first.
        //     2. This is a real app behaviour worth reporting: the modal
        //        barrier does not cover the full screen, so a stray tap
        //        during automation can close the app with no warning. On a
        //        shared tablet that is a genuine hazard.
        //
        // So this phase only ever taps INSIDE the dialog box.
        console.log('\n  [2] pressing an actual day cell (not the Today shortcut)...');
        const dialogBox = { x1: 441, y1: 217, x2: 1479, y2: 937 };

        // Day 6 of the current month sits in row 1, column 6. Row 1 reads
        // "28 29 30 1 2 3 4", so the 6th cell is October 6 — today.
        const dayCell = await driver.$('//android.view.View[@content-desc="6"]');
        const dayX = (await dayCell.getLocation()).x;
        const dayY = (await dayCell.getLocation()).y;
        const dayBounds = await dayCell.getAttribute('bounds');
        const inDialog = dayX > dialogBox.x1 && dayX < dialogBox.x2
            && dayY > dialogBox.y1 && dayY < dialogBox.y2;
        console.log(`  day cell "6" at ${dayBounds} — inside dialog: ${inDialog}`);

        if (inDialog) {
            await page.press(driver, dayCell);
            await driver.pause(1500);
            const open = await driver.$('~Today');
            const stillOpen = await open.isDisplayed().catch(() => false);
            console.log(`  after pressing day 6, picker: ${stillOpen ? 'STILL OPEN' : 'CLOSED ✅'}`);
            await state(driver, 'C. after pressing day cell 6');
            await saveDump(driver, 'datepicker-c-daycell');
        }

        // --- 3. If still open, press "Today" as well ---
        const openNow = await driver.$('~Today');
        if (await openNow.isDisplayed().catch(() => false)) {
            console.log('\n  [3] picker still open — now retrying "Today"...');
            await page.press(driver, openNow);
            await driver.pause(1500);
            const open2 = await driver.$('~Today');
            console.log(`  after Today: ${await open2.isDisplayed().catch(() => false) ? 'STILL OPEN' : 'CLOSED ✅'}`);
            await state(driver, 'D. after day cell then Today');
        }

        // --- 4. What does the Order Date field show now? ---
        console.log(`\n  Order Date field now shows: ${await page.readOrderDate(driver)}`);
        console.log('\n=== probe finished ===\n');

    } catch (error) {
        console.error(`\n❌ probe failed: ${error.message}`);
        if (driver) console.error(`   tree: ${await saveDump(driver, 'probe-datepicker')}`);
        process.exitCode = 1;
    } finally {
        if (driver) {
            try { console.log(`  cleanup: ${await page.leaveFormCleanly(driver)}`); } catch {}
        }
        await quit(driver);
    }
}

main();