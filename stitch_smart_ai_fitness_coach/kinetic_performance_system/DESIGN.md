---
name: Kinetic Performance System
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c9ac'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e9379'
  outline-variant: '#444933'
  surface-tint: '#abd600'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c3f400'
  on-primary-container: '#556d00'
  inverse-primary: '#506600'
  secondary: '#b9f1ff'
  on-secondary: '#00363f'
  secondary-container: '#00e0ff'
  on-secondary-container: '#005f6d'
  tertiary: '#ffffff'
  on-tertiary: '#690003'
  tertiary-container: '#ffdad5'
  on-tertiary-container: '#ca0a0f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#a5eeff'
  secondary-fixed-dim: '#00daf8'
  on-secondary-fixed: '#001f25'
  on-secondary-fixed-variant: '#004e5a'
  tertiary-fixed: '#ffdad5'
  tertiary-fixed-dim: '#ffb4aa'
  on-tertiary-fixed: '#410001'
  on-tertiary-fixed-variant: '#930005'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Anton
    fontSize: 48px
    fontWeight: '400'
    lineHeight: '1.1'
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: Anton
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.01em
  headline-md:
    fontFamily: Anton
    fontSize: 24px
    fontWeight: '400'
    lineHeight: '1.2'
  body-lg:
    fontFamily: Lexend
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Lexend
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.2'
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
  label-caps:
    fontFamily: Lexend
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1.0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 16px
  margin: 20px
---

## Brand & Style

This design system is engineered for a high-intensity, premium fitness experience. The brand personality is aggressive, technical, and motivating, targeting athletes who value data-driven progress and elite aesthetics. 

The visual style is **High-Contrast Dark Mode** fused with **Tactile Modernism**. It leverages a deep obsidian canvas to make vibrant, "energy-infused" accents pop, simulating the environment of a high-end, late-night boutique gym. Interactive elements use subtle gradients and soft depth to feel like physical performance gear—sleek, durable, and responsive. The emotional goal is to transform biometric data into a source of kinetic energy and competitive drive.

## Colors

The color palette is anchored by **Volt Lime** (Primary), a high-visibility neon used for critical actions and active states. **Electric Blue** (Secondary) serves as the primary data visualization color, representing flow and endurance. **Racing Red** (Tertiary) is reserved for high-stress zones, heart rate peaks, and destructive actions.

The neutral scale is strictly dark. The background uses a true black or deep charcoal to maximize the luminosity of the accent colors.
- **Surface Primary:** #121212 (Main background)
- **Surface Secondary:** #1E1E1E (Cards and elevated containers)
- **Surface Tertiary:** #2C2C2C (Pressed states and subtle borders)
- **Text Primary:** #FFFFFF (Maximum readability)
- **Text Secondary:** #A0A0A0 (Supportive data and labels)

## Typography

Typography prioritizes impact and athletic utility. 
- **Headings:** Use **Anton** for its condensed, vertical power, reminiscent of scoreboard and sports apparel typography. All headlines should be treated with slight tracking to ensure readability at speed.
- **Body & Interface:** **Lexend** provides exceptional legibility and a friendly yet active tone for workout instructions and social features.
- **Data & Metrics:** **JetBrains Mono** is utilized for all numerical data, timers, and split times. The monospaced nature ensures that ticking clocks and shifting metrics do not cause layout "jitter," maintaining a technical, high-performance feel.

## Layout & Spacing

This design system employs a **Fluid-Hybrid Grid** designed for mobile-first performance.
- **Vertical Rhythm:** Built on a 4px baseline grid. Most elements should use 16px (sm) or 24px (md) padding to maintain a breathable but dense "data-cockpit" feel.
- **Horizontal Layout:** A 4-column mobile grid with 20px outer margins. 
- **Sectioning:** Use large 40px (lg) or 64px (xl) vertical gaps between distinct workout blocks to allow the user to scan sections while in motion.
- **Data Density:** In "Active Workout" modes, margins may shrink to 12px to maximize the scale of real-time metrics.

## Elevation & Depth

Hierarchy is established through **Tonal Stacking** and **Performance Glows** rather than heavy drop shadows.
- **Level 0 (Base):** #121212.
- **Level 1 (Cards):** #1E1E1E with a 1px subtle stroke (#FFFFFF at 5% opacity).
- **Interactive Depth:** Elements use "Ambient Glows." Active buttons or progress rings should cast a soft, diffused shadow colored with the primary color (e.g., a neon lime outer glow with 20% opacity and 15px blur) to simulate light-emitting hardware.
- **Glassmorphism:** Overlays and navigation bars use a heavy backdrop blur (20px) with a 60% opaque black tint to maintain legibility over moving map data or workout videos.

## Shapes

The shape language is **Technical-Rounded**. 
Standard UI components like cards and input fields use a **0.5rem (8px)** corner radius to feel modern and accessible. Large buttons and progress containers use **1.5rem (24px)** or full pill-shapes to evoke the look of high-performance sneakers and ergonomic gym equipment. 

Avoid sharp 0px corners, as they feel too corporate; avoid overly bubbly 32px+ corners on cards to maintain a precise, "engineered" aesthetic.

## Components

- **Action Buttons:** Primary buttons feature a subtle diagonal gradient (e.g., Volt Lime to a slightly darker shade) and use bold, uppercase Lexend for the label.
- **Metrics Cards:** Use a secondary surface color with a "Inner Glow" top border (1px) to give a tactile, three-dimensional feel. Numbers are always in JetBrains Mono.
- **Progress Rings:** Use heavy stroke weights (8px+) with rounded caps. Use a glow effect on the leading edge of the progress indicator to signify momentum.
- **State Indicators:** Use "Live" badges—small pills with a pulsing opacity animation—to denote active heart rate tracking or GPS connectivity.
- **Inputs:** Darker than the card surface, with a 2px bottom-only border that illuminates in the Primary color when focused.
- **Tactile Sliders:** Thick tracks with oversized thumb grips for easy adjustment with sweaty hands or during movement.