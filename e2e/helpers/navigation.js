export async function gotoAndWaitForCustomElements(page, url, options) {
	const response = await page.goto(url, options);
	await page.evaluate(async () => {
		const tags = [
			...new Set(
				[...document.querySelectorAll("*")]
					.map((element) => element.localName)
					.filter((name) => name.includes("-")),
			),
		];
		await Promise.all(tags.map((tag) => customElements.whenDefined(tag)));
	});
	return response;
}
