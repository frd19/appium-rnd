/**
 * tests/all.js
 * -----------
 * Runs every test in order and prints a summary.
 *
 * Usage:
 *     node tests/all.js
 *
 * This is a convenience wrapper, not a test framework runner. Each test is
 * still a normal standalone script that you can also run on its own:
 *
 *     node tests/smoke.js
 *     node tests/test-01-login.js
 *     node tests/test-02-create-transport-order.js
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EACH TEST RUNS IN ITS OWN PROCESS
 *   The tests deliberately share a real device, and Appium holds a session
 *   per process. Running them in one process would mean sharing one
 *   session, and a crash in one test would leave the device in an unknown
 *   state for the next. Spawning each as a child process keeps them
 *   isolated, and means one broken test cannot stop the rest from running.
 *
 * NOTE: Test-01 wipes app data to force the login screen. The tests after
 * it log back in automatically, but if you use the app by hand afterwards,
 * expect to need to sign in again.
 */

const { spawn } = require('child_process');
const path = require('path');

const TESTS = [
    { file: 'smoke.js', name: 'Smoke test', why: 'device + app reachable' },
    { file: 'test-01-login.js', name: 'Test-01 Login', why: 'sign in and reach the board' },
    {
        file: 'test-02-create-transport-order.js',
        name: 'Test-02 Create transport order',
        why: 'full flow: entry path, validation, Step 1, Fleet and SLA, route — stops at Submit gate (shared-tablet rule)',
    },
];

/** Run one test file as a child process. Resolves to pass/fail. */
function runTest(test) {
    return new Promise((resolve) => {
        const script = path.join(__dirname, test.file);
        const child = spawn(process.execPath, [script], {
            stdio: 'inherit',
            shell: false,
        });

        child.on('error', (error) => {
            console.error(`  Could not start ${test.file}: ${error.message}`);
            resolve(false);
        });

        child.on('close', (code) => {
            // A test sets process.exitCode = 1 when it fails, and the test
            // prints its own PASS/FAIL lines. Either is enough to judge.
            resolve(code === 0);
        });
    });
}

async function main() {
    console.log('\n' + '='.repeat(62));
    console.log('  RUNNING ALL TESTS');
    console.log('='.repeat(62) + '\n');

    const results = [];

    for (let i = 0; i < TESTS.length; i += 1) {
        const test = TESTS[i];
        const number = `${i + 1} of ${TESTS.length}`;

        console.log('\n' + '-'.repeat(62));
        console.log(`  [${number}] ${test.name}`);
        console.log(`  ${test.why}`);
        console.log('-'.repeat(62));

        const passed = await runTest(test);
        results.push({ ...test, passed });
    }

    // --- Summary ---
    const passedCount = results.filter((r) => r.passed).length;

    console.log('\n' + '='.repeat(62));
    console.log('  SUMMARY');
    console.log('='.repeat(62));

    for (const result of results) {
        console.log(
            `  ${result.passed ? 'PASS' : 'FAIL'}  ${result.name}`
        );
    }

    console.log('-'.repeat(62));
    console.log(`  ${passedCount} of ${results.length} passed`);
    console.log('='.repeat(62) + '\n');

    if (passedCount !== results.length) {
        process.exitCode = 1;
    }
}

main();