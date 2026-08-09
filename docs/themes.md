# Themes

Import the optional stylesheet after the components:

```css
@import "compost/themes";
```

Set `data-compost-theme` on the document or any container. Bundled themes are
`dark`, `light`, and `gruvbox`.

```html
<html data-compost-theme="light">
```

Themes set colors and component presentation variables, not layout or sizes.
Override the semantic `--compost-theme-*` variables for a custom palette, or a
component's own variables for a local adjustment.
