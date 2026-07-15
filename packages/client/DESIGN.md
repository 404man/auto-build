---
name: DevOps Precision
colors:
  surface: '#faf8ff'
  surface-dim: '#d8d9e6'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#ecedfa'
  surface-container-high: '#e6e7f4'
  surface-container-highest: '#e1e2ee'
  on-surface: '#191b24'
  on-surface-variant: '#424656'
  inverse-surface: '#2e303a'
  inverse-on-surface: '#eff0fd'
  outline: '#727687'
  outline-variant: '#c2c6d8'
  surface-tint: '#0054d6'
  primary: '#0050cb'
  on-primary: '#ffffff'
  primary-container: '#0066ff'
  on-primary-container: '#f8f7ff'
  inverse-primary: '#b3c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#a33200'
  on-tertiary: '#ffffff'
  tertiary-container: '#cc4204'
  on-tertiary-container: '#fff6f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#001849'
  on-primary-fixed-variant: '#003fa4'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832600'
  background: '#faf8ff'
  on-background: '#191b24'
  surface-variant: '#e1e2ee'
typography:
  h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  code-block:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  h1-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1280px
  gutter: 16px
---

## Brand & Style

The design system is engineered for developers who demand high-velocity feedback and clarity during local builds. The brand personality is technical, reliable, and hyper-efficient. It draws heavily from **Minimalism** and **Developer-Centric** aesthetics, prioritizing data density without sacrificing legibility. 

The visual language is characterized by sharp precision, high-contrast states, and a utilitarian layout reminiscent of modern cloud infrastructure dashboards. It avoids unnecessary ornamentation, using "Terminal-inspired" elements to bridge the gap between the command line and the graphical user interface. The emotional response should be one of control, speed, and technical confidence.

## Colors

The palette is optimized for a clean, high-clarity light mode to ensure maximum readability in well-lit environments.

- **Primary (Electric Blue):** Used for primary calls to action, active build indicators, and focused states. It represents progress and motion.
- **Secondary (Emerald Green):** Dedicated exclusively to successful build states, completed deployments, and "Ready" indicators.
- **Background/Surface:** A crisp white-to-light-grey hierarchy provides the structural foundation. Surfaces use subtle tonal shifts to define modular sections.
- **Borders:** Subtle but high-contrast borders replace shadows to define architecture, ensuring clarity and a professional, "blueprinted" feel.

## Typography

This design system utilizes **Inter** as the primary typeface for all UI elements, including headlines, body text, and labels. This unified approach provides a consistent, highly legible, and neutral foundation across navigation, settings, and general interface components.

**JetBrains Mono** is utilized for all technical output, including build logs, terminal emulators, commit hashes, and file paths. This distinction helps the user mentally switch between "Managing" (UI) and "Building" (Code). Use `label-mono` for small technical labels like branch names or version numbers to maintain a tool-like aesthetic.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid** model. The sidebar remains fixed at 240px, while the main content area expands to a maximum width of 1280px. Content is organized into a modular 12-column grid.

Spacing follows a strict 4px baseline rhythm. 16px (`md`) is the default padding for cards and containers, while 12px (`sm`) is used for internal component spacing (e.g., button groups). On mobile, horizontal margins reduce to 16px, and multi-column card layouts reflow into a single vertical stack.

## Elevation & Depth

In light mode, depth is conveyed through **Tonal Layering** and **Low-contrast Outlines** rather than traditional shadows. 

1. **Base Layer:** Background for the global canvas.
2. **Surface Layer:** Card containers with a 1px border.
3. **Elevated Layer:** Hover states or active modals use a slightly lighter surface or a primary-colored border.

Shadows, if used for modals or dropdowns, are light and diffused (0px 2px 8px rgba(0,0,0,0.08)) to lift elements without introducing visual clutter.

## Shapes

The shape language is "Soft-Industrial." A standard 4px (`roundedness: 1`) corner radius is applied to buttons, input fields, and cards. This provides a clean, modern feel that remains technical and "engineered."

Fully sharp corners (0px) are reserved for terminal-like output windows to emphasize their difference from standard UI elements. High-contrast indicators (like status pips) use circles for maximum visibility.

## Components

- **Buttons:** Primary buttons are solid Electric Blue with white text. Secondary buttons are outlined in the border color with a subtle hover-fill.
- **Build Status Chips:** Use a combination of a colored "pulse" dot and mono-type labels. Green for success, Blue for running, Amber for warning, Red for failure.
- **Log Viewer:** A dedicated component using JetBrains Mono on a contrasting background. Features syntax highlighting for common build errors and file paths.
- **Cards:** Used to group build steps or project overviews. They feature a 1px border, no shadow, and a clear header section separated by a horizontal rule.
- **Inputs:** White backgrounds with a 1px border. Focus state is indicated by an Electric Blue border glow (0px 0px 0px 2px).
- **Icons:** Use 20px or 24px line-art icons (1.5px stroke weight). Icons for Git (branch/commit) and Build (hammer/box) should be standard across the platform.