# Finanzkompass

This site uses the Alpine Earth design system (`public/alpine-earth/`, linked in `index.html`). Build UI with its `ae-` classes and tokens; see the alpine-earth skill. Don't edit files in `public/alpine-earth/` to restyle the app: changes to the system go back into the design-system repo and a new kit.

- `src/styles.css` holds only the app tokens (derived from the kit's `--ae-*` tokens) and the app's own components.
- Materials: `ae-surface--paper` for featured items (verdict, live summary, empty states), `--fiber`, `--linen` and `--kraft` for sheets that sit side by side, linen in the nav and table headers. Forms, charts and data stay on plain white sheets.
- Patterns and trims: contour lines in the hero, schindel pattern in the footer, Tibetan key trim on the start page, tibeb hem under the nav. At most two trims per screen.
- Illustrations: `alpine-collage` in the hero (torn edge), `ridge-horizon` above the footer, `ridge-stone` on the journey intro, dried grass on empty states.
- Links to places are Wegweiser signs (`Signpost` component or `ae-wegweiser`); actions are `.btn`. Wegweiser yellow is only for signage.
- Text on materials is full ink; `.muted` uses `--ink-2` because the canvas is paper.
- Chart series colours (`--s-*`) were checked with a colour-vision validator for both themes; re-check them if you change any.
