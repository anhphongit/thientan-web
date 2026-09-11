# Phase 01 — Mockup Options & Approval Gate

**Effort:** 45m  
**Blocking:** Phases 02-05  
**Input:** User design approval  
**Output:** Selected mockup option  

---

## Mock-First Approach (Development Rule M5-3)

Per your development rules, all new UI screens must present 2-3 **design mockups** before implementation. This phase is your approval gate.

### Two Options Created

| Option | Layout | File | Best For |
|--------|--------|------|----------|
| **A — Grouped Cards** | Each config section is a separate card with clear title, description, and grouped editor | `phase-01-mockup-option-a.html` | Mobile-first; visual clarity; natural card separation |
| **B — Compact Inline** | All sections in one card with inline labels; horizontal rules between sections | `phase-01-mockup-option-b.html` | Desktop efficiency; space savings; single scrollable card |

---

## Design Comparison

### Option A: Grouped Cards
- ✅ **Pros:**
  - Clear visual hierarchy — each config has its own "story"
  - Mobile-friendly — cards stack naturally on narrow screens
  - User can see entire section at once on small devices
  - Matches Orders/Inventory card pattern
  - Easy to expand (add more sections later)

- ❌ **Cons:**
  - Uses more vertical space on desktop (5 cards = 5 gaps + padding)
  - Scroll distance increases on very long lists (like `customerList`)

### Option B: Compact Inline
- ✅ **Pros:**
  - Desktop efficient — all settings visible in one scrollable card
  - Reduces perceived "scroll distance" on desktop
  - All inputs use consistent spacing within one container

- ❌ **Cons:**
  - Requires careful mobile layout (inputs stack below labels)
  - Less visual separation between config types
  - Harder to expand with new sections (break the card pattern)

---

## Recommended: **Option A — Grouped Cards**

**Why:** 
- Aligns with your existing design system (Orders/Inventory use cards)
- Mobile-first approach matches your user base (staff on phones)
- Cleaner visual hierarchy
- Easier to maintain and extend

**Trade-off:** Desktop users scroll slightly more, but readability & consistency wins.

---

## How to Review

**View the mockups:**
- `phase-01-mockup-option-a.html` — Open in browser to see interactive design
- `phase-01-mockup-option-b.html` — Open in browser to compare

**Test on mobile:** Resize your browser to 360px width to see responsive behavior.

**Check for:**
- Visual hierarchy and clarity
- Mobile responsiveness (360px, 375px viewports)
- Consistency with Orders/Inventory UI
- Label clarity and input accessibility

---

## Success Criteria

- [ ] Selected mockup option (A or B)
- [ ] Approved responsive behavior (360px+)
- [ ] Ready for Phase 02 (CSS foundation)

---

## Next Step

**Respond with:**
- ✅ Selected option (A or B, or request modifications)
- Any adjustments you'd like before Phase 02 starts

Once approved → Phase 02 begins (CSS foundation in `Styles.html`)
