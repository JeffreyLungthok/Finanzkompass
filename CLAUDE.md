# Finanzkompass

This site uses the Alpine Earth design system. Its tokens (`--ae-*`) and the app tokens derived from them live at the top of `src/styles.css`. Build UI with those tokens and the existing classes (`.panel`, `.btn`, `.ae-textured`, …); see the alpine-earth skill.

- Primary actions are forest (`--primary`). Wegweiser yellow (`--sign`) is only for signage: the `Signpost` component, the brand mark and the retirement marker in the chart.
- Texture (`ae-textured ae-textured--paper|linen|clay`) goes on featured surfaces only: hero, verdict, live summary, empty states, the journey card header. Forms, tables and charts stay solid.
- Fonts: Source Sans 3 (UI) and Source Serif 4 (`.display`, used once per page).
- Chart series colours (`--s-*`) were checked with a colour-vision validator for both themes; re-check them if you change any.
