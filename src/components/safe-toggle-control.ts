import { LitElement, css, html, nothing } from 'lit';
import { fireHaptic } from '../haptics';
import { t, type Lang } from '../i18n';
import { TimerBag, type Effect } from '../machines/effects';
import { multiTapReducer, type MultiTapEvent, type MultiTapState } from '../machines/multi-tap';
import { initialSlide, slideReducer, type SlideEvent, type SlideState } from '../machines/slide';
import { tapReducer, type TapState } from '../machines/tap';
import type { Direction, DirectionConfig } from '../types';

const RETURN_MS = 250;
const NUDGE_MS = 400;
const SLIDE_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter']);

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The guarded control row. Translates DOM input into reducer events and runs their
 * effects; the card owns what happens after `gesture-done`.
 */
export class SafeToggleControl extends LitElement {
  static properties = {
    direction: { attribute: false },
    cfg: { attribute: false },
    busy: { attribute: false },
    label: { attribute: false },
    targetColor: { attribute: false },
    lang: { attribute: false },
    haptics: { attribute: false },
    rtl: { attribute: false },
    slide: { state: true },
    multi: { state: true },
    nudging: { state: true },
  };

  declare direction: Direction | null;
  declare cfg: DirectionConfig;
  declare busy: boolean;
  declare label: string;
  declare targetColor: string;
  declare lang: Lang;
  declare haptics: boolean;
  declare rtl: boolean;
  declare slide: SlideState;
  declare multi: MultiTapState;
  declare nudging: boolean;

  private readonly timers = new TimerBag();
  private tap: TapState = { phase: 'idle' };
  /** Result of the last pointer press on the button; null when no pointer was involved. */
  private pointerTapped: boolean | null = null;
  private travelPx = 1;

  constructor() {
    super();
    this.direction = null;
    this.busy = false;
    this.label = '';
    this.targetColor = 'var(--primary-color)';
    this.lang = 'en';
    this.haptics = true;
    this.rtl = false;
    this.slide = initialSlide;
    this.multi = { phase: 'idle' };
    this.nudging = false;
  }

  private get disabled(): boolean {
    return this.direction === null || this.busy;
  }

  /** Back to the resting state; the card calls this whenever its flow returns to idle. */
  reset(): void {
    this.timers.clearAll();
    this.slide = initialSlide;
    this.multi = { phase: 'idle' };
    this.tap = { phase: 'idle' };
    this.pointerTapped = null;
    this.nudging = false;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.reset();
  }

  private emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private run(effects: Effect[], onTimeout: (id: string) => void): void {
    for (const fx of effects) {
      switch (fx.type) {
        case 'haptic':
          fireHaptic(this, fx.kind, this.haptics);
          break;
        case 'announce':
          this.emit('announce', t(fx.key, { lang: this.lang, vars: fx.vars }));
          break;
        case 'timer':
          this.timers.set(fx.id, fx.ms, () => onTimeout(fx.id));
          break;
        case 'cancelTimer':
          this.timers.clear(fx.id);
          break;
        case 'nudge':
          if (reducedMotion()) break;
          this.nudging = true;
          this.timers.set('nudge', NUDGE_MS, () => (this.nudging = false));
          break;
        case 'done':
          this.emit('gesture-done');
          break;
      }
    }
  }

  // Slide

  private dispatchSlide(e: SlideEvent): void {
    const before = this.slide.phase;
    const { state, effects } = slideReducer(this.slide, e, {
      travelPx: this.travelPx,
      holdMs: this.cfg.hold_ms,
    });
    this.slide = state;
    if (before === 'idle' && (state.phase === 'dragging' || state.phase === 'holding')) {
      this.emit('gesture-start');
    }
    this.run(effects, (id) => this.dispatchSlide({ type: 'timeout', id }));
    if (state.phase === 'returning' && before !== 'returning') {
      this.emit('gesture-cancel');
      if (reducedMotion()) this.dispatchSlide({ type: 'returned' });
      else this.timers.set('return', RETURN_MS, () => this.dispatchSlide({ type: 'returned' }));
    }
  }

  private logicalX(e: PointerEvent): number {
    return this.rtl ? -e.clientX : e.clientX;
  }

  private measure(): void {
    const track = this.renderRoot.querySelector<HTMLElement>('.track');
    const handle = this.renderRoot.querySelector<HTMLElement>('.handle');
    const gap = 8; // handle inset on both ends
    this.travelPx = Math.max(1, (track?.clientWidth ?? 0) - (handle?.offsetWidth ?? 0) - gap);
  }

