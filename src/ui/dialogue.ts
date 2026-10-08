/**
 * Dialogue / narration box. Lines type out (skippable); tap, click, Enter, Space or
 * E advances. Resolves once the last line is dismissed.
 */

export interface Line {
  text: string;
  speaker?: string;
  style?: 'narration' | 'terminal' | 'system';
}

export class Dialogue {
  readonly el: HTMLDivElement;
  private speakerEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private moreEl: HTMLDivElement;
  private queue: Line[] = [];
  private resolve: (() => void) | null = null;
  private typing = false;
  private full = '';
  private shown = 0;
  private timer = 0;
  private lastAdvance = 0;
  onType: (() => void) | null = null;
  onOpenChange: ((open: boolean) => void) | null = null;
  speed = () => 55;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'dialogue';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-live', 'polite');
    this.el.tabIndex = -1;
    this.speakerEl = document.createElement('div');
    this.speakerEl.className = 'speaker';
    this.textEl = document.createElement('div');
    this.textEl.className = 'text';
    this.moreEl = document.createElement('div');
    this.moreEl.className = 'more';
    this.moreEl.textContent = '▼ WEITER';
    this.el.append(this.speakerEl, this.textEl, this.moreEl);
    parent.append(this.el);
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.advance();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (!e.repeat) this.advance();
      }
    });
  }

  get open(): boolean {
    return this.resolve !== null;
  }

  /** Full text of the current line (also while it is still typing). */
  get text(): string {
    return this.open ? this.full : '';
  }

  say(lines: Line[]): Promise<void> {
    // A new conversation replaces a pending one (never stack two).
    if (this.resolve) this.finish();
    this.queue = lines.slice();
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.el.classList.add('show');
      this.onOpenChange?.(true);
      this.next();
    });
  }

  private next(): void {
    const line = this.queue.shift();
    if (!line) {
      this.finish();
      return;
    }
    this.el.className = `dialogue show ${line.style ?? 'narration'}`;
    this.speakerEl.textContent = line.speaker ?? '';
    this.speakerEl.style.display = line.speaker ? '' : 'none';
    this.full = line.text;
    this.shown = 0;
    this.typing = true;
    this.moreEl.classList.add('hidden');
    const cps = this.speed();
    if (cps <= 0) {
      this.complete();
      return;
    }
    const step = () => {
      if (!this.typing) return;
      this.shown = Math.min(this.full.length, this.shown + 1);
      this.textEl.textContent = this.full.slice(0, this.shown);
      if (this.shown % 3 === 0) this.onType?.();
      if (this.shown >= this.full.length) this.complete();
      else this.timer = window.setTimeout(step, 1000 / cps);
    };
    this.textEl.textContent = '';
    step();
  }

  private complete(): void {
    this.typing = false;
    window.clearTimeout(this.timer);
    this.textEl.textContent = this.full;
    this.moreEl.classList.remove('hidden');
    this.moreEl.textContent = this.queue.length ? '▼ WEITER' : '■ OK';
  }

  advance(): void {
    const now = performance.now();
    if (now - this.lastAdvance < 120) return;
    this.lastAdvance = now;
    if (!this.open) return;
    if (this.typing) this.complete();
    else this.next();
  }

  private finish(): void {
    window.clearTimeout(this.timer);
    this.typing = false;
    this.el.classList.remove('show');
    const r = this.resolve;
    this.resolve = null;
    this.queue = [];
    this.onOpenChange?.(false);
    r?.();
  }

  /** Force-close (scene change, menu). */
  close(): void {
    if (this.open) this.finish();
  }
}
