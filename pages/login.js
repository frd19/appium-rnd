/**
 * pages/login.js
 * -------------
 * Actions for the login screen.
 *
 * Screen layout captured from the real device
 * (com.stc.tms.stg.planner v1.0.14, Samsung Tab S9 FE, 1920x1200):
 *
 *   Log in to your account
 *   Welcome back! Please enter your details.
 *   [ Email    ]   <- android.widget.EditText
 *   [ Password ]   <- android.widget.EditText
 *   Forgot password
 *   [ Sign in ]    <- android.widget.Button desc="Sign in"
 *
 * ── TWO THINGS THAT WILL BREAK A NAIVE TEST ──────────────────────────
 *
 * 1. FIELD SELECTION
 *    Neither text field has an accessibility id or hint text, so they
 *    cannot be told apart by name. We select them by POSITION:
 *    first EditText = Email, second = Password.
 *
 * 2. THE SOFT KEYBOARD  (this one cost us a test run)
 *    Tapping a field opens the on-screen keyboard, which resizes the
 *    page and pushes the "Sign in" button off the visible area —
 *    the button is then genuinely absent from the UI tree.
 *    Always dismiss the keyboard before pressing Sign in.
 * ─────────────────────────────────────────────────────────────────────
 */

const { waitFor, log } = require('../helpers/device');

