# Lessons Learned: Config UI Visual Mismatch (M5.4)

**Date:** 2026-09-11  
**Incident:** UI implementation didn't match chosen mockup (Option C)  
**Status:** RESOLVED + PREVENTIVE MEASURES ADDED

---

## What Went Wrong

### Issue 1: Wrong Layout Wrapper
- **Chose:** Stacked sections UI (Option C)
- **Implemented:** `.form-linear` wrapper (designed for sequential forms)
- **Result:** Settings UI rendered as form layout
- **Root Cause:** Assumed `.form-linear` was generic container; didn't verify it was form-specific

### Issue 2: CSS Class Inheritance Problem
- **Used:** `.field` class for config inputs
- **Expected:** Plain text inputs
- **Got:** Form-style inputs with labels and specific margins
- **Root Cause:** Reused existing class without checking its styling impact

### Issue 3: Skipped Visual Verification
- **Only checked:** Tests passing (83/83 passed)
- **Didn't check:** Actual visual layout in browser
- **Result:** Layout drift went unnoticed until user tested live
- **Root Cause:** No mandatory screenshot comparison step in workflow

---

## How We Fixed It

1. **Removed `.field` class** from config inputs → plain inputs
2. **Replaced `.form-linear` wrapper** with simple max-width container
3. **Added inline styles** for proper input/button styling
4. **Added item count badges** to section headers
5. **Fixed row layout** to match Option C structure

**Outcome:** UI now matches mockup. Tests still pass (83/83).

---

## Preventive Measures Implemented

### 1. UI Implementation Guidelines
**File:** `./.claude/rules/ui-implementation-guidelines.md`

Comprehensive rules covering:
- Mockup-first development (non-negotiable)
- **Visual verification step (mandatory)** ← KEY NEW RULE
- CSS class isolation (don't reuse carelessly)
- Implementation checklist with screenshot comparison
- Common CSS pitfalls and how to avoid them
- Layout structure validation before moving to next phase

### 2. Updated CLAUDE.md
- Added prominent reference to UI guidelines
- Marked it as "MUST READ" for any UI work

### 3. Future Workflow Changes

Every UI implementation should now include:
```
Phase 03 (Markup) → Phase 03a (Visual Verification) ← NEW MANDATORY STEP
```

**Phase 03a: Visual Verification**
- Take screenshot of implemented UI
- Compare against approved mockup
- Verify all layout/spacing/colors match
- Fix any drift before moving forward

---

## Key Learnings

| Learning | Previous | Now |
|----------|----------|-----|
| **Class reuse safety** | Assumed safe | Verify styling first |
| **Layout wrapper choice** | Used nearest match | Check class documentation |
| **Verification method** | Tests + assumption | Tests + screenshot comparison |
| **Approval process** | Get design approval | Get design approval + document it |
| **Phase gate** | Tests passing = done | Tests + visual match = done |

---

## Time Impact

- **Time spent fixing:** ~15 min (layout fixes)
- **Time spent on preventive rules:** ~20 min (documentation)
- **Prevention benefit:** Future similar issues avoided (estimated 30+ min per incident)

**Return on investment:** Very high. Future UI work will catch visual mismatches before commit.

---

## Recommendations

1. **Apply these rules to all future UI work** (forms, modals, pages, components)
2. **Before merging any UI PR:** Require screenshot comparison
3. **CSS naming:** Always use component-specific classes, not generic ones
4. **Testing:** Remember tests verify syntax, not visual layout

---

## Related Issues Fixed

- ✅ Config UI layout (stacked sections with proper styling)
- ✅ Shallow-copy mutation bug (Phase 04)
- ✅ Delete button not working (Phase 04)
- ✅ Dirty state tracking one-way (Phase 04)
- ✅ vatRates stored as strings (Phase 04)

---

## Files Modified

- `CLAUDE.md` — Added UI guidelines reference
- `.claude/rules/ui-implementation-guidelines.md` — NEW comprehensive rules
- `apps/web/ui/ViewsAdmin.html` — Fixed config render functions
- `apps/web/ui/Styles.html` — Added config CSS (Phase 02)

---

## Next Steps

✅ All 4 phases complete (Phase 05 optional viewport testing)  
✅ Tests passing (83/83)  
✅ UI matches chosen mockup (Option C)  
✅ Preventive rules added to prevent recurrence  

**Ready for:** Production deployment or further refinement based on user feedback.

