/* The app's name as the learner sees it, in one place (the owner chose "Ya",
 * 2026-10-01; it was Bridges). Store title: "Ya: Learn Russian".
 *
 * Only what is shown. The package id (app.bridges.russian), the backup kind
 * ("bridges-profile") and file names keep the old word: a phone that has the
 * app and a backup made last week must both go on working. */

export const APP_NAME = "Ya";
/* The name with what it is, where the app introduces itself — the opening
   splash and the sign-in mark (the owner, 2026-10-05: it "should say Ya:
   Learn Russian"). Elsewhere, in a sentence, the short name reads better. */
export const APP_TITLE = "Ya: Learn Russian";

/* The logo's own colour, as artwork rather than a theme token: the tile is
   the same coral in both themes, like the launcher icon it matches
   (tools/make_app_icon.py CORAL). The interface keeps its indigo — coral beside
   the app's red for a wrong answer would make every main button look like one. */
export const LOGO_CORAL = "#D9502A";