const LoginPage = {
    /** True when the login screen is showing. */
    async isVisible(driver) {
        try {
            const heading = await driver.$('~Log in to your account');
            return await heading.isDisplayed();
        } catch {
            return false;
        }
    },

    /**
     * Wait until the login screen is FULLY rendered.
     *
     * This matters: right after the app starts, the screen exists but is
     * still building. A dump taken too early shows only ONE text field and
     * no buttons, so `findSignInButton` would fail even though the screen
     * is fine. We therefore wait until BOTH fields AND the Sign in button
     * are present before returning.
     */
    async waitForScreen(driver, timeout = 20000) {
        const heading = await waitFor(driver, '~Log in to your account', timeout);

        // Wait for the form to finish rendering.
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            try {
                const fields = await driver.$$('//android.widget.EditText');
                if ((await fields.length) >= 2) {
                    const button = await driver.$('~Sign in');
                    if (await button.isDisplayed()) {
                        return heading;
                    }
                }
            } catch {
                // still rendering
            }
            await driver.pause(700);
        }

        throw new Error('Login screen did not finish loading.');
    },

    /** True when the Kanban board (app home) is showing. */
    async isLoggedIn(driver) {
        try {
            const board = await driver.$('~Dispatching');
            return await board.isDisplayed();
        } catch {
            return false;
        }
    },

    /**
     * Close the on-screen keyboard if it is open.
     *
     * WHY THE CAREFUL FALLBACK MATTERS
     *   The usual fallback for "hide the keyboard" is to press BACK, which
     *   hides the keyboard without navigating. That is only true WHILE a
     *   keyboard is showing.
     *
     *   This app has no back handler — pressing BACK with no keyboard on
     *   screen EXITS the app and drops you at the launcher. We verified
     *   this on the device: a stray BACK took us out of the app entirely.
     *
     *   So the BACK key is only sent when a keyboard is actually open.
     */
    async hideKeyboard(driver) {
        try {
            await driver.execute('mobile: hideKeyboard');
        } catch {
            // 'mobile: hideKeyboard' is not available on every driver
            // version. Fall back to BACK, but only if a keyboard is up.
            try {
                const shown = await driver.isKeyboardShown();
                if (shown) {
                    await driver.back();
                }
            } catch {
                // ignore — the button may still be reachable
            }
        }
        await driver.pause(800);
    },

    /** Find the "Sign in" button, scrolling it into view if needed. */
    async findSignInButton(driver, timeout = 15000) {
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
            try {
                const button = await driver.$('~Sign in');
                if (await button.isDisplayed()) {
                    return button;
                }
            } catch {
                // not present right now
            }

            // Button is missing — the keyboard is probably covering it.
            await this.hideKeyboard(driver);

            try {
                const button = await driver.$('~Sign in');
                if (await button.isDisplayed()) {
                    return button;
                }
            } catch {
                // still missing, loop and retry
            }
            await driver.pause(500);
        }

        throw new Error('Could not find the "Sign in" button.');
    },

    /**
     * Fill Email and Password.
     *
     * WHY WE RE-FIND THE FIELDS EACH TIME
     *   Typing into the first field opens the on-screen keyboard, which
     *   RESIZES the page. Every element reference obtained before that is
     *   then stale, and writing to it silently goes nowhere — the field
     *   stays empty and the app reports "Password is required".
     *
     *   So: locate one field, type, dismiss the keyboard, then locate the
     *   next field fresh.
     *
     * FIELD IDENTIFICATION
     *   The password field is marked password="true" in the UI tree, so we
     *   can find it directly instead of relying on it being the 2nd field.
     */
    async fillCredentials(driver, email, password) {
        const EMAIL_XPATH = '//android.widget.EditText[@password="false"]';
        const PASSWORD_XPATH = '//android.widget.EditText[@password="true"]';

        // --- Email ---
        const emailField = await waitFor(driver, EMAIL_XPATH, 15000);
        await emailField.click();
        await emailField.setValue(email);
        await this.hideKeyboard(driver);

        // Re-find both fields: the keyboard may have moved them.
        const passwordField = await waitFor(driver, PASSWORD_XPATH, 15000);
        await passwordField.click();
        await passwordField.setValue(password);
        await this.hideKeyboard(driver);

        // Verify both landed before we try to submit, so any failure
        // points at the real cause instead of a confusing app error.
        const verify = await this.readFields(driver);
        if (verify.email !== email) {
            throw new Error(
                `Email was not entered correctly. Read back: "${verify.email}"`
            );
        }
        if (verify.passwordLength === 0) {
            throw new Error(
                'Password field is empty. '
                + 'The keyboard may have covered the field when it was typed into.'
            );
        }
    },

    /**
     * Read back what is currently in the two fields.
     * Returns { email, passwordLength }.
     *
     * NOTE: we use getAttribute('text'), NOT getValue().
     * This driver rejects 'value' with:
     *   "'value' attribute is unknown for the element"
     * For a password field the text is masked (dots), so we only
     * compare that something was entered, not the real content.
     */
    async readFields(driver) {
        const result = { email: '', passwordLength: 0 };

        try {
            const emailField = await driver.$(
                '//android.widget.EditText[@password="false"]'
            );
            result.email = (await emailField.getAttribute('text')) || '';
        } catch {
            // leave blank
        }

        try {
            const passwordField = await driver.$(
                '//android.widget.EditText[@password="true"]'
            );
            const value = await passwordField.getAttribute('text');
            result.passwordLength = value ? value.length : 0;
        } catch {
            // leave 0
        }

        return result;
    },

    /** Fill the fields and sign in. */
    async login(driver, email, password) {
        await this.fillCredentials(driver, email, password);
        const button = await this.findSignInButton(driver);
        await button.click();
    },

    /**
     * Press Sign in and wait for the board to appear.
     * Returns true if login succeeded.
     */
    async submitAndWait(driver, timeout = 20000) {
        const button = await this.findSignInButton(driver);
        await button.click();

        // Poll until the board shows or the timeout runs out.
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            if (await this.isLoggedIn(driver)) {
                return true;
            }
            await driver.pause(1000);
        }
        return false;
    },

    /** Read the error message shown on a failed login, if any. */
    async errorMessage(driver) {
        const candidates = [
            'Invalid email or password',
            'Email or password is incorrect',
            'Wrong password',
            'Please fill in all fields',
            'Email is required',
            'Password is required',
        ];

        for (const text of candidates) {
            try {
                const el = await driver.$(`~${text}`);
                if (await el.isDisplayed()) {
                    return text;
                }
            } catch {
                // keep checking
            }
        }
        return null;
    },
};

module.exports = LoginPage;