import { chromium, expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../../apps/google-docs-extension/dist", import.meta.url));
const liveDocUrl = process.env.AMPER_LIVE_DOCS_URL;

test.skip(!liveDocUrl, "Set AMPER_LIVE_DOCS_URL to a disposable, editable Google Doc for live formatting verification.");

test("real Google Doc formats simple fractions natively, protects slash text, and restores syntax", async () => {
  // Dozens of real keystroke round trips through Docs; the 30 s default is for local pages.
  test.setTimeout(300_000);
  const output = mkdtempSync(join(tmpdir(), "amper-live-docs-"));
  const context = await chromium.launchPersistentContext(join(output, "profile"), {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const docId = liveDocUrl?.match(/^https:\/\/docs\.google\.com\/document\/d\/([\w-]+)\//)?.[1];
  expect(docId).toBeTruthy();
  const marker = `AmperFormatting${Date.now()}`;
  const endMarker = `AmperFinish${Date.now()}`;
  let cleanupBlock: (() => Promise<void>) | undefined;
  const exportState = async (name: string) => {
    const response = await context.request.get(`https://docs.google.com/document/d/${docId}/export?format=docx`);
    expect(response.ok()).toBe(true);
    const path = join(output, `${name}.docx`);
    writeFileSync(path, await response.body());
    const xml = execFileSync("unzip", ["-p", path, "word/document.xml"], { encoding: "utf8" });
    writeFileSync(join(output, `${name}.xml`), xml);
    return xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  };
  try {
    const extensionPage = await context.newPage();
    await extensionPage.goto("chrome://extensions");
    const extensionId = await extensionPage.evaluate(async () => (await chrome.management.getAll()).find((item) => item.name === "Amper")?.id);
    expect(extensionId, "production Amper extension must load").toBeTruthy();
    await context.addInitScript(() => {
      if (window.top !== window) return;
      const events: { type: string; detail: unknown }[] = [];
      Object.defineProperty(window, "__amperLiveEvents", { value: events });
      document.addEventListener("amper:bridge-active", (event) => {
        events.push({ type: "active", detail: (event as CustomEvent).detail });
      });
    });

    const page = await context.newPage();
    await page.goto(liveDocUrl!, { waitUntil: "domcontentloaded" });
    await page.locator("iframe.docs-texteventtarget-iframe").waitFor({ timeout: 45_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const enable = popup.getByRole("button", { name: "Enable Amper", exact: true });
    await expect(enable).toBeVisible({ timeout: 15_000 });
    await enable.click();
    await expect(popup.locator("#consentDisclosure")).toBeHidden({ timeout: 15_000 });
    await expect(popup.locator("#enabled")).toBeChecked({ timeout: 15_000 });
    await popup.close();
    await extensionPage.close();

    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { __amperLiveEvents: { type: string; detail: unknown }[] }).__amperLiveEvents.some(
        (event) => event.type === "active" && event.detail === true,
      ),
    ), { timeout: 20_000 }).toBe(true);
    await page.waitForTimeout(4_000);
    await page.mouse.click(600, 180);

    const call = async (request: { op: string; count?: number; key?: string }) => page.evaluate((payload) => {
      let raw: string | undefined;
      const listener = (event: Event) => { raw = (event as CustomEvent<string>).detail; };
      document.addEventListener("amper:bridge-response", listener);
      document.dispatchEvent(new CustomEvent("amper:bridge-request", { detail: JSON.stringify(payload) }));
      document.removeEventListener("amper:bridge-response", listener);
      return raw ? JSON.parse(raw) as { ok: boolean; text?: string | null; error?: string } : { ok: false, error: "no bridge response" };
    }, request);

    await expect.poll(() => call({ op: "ping" }), { timeout: 20_000 }).toEqual({ ok: true });
    const baseline = await exportState("starting-state");
    console.log(`Live formatting starting state recorded before edits: ${output}; ${baseline.length} paragraphs`);
    // Append our own bracketed block. Older AmperBase lines are never selected for deletion.
    await call({ op: "moveRight", count: 8192 });
    await page.keyboard.press("Enter");
    await page.keyboard.type(marker);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type(endMarker);
    const testEnd = async () => {
      await call({ op: "moveRight", count: 8192 });
      await call({ op: "selectBack", count: endMarker.length });
      expect((await call({ op: "copySelection" })).text).toBe(endMarker);
      await call({ op: "moveRight", count: 1 });
      await call({ op: "moveLeft", count: endMarker.length + 1 });
    };
    cleanupBlock = async () => {
      const before = await exportState("before-cleanup");
      expect(before.slice(0, baseline.length)).toEqual(baseline);
      await call({ op: "moveRight", count: 8192 });
      let deleted = false;
      for (let n = 0; n < 2048; n++) {
        await call({ op: "selectBack", count: 1 });
        const text = ((await call({ op: "copySelection" })).text ?? "")
          .replaceAll("\u00a0", " ").replace(/\r\n?|\u000b/g, "\n").replace(/\n$/, "");
        if (!text.startsWith(marker + "\n") || !text.endsWith("\n" + endMarker)) continue;
        await page.keyboard.press("Delete");
        deleted = true;
        break;
      }
      if (!deleted) {
        console.log(`Cleanup stopped safely; own marked block remains: ${marker}`);
        return;
      }
      await page.waitForTimeout(4000);
      const afterRange = await exportState("after-range-deletion");
      expect(afterRange.slice(0, baseline.length)).toEqual(baseline);
      if (afterRange.length === baseline.length + 1 && !/<(?:w|m):t\b/.test(afterRange.at(-1)!)) {
        await page.keyboard.press("Backspace");
      }
      await page.waitForTimeout(4000);
      expect(await exportState("after-cleanup")).toEqual(baseline);
      console.log("Live formatting cleanup verified: exact starting paragraphs, no residue");
    };
    await testEnd();

    // Playwright types characters outside the US layout ("°") as a bare text insertion with no
    // keydown. A real layout key (⌥⇧8 on macOS) sends a trusted keydown with that key, so send one.
    const cdp = await context.newCDPSession(page);
    const typeLikeKeyboard = async (text: string) => {
      for (const ch of text) {
        if (/^[A-Z]$/.test(ch)) {
          // A real capital: Shift goes down first (Playwright's type() sends only the letter).
          await page.keyboard.down("Shift");
          await page.keyboard.press(`Key${ch}`);
          await page.keyboard.up("Shift");
        } else if (/^[\x20-\x7e]$/.test(ch)) {
          await page.keyboard.type(ch);
        } else {
          await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch });
          await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
        }
      }
    };

    const readTail = async (length: number) => {
      await call({ op: "selectBack", count: length });
      const result = await call({ op: "copySelection" });
      await call({ op: "moveRight", count: 1 });
      return result.text ?? "";
    };
    const selectedHtml = async (offsetFromEnd: number, length: number) => {
      if (offsetFromEnd) await call({ op: "moveLeft", count: offsetFromEnd });
      await call({ op: "selectBack", count: length });
      const result = await call({ op: "copySelectionHtml" });
      await call({ op: "moveRight", count: 1 });
      if (offsetFromEnd) await call({ op: "moveRight", count: offsetFromEnd });
      return result.text ?? "";
    };
    const effectiveAlign = (html: string) =>
      [...html.matchAll(/vertical-align\s*:\s*(sub|super|baseline)/gi)].at(-1)?.[1]?.toLowerCase() ?? "unknown";
    /** Every glyph in the selection is baseline (no sub/super anywhere, unlike effectiveAlign). */
    const allBaseline = (html: string) => !/vertical-align\s*:\s*(sub|super)/i.test(html) && !/<su[bp]\b/i.test(html);
    let completedChecks = 0;
    const clearExact = async (expectedTestSuffix: string) => {
      await call({ op: "selectBack", count: expectedTestSuffix.length });
      expect((await call({ op: "copySelection" })).text).toBe(expectedTestSuffix);
      await page.keyboard.press("Delete");
      // Bridge selection keys are synthetic and do not reset the extension's
      // trusted typing shadow; a real canvas click restores that boundary.
      await page.mouse.click(600, 180);
      await testEnd();
      completedChecks++;
    };
    // The shared test Doc may have a script-styled caret from earlier checks.
    // Normalize only the typing style at the end and verify a fresh baseline probe.
    const baselineProbe = "AmperBase ";
    await page.keyboard.type(baselineProbe);
    const initialProbeHtml = await selectedHtml(1, "AmperBase".length);
    const initialAlign = effectiveAlign(initialProbeHtml);
    await clearExact(baselineProbe);
    if (initialAlign === "sub" || initialAlign === "super") {
      await call({ op: initialAlign === "sub" ? "toggleSubscript" : "toggleSuperscript" });
    }
    await page.keyboard.type(baselineProbe);
    const baselineProbeHtml = await selectedHtml(1, "AmperBase".length);
    expect(effectiveAlign(baselineProbeHtml)).toBe("baseline");
    await clearExact(baselineProbe);

    // Bare a/b fractions are suggestion-only: they must not change on Space, and Tab applies
    // the native fraction (superscript numerator, baseline U+2044, subscript denominator).
    const cases = [
      { typed: "5/4", visible: "5⁄4", numerator: "5", denominator: "4" },
      { typed: "12/24", visible: "12⁄24", numerator: "12", denominator: "24" },
      { typed: "3/y", visible: "3⁄y", numerator: "3", denominator: "y" },
      { typed: "x/2", visible: "x⁄2", numerator: "x", denominator: "2" },
      { typed: "x/y", visible: "x⁄y", numerator: "x", denominator: "y" },
    ];

    for (const item of cases) {
      await page.keyboard.type(`${item.typed} `);
      await page.waitForTimeout(600);
      // Not rewritten on Space.
      expect(await readTail(item.typed.length + 1), `${item.typed}: bare slash must not auto-convert`).toBe(`${item.typed} `);
      // Tab accepts the offered fraction.
      await page.keyboard.press("Tab");
      await expect.poll(() => readTail(item.visible.length + 1), { timeout: 15_000 }).toBe(`${item.visible} `);
      await page.keyboard.type("tail ");
      await page.waitForTimeout(300);
      const suffix = `${item.visible} tail `;
      await expect.poll(() => readTail(suffix.length), { timeout: 15_000 }).toBe(suffix);
      const numeratorHtml = await selectedHtml(suffix.length - item.numerator.length, item.numerator.length);
      expect(effectiveAlign(numeratorHtml), `${item.typed}: numerator`).toBe("super");
      const slashIndex = item.numerator.length;
      expect(effectiveAlign(await selectedHtml(suffix.length - slashIndex - 1, 1)), `${item.typed}: fraction slash`).toBe("baseline");
      const denominatorEnd = slashIndex + 1 + item.denominator.length;
      expect(effectiveAlign(await selectedHtml(suffix.length - denominatorEnd, item.denominator.length)), `${item.typed}: denominator`).toBe("sub");
      expect(allBaseline(await selectedHtml(1, "tail".length)), `${item.typed}: every following character stays baseline`).toBe(true);
      await clearExact(suffix);
    }

    // Backspace right after accepting restores the exact bare shorthand.
    for (const restoreCase of cases.slice(0, 2)) {
      await page.keyboard.type(`${restoreCase.typed} `);
      await page.waitForTimeout(600);
      await page.keyboard.press("Tab");
      await expect.poll(() => readTail(restoreCase.visible.length + 1), { timeout: 15_000 }).toBe(`${restoreCase.visible} `);
      await page.keyboard.press("Backspace");
      await expect.poll(() => readTail(restoreCase.typed.length + 1), { timeout: 15_000 }).toBe(`${restoreCase.typed} `);
      expect(allBaseline(await selectedHtml(1, restoreCase.typed.length)), `${restoreCase.typed}: restored source is plain text`).toBe(true);
      await clearExact(`${restoreCase.typed} `);
    }

    const protectedText = "https://example.com/x/y /tmp/x/y 2026/10/06 and/or n/a const x/y km/h m/s β/γ ";
    await page.keyboard.type(protectedText);
    await page.waitForTimeout(250);
    await expect.poll(() => readTail(protectedText.length), { timeout: 15_000 }).toBe(protectedText);
    expect(allBaseline(await selectedHtml(1, protectedText.length - 1)), "protected text stays plain").toBe(true);
    await clearExact(protectedText);

    // Explicit formatting commands and temperature shortcuts. Docs reports each range's
    // alignment itself, through the clipboard HTML of a real selection.
    const explicitCases: { typed: string; visible: string; spans: { text: string; align: "super" | "sub" }[]; baseline?: string[] }[] = [
      { typed: "x sup(2)", visible: "x2", spans: [{ text: "2", align: "super" }] },
      { typed: "E sup(activation energy)", visible: "Eactivation energy", spans: [{ text: "activation energy", align: "super" }] },
      { typed: "V sub(max)", visible: "Vmax", spans: [{ text: "max", align: "sub" }] },
      { typed: "H sub(formation of methane)", visible: "Hformation of methane", spans: [{ text: "formation of methane", align: "sub" }] },
      { typed: "frac(x/y)", visible: "x⁄y", spans: [{ text: "x", align: "super" }, { text: "y", align: "sub" }] },
      { typed: "frac(12/24)", visible: "12⁄24", spans: [{ text: "12", align: "super" }, { text: "24", align: "sub" }] },
      // The spacing typed around the slash is kept, at baseline.
      { typed: "frac(x / y)", visible: "x ⁄ y", spans: [{ text: "x", align: "super" }, { text: "y", align: "sub" }], baseline: [" ⁄ "] },
      { typed: "25degC", visible: "25°C", spans: [] },
      { typed: "72degF", visible: "72°F", spans: [] },
      // Compound fractions: the whole operands are kept, only inner sub(...) content is lowered.
      {
        typed: "frac(P sub(0.5 atm) / P sub(1 bar))",
        visible: "P0.5 atm ⁄ P1 bar",
        spans: [{ text: "0.5 atm", align: "sub" }, { text: "1 bar", align: "sub" }],
        baseline: ["P", " ⁄ ", "P"],
      },
      {
        typed: "frac(T sub(0°C) / T sub(25°C))",
        visible: "T0°C ⁄ T25°C",
        spans: [{ text: "0°C", align: "sub" }, { text: "25°C", align: "sub" }],
        baseline: ["T", " ⁄ ", "T"],
      },
      {
        typed: "frac(n sub(1) / n sub(2))",
        visible: "n1 ⁄ n2",
        spans: [{ text: "1", align: "sub" }, { text: "2", align: "sub" }],
        baseline: ["n", " ⁄ ", "n"],
      },
    ];
    // Docs capitalises the first word of a paragraph ("x " → "X "); a lead word keeps each case mid-sentence.
    const lead = "AmperBase ";
    for (const item of explicitCases) {
      const suffix = `${item.visible} tail `;
      expect(suffix, "kelvin never gets a degree sign").not.toContain("°K");
      await typeLikeKeyboard(`${lead}${item.typed} tail `);
      await page.waitForTimeout(400);
      // Delimiters and keywords are gone from the visible text.
      await expect.poll(() => readTail(suffix.length), { timeout: 15_000 }).toBe(suffix);
      let searchFromInItem = 0;
      for (const span of item.spans) {
        const start = item.visible.indexOf(span.text, searchFromInItem);
        expect(start, `${item.typed}: ${span.text}`).toBeGreaterThanOrEqual(0);
        searchFromInItem = start + span.text.length;
        const html = await selectedHtml(suffix.length - (start + span.text.length), span.text.length);
        expect(effectiveAlign(html), `${item.typed}: "${span.text}" alignment`).toBe(span.align);
      }
      let searchBaseline = 0;
      for (const text of item.baseline ?? []) {
        const start = item.visible.indexOf(text, searchBaseline);
        expect(start, `${item.typed}: ${text}`).toBeGreaterThanOrEqual(0);
        searchBaseline = start + text.length;
        const html = await selectedHtml(suffix.length - (start + text.length), text.length);
        expect(allBaseline(html), `${item.typed}: "${text}" stays baseline`).toBe(true);
      }
      // The character before the formatted content and the following text stay baseline.
      if (item.spans.length) {
        const firstStart = item.visible.indexOf(item.spans[0]!.text);
        if (firstStart > 0) expect(effectiveAlign(await selectedHtml(suffix.length - firstStart, 1)), `${item.typed}: base`).toBe("baseline");
      }
      expect(allBaseline(await selectedHtml(1, "tail".length)), `${item.typed}: every following character stays baseline`).toBe(true);
      await clearExact(`${lead}${suffix}`);
    }

    // Immediate Backspace restores the exact shorthand.
    for (const item of explicitCases) {
      await typeLikeKeyboard(`${lead}${item.typed} `);
      await page.waitForTimeout(300);
      await expect.poll(() => readTail(item.visible.length + 1), { timeout: 15_000 }).toBe(`${item.visible} `);
      await page.keyboard.press("Backspace");
      await expect.poll(() => readTail(item.typed.length), { timeout: 15_000 }).toBe(item.typed);
      expect(allBaseline(await selectedHtml(0, item.typed.length)), `${item.typed}: restored shorthand is plain text`).toBe(true);
      await clearExact(`${lead}${item.typed}`);
    }

    // The caret is baseline after every native formatting path: the very next typed word, including
    // a Shift-modified capital, is ordinary text, and so is text typed after a Backspace restore.
    const followingCases: { typed: string; visible: string; tab?: boolean }[] = [
      { typed: "x sup(2)", visible: "x2" },
      { typed: "V sub(max)", visible: "Vmax" },
      { typed: "x^2", visible: "x²" },
      { typed: "x_2", visible: "x₂" },
      { typed: "x^(effective)", visible: "xeffective" },
      { typed: "x_(max)", visible: "xmax" },
      { typed: "frac(x/y)", visible: "x⁄y" },
      { typed: "frac(P sub(0.5 atm) / P sub(1 bar))", visible: "P0.5 atm ⁄ P1 bar" },
      { typed: "H2O(l)", visible: "H₂O(l)" },
      { typed: "5/4", visible: "5⁄4", tab: true },
    ];
    for (const item of followingCases) {
      for (const next of ["Next", "next"]) {
        const suffix = `${item.visible} ${next} `;
        await typeLikeKeyboard(`${lead}${item.typed} `);
        await page.waitForTimeout(400);
        if (item.tab) {
          await page.keyboard.press("Tab");
          await expect.poll(() => readTail(item.visible.length + 1), { timeout: 15_000 }).toBe(`${item.visible} `);
        }
        await typeLikeKeyboard(`${next} `);
        await page.waitForTimeout(300);
        await expect.poll(() => readTail(suffix.length), { timeout: 15_000 }).toBe(suffix);
        expect(allBaseline(await selectedHtml(1, next.length)), `${item.typed} then "${next}": following text is baseline`).toBe(true);
        await clearExact(`${lead}${suffix}`);
      }
      // Backspace restore, then the next word: both baseline.
      if (item.typed === item.visible) continue;
      await typeLikeKeyboard(`${lead}${item.typed} `);
      await page.waitForTimeout(400);
      if (item.tab) {
        await page.keyboard.press("Tab");
        await expect.poll(() => readTail(item.visible.length + 1), { timeout: 15_000 }).toBe(`${item.visible} `);
      }
      await page.keyboard.press("Backspace");
      const restored = item.tab ? `${item.typed} ` : item.typed;
      await expect.poll(() => readTail(restored.length), { timeout: 15_000 }).toBe(restored);
      expect(allBaseline(await selectedHtml(0, restored.length)), `${item.typed}: restored shorthand is baseline`).toBe(true);
      const afterRestore = item.tab ? "Next " : " Next ";
      await typeLikeKeyboard(afterRestore);
      await page.waitForTimeout(300);
      await expect.poll(() => readTail(restored.length + afterRestore.length), { timeout: 15_000 }).toBe(restored + afterRestore);
      expect(allBaseline(await selectedHtml(1, "Next".length)), `${item.typed}: text after a restore is baseline`).toBe(true);
      await clearExact(`${lead}${restored}${afterRestore}`);
    }

    // Existing chemistry still works alongside the new shortcuts.
    const chemistry = "H2SO4 SO4^2- ^14C equi sigma ";
    const chemistryVisible = "H₂SO₄ SO₄²⁻ ¹⁴C ⇌ σ ";
    await page.keyboard.type(chemistry);
    await page.waitForTimeout(400);
    await expect.poll(() => readTail(chemistryVisible.length), { timeout: 15_000 }).toBe(chemistryVisible);
    await clearExact(chemistryVisible);

    // Check each chemistry/symbol shortcut independently, including baseline text and exact restore.
    for (const [typed, visible] of [
      ["H2SO4", "H₂SO₄"], ["SO4^2-", "SO₄²⁻"], ["^14C", "¹⁴C"], ["equi", "⇌"], ["sigma", "σ"],
    ] as const) {
      await typeLikeKeyboard(`${lead}${typed} Next `);
      await page.waitForTimeout(300);
      await expect.poll(() => readTail(`${visible} Next `.length), { timeout: 15_000 }).toBe(`${visible} Next `);
      expect(allBaseline(await selectedHtml(1, "Next".length)), `${typed}: following text stays baseline`).toBe(true);
      await clearExact(`${lead}${visible} Next `);

      await typeLikeKeyboard(`${lead}${typed} `);
      // These selection probes move the real caret. Let the deferred boundary rewrite
      // finish first, as in the existing cases, rather than racing it with selectBack.
      await page.waitForTimeout(300);
      await expect.poll(() => readTail(visible.length + 1), { timeout: 15_000 }).toBe(`${visible} `);
      await page.keyboard.press("Backspace");
      await expect.poll(() => readTail(typed.length), { timeout: 15_000 }).toBe(typed);
      expect(allBaseline(await selectedHtml(0, typed.length)), `${typed}: exact restored source stays baseline`).toBe(true);
      await typeLikeKeyboard(" Next ");
      await page.waitForTimeout(300);
      await expect.poll(() => readTail(`${typed} Next `.length), { timeout: 15_000 }).toBe(`${typed} Next `);
      expect(allBaseline(await selectedHtml(1, "Next".length)), `${typed}: text after restore stays baseline`).toBe(true);
      await clearExact(`${lead}${typed} Next `);
    }

    console.log(`Live formatting: all ${completedChecks} scenario checks passed`);

  } finally {
    try {
      await cleanupBlock?.();
    } finally {
      await context.close();
    }
  }
});