  private onSlideDown(e: PointerEvent): void {
    if (this.disabled) return;
    const onHandle = e
      .composedPath()
      .some((n) => n instanceof HTMLElement && n.classList.contains('handle'));
    if (onHandle) {
      this.measure();
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // capture is best effort (synthetic events, old WebViews)
      }
    }
    this.dispatchSlide({ type: 'down', x: this.logicalX(e), onHandle });
  }

  private onSlideMove(e: PointerEvent): void {
    if (this.disabled) return;
    this.dispatchSlide({ type: 'move', x: this.logicalX(e) });
  }

  private onSlideUp(): void {
    if (!this.disabled) this.dispatchSlide({ type: 'up' });
  }

  private onSlideCancel(): void {
    this.dispatchSlide({ type: 'cancel' });
  }

  private onSlideKey(e: KeyboardEvent, pressed: boolean): void {
    if (this.disabled || !SLIDE_KEYS.has(e.key)) return;
    e.preventDefault();
    if (!pressed && e.key !== 'Enter') return;
    if (pressed && e.repeat && e.key === 'Enter') return;
    const k =
      this.rtl && e.key.startsWith('Arrow')
        ? e.key === 'ArrowRight'
          ? 'ArrowLeft'
          : 'ArrowRight'
        : e.key;
    this.dispatchSlide({ type: 'key', key: k as 'Enter', pressed });
  }

  // Tap / multi-tap

  private dispatchMulti(e: MultiTapEvent): void {
    const before = this.multi.phase;
    const { state, effects } = multiTapReducer(this.multi, e, {
      taps: this.cfg.taps,
      windowMs: this.cfg.tap_window_ms,
    });
    this.multi = state;
    if (before === 'idle' && state.phase === 'counting') this.emit('gesture-start');
    this.run(effects, (id) => this.dispatchMulti({ type: 'timeout', id }));
    if (e.type === 'timeout' && before === 'counting' && state.phase === 'idle') {
      this.emit('gesture-cancel');
    }
  }

  private activate(): void {
    if (this.disabled) return;
    if (this.cfg.gesture === 'multi_tap') {
      this.dispatchMulti({ type: 'tap', t: Date.now() });
    } else {
      this.emit('gesture-start');
      fireHaptic(this, 'success', this.haptics);
      this.emit('gesture-done');
    }
  }

  private onButtonPointer(e: PointerEvent): void {
    const ev = { x: e.clientX, y: e.clientY, t: Date.now() };
    if (e.type === 'pointerdown') {
      this.tap = tapReducer(this.tap, { type: 'down', ...ev }).state;
    } else if (e.type === 'pointerup') {
      const r = tapReducer(this.tap, { type: 'up', ...ev });
      this.tap = r.state;
      this.pointerTapped = r.tapped;
    } else {
      this.tap = tapReducer(this.tap, { type: 'cancel' }).state;
      this.pointerTapped = false;
    }
  }

  private onButtonClick(): void {
    const ok = this.pointerTapped !== false;
    this.pointerTapped = null;
    if (ok) this.activate();
  }

  private onButtonKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (!e.repeat) this.activate();
  }

  // Render

  private renderIcon() {
    if (this.busy) return html`<span class="spinner" aria-hidden="true"></span>`;
    const icon = this.rtl ? 'mdi:chevron-left' : 'mdi:chevron-right';
    return html`<ha-icon .icon=${icon}></ha-icon>`;
  }

  private renderSlide() {
    const p = this.slide.progress;
    const holding = this.slide.phase === 'holding';
    const label = holding ? t('hold_label', { lang: this.lang }) : this.label;
    return html`
      <div
        class="track ${this.nudging ? 'nudge' : ''} ${this.slide.phase}"
        style="--progress: ${p}; --target: ${this.targetColor}; --hold-ms: ${this.cfg.hold_ms}ms"
        dir=${this.rtl ? 'rtl' : 'ltr'}
        @pointerdown=${this.onSlideDown}
        @pointermove=${this.onSlideMove}
        @pointerup=${this.onSlideUp}
        @pointercancel=${this.onSlideCancel}
        @lostpointercapture=${this.onSlideUp}
      >
        <div class="fill"></div>
        <span class="label">${label}</span>
        <div
          class="handle"
          role="slider"
          tabindex=${this.disabled ? -1 : 0}
          aria-label=${this.label}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${Math.round(p * 100)}
          aria-valuetext=${label}
          aria-disabled=${this.disabled ? 'true' : 'false'}
          @keydown=${(e: KeyboardEvent) => this.onSlideKey(e, true)}
          @keyup=${(e: KeyboardEvent) => this.onSlideKey(e, false)}
        >
          ${holding ? html`<span class="hold-ring"></span>` : nothing} ${this.renderIcon()}
        </div>
      </div>
    `;
  }

  private renderButton() {
    const counting = this.multi.phase === 'counting' ? this.multi : null;
    const label = counting
      ? t('multi_tap_remaining', { lang: this.lang, vars: { n: this.cfg.taps - counting.n } })
      : this.label;
    return html`
      <div
        class="button ${counting ? 'counting' : ''}"
        role="button"
        tabindex=${this.disabled ? -1 : 0}
        aria-disabled=${this.disabled ? 'true' : 'false'}
        style="--target: ${this.targetColor}; --window-ms: ${this.cfg.tap_window_ms}ms"
        @pointerdown=${this.onButtonPointer}
        @pointerup=${this.onButtonPointer}
        @pointercancel=${this.onButtonPointer}
        @click=${this.onButtonClick}
        @keydown=${this.onButtonKey}
      >
        ${counting ? html`<span class="countdown"></span>` : nothing}
        ${this.busy ? html`<span class="spinner" aria-hidden="true"></span>` : nothing}
        <span class="label">${label}</span>
      </div>
    `;
  }

  render() {
    return this.cfg.gesture === 'slide' ? this.renderSlide() : this.renderButton();
  }

  static styles = css`
    :host {
      display: block;
      --row-height: var(--feature-height, 42px);
      --row-radius: var(--feature-border-radius, 12px);
    }
    .track,
    .button {
      position: relative;
      height: var(--row-height);
      border-radius: var(--row-radius);
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      box-sizing: border-box;
    }
    .track {
      /* vertical swipes scroll the page; the browser then sends pointercancel */
      touch-action: pan-y;
    }
    .fill {
      position: absolute;
      inset: 0;
      inset-inline-end: auto;
      width: calc(var(--row-height) + (100% - var(--row-height)) * var(--progress));
      background: color-mix(in srgb, var(--target) 25%, transparent);
    }
    .label {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-inline: calc(var(--row-height) + 8px);
      color: var(--primary-text-color);
      font-size: var(--ha-font-size-m, 14px);
      font-weight: var(--ha-font-weight-medium, 500);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
    .track .label {
      opacity: calc(1 - var(--progress) * 1.5);
    }
    .handle {
      position: absolute;
      top: 4px;
      inset-inline-start: calc(4px + (100% - var(--row-height)) * var(--progress));
      width: calc(var(--row-height) - 8px);
      height: calc(var(--row-height) - 8px);
      border-radius: calc(var(--row-radius) - 4px);
      background: var(--target);
      color: var(--text-primary-color, #fff);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
      --mdc-icon-size: 20px;
    }
    .handle:focus-visible,
    .button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .track.returning .handle,
    .track.returning .fill,
    .track.idle .handle,
    .track.idle .fill {
      transition:
        inset-inline-start 0.25s ease,
        width 0.25s ease;
    }
    .track.dragging .handle,
    .track.holding .handle {
      cursor: grabbing;
    }
    .hold-ring {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: rgba(255, 255, 255, 0.35);
      transform-origin: left;
      animation: hold var(--hold-ms) linear forwards;
    }
    @keyframes hold {
      from {
        transform: scaleX(0);
      }
      to {
        transform: scaleX(1);
      }
    }
    .nudge .handle {
      animation: nudge 0.4s ease;
    }
    @keyframes nudge {
      40% {
        translate: 12px;
      }
    }
    [dir='rtl'].nudge .handle {
      animation-direction: reverse;
    }
    .button {
      cursor: pointer;
      background: color-mix(
        in srgb,
        var(--target) 20%,
        var(--secondary-background-color, transparent)
      );
    }
    .countdown {
      position: absolute;
      inset-block-end: 0;
      inset-inline-start: 0;
      height: 3px;
      width: 100%;
      background: var(--warning-color, #ffa600);
      transform-origin: left;
      animation: drain var(--window-ms) linear forwards;
    }
    .counting {
      outline: 2px solid var(--warning-color, #ffa600);
      outline-offset: -2px;
    }
    @keyframes drain {
      to {
        transform: scaleX(0);
      }
    }
    [aria-disabled='true'],
    .handle[aria-disabled='true'] {
      cursor: default;
    }
    .button[aria-disabled='true'],
    .handle[aria-disabled='true'] {
      opacity: 0.5;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-inline-end-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .button .spinner {
      position: absolute;
      inset-inline-start: 12px;
      top: calc(50% - 10px);
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .nudge .handle,
      .spinner,
      .countdown {
        animation: none;
      }
      .track .handle,
      .track .fill {
        transition: none;
      }
    }
  `;
}

if (!customElements.get('safe-toggle-control')) {
  customElements.define('safe-toggle-control', SafeToggleControl);
}
