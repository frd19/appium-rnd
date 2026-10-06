/**
 * helpers/device.js
 * -----------------
 * Small utilities that every test file uses.
 *
 * Nothing here is test-specific. It is the plumbing:
 *   - connect to Appium
 *   - open / close the app
 *   - wait
 *   - take a screenshot and save the UI tree on failure
 */

const { remote } = require('webdriverio');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');

const DUMP_DIR = path.join(__dirname, '..', 'dumps');

/**
 * Log in if the app is showing the login screen.
 *
 * The app persists its session, so after the first successful login the
 * login screen usually does NOT appear. But if the session expires or the
 * app data is cleared, every other test would fail at the first step.
 * Calling this at the start of a test makes it robust either way.
 */
async function ensureLoggedIn(driver) {
    // Required here, not at the top, to avoid a circular import.
    const login = require('../pages/login');

    if (await login.isLoggedIn(driver)) {
        return true;
    }

    if (!(await login.isVisible(driver))) {
        // Neither logged in nor at the login screen — let the test fail
        // with its own message rather than guessing.
        return false;
    }

    console.log('  ℹ️  INFO — Login screen detected, signing in...');
    // Wait for the screen to finish rendering before typing into it.
    await login.waitForScreen(driver);
    await login.login(driver, config.user.email, config.user.password);

    const deadline = Date.now() + config.timeout.long;
    while (Date.now() < deadline) {
        if (await login.isLoggedIn(driver)) {
            console.log('  ✅ PASS — Logged in.');
            return true;
        }
        await driver.pause(1000);
    }

    return false;
}

/**
 * Appium needs to know where the Android SDK is.
 * If ANDROID_HOME is not set on your machine it fails with
 * "Neither ANDROID_HOME nor ANDROID_SDK_ROOT environment variable was exported".
 *
 * We set it here automatically so you do not have to configure anything.
 * The path below is the normal install location on Windows.
 */
function ensureAndroidHome() {
    if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) {
        return; // already set, nothing to do
    }

    const candidates = [
        path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
        path.join(os.homedir(), 'Android', 'Sdk'),
        'C:\\Android\\Sdk',
    ];

    for (const sdk of candidates) {
        if (fs.existsSync(path.join(sdk, 'platform-tools', 'adb.exe'))) {
            process.env.ANDROID_HOME = sdk;
            process.env.ANDROID_SDK_ROOT = sdk;
            // Also make adb reachable by name, not just full path
            const platformTools = path.join(sdk, 'platform-tools');
            process.env.PATH = `${platformTools}${path.delimiter}${process.env.PATH}`;
            console.log(`  ℹ️  Using Android SDK: ${sdk}`);
            return;
        }
    }

    console.warn(
        '  ⚠️  Could not find the Android SDK automatically.\n'
        + '     If the test fails with an ANDROID_HOME error, set it manually:\n'
        + '     $env:ANDROID_HOME = "C:\\Users\\' + os.userInfo().username
        + '\\AppData\\Local\\Android\\Sdk"\n'
    );
}

/**
 * Find adb and return its full path, or null when it is missing.
 */
function findAdb() {
    const roots = [
        process.env.ANDROID_HOME,
        process.env.ANDROID_SDK_ROOT,
        path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
        path.join(os.homedir(), 'Android', 'Sdk'),
        'C:\\Android\\Sdk',
    ].filter(Boolean);

    for (const sdk of roots) {
        const exe = path.join(sdk, 'platform-tools', 'adb.exe');
        if (fs.existsSync(exe)) return exe;
    }
    return null;
}

/**
 * Friendly diagnosis when no device is attached.
 *
 * WHY THIS EXISTS
 *   Without it, a missing tablet produces a raw Appium error after a 20s
 *   wait: "Could not find a connected Android device in 20000ms", wrapped in
 *   a WebDriver stack trace. That reads like a test bug or an Appium problem
 *   when it is almost always just a cable, a sleeping screen, or a
 *   charge-only port.
 *
 *   This runs `adb devices` first and turns the common cases into one clear
 *   instruction, so we don't waste a session diagnosing a loose cable.
 *
 * @returns true if a device is ready, false otherwise (message already printed)
 */
