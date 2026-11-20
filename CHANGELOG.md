# Changelog

All notable changes to Safe Toggle Card. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

Each release on GitHub uses the section for its version as the release notes.

## [Unreleased]

## [0.1.6] - 2026-11-20

### Changed

- Safe Toggle Card is in the HACS default store. The README now tells you to search for it in HACS, or use the Open in HACS button. Adding it as a custom repository is still described for older HACS versions.
- The manual install steps add a version number to the resource URL, so browsers and the Companion app load the new file after an update, and show the entry for dashboards in YAML mode.

## [0.1.5] - 2026-11-20

### Changed

- The repository is now `uded/safe-toggle-card`, the same name as the card. The old `slide-and-confirm-card` address redirects here, and existing dashboards keep working: the card type is still `custom:safe-toggle-card`.

## [0.1.4] - 2026-11-20

### Changed

- The README shows the card in Home Assistant: a slide, a multi-tap and the confirmation dialog. The screenshots also appear on the card's page in HACS.
- The repository is ready for the HACS default store. Every HACS validation check passes.

## [0.1.3] - 2026-11-19

### Added

- `color` option, the same as in HA's Tile card: `state` (default), a theme color name like `red` or `deep-purple`, or a hex value like `#8e44ad`. It colors the slider in both directions, and the header icon while the entity is active.
- Color picker in the visual editor, right after Icon. Picking "state" removes `color` from the YAML.

## [0.1.2] - 2026-11-19

### Fixed

- The slide handle is readable on light themes. The chevron now mixes the state color with the theme's text color: 4:1 contrast on HA's default light theme (it was about 1.6:1), 7:1 on dark.
- A thin ring in the state color gives the handle an edge on the pale tint.

## [0.1.1] - 2026-11-19

### Changed

- The slide control is quiet until you use it. The handle looks like HA's tile icon, a soft tint of the state color with the chevron in full color, instead of a solid block.
- The fill behind the handle is invisible at rest and grows with your drag. The tinted box around the handle is gone.
- The slider label uses the secondary text color and normal weight, so it no longer competes with the entity name.
- Card padding is 12px, on HA's 4px grid.

### Developer

- The demo page loads HA's real default light and dark theme, generated from the `home-assistant/frontend` sources.

## [0.1.0] - 2026-11-19

### Added

- First release. One card that toggles an entity behind a protection you choose separately for turning on and turning off:
  - slide, optionally held at the end
  - multi-tap with a visible countdown
  - tap with a confirmation dialog
  - an optional PIN after any of them, set inline or read from an `input_text`
- Works with `input_boolean`, `switch`, `light`, `lock`, `script`, `scene` and other on/off entities, with an optional custom action per direction.
- Visual editor with presets, English and Polish, haptics in the Companion app, keyboard control and screen reader announcements.

[Unreleased]: https://github.com/uded/safe-toggle-card/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/uded/safe-toggle-card/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/uded/safe-toggle-card/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/uded/safe-toggle-card/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/uded/safe-toggle-card/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/uded/safe-toggle-card/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/uded/safe-toggle-card/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/uded/safe-toggle-card/releases/tag/v0.1.0
