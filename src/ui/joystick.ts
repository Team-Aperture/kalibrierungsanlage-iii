/** Optional on-screen joystick for touch devices (enabled in the settings). */
export class Joystick {
  readonly el: HTMLDivElement;
  private knob: HTMLDivElement;
  private active: number | null = null;
  value = { x: 0, y: 0 };

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'joystick';
    this.el.setAttribute('aria-hidden', 'true');
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.el.append(this.knob);
    parent.append(this.el);
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.active = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      this.move(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.active) this.move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.active) return;
      this.active = null;
      this.value.x = 0;
      this.value.y = 0;
      this.knob.style.transform = '';
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  private move(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = r.width / 2 - 10;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max;
    const ny = dy / max;
    const mag = Math.hypot(nx, ny);
    if (mag < 0.18) {
      this.value.x = 0;
      this.value.y = 0;
    } else {
      this.value.x = nx;
      this.value.y = ny;
    }
  }

  setEnabled(on: boolean): void {
    this.el.classList.toggle('show', on);
    if (!on) {
      this.value.x = 0;
      this.value.y = 0;
      this.knob.style.transform = '';
    }
  }
}
