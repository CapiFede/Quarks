# Quarks App — UI Kit

## Overview
High-fidelity interactive recreation of the Quarks desktop app.

- **Shell:** Custom title bar with tabs, home/quark navigation, settings menu, window controls (min/max/close)
- **Launcher:** Responsive grid of QuarkCards, each opening in a new tab
- **Quark Music:** Full music player with search, track list, player controls, playlist toolbar, download drawer, song info drawer

## Files
- `index.html` — main interactive prototype (loads all JSX components)
- `Shell.jsx` — window frame, title bar, tab system
- `LauncherGrid.jsx` — home screen grid
- `MusicPage.jsx` — music quark page (search + track list layout)
- `PlayerControls.jsx` — bottom player bar
- `PlaylistToolbar.jsx` — playlist chips + action buttons
- `Drawers.jsx` — download drawer, song info drawer

## Design width
900×600px (matches Flutter `windowOptions` in main.dart), scaled to viewport.

## Notes
- All icons via Material Icons CDN (matches Flutter Material Icons usage)
- Font: Silkscreen via Google Fonts
- No real audio playback — fake state only
- Drawers overlay the content area absolutely
