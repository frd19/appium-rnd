/**
 * probe-selectors.js
 * ------------------
 * THROWAWAY — not part of the test suite.
 *
 * `selectCustomer()` cannot find the "PT QA" option even though the dump
 * plainly contains:
 *     "PT QA | CUST-1790135906434241572"
 *
 * Rather than guess which XPath flavour Appium likes, open the dropdown and
 * try every plausible form, printing exactly which ones match.
 *
 * Run:  node tests/probe-selectors.js
 */

const {
    connect, quit, restartApp, ensureLoggedIn, log,
} = require('../helpers/device');
const page = require('../pages/transportOrder');

const NEWLINE = String.fromCharCode(10); // a real \n inside the XPath literal

const CANDIDATES = [
    ['starts-with, name + newline', `//*[starts-with(@content-desc,"PT QA${NEWLINE}")]`],
    ['starts-with, name only', '//*[starts-with(@content-desc,"PT QA")]'],
    ['contains, name', '//*[contains(@content-desc,"PT QA")]'],
];

async function main() {
    console.log('\n=== Probing customer-dropdown selectors ===\n');

    let driver;
    try {
        driver = await connect();
        await restartApp(driver);
        await ensureLoggedIn(driver);
        await page.waitForBoard(driver);

        await page.openCreateMenu(driver);
        await page.tapCreateNew(driver);
        await page.waitForCreateForm(driver);

        // Open the dropdown with a normal click — the field itself is not
        // one of the controls that needs a press.
        const field = await page.scrollToField(driver, 'Select Customer');
        await field.click();
        await driver.pause(2500);

        // Prove the dropdown is open before blaming any selector.
        const dismiss = await driver.$('~Dismiss');
        console.log(`dropdown open (Dismiss present): ${await dismiss.isExisting()}`);
        console.log('');

        // Show the raw text so there is no doubt about spacing.
        const views = await driver.$$('//android.view.View');
        console.log('raw content-desc values containing "QA" (before scroll):');
        for (let i = 0; i < await views.length; i += 1) {
            const d = await views[i].getAttribute('content-desc');
            if (d && d.includes('QA')) {
                console.log(`   [${JSON.stringify(d)}]`);
            }
        }
        console.log('');

        // --- The important part -------------------------------------------------
        // Scroll the option list so that BOTH "PT QA" and "PT QA update" are
        // rendered at the same time. Only then can we tell whether a selector
        // picks the right one. Earlier, with the list at the top, even a sloppy
        // "contains" matched exactly 1 result — because "PT QA update" simply
        // was not in the tree yet. That was a false sense of safety.
        console.log('scrolling the option list so both "PT QA" and "PT QA update" render...');
        try {
            await driver.performActions([
                {
                    type: 'pointer',
                    id: 'finger1',
                    parameters: { pointerType: 'touch' },
                    actions: [
                        { type: 'pointerMove', duration: 0, x: 1000, y: 550 },
                        { type: 'pointerDown', button: 0 },
                        { type: 'pause', duration: 150 },
                        { type: 'pointerMove', duration: 400, x: 1000, y: 350 },
                        { type: 'pointerUp', button: 0 },
                    ],
                },
            ]);
            await driver.releaseActions();
            await driver.pause(1500);
        } catch (error) {
            console.log(`  (scroll failed: ${error.message})`);
        }

        const views2 = await driver.$$('//android.view.View');
        console.log('raw content-desc values containing "QA" (after scroll):');
        for (let i = 0; i < await views2.length; i += 1) {
            const d = await views2[i].getAttribute('content-desc');
            if (d && d.includes('QA')) {
                console.log(`   [${JSON.stringify(d)}]`);
            }
        }
        console.log('');

        for (const [label, selector] of CANDIDATES) {
            let count = 0;
            let displayed = 0;
            const matched = [];
            try {
                const els = await driver.$$(selector);
                count = await els.length;
                for (let i = 0; i < count; i += 1) {
                    if (await els[i].isDisplayed()) {
                        displayed += 1;
                        matched.push(await els[i].getAttribute('content-desc'));
                    }
                }
            } catch (error) {
                console.log(`  ERROR  ${label}`);
                console.log(`         ${error.message.split('\n')[0]}`);
                continue;
            }

            const safe = displayed === 1 ? 'SAFE ' : displayed === 0 ? 'none ' : 'AMBIG';
            console.log(`  ${safe}  ${label.padEnd(32)} found=${count} displayed=${displayed}`);
            matched.forEach((m) => console.log(`           matched: ${JSON.stringify(m)}`));
            console.log(`           ${selector}`);
        }

        console.log('\n=== probe finished ===\n');

    } catch (error) {
        console.error(`\n❌ probe failed: ${error.message}`);
        process.exitCode = 1;
    } finally {
        await quit(driver);
    }
}

main();