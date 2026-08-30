import { examples } from "./shared/catalog.js";
import "./shared/example-page.js";

const catalog = document.querySelector("[data-examples]");
if (catalog) catalog.innerHTML = examples.map(card).join("");

function card(example) {
	return `
    <a class="example-card" href="${example.href}">
      <strong>${escapeHTML(example.title)}</strong>
      <small>${escapeHTML(example.summary)}</small>
    </a>
  `;
}

function escapeHTML(value) {
	return String(value)
		.replace(/&/gu, "&amp;")
		.replace(/</gu, "&lt;")
		.replace(/>/gu, "&gt;")
		.replace(/"/gu, "&quot;");
}
