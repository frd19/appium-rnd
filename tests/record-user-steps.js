/**
 * tests/record-user-steps.js
 * --------------------------
 * THROWAWAY utility. Records what a human does on the tablet so it can be
 * turned into automation afterwards.
 *
 *   node tests/record-user-steps.js [minutes]
 *
 * HOW IT WORKS
 *   Every 1.5s it runs `adb shell uiautomator dump`, reads every labelled node
 *   plus every EditText value, and fingerprints the screen. When the
 *   fingerprint CHANGES, the new state (labels, classes, bounds) is appended
 *   to fleet-sla-record.txt with a timestamp. Unchanged screens are skipped,
 *   so the log is a readable list of the actual transitions the person made.
 *
 * WHY THIS EXISTED (6 Oct)
 *   The tester's Fleet-and-SLA flow has never been automated: pick-up and drop
 *   point are 3-step searchable autocompletes, Stand by Time is the clock-face
 *   dial, Product Group has unknown captions and unit dropdowns. Rather than
 *   script from a description, record the real interaction and replay it.
 *
 * READ-ONLY. It never injects input — a dump cannot disturb what the person
 * is doing on the shared tablet.
 *
 * Stop with Ctrl+C. The log is written continuously, so nothing is lost.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

const ADB = `${process.env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`;
const LOG = process.env.RECORD_LOG || 'fleet-sla-record.txt';
const INTERVAL_MS = 1500;
const minutes = Number(process.argv[2]) || 20;
const deadline = Date.now() + minutes * 60 * 1000;

function pad(n) {
    return String(n).padStart(2, '0');
}

function stamp() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Parse the XML tree into a list of {label, cls, bounds, text}. */
function parseDump(xml) {
    const nodes = [];
    const re = /<node\b[^>]*>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const n = m[0];
        const attr = (name) => {
            const mm = n.match(new RegExp(`${name}="([^"]*)"`));
            return mm ? mm[1] : '';
        };
        const label = attr('content-desc');
        const text = attr('text');
        const cls = attr('class').split('.').pop();
        const bounds = attr('bounds');
        if (label || text) {
            nodes.push({ label, text, cls, bounds });
        }
    }
    return nodes;
}

/** A stable fingerprint — labels + texts, sorted. */
function signature(nodes) {
    return nodes
        .map((n) => `${n.label}▮${n.text}`)
        .sort()
        .join('\n');
}

function readScreen() {
    const raw = execFileSync(ADB, [
        'shell', 'uiautomator', 'dump', '/sdcard/rec.xml',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .toString();
    const local = execFileSync(ADB, [
        'pull', '/sdcard/rec.xml', `${process.cwd()}\\dumps\\rec.xml`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .toString();
    const xml = fs.readFileSync(`${process.cwd()}\\dumps\\rec.xml`, 'utf8');
    return parseDump(xml);
}

function fmtEntry(nodes) {
    const paths = [];
    for (const n of nodes) {
        const label = n.label || `«${n.text}»`;
        paths.push(`      ${n.cls.padEnd(14)} ${label.replace(/\n/g, ' · ')}`
            + `  ${n.bounds}`);
    }
    return paths.join('\n');
}

function hhmm() {
    const d = new Date();
    return `${d.getHours()}:${d.getMinutes()}`;
}

function main() {
    console.log(`Recording screen up to ${minutes} min (Ctrl+C to stop).`);
    console.log(`Log: ${LOG}\n`);
    fs.writeFileSync(LOG,
        `# Fleet & SLA manual walkthrough — recorded ${new Date().toISOString()}\n`
        + `# started ~${hhmm()}\n\n`, 'utf8');

    let lastSig = '';
    let lastGroups = [];
    let changed = 0;

    const step = () => {
        try {
            const nodes = readScreen();
            const sig = signature(nodes);
            if (sig !== lastSig) {
                changed += 1;
                const entry = `[${stamp()}] state ${changed}\n${fmtEntry(nodes)}\n`;
                fs.appendFileSync(LOG, entry, 'utf8');
                console.log(entry);
                lastSig = sig;
                lastGroups = nodes;
            }
        } catch (e) {
            // A dump can race the app; skip a tick rather than die.
            console.log(`  (skip: ${e.message.split('\n')[0]})`);
        }
    };

    step();

    const timer = setInterval(() => {
        if (Date.now() > deadline) {
            clearInterval(timer);
            console.log(`\nRecording finished — ${changed} state change(s) in `
                + `${LOG}.`);
            process.exit(0);
        }
        step();
    }, INTERVAL_MS);

    process.on('SIGINT', () => {
        clearInterval(timer);
        console.log(`\nStopped by hand — ${changed} state change(s) in ${LOG}.`);
        process.exit(0);
    });
}

main();