async function checkDeviceAttached() {
    const { execFileSync } = require('child_process');
    const adb = findAdb();

    if (!adb) {
        console.error(
            '  ❌ Could not find adb.exe.\n'
            + '     Set ANDROID_HOME, or check the SDK path in config.js.\n'
        );
        return false;
    }

    let output = '';
    try {
        output = execFileSync(adb, ['devices'], {
            encoding: 'utf8',
            timeout: 15000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {
        console.error(
            '  ❌ adb did not respond. Try: adb kill-server  then  adb start-server\n'
        );
        return false;
    }

    const rows = output
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean);

    if (rows.length === 0) {
        console.error(
            '  ❌ No Android device attached.\n'
            + '     No tablet is visible over USB. On the tablet, check:\n'
            + '       1. Screen is awake and unlocked\n'
            + '       2. Cable is seated at both ends\n'
            + '       3. Developer options -> USB debugging is ON\n'
            + '       4. Try a different USB port (prefer a rear port on the PC,\n'
            + '          avoid ports on monitors or unpowered hubs)\n'
            + `     Expected udid: ${config.device.udid}\n`
            + '     Then re-run: adb devices -l\n'
        );
        return false;
    }

    const wanted = config.device.udid;
    const ours = rows.find((row) => row.startsWith(wanted));

    if (!ours) {
        console.error(
            '  ❌ A device is attached, but not the one config.js expects.\n'
            + `     Expected: ${wanted}\n`
            + `     Attached: ${rows.join(' | ')}\n`
            + '     Update device.udid in config.js.\n'
        );
        return false;
    }

    if (ours.includes('unauthorized')) {
        console.error(
            '  ❌ The tablet is UNAUTHORIZED.\n'
            + '     Tap "Allow USB debugging?" on the tablet screen.\n'
            + '     Tick "Always allow from this computer" if offered.\n'
        );
        return false;
    }

    if (!ours.includes('device')) {
        console.error(
            '  ❌ The tablet is attached but not ready: '
            + `${ours.split(/\s+/)[1]}\n`
        );
        return false;
    }

    return true;
}

/**
 * True when our app is the one in the foreground.
 *
 * WHY THIS EXISTS
 *   The tablet is shared with another project, and the app has been observed
 *   disappearing mid-run: probe-step2c.js found the Android *launcher* on
 *   screen after a failed `waitForCreateForm`. Something closed the app
 *   between two actions.
 *
 *   On a shared device that is a normal hazard, not a bug to chase. The other
 *   project may close it, Android may reclaim it, or a double open/close of
 *   the Create form may take it down. Either way the fix is the same: notice,
 *   bring it back, and carry on.
 *
 *   Checking this before each major step turns a confusing 20s timeout into a
 *   one-line recovery.
 */
async function appIsForeground(driver) {
    try {
        const current = await driver.getCurrentPackage();
        return current === config.app.package;
    } catch {
        return false;
    }
}

/**
 * Make sure our app is in the foreground, restarting it if it is not.
 *
 * @returns true when the app is up and logged in
 */
async function ensureAppRunning(driver, { attempts = 2 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (await appIsForeground(driver)) {
            if (attempt > 1) {
                console.log('  ✅ App is back in the foreground.');
            }
            return true;
        }

        console.log(
            '  ⚠️  The app is not in the foreground (someone closed it, or it '
            + 'was killed). Restarting it...'
        );
        try {
            await restartApp(driver);
        } catch {
            // fall through to the next attempt
        }
    }

    const pkg = await driver.getCurrentPackage().catch(() => 'unknown');
    throw new Error(
        `Could not bring "${config.app.package}" back to the foreground after `
        + `${attempts} attempts. Currently showing: ${pkg}.`
    );
}

/**
 * Force the app into a full-screen window.
 *
 * WHY THIS EXISTS — a genuine cause of two wasted runs (5-6 Oct 2026)
 *   The tablet is in Android's freeform / desktop mode, so the app opens in a
 *   floating window instead of filling the screen. Measured with
 *   `dumpsys activity activities`:
 *
 *       Task{...} mode=freeform
 *           mBounds=Rect(441, 157 - 1479, 937)     <- only 1038 x 780
 *           mMaxBounds=Rect(0, 0 - 1920, 1200)     <- the real screen
 *
 *   That tiny window is why the date picker appeared to have no buttons. It
 *   was not a picker bug and not a missing accessibility node — the calendar
 *   grid was physically too tall for the window, so the row holding
 *   Cancel/Next was clipped away. The accessibility tree only had 58 nodes and
 *   no Button at all, which looked exactly like a Flutter semantics problem.
 *
 *   Two attempts did NOT work, recorded so nobody repeats them:
 *     - `am start --windowingMode 1 ...` -> "intent has been delivered to
 *       currently running top-most instance"; the existing freeform task is
 *       reused and the flag is ignored.
 *     - `am start ... --task-bound 1920x1200+0+0` -> throws inside
 *       ActivityManagerService (unsupported argument).
 *
 *   What DOES work is a swipe that drags the window's title bar to the screen
 *   edge. Android's desktop mode snaps the window to the full display:
 *       before  mBounds=Rect(441, 157 - 1479, 937)
 *       after   mBounds=Rect(0, 45 - 1920, 1128)
 *
 *   Also note: another app (Chrome) was sitting on top of ours in
 *   freeform mode, so `dumpsys window` reported `mCurrentFocus` as chrome
 *   even after we started our app. Fullscreen mode resolves that too.
 */
async function ensureFullscreen(driver) {
    const { execFileSync } = require('child_process');
    const adb = findAdb();
    if (!adb) return false;

    const run = (args) => execFileSync(adb, args, {
        encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    // Bring our app forward first; a freeform window left behind may not be.
    try { run(['shell', 'am', 'start', '-n', `${config.app.package}/${config.app.activity}`]); } catch {}

    await driver.pause(3000);

    // How big is the REAL display? Ask the device rather than hardcoding
    // 1920x1200 — this tablet could be resized or replaced.
    let maxW = 1920;
    let maxH = 1200;
    try {
        const size = run(['shell', 'wm', 'size']);
        const phys = size.match(/Physical size:\s*(\d+)x(\d+)/);
        if (phys) {
            // Reported portrait; the app is landscape, so swap when taller.
            const a = Number(phys[1]);
            const b = Number(phys[2]);
            maxW = Math.max(a, b);
            maxH = Math.min(a, b);
        }
    } catch {}

    // "Big enough" means the dialogs fit, not pixel-perfect full screen.
    //
    // WHY NOT COMPARE TO THE DISPLAY EXACTLY
    //   A window of 1920x1083 was measured on this tablet with the app
    //   correctly maximised, and the date picker's Apply/Cancel row (y=944 to
    //   1010) fitted inside it with room to spare. The display is 1920x1200, so
    //   demanding 1200px of height made a perfectly usable window report as a
    //   failure and print a misleading "may need maximising by hand".
    //
    //   The thing that actually matters is the freeform floating window, which
    //   measured only 1038x780 — roughly half the width and two thirds of the
    //   height. Anything near full width is fine. 90% is the threshold.
    const bigEnough = (w, h) => w >= maxW * 0.9 && h >= maxH * 0.9;

    // Are we already big enough?
    const info = run(['shell', 'dumpsys', 'activity', 'activities']);
    const bounds = info.match(/mBounds=Rect\((\d+), (\d+) - (\d+), (\d+)\)/);
    if (bounds) {
        const [, x1, y1, x2, y2] = bounds.map(Number);
        const width = x2 - x1;
        const height = y2 - y1;
        if (bigEnough(width, height)) {
            if (width < maxW || height < maxH) {
                log('INFO',
                    `App window is ${width}x${height} of ${maxW}x${maxH} — `
                    + 'large enough for all dialogs.');
            }
            return true;
        }
        log('INFO', `App window is only ${width}x${height} `
            + `(needs about ${Math.round(maxW * 0.9)}x${Math.round(maxH * 0.9)}). `
            + 'Maximising...');
    }

    // Drag the title bar to the top-left corner to trigger the snap.
    try {
        run(['shell', 'input', 'swipe', '900', '160', '200', '20', '300']);
    } catch {
        return false;
    }
    await driver.pause(3000);

    const after = run(['shell', 'dumpsys', 'activity', 'activities']);
    const b2 = after.match(/mBounds=Rect\((\d+), (\d+) - (\d+), (\d+)\)/);
    if (b2) {
        const [, x1, y1, x2, y2] = b2.map(Number);
        const width = x2 - x1;
        const height = y2 - y1;
        if (bigEnough(width, height)) {
            log('INFO', `App window is now ${width}x${height} — large enough.`);
            return true;
        }
        log('INFO', `App window is still ${width}x${height}. `
            + 'It may need maximising by hand — tap the enlarge icon at the '
            + 'top-right of the window title bar.');
    }
    return false;
}

/**
 * Connect to Appium and return the driver.
 */
async function connect() {
    ensureAndroidHome();

    // Fail fast and clearly if the tablet is not attached, instead of waiting
    // out a 20s timeout and printing a WebDriver stack trace.
    if (!(await checkDeviceAttached())) {
        throw new Error('No usable Android device attached. See the message above.');
    }

    const driver = await remote({
        hostname: config.appium.hostname,
        port: config.appium.port,
        path: config.appium.path,
        logLevel: 'error',
        capabilities: {
            platformName: config.device.platformName,
            'appium:automationName': config.device.automationName,
            'appium:udid': config.device.udid,
            'appium:appPackage': config.app.package,
            'appium:appActivity': config.app.activity,
            'appium:noReset': true,          // keep the app's saved session
            'appium:ignoreHiddenApiPolicyError': true,
            'appium:newCommandTimeout': 300,
        },
    });
    return driver;
}

/**
 * Close the session cleanly.
 */
async function quit(driver) {
    if (driver) {
        await driver.deleteSession();
    }
}

/**
 * Stop the app and start it fresh from the launcher.
 *
 * Note on WebdriverIO 8 + Appium "mobile:" commands:
 *   `execute(script, ...args)` passes each argument straight through to
 *   the mobile endpoint, which expects ONE plain object. So the argument
 *   must be an object literal — not a string, and not wrapped in an array.
 *
 *   Wrong: driver.execute('mobile: terminateApp', 'com.x')     // v7 style
 *   Wrong: driver.execute('mobile: terminateApp', ['com.x'])
 *   Right: driver.execute('mobile: terminateApp', { appId: 'com.x' })
 *
 * `resetApp: true` clears app data first — this is what forces a login
 * screen to appear. It also deletes the saved session, so use it with care.
 */
async function restartApp(driver, { resetApp = false } = {}) {
    const component = `${config.app.package}/${config.app.activity}`;

    // Close the app completely.
    await driver.execute('mobile: terminateApp', { appId: config.app.package });

    if (resetApp) {
        // Wipe app data (removes any saved session).
        await driver.execute('mobile: clearApp', { appId: config.app.package });
    }

    // Open it again and wait until the first screen is ready.
    await driver.execute('mobile: startActivity', { component, wait: true });

    await driver.pause(config.timeout.medium);
}

/**
 * Wait for an element to appear, then return it.
 * `selector` uses the same syntax you saw in the docs:
 *   '~Create Transport Order'   -> accessibility id
 *   'android=Text(text)'       -> text
 */
async function waitFor(driver, selector, timeout = config.timeout.long) {
    const element = await driver.$(selector);
    await element.waitForDisplayed({ timeout });
    return element;
}

/**
 * Tap an element by its accessibility id, waiting for it first.
 */
async function tapById(driver, id, timeout = config.timeout.long) {
    const element = await waitFor(driver, `~${id}`, timeout);
    await element.click();
    return element;
}

/**
 * Check whether an element is present, without throwing if it is not.
 * Useful for "optional" checks.
 */
async function isDisplayed(driver, selector, timeout = config.timeout.short) {
    try {
        const element = await driver.$(selector);
        await element.waitForDisplayed({ timeout });
        return true;
    } catch {
        return false;
    }
}

/**
 * Save the current UI tree to dumps/<name>.xml
 * Call this when a test fails so you can see what was on screen.
 */
async function saveDump(driver, name) {
    try {
        if (!fs.existsSync(DUMP_DIR)) {
            fs.mkdirSync(DUMP_DIR, { recursive: true });
        }
        const xml = await driver.getPageSource();
        const file = path.join(DUMP_DIR, `${name}.xml`);
        fs.writeFileSync(file, xml, 'utf8');
        return file;
    } catch (e) {
        return `dump failed: ${e.message}`;
    }
}

/**
 * Save a screenshot to dumps/<name>.png
 */
async function saveScreenshot(driver, name) {
    try {
        if (!fs.existsSync(DUMP_DIR)) {
            fs.mkdirSync(DUMP_DIR, { recursive: true });
        }
        const file = path.join(DUMP_DIR, `${name}.png`);
        await driver.saveScreenshot(file);
        return file;
    } catch (e) {
        return `screenshot failed: ${e.message}`;
    }
}

/**
 * Log a result in a clear, readable way.
 */
function log(status, message) {
    const mark = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️ ';
    console.log(`  ${mark} ${status} — ${message}`);
}

module.exports = {
    ensureAndroidHome,
    checkDeviceAttached,
    ensureFullscreen,
    appIsForeground,
    ensureAppRunning,
    ensureLoggedIn,
    connect,
    quit,
    restartApp,
    waitFor,
    tapById,
    isDisplayed,
    saveDump,
    saveScreenshot,
    log,
};