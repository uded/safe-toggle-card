# Safe Toggle Card

A Home Assistant Lovelace card that switches one entity on or off, behind protection against accidental activation. Slide like an iPhone, tap several times, confirm in a dialog, or enter a PIN. Each direction gets its own protection: unlocking the front door can need a slide and a PIN, while locking it is a single tap.

The card follows your Home Assistant theme: state colors, MDI icons, card radius and fonts all come from the theme.

| Slide                                                                                                    | Multi-tap                                                                                                          | Dialog                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| ![Slide to turn on](https://raw.githubusercontent.com/uded/slide-and-confirm-card/main/images/slide.png) | ![Tap 3 times to turn on](https://raw.githubusercontent.com/uded/slide-and-confirm-card/main/images/multi-tap.png) | ![Confirmation dialog](https://raw.githubusercontent.com/uded/slide-and-confirm-card/main/images/dialog.png) |

## Installation

### HACS

1. In HACS, open the menu (⋮) and choose **Custom repositories**.
2. Add this repository's URL with the type **Dashboard**.
3. Install **Safe Toggle Card** and reload the browser.

### Manual

1. Download `safe-toggle-card.js` from the latest release into `config/www/`.
2. In **Settings → Dashboards → ⋮ → Resources**, add `/local/safe-toggle-card.js` as a **JavaScript module**.

Requires Home Assistant 2024.8 or newer.

## Quick start

Add the card from the card picker and set everything in the visual editor, or use YAML:

```yaml
type: custom:safe-toggle-card
entity: lock.front_door
activate: # unlocking
  gesture: slide
  confirm: pin
deactivate: # locking
  gesture: tap
pin:
  source: inline
  hash: v1$...$... # written by the visual editor
```

## How it works

The card looks at the entity and works out which way the next switch goes:

- **activate** switches it to the active state (on, unlocked, running).
- **deactivate** switches it back (off, locked, stopped).

The direction is fixed when you start a gesture. If the entity changes state while you are sliding or entering a PIN, the card cancels instead of sending the old intent. While the action runs, the control is disabled until Home Assistant reports the new state (or 10 s pass), so one gesture can never fire twice.

### Supported entities

| Domain                                                                         | activate                | deactivate                   |
| ------------------------------------------------------------------------------ | ----------------------- | ---------------------------- |
| `input_boolean`, `switch`, `light`, `fan`, `automation`, `siren`, `humidifier` | `<domain>.turn_on`      | `<domain>.turn_off`          |
| `lock`                                                                         | `lock.unlock`           | `lock.lock`                  |
| `script`                                                                       | `script.turn_on` (run)  | `script.turn_off` (stop)     |
| `scene`                                                                        | `scene.turn_on`         | (none, scenes are stateless) |
| any other entity whose state is `on` or `off`                                  | `homeassistant.turn_on` | `homeassistant.turn_off`     |

## Options

| Option          | Default       | Description                                                                                                                                   |
| --------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`        | required      | The entity to switch.                                                                                                                         |
| `name`          | friendly name | Name in the header.                                                                                                                           |
| `icon`          | entity icon   | Icon in the header.                                                                                                                           |
| `color`         | `state`       | Card color, as in the Tile card: a theme color name (`red`, `teal`, ...) or a hex value. Colors the slider, and the header icon while active. |
| `show_state`    | `true`        | Show the state under the name.                                                                                                                |
| `header_action` | `none`        | `none` or `more-info`. See [Security](#security).                                                                                             |
| `haptics`       | `true`        | Haptic feedback (Companion app, Android browsers).                                                                                            |
| `language`      | `auto`        | `auto` (follows Home Assistant), `en` or `pl`.                                                                                                |
| `activate`      | slide         | Protection when switching to active. See [Direction options](#direction-options).                                                             |
| `deactivate`    | slide         | Protection when switching back.                                                                                                               |
| `pin`           |               | Required when a direction uses `confirm: pin`. See [PIN](#pin).                                                                               |
| `texts`         |               | Text overrides for the whole card. See [Texts](#texts).                                                                                       |

### Direction options

| Option          | Default | Description                                                                                              |
| --------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `gesture`       | `slide` | `tap`, `multi_tap` or `slide`.                                                                           |
| `taps`          | `3`     | `multi_tap`: number of taps, 2 to 10.                                                                    |
| `tap_window_ms` | `2000`  | `multi_tap`: all taps must land within this time from the first one, 500 to 10000.                       |
| `hold_ms`       | `0`     | `slide`: hold at the end this long before it fires, 0 to 5000. `0` fires on release.                     |
| `confirm`       | `none`  | `none`, `dialog` (confirmation dialog) or `pin`.                                                         |
| `action`        |         | Replace the default service, e.g. `perform_action: script.open_gate`, with optional `target` and `data`. |
| `texts`         |         | Text overrides for this direction only.                                                                  |

### Presets

The editor offers these combinations; anything else is "Custom".

| Preset          | gesture     | hold_ms | confirm  |
| --------------- | ----------- | ------- | -------- |
| Tap             | `tap`       |         | `none`   |
| Tap + confirm   | `tap`       |         | `dialog` |
| Tap + PIN       | `tap`       |         | `pin`    |
| Multi-tap       | `multi_tap` |         | `none`   |
| Multi-tap + PIN | `multi_tap` |         | `pin`    |
| Slide           | `slide`     | `0`     | `none`   |
| Slide and hold  | `slide`     | `800`   | `none`   |
| Slide + PIN     | `slide`     | `0`     | `pin`    |

## PIN

| Option         | Default  | Description                                                    |
| -------------- | -------- | -------------------------------------------------------------- |
| `source`       | `inline` | `inline` (hash stored in the card) or `entity` (`input_text`). |
| `hash`         |          | `inline`: written by the visual editor. Never the PIN itself.  |
| `entity`       |          | `entity`: an `input_text` holding the PIN.                     |
| `length`       | `4`      | `inline`: number of digits, 4 to 8.                            |
| `max_attempts` | `5`      | Wrong attempts before the keypad locks.                        |
| `lockout_s`    | `30`     | How long it stays locked. `0` never locks.                     |

The visual editor stores only a salted SHA-256 hash. On a YAML-mode dashboard, generate the hash in a shell (replace `1234` with your PIN):

```sh
salt=$(openssl rand -hex 16); printf 'v1$%s$%s\n' "$salt" "$(printf '%s%s' "$salt" 1234 | shasum -a 256 | cut -d' ' -f1)"
```

`!secret` cannot be used: the frontend never receives `secrets.yaml`.

## Texts

Every text can be overridden, per card (`texts:`) or per direction (`activate.texts:`). Placeholders: `{target}` (the verb, such as "unlock"), `{name}`, `{n}`, `{s}`, `{message}`, `{entity}`, `{time}`.

```yaml
activate:
  texts:
    slide_label: Slide to open the gate
    confirm_text: Open {name} now?
```

Keys: `slide_label`, `tap_label`, `multi_tap_label`, `multi_tap_remaining`, `hold_label`, `confirm_title`, `confirm_text`, `confirm_ok`, `confirm_cancel`, `pin_title`, `pin_wrong`, `pin_locked`, `pin_entity_unavailable`, `pin_backspace`, `pin_submit`, `cancelled`, `state_changed`, `pending`, `done`, `error`, `entity_not_found`, `last_activated`, `header_action_warning`, and the verbs `verb_turn_on`, `verb_turn_off`, `verb_unlock`, `verb_lock`, `verb_run`, `verb_stop`, `verb_activate`.

## Security

This card protects against kids, pockets and stray taps. It does not protect against people.

- Anyone who can open the dashboard can call the service directly, from Developer Tools or the API.
- An inline PIN is stored as a salted hash, but a 4 digit PIN is quick to brute force from the hash.
- An `input_text` PIN is readable by every user who can see that entity.
- The wrong-attempt lockout lives in the browser and resets on reload.
- `header_action: more-info` opens Home Assistant's details dialog, whose own controls are not guarded.

For real access control, use Home Assistant users and permissions, or an alarm panel with a code checked on the server.

## Accessibility

- Every control works with the keyboard. The slider uses arrow keys, Home and End, then Enter. With `hold_ms`, hold Enter.
- State changes, remaining taps and errors are announced to screen readers.
- Animations are reduced when the system asks for reduced motion.

## Development

```sh
npm ci
task test    # unit tests
task lint    # type-check and formatting
task build   # dist/safe-toggle-card.js
task dev     # demo page with a simulated Home Assistant
```

## License

MIT
