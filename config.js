/**
 * config.js
 * ----------
 * All settings for your Appium tests live here.
 * If you change phone, app, or account, you only edit THIS file.
 */

module.exports = {
    // ---- Appium server ----
    appium: {
        hostname: '127.0.0.1',
        port: 4723,
        path: '/',
    },

    // ---- Your physical device ----
    // Get this value by running: adb devices
    device: {
        udid: 'RRGL707WSTA', // <-- change this if you connect a different phone/tablet
        platformName: 'Android',
        automationName: 'UiAutomator2',
    },

    // ---- The application under test ----
    app: {
        package: 'com.stc.tms.stg.planner',
        activity: 'com.stc.tms.planner.MainActivity',
    },

    // ---- Test account (from test case Test-01) ----
    //
    // Only TWO email addresses are valid on this staging build, confirmed by
    // the tester:
    //     om@gmail.com
    //     ruslijun@gmail.com
    // Anything else is rejected at login.
    //
    // Known quirk: after logging in as om@gmail.com the app header still
    // shows "Rusli Junaidi\nruslijun@gmail.com". That is a staging
    // behaviour, not a test bug — the login itself succeeds.
    user: {
        email: 'om@gmail.com',
        password: 'Password123!',
        validEmails: ['om@gmail.com', 'ruslijun@gmail.com'],
    },

    // ---- Wait times (milliseconds) ----
    timeout: {
        short: 5000,   // small wait, e.g. after a simple tap
        medium: 10000, // wait for a screen to load
        long: 20000,   // wait for network / long operations
    },

    // ---- Always dump the UI tree when a test fails ----
    // Makes debugging much easier: it saves the screen as XML.
    dumpOnFailure: true,
};