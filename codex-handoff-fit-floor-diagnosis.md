# Codex handoff — diagnose fitToViewport floor-scroll fallback

## Context

The May 7 and May 13 handoffs have both flagged the same underlying bug:

> When MOTM Q&A content exceeds the fit helper's floor scale, the helper
> neither shrinks further nor falls back to scroll. Content gets cut off
> silently at the bottom.

This bug has now survived three tuning passes (8 → 4 → 2 pairs per slide). The
May 13 handoff was explicit: **"time to instrument it properly with logging
and trace it end-to-end rather than guessing fixes."** That's this task.

A TODO comment in the source already confirms the issue:

```
// TODO: Overflow at the floor scale does not appear to trigger this scroll
// fallback reliably on the gym TV; diagnose fit floor detection separately.
```
— `src/renderer/src/views/MemberOfMonthView.ts`, lines 502–503

This task is **diagnostic**, not corrective. Do not "fix" anything yet. The
deliverable is logs and a written diagnosis. A fix follows in a separate task
once the root cause is understood.

## Files

- `src/renderer/src/utils/fitToViewport.ts` — the fit helper. Read it
  completely before doing anything else.
- `src/renderer/src/views/MemberOfMonthView.ts` — the consumer, specifically
  `renderQAGroup()` at line 380 and the `onScale` callback at lines 504–523.

## What the call site expects

In `MemberOfMonthView.ts` lines 504–523:

```typescript
currentQaFit = fitToViewport(scroller, content, {
  mode: 'css-var',
  minScale: 0.72,
  onScale: (_scale, hitFloor) => {
    scroller.style.overflowY = hitFloor ? 'auto' : 'hidden'
    if (!hitFloor) {
      fallbackScrollStarted = false
      scroller.scrollTop = 0
    } else if (!fallbackScrollStarted) {
      fallbackScrollStarted = true
      console.log('[motm-view] Q&A fit floor hit; starting scroll fallback', {
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        contentScrollHeight: content.scrollHeight
      })
      startAutoScroll(scroller)
    }
  }
})
```

The contract: when content can't fit even at `minScale: 0.72`, `hitFloor`
should be `true`, the scroller's `overflowY` should flip to `auto`, and
`startAutoScroll` should engage. In practice on the gym TV this doesn't happen
reliably on members with long answers.

## Diagnostic plan

### Step 1 — read `fitToViewport.ts` end to end

Before touching anything, read the whole helper. Understand:
- How does it measure content vs container? `getBoundingClientRect`,
  `scrollHeight`, or `offsetHeight`?
- Where does `hitFloor` get computed? Is it `computedScale === minScale`, or
  `computedScale <= minScale + epsilon`, or something else?
- When does it call `onScale`? On every fit() call, only on changes, or
  debounced?
- Is the measurement happening BEFORE or AFTER the CSS variable update? If
  before, `--fit-scale` is still at the previous value and `scrollHeight`
  reflects that, not the new scale.

Summarize what you find in the diagnosis doc.

### Step 2 — add instrumentation

Add `console.log` calls to `fitToViewport.ts` (NOT to MemberOfMonthView.ts —
keep the consumer clean). Log every time a fit pass runs, at minimum:

- `containerHeight` (measured)
- `contentNaturalHeight` (measured at scale 1 — you may need to read it
  before applying any scale, or compute as `contentHeight / currentScale`)
- `requestedScale` (what the math says it should be)
- `clampedScale` (after applying min/max)
- `hitFloor` (the boolean passed to onScale)
- `scrollHeightAfter` and `clientHeightAfter` (read after the scale is
  applied — use `requestAnimationFrame` to wait one paint)

Prefix every log with `[fit]` so it's easy to grep in the gym TV's console.

### Step 3 — define what counts as "broken"

The hypothesis to test: on members with long Q&A content, `hitFloor` is
`false` even when content overflows. Possible variants:

1. `hitFloor` IS true but `overflowY = 'auto'` isn't taking effect because
   `scrollHeight === clientHeight` (measurement timing).
2. `hitFloor` is FALSE because the requested scale is exactly `0.72` and the
   comparison uses `<` instead of `<=`.
3. The fit pass runs once on mount with content height = 0 (fonts not loaded),
   computes a satisfying scale of 1, and never re-runs after fonts settle.
4. `startAutoScroll` IS called but exits early at `if (overflow <= 4) return`
   (line 537) because the scroller's `scrollHeight` and `clientHeight` are
   measured before the `overflowY = 'auto'` style flush.

Your job is to identify which one (or which combination) is happening.

### Step 4 — write the diagnosis

Create `docs/fit-floor-diagnosis.md` documenting:

1. The measurement pipeline as it currently works (from your reading of the
   source).
2. The hypothesis that matches the observed behavior, with evidence from the
   logs.
3. The proposed fix, in prose — what would need to change, in which function,
   at which line, and why. Do NOT implement it.
4. What tests would prove the fix worked.

## Constraints

- Do NOT modify `QA_PER_SLIDE` or anything in `renderQAGroup` other than
  potentially adding more `[fit]`-prefixed logs in the `onScale` callback if
  it's useful for correlating consumer-side timing with helper-side timing.
- Do NOT change the `startAutoScroll` function.
- Do NOT attempt to fix the bug in this task. Diagnosis only.
- `npm run build` must still pass.
- All new console.log calls must use the `[fit]` prefix so they can be
  grepped out later.

## How to test on the gym TV

The dev will run the build, point the gym TV at MOTM with a known-long member,
open the PC#2 dev tools console (the renderer process — `Ctrl+Shift+I` in the
running Electron window, if devtools are enabled in production builds; if not,
the dev will run a dev build for diagnosis only), and capture the
`[fit]`-prefixed log lines. They'll paste those back into the next session.

Include in the diagnosis doc a section "How to capture logs for this bug"
documenting exactly which member to test on, which slide, and what to look
for in the output. Make it copy-pasteable.
