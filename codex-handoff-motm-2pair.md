# Codex handoff — MOTM Q&A 2-pair-per-slide verification

## Context

The May 13 build had Q&A overflow on some members: content exceeded the fit
helper's floor scale, the scroll fallback didn't engage, and the bottom of long
answers got clipped silently. Tonight I dropped QA_PER_SLIDE from 4 to 2 in
commit `de21726`, expecting the extra vertical room per pair to push all
current-member content above the floor and avoid the overflow path entirely.

This is a **workaround**, not a fix. The underlying fit-floor / scroll-fallback
bug is still latent — see the second handoff for that. Don't conflate them.

## File

`src/renderer/src/views/MemberOfMonthView.ts`

Relevant constants and structure:

- `QA_PER_SLIDE = 2` (line 16) — was 4, now 2
- `renderQAGroup()` (line 380) — renders the slide
- Grid is 2 columns × 1 row: `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'`
  (line 443). With 2 pairs, this gives one pair per column on a single row.
- The fit-helper / auto-scroll wiring is at lines 504–523, with a known bug
  flagged in the TODO at lines 502–503 — **do not modify this block in this task.**

## What I want from this task

1. **Verify the geometry holds for known-overflowing members.** The May 13
   handoff noted that members with long answers in multiple Q&As on the same
   slide were the ones overflowing. With 2 pairs per slide rather than 4, each
   pair has half the slide height. Walk through the math:
   - Banner (line 391–401): `clamp(28px, 4vh, 52px)` plus padding `py-4` → about
     90–120px on a 1080p TV.
   - Q&A counter (line 404–408): ~20px plus `mt-4`.
   - Grid padding (line 446–447): `32px * --fit-scale` top/bottom.
   - Grid gap (line 444–445): doesn't apply vertically because we're now
     single-row.
   - Per pair: Q label (20px) + Q (34px, line-height 1.2) + A label (17px) + A
     (26px, line-height 1.45) + margins. For an N-line answer, total height is
     roughly `~110px + 26 * 1.45 * N` per pair at scale 1.

   At minScale 0.72 with a ~960px-tall content area (1080 minus banner and
   header), how many lines of answer fit per pair? Compute it and state the
   answer. If it's fewer than ~22 lines, that's the new ceiling — members
   exceeding it will still hit the same broken floor-scroll path.

2. **Sanity-check the grid behavior with one pair.** Members whose total Q&A
   count is odd will have a final slide with only one pair. With
   `repeat(2, minmax(0, 1fr))` and a single grid child, the child lands in the
   left column and the right column is empty. Confirm this in the code — don't
   "fix" it by changing to `auto-fit` or centering, the asymmetric layout is
   acceptable. Just confirm and move on.

3. **Add a regression test or assertion.** Pick whichever fits the codebase
   style:
   - A unit test that imports `qaSlideCount` and asserts `QA_PER_SLIDE === 2`
     plus a few slide-count cases (0 pairs → 0 slides, 1 → 1, 2 → 1, 3 → 2,
     5 → 3).
   - Or a comment immediately above `QA_PER_SLIDE` documenting the trade-off
     so the next person tuning it (or Codex itself in a future session) knows
     this constant is load-bearing for the unfixed fit-floor bug below.

   The constants block already has a brief comment ("2 columns × 1 row; long
   answers need the full slide height"). Expand it to mention the dependency
   on the unfixed floor-scroll bug so nobody silently bumps it back to 4.

## Verification

- `npm run build` must pass.
- No TypeScript errors.
- If you added a test, `npm test` (or whatever the suite is — check `package.json`)
  must pass.
- Do NOT change the `fitToViewport` call or the `onScale` callback wiring.
- Do NOT change `QA_PER_SLIDE` away from 2.

## Out of scope

- Diagnosing the fit-floor / scroll-fallback bug. That's a separate handoff.
- Changing the grid template, gap, padding, or font sizes.
- Touching the hero slide, the swap-detection heuristic, or the auto-scroll
  fallback.
