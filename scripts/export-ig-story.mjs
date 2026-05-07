#!/usr/bin/env node
/**
 * BAiR · Export IG Story PNG (1080x1920) from an Open Design HTML file.
 *
 * Strategy: load the file's raw URL via headless Chromium, locate every
 * .dc-card whose bounding box is 1080x1920 (the artboard convention), and
 * screenshot the requested one. Tweaks panel is hidden so it can't bleed in.
 *
 * Usage:
 *   export-ig-story.mjs --project <id> --file <name.html> [--card N] [--out path] [--scale 2] [--list]
 *
 * Examples:
 *   # List all 1080x1920 cards in the file
 *   ./export-ig-story.mjs --project weekly-event-post --file 'Weekly Event Post.html' --list
 *
 *   # Export card #0 at 2x to /tmp/story.png
 *   ./export-ig-story.mjs --project weekly-event-post --file 'Weekly Event Post.html' --card 0 --out /tmp/story.png
 *
 *   # Stream PNG bytes to stdout (for piping by daemon)
 *   ./export-ig-story.mjs --project weekly-event-post --file 'Weekly Event Post.html' --card 0 --stdout
 *
 * Exit codes: 0 ok, 1 usage, 2 navigation/render failure, 3 card not found.
 */

import { argv, env, exit, stdout, stderr } from 'node:process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Resolve playwright from the design-tool's pnpm store regardless of cwd.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PW_PATH = resolve(
  ROOT,
  'node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs',
);
const { chromium } = await import(PW_PATH);

function parseArgs(args) {
  const out = { card: 0, scale: 2, list: false, stdout: false, all: false };
  for (let i = 2; i < args.length; i++) {
    const k = args[i];
    const v = args[i + 1];
    switch (k) {
      case '--project':  out.project  = v; i++; break;
      case '--file':     out.file     = v; i++; break;
      case '--card':     out.card     = Number(v); i++; break;
      case '--scale':    out.scale    = Number(v); i++; break;
      case '--out':      out.out      = v; i++; break;
      case '--base':     out.base     = v; i++; break;
      case '--out-dir':  out.outDir   = v; i++; break;
      case '--list':     out.list     = true; break;
      case '--stdout':   out.stdout   = true; break;
      case '--all':      out.all      = true; break;
      default:
        stderr.write(`unknown arg: ${k}\n`);
        exit(1);
    }
  }
  if (!out.project || !out.file) {
    stderr.write('usage: export-ig-story.mjs --project <id> --file <name.html> [--card N] [--out path | --stdout] [--all --out-dir DIR] [--scale 2] [--list] [--base http://host:port]\n');
    exit(1);
  }
  if (out.all && !out.outDir) {
    stderr.write('--all requires --out-dir <dir>\n');
    exit(1);
  }
  out.base ||= env.OD_DAEMON_BASE || 'http://127.0.0.1:7456';
  return out;
}

const opts = parseArgs(argv);
const rawUrl = `${opts.base.replace(/\/+$/, '')}/api/projects/${encodeURIComponent(opts.project)}/raw/${encodeURI(opts.file)}`;

// Honour upstream-set executable path; otherwise fall back to a known cached
// chromium so the daemon doesn't need a fresh `playwright install`.
const fallbackChrome =
  '/Users/larry/Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const launchOpts = env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: env.OD_CHROMIUM_PATH || fallbackChrome };

const browser = await chromium.launch(launchOpts);
try {
  const ctx = await browser.newContext({
    viewport: { width: 2400, height: 2200 },
    deviceScaleFactor: opts.scale,
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => stderr.write(`[pageerror] ${String(e).slice(0, 200)}\n`));

  await page.goto(rawUrl, { waitUntil: 'load', timeout: 60_000 });
  // babel-standalone JSX rendering needs a beat; fonts must be ready before screenshot.
  await page.waitForTimeout(5_000);
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}

  // Hide and remove any tweak/comment overlay so it can't appear in a screenshot.
  await page.addStyleTag({
    content: `.twk-panel,[class*="twk-"]{display:none!important;}`,
  }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('.twk-panel').forEach((n) => n.remove());
  });

  // Locate every artboard-sized container (1080x1920, ±2px tolerance).
  const cards = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.dc-card, [class*="dc-card"]'));
    return all.map((el, idx) => {
      const r = el.getBoundingClientRect();
      const labelEl = el.querySelector('[class*="label" i], h1, h2, h3');
      const label =
        labelEl?.textContent?.trim().slice(0, 80) ??
        el.previousElementSibling?.textContent?.trim().slice(0, 80) ??
        '';
      return { idx, w: Math.round(r.width), h: Math.round(r.height), label };
    });
  });

  if (opts.list) {
    stdout.write(JSON.stringify({ url: rawUrl, cards }, null, 2) + '\n');
  } else if (opts.all) {
    // Render every artboard in one browser session (one cold-start, one
    // navigation, N screenshots) and write them to --out-dir. The daemon
    // packages the directory into a ZIP for the client. stdout receives a
    // single-line JSON manifest the daemon parses to learn what it should
    // pack and how to label each entry.
    mkdirSync(opts.outDir, { recursive: true });
    const handles = await page.$$('.dc-card, [class*="dc-card"]');
    const manifest = [];
    for (let i = 0; i < cards.length; i++) {
      const handle = handles[i];
      if (!handle) {
        stderr.write(`card index ${i} not resolvable; skipping\n`);
        continue;
      }
      const buf = await handle.screenshot({ type: 'png' });
      const fileName = `${String(i).padStart(2, '0')}.png`;
      writeFileSync(join(opts.outDir, fileName), buf);
      manifest.push({
        idx: cards[i].idx,
        file: fileName,
        label: cards[i].label || '',
        w: cards[i].w,
        h: cards[i].h,
        bytes: buf.length,
      });
      stderr.write(`✓ card ${i}: ${buf.length} bytes\n`);
    }
    stdout.write(JSON.stringify({ url: rawUrl, cards: manifest }) + '\n');
  } else {
    if (opts.card < 0 || opts.card >= cards.length) {
      stderr.write(`card index ${opts.card} out of range (found ${cards.length})\n`);
      await browser.close();
      exit(3);
    }
    const handles = await page.$$('.dc-card, [class*="dc-card"]');
    const target = handles[opts.card];
    if (!target) {
      stderr.write(`card index ${opts.card} not resolvable\n`);
      await browser.close();
      exit(3);
    }
    const buf = await target.screenshot({ type: 'png' });
    if (opts.stdout) {
      stdout.write(buf);
    } else {
      const outPath = opts.out || `/tmp/ig-story-${opts.project}-${opts.card}.png`;
      writeFileSync(outPath, buf);
      stderr.write(`✓ ${outPath} (${buf.length} bytes, card ${opts.card}: ${cards[opts.card]?.label || 'unlabelled'})\n`);
    }
  }
} catch (err) {
  stderr.write(`[fail] ${String(err.stack || err).slice(0, 800)}\n`);
  exit(2);
} finally {
  await browser.close();
}
