# Raidō ᚱ - Branding Guide

## The Name

**Raidō** (pronounced RAI-tho) is the 5th rune of the Elder Futhark, the oldest Norse runic alphabet. It literally means "ride" or "journey" and symbolizes travel, movement, rhythm, and the ordered path forward.

The Unicode character is: ᚱ (U+16B1)

## Logo

The logo is the Raidō rune (ᚱ) rendered as a vertical stave with a triangular flag and diagonal leg, inside a macOS-style rounded square with an earth-tone gradient.

### Logo Construction

- **Shape:** Rounded rectangle (squircle), corner radius = 20% of width
- **Rune:** Vertical stave (left), triangular flag on upper half, diagonal leg on lower half
  - Think of it like the letter R: vertical backbone, triangular bump on the upper half, diagonal leg below
- **Rune stroke:** Rounded caps and joins, cream/white (#FFF8F0)
- **Background gradient:** Linear, bottom-left to top-right
  - Start: #8B5E3C (deep warm brown)
  - End: #D4A574 (warm sand/leather)

### Stroke Width Scaling

| Size | Stroke Width | Purpose |
|------|-------------|---------|
| 512px | 36 | Vector source |
| 32px | 3.5 | Toolbar/tab icon |
| 16px | 2.5 | Favicon |

### Files Included

| File | Use |
|------|-----|
| `icon-1024.png` | macOS app icon retina source |
| `icon-512.png` | macOS app icon |
| `icon-512.svg` | Vector source, scalable |
| `icon-256.png` | Windows app icon |
| `icon-128.png` | Linux app icon |
| `icon-64.png` | Large UI icon |
| `icon-32.png` | Toolbar/tab icon (thicker stroke) |
| `icon-16.png` | Favicon (thickest stroke) |
| `icon.icns` | macOS icon bundle |
| `wordmark-dark.svg` | Horizontal logo + "raidō" for dark backgrounds |
| `wordmark-light.svg` | Horizontal logo + "raidō" for light backgrounds |

### Electron Icon Setup

For `electron-builder`, use the `.icns` bundle:

```json
{
  "build": {
    "mac": {
      "icon": "branding/icon.icns"
    }
  }
}
```

For generating the macOS `.icns` file from PNGs:
```bash
mkdir icon.iconset
cp icon-16.png icon.iconset/icon_16x16.png
cp icon-32.png icon.iconset/icon_16x16@2x.png
cp icon-32.png icon.iconset/icon_32x32.png
cp icon-64.png icon.iconset/icon_32x32@2x.png
cp icon-128.png icon.iconset/icon_128x128.png
cp icon-256.png icon.iconset/icon_128x128@2x.png
cp icon-256.png icon.iconset/icon_256x256.png
cp icon-512.png icon.iconset/icon_256x256@2x.png
cp icon-512.png icon.iconset/icon_512x512.png
cp icon-1024.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

## Color Palette

### Primary Colors (Earth Tones)

| Name | Hex | RGB Channels | Use |
|------|-----|-------------|-----|
| Deep Brown | #8B5E3C | 139 94 60 | Gradient start, deep accents |
| Primary Earth | #C2885A | 194 136 90 | Buttons, active states, badge |
| Warm Sand | #D4A574 | 212 165 116 | Gradient end, highlights |
| Cream | #FFF8F0 | 255 248 240 | Text on dark, rune stroke |

### CSS Variable Overrides

Raidō overrides the shared theme accent colors with earth tones:

```css
:root, [data-theme='dark'] {
  --accent-deep: 139 94 60;
  --accent-primary: 194 136 90;
  --accent-warm: 212 165 116;
  --border-active: 194 136 90;
}

[data-theme='light'] {
  --accent-deep: 120 78 45;
  --accent-primary: 160 114 78;
  --accent-warm: 180 140 100;
  --border-active: 160 114 78;
}
```

### Distinction from Kenaz

| Property | Kenaz (fire) | Raidō (earth) |
|----------|-------------|---------------|
| Gradient start | #C43E0C (burnt orange) | #8B5E3C (deep brown) |
| Gradient end | #F7A94B (warm amber) | #D4A574 (warm sand) |
| Primary accent | #E8571F (fire orange) | #C2885A (earth brown) |
| Badge color | System red | #C2885A (accent primary) |

## Typography

### Font

**Outfit** from Google Fonts — shared across the Futhark suite.

### Scale

Same as the Futhark core design system. See `@futhark/core` for details.

### Monospace

`"SF Mono", "Fira Code", "Cascadia Code", monospace`

## Iconography

Use **Lucide** icons (https://lucide.dev) for UI icons, matching the Futhark suite conventions.

Suggested mappings for Raidō:
- Today: `sun`
- Inbox: `inbox`
- Upcoming: `calendar`
- Projects: `folder`
- Logbook: `book-open`
- Complete: `check-circle`
- Priority: `flag`
- Tags: `tag`
- Search: `search`
- Settings: `settings`
