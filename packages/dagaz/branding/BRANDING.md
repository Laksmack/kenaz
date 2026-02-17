# Dagaz ᛞ - Branding Guide

## The Name

**Dagaz** (pronounced DAH-gaz) is the 23rd rune of the Elder Futhark. It literally means "day" or "dawn" and symbolizes breakthrough, awakening, clarity, and the turning point between darkness and light.

The Unicode character is: ᛞ (U+16DE)

## Logo

The logo is the Dagaz rune (ᛞ) rendered inside a macOS-style rounded square with a sky blue gradient.

### Logo Construction

- **Shape:** Rounded rectangle (squircle), corner radius = 20% of width
- **Rune:** Horizontal butterfly/bowtie shape - two triangles meeting at a center point, wider than tall. Think of an hourglass rotated 90 degrees, or the shape ><. The triangles point left and right, pinching together in the middle.
  - The rune should be horizontally oriented (wider than tall)
  - Two diagonal strokes from top-left to center-right, and top-right to center-left, forming an X that creates the bowtie
  - Connected by horizontal lines at the top and bottom
- **Rune stroke:** Rounded caps and joins, cream/white (#F0F4FF)
- **Background gradient:** Linear, bottom-left to top-right
  - Start: #2D5F8A (deep twilight blue)
  - End: #7AB8D4 (morning sky blue)

### Distinction from siblings

| Property | Kenaz (fire) | Raidō (earth) | Dagaz (sky) |
|----------|-------------|---------------|-------------|
| Gradient start | #C43E0C | #8B5E3C | #2D5F8A |
| Gradient end | #F7A94B | #D4A574 | #7AB8D4 |
| Primary accent | #E8571F | #C2885A | #4A9AC2 |
| Element | Fire | Earth | Sky |

## Color Palette

### Primary Colors (Sky Tones)

| Name | Hex | Use |
|------|-----|-----|
| Deep Twilight | #2D5F8A | Gradient start, deep accents |
| Primary Sky | #4A9AC2 | Buttons, active states, badge |
| Morning Blue | #7AB8D4 | Gradient end, highlights |
| Ice White | #F0F4FF | Text on dark, rune stroke |

### CSS Variable Overrides

```css
:root, [data-theme='dark'] {
  --accent-deep: 45 95 138;
  --accent-primary: 74 154 194;
  --accent-warm: 122 184 212;
  --border-active: 74 154 194;
}
```

### Semantic role in Futhark suite

Dagaz blue = **scheduled, time-bound, future**. When other apps show calendar-related information, they use Dagaz blue as a cross-reference color.

## Purpose

Dagaz is the Futhark calendar app. It owns your schedule, events, and time blocks. Port 3143.

## Status

Concept. Directories and branding established, no implementation yet.

## Typography

**Outfit** from Google Fonts - shared across the Futhark suite.

## Iconography

Use **Lucide** icons. Suggested mappings:
- Day view: `sun`
- Week view: `calendar-days`
- Month view: `grid`
- Event: `clock`
- Conflict: `alert-triangle`
