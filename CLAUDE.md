# Finanzkompass

This site uses the Alpine Earth design system (`public/alpine-earth/`, linked in `index.html`). Build UI with its `ae-` classes and tokens; see the alpine-earth skill. Don't edit files in `public/alpine-earth/` to restyle the app: changes to the system go back into the design-system repo and a new kit.

- `src/styles.css` holds only the app tokens (derived from the kit's `--ae-*` tokens) and the app's own components.
- One texture level: the kit's paper canvas is the only material. Featured items (Ist-Check verdict, empty states) are `ae-surface--paper` sheets; everything else is a plain white sheet. No patterns, trims, linen, kraft or extra illustrations.
- The one featured image is the start-page hero: the real Monte-Carlo result drawn as paper ridgelines (`HeroRidges`), with the sun as the goal. Keep it on real engine output; label example plans as examples.
- One metaphor, the trail: links to places are Wegweiser signs (`Signpost` or `ae-wegweiser`), actions are `.btn`. Wegweiser yellow is only for signage. One primary path per screen.
- Fixed names and times: "Plan erfassen" (entering data), "Ist-Check" (10 min including the plan), "Lebenssimulation" (15 min). Use the same words in nav, buttons and copy.
- Text on the paper canvas is full ink; `.muted` uses `--ink-2`.
- Chart series colours (`--s-*`) were checked with a colour-vision validator for both themes; re-check them if you change any.
