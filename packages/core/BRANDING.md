# Futhark Branding Reference

## Rune SVG Paths (512x512 viewBox)

All runes use stroke-based rendering: `stroke="#FFF8F0"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`.

Use `stroke-width="35.84"` for app icons (100px display), `stroke-width="42"` for dock icons (64px display).

### Kenaz ᚲ (torch/fire)
A single open chevron pointing left - like a "<" rotated slightly.

```svg
<path d="M332.8 112.6L189.4 256L332.8 399.4" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
```

### Raidō ᚱ (journey/ride)
Vertical stave + triangular flag (upper half) + diagonal leg (lower half). Like a "R" made of straight lines.

```svg
<!-- Vertical stave -->
<path d="M190 399.4L190 112.6" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round" fill="none"/>
<!-- Triangular flag (upper half) -->
<path d="M190 112.6L330 210L190 307.4" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<!-- Diagonal leg (lower half) -->
<path d="M190 307.4L330 399.4" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round" fill="none"/>
```

### Dagaz ᛞ (day/dawn)
HORIZONTAL butterfly/bowtie - two vertical staves connected by an X in the middle. NOT a vertical hourglass.

Two vertical lines on left and right, connected by diagonal lines that cross in the center.

```svg
<!-- Diagonal X connecting the two staves -->
<path d="M128 160L256 256L128 352M384 160L256 256L384 352" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<!-- Left vertical stave -->
<line x1="128" y1="160" x2="128" y2="352" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round"/>
<!-- Right vertical stave -->
<line x1="384" y1="160" x2="384" y2="352" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round"/>
```

IMPORTANT: Dagaz is WIDE, not tall. The shape extends horizontally. Think of two "|" staves on the sides with an "X" connecting them: |><|

### Laguz ᛚ (water) - future
Simple angular hook - vertical stave with a diagonal branch going up-right from the top.

```svg
<!-- Vertical stave -->
<line x1="190" y1="399.4" x2="190" y2="160" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round"/>
<!-- Diagonal branch from top -->
<path d="M190 160L320 256" stroke="#FFF8F0" stroke-width="35.84" stroke-linecap="round" fill="none"/>
```

## Icon Backgrounds (512x512 viewBox)

All icons use a rounded rectangle with gradient fill:

```svg
<rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#gradient)"/>
```

### Gradients (bottom-left to top-right)

```
Kenaz:  #C43E0C → #F7A94B  (deep ember → amber)
Raidō:  #8B5E3C → #D4A574  (dark leather → sand)
Dagaz:  #2D5F8A → #7AB8D4  (twilight → morning sky)
Laguz:  #1B4D5C → #5CB8A5  (deep ocean → seafoam)
```

## Color Families

### Kenaz · Fire
- #C43E0C (deep ember)
- #E8571F (flame)
- #E8834A (warm orange - accent)
- #F7A94B (amber)

### Raidō · Earth
- #8B5E3C (dark leather)
- #C2885A (saddle brown - accent)
- #D4A574 (sand)

### Dagaz · Sky
- #2D5F8A (twilight)
- #4A90AD (mid sky)
- #5B8FB4 (steel blue - accent)
- #7AB8D4 (morning sky)

### Laguz · Water
- #1B4D5C (deep ocean)
- #3A8A7A (mid teal)
- #5CB8A5 (seafoam - accent)
