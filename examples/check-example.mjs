// Headless check for one element example: renders /examples/<element>/,
// reports console errors, computed ink/font, the focused element after Tab,
// and saves examples/<element>.png.
//
//   npm run dev
//   node examples/check-example.mjs compost-knob [port]
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
// A worktree under .claude/worktrees/<name> borrows the main checkout's modules.
const playwrightPath = ["node_modules", "../../../node_modules"]
	.map((dir) => resolve(root, dir, "playwright/index.mjs"))
	.find((path) => existsSync(path));
if (!playwrightPath) {
	console.error("playwright not found: run npm install in the repository");
	process.exit(1);
}
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const el = process.argv[2] || "compost-knob";
const port = process.argv[3] || "8000";
const browser = await chromium.launch();
const page = await (
	await browser.newContext({ viewport: { width: 1000, height: 900 } })
).newPage();
const errors = [];
page.on("console", (message) => {
	if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(String(error)));
const response = await page.goto(`http://127.0.0.1:${port}/examples/${el}/`);
await page.waitForTimeout(500);
const info = await page.evaluate(
	(el) =>
		[...document.querySelectorAll("section")].map((section) => {
			const element = section.querySelector(el);
			if (!element) return { ctx: section.className, missing: true };
			const host = getComputedStyle(element);
			const box = element.getBoundingClientRect();
			return {
				ctx: section.className,
				color: host.color,
				font: host.fontFamily.split(",")[0],
				size: host.fontSize,
				w: Math.round(box.width),
				h: Math.round(box.height),
			};
		}),
	el,
);
await page.keyboard.press("Tab");
const focused = await page.evaluate(() => {
	const active = document.activeElement;
	return active
		? `${active.tagName} outline=${getComputedStyle(active).outlineStyle}`
		: "none";
});
await page.screenshot({ path: resolve(here, `${el}.png`), fullPage: true });
console.log(JSON.stringify({ errors, focused, info }, null, 1));
await browser.close();
if (!response?.ok() || errors.length || info.some(({ missing }) => missing))
	process.exitCode = 1;
