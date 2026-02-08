# Kenaz ᚲ - Branding Guide

## The Name

**Kenaz** (pronounced keh-NAHZ) is the 6th rune of the Elder Futhark, the oldest Norse runic alphabet. It literally means "torch" or "fire" and symbolizes illumination, knowledge, creativity, and transformation.

The Unicode character is: ᚲ (U+16B2)

## Logo

The logo is the Kenaz rune (ᚲ) rendered as a chevron/angle shape inside a macOS-style rounded square with an orange gradient.

### Logo Construction

- **Shape:** Rounded rectangle (squircle), corner radius = 20% of width
- **Rune:** Two lines meeting at a point, forming an open angle pointing right
- **Rune stroke:** Rounded caps and joins, cream/white (#FFF8F0)
- **Background gradient:** Linear, bottom-left to top-right
  - Start: #C43E0C (deep burnt orange)
  - End: #F7A94B (warm amber)

### Files Included

| File | Use |
|------|-----|
| `icon-1024.png` | macOS app icon (source) |
| `icon-512.png` | macOS app icon |
| `icon-512.svg` | Vector source, scalable |
| `icon-256.png` | Windows app icon |
| `icon-128.png` | Linux app icon |
| `icon-64.png` | Large UI icon |
| `icon-32.png` | Toolbar/tab icon (thicker stroke) |
| `icon-16.png` | Favicon (thickest stroke) |
| `wordmark-dark.svg` | Horizontal logo + "kenaz" for dark backgrounds |
| `wordmark-light.svg` | Horizontal logo + "kenaz" for light backgrounds |

### Electron Icon Setup

For `electron-builder`, use `icon-512.png` as the base. It will auto-generate platform icons.

```json
{
  "build": {
    "icon": "branding/icon-512.png",
    "mac": {
      "icon": "branding/icon-512.png"
    }
  }
}
```

For the macOS `.icns` file, you may want to generate from the 1024px PNG:
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

### Primary Colors

| Name | Hex | CSS Variable | Use |
|------|-----|-------------|-----|
| Deep Orange | #C43E0C | `--color-deep` | Gradient start, hover states |
| Primary Orange | #E8571F | `--color-primary` | Buttons, active states, links |
| Warm Amber | #F7A94B | `--color-warm` | Gradient end, highlights |
| Cream | #FFF8F0 | `--color-light` | Text on dark, rune stroke |

### UI Colors

| Name | Hex | CSS Variable | Use |
|------|-----|-------------|-----|
| Background | #0a0a0a | `--color-bg` | Main app background |
| Surface | #111111 | `--color-surface` | Panels, cards, sidebar |
| Surface Raised | #1a1a1a | `--color-surface-raised` | Hover states, borders |
| Text Primary | #f0e6da | `--color-text` | Primary text |
| Text Secondary | #999999 | `--color-text-secondary` | Labels, timestamps |
| Text Muted | #555555 | `--color-text-muted` | Disabled, placeholders |
| Border | #1a1a1a | `--color-border` | Panel dividers |

### Label Colors

| Name | Hex | CSS Variable | Use |
|------|-----|-------------|-----|
| Pending | #F2C94C | `--color-pending` | Pending label indicator |
| Follow Up | #F28C38 | `--color-followup` | Follow up label indicator |
| Done | #4CAF50 | `--color-done` | Archived/done indicator |

### CSS Variables Block

```css
:root {
  /* Brand */
  --color-deep: #C43E0C;
  --color-primary: #E8571F;
  --color-warm: #F7A94B;
  --color-light: #FFF8F0;

  /* UI */
  --color-bg: #0a0a0a;
  --color-surface: #111111;
  --color-surface-raised: #1a1a1a;
  --color-text: #f0e6da;
  --color-text-secondary: #999999;
  --color-text-muted: #555555;
  --color-border: #1a1a1a;

  /* Labels */
  --color-pending: #F2C94C;
  --color-followup: #F28C38;
  --color-done: #4CAF50;

  /* Gradient */
  --gradient-brand: linear-gradient(135deg, var(--color-deep), var(--color-warm));
}
```

## Typography

### Font

**Outfit** from Google Fonts - geometric sans-serif, clean and modern.

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

### Scale

| Element | Weight | Size |
|---------|--------|------|
| App title / wordmark | 600 | 28px |
| Sidebar section headers | 600 | 13px |
| Email subject (list) | 500 | 14px |
| Email sender (list) | 600 | 13px |
| Email snippet (list) | 400 | 13px |
| Email body | 400 | 15px |
| HubSpot sidebar labels | 300 | 11px |
| HubSpot sidebar values | 500 | 13px |
| Buttons | 500 | 13px |
| Keyboard shortcuts | 400 (monospace) | 11px |

### Monospace (code, shortcuts)

Use `"SF Mono", "Fira Code", "Cascadia Code", monospace` for keyboard shortcut hints and any code blocks.

## Iconography

Use **Lucide** icons (https://lucide.dev) for UI icons. They match the clean, rounded stroke style of the Kenaz rune.

Suggested mappings:
- Inbox: `inbox`
- Archive/Done: `archive`
- Pending: `clock`
- Follow Up: `flag`
- Compose: `pen-line`
- Reply: `reply`
- Search: `search`
- Settings: `settings`
- HubSpot: `building-2` or custom
