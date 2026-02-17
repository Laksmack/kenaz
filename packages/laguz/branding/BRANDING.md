# Laguz ᛚ - Branding Guide

## The Name

**Laguz** (pronounced LAH-gooz) is the 21st rune of the Elder Futhark. It literally means "lake" or "water" and symbolizes flow, intuition, the subconscious, and the depths beneath the surface.

The Unicode character is: ᛚ (U+16DA)

## Logo

The logo is the Laguz rune (ᛚ) rendered inside a macOS-style rounded square with an ocean teal gradient.

### Logo Construction

- **Shape:** Rounded rectangle (squircle), corner radius = 20% of width
- **Rune:** Simple angular hook - a vertical stave with a single diagonal branch extending upward and to the right from the top. Think of it like a shepherd's crook or a simplified "L" rotated, or the top-left corner of a rectangle drawn with just two strokes.
  - Vertical stave runs full height
  - Diagonal branch angles ~45 degrees from the top of the stave toward the upper right
  - Clean, minimal, the simplest rune in the suite
- **Rune stroke:** Rounded caps and joins, cream/white (#F0FFF8)
- **Background gradient:** Linear, bottom-left to top-right
  - Start: #1B4D5C (deep ocean)
  - End: #5CB8A5 (shallow teal)

### Distinction from siblings

| Property | Kenaz (fire) | Raidō (earth) | Dagaz (sky) | Laguz (water) |
|----------|-------------|---------------|-------------|---------------|
| Gradient start | #C43E0C | #8B5E3C | #2D5F8A | #1B4D5C |
| Gradient end | #F7A94B | #D4A574 | #7AB8D4 | #5CB8A5 |
| Primary accent | #E8571F | #C2885A | #4A9AC2 | #4AA89A |
| Element | Fire | Earth | Sky | Water |

## Color Palette

### Primary Colors (Ocean Tones)

| Name | Hex | Use |
|------|-----|-----|
| Deep Ocean | #1B4D5C | Gradient start, deep accents |
| Primary Teal | #4AA89A | Buttons, active states, badge |
| Shallow Teal | #5CB8A5 | Gradient end, highlights |
| Sea Foam | #F0FFF8 | Text on dark, rune stroke |

### CSS Variable Overrides

```css
:root, [data-theme='dark'] {
  --accent-deep: 27 77 92;
  --accent-primary: 74 168 154;
  --accent-warm: 92 184 165;
  --border-active: 74 168 154;
}
```

### Semantic role in Futhark suite

Laguz teal = **reference, context, depth**. When other apps show linked vault notes, cross-references, or contextual information from other apps, they use Laguz teal.

## Purpose

Laguz is the Futhark scratch pad and vault browser. Two modes:

- **Scratch tabs** - numbered, ephemeral notes for prompt engineering, quick text, copy/paste staging
- **Vault view** - browse and edit the Obsidian vault (same folder, markdown native)

Port 3144.

### Key concept

Laguz is the river (capture, write, flow). Obsidian vault is the lake (store, link, search). Laguz writes markdown directly to the vault folder. Both can coexist - same files, two front doors.

## Status

Concept. Directories and branding established, no implementation yet.

## Typography

**Outfit** from Google Fonts - shared across the Futhark suite.

## Iconography

Use **Lucide** icons. Suggested mappings:
- Scratch tab: `file-text`
- Vault browser: `folder-tree`
- New note: `plus`
- Save to vault: `download`
- Search: `search`
- Backlinks: `link`
