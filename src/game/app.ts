/**
 * GameApp – owns state, settings, audio, input and UI, and drives the Phaser game.
 * Scenes and room scripts talk to the rest of the program only through this class
 * (and the ScriptCtx facade built on it).
 */

import Phaser from 'phaser';
import { AudioEngine, type Ambience } from '../audio/audio';
import { GameState } from '../state/gameState';
import { clearSave, defaultSave, loadSave, writeSave } from '../state/save';
import { loadSettings, saveSettings } from '../state/settings';
import type { ItemId, RoomId, Settings } from '../state/types';
import { endingPanel } from '../ui/ending';
import { inventoryPanel } from '../ui/inventory';
import { aboutPanel, confirmPanel, mainMenu, pauseMenu, settingsPanel } from '../ui/menus';
import { puzzlePanel } from '../ui/puzzlePanel';
import { reader } from '../ui/terminal';
import { UI } from '../ui/ui';
import type { DisplayLayout } from './display';
import { InputManager, type GameAction } from './input';
import { ROOMS } from './rooms';
import { BootScene } from './scenes/BootScene';
import { WorldScene, type WorldSceneData } from './scenes/WorldScene';

type Mode = 'boot' | 'menu' | 'play' | 'paused' | 'ending';

export class GameApp {
  readonly state = new GameState();
  readonly audio = new AudioEngine();
  readonly input = new InputManager();
  settings: Settings;
  readonly ui: UI;
  game!: Phaser.Game;
  scene: WorldScene | null = null;
  mode: Mode = 'boot';
  private hasSave = false;
  private saveNotice = '';
  private persistTimer = 0;
  private pauseModal: HTMLElement | null = null;
  private lastTick = performance.now();
  private transitioning = false;

  constructor() {
    this.settings = loadSettings();
    this.ui = new UI(
      {
        verb: (id) => this.scene?.focusAction(id),
        pause: () => this.togglePause(),
        inventory: () => this.openInventory(),
        markers: () => this.scene?.toggleMarkers(),
        layout: (l) => this.onLayout(l),
        cancelItem: () => this.ui.setPendingItem(null),
      },
      () => this.settings,
    );
    this.input.joy = this.ui.joystick.value;
    this.input.blocked = () => this.mode !== 'play' || this.ui.blocking || !!this.scene?.inputLocked || this.transitioning;
    this.input.on('action', (a) => this.onAction(a));
    this.applySettings(this.settings, false);
    this.state.on('change', ({ kind }) => {
      if (kind === 'item') this.ui.setInventoryCount(this.state.data.inventory.length, true);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.persistNow();
        if (this.mode === 'play' && !this.ui.hasModal) this.pause();
        this.audio.suspend();
      } else if (this.mode !== 'boot') this.audio.resume();
    });
    window.addEventListener('pagehide', () => this.persistNow());
    // First gesture anywhere unlocks audio (autoplay policy).
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  // ------------------------------------------------------------------ boot

  start(): void {
    const l = this.ui.layout!;
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: l.gameW,
      height: l.gameH,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#07080d',
      banner: false,
      disableContextMenu: true,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.NONE, zoom: l.cssPx },
      input: { activePointers: 2, keyboard: false },
      render: { antialias: false, pixelArt: true, powerPreference: 'high-performance', clearBeforeRender: true },
      scene: [BootScene, WorldScene],
      callbacks: { preBoot: (game) => game.registry.set('app', this) },
    });
  }

  private onLayout(l: DisplayLayout): void {
    if (!this.game) return;
    this.game.scale.resize(l.gameW, l.gameH);
    this.game.scale.setZoom(l.cssPx);
  }

  /** Called by BootScene once every texture is baked. */
  booted(): void {
    const res = loadSave();
    if (res.ok) {
      this.state.reset(res.data);
      this.hasSave = true;
    } else {
      this.state.reset(defaultSave());
      this.hasSave = false;
      if (res.reason === 'corrupt') this.saveNotice = 'Der gespeicherte Spielstand war beschädigt und wurde ignoriert.';
      if (res.reason === 'incompatible') this.saveNotice = 'Der gespeicherte Spielstand stammt aus einer inkompatiblen Version.';
    }
    document.getElementById('loader')?.remove();
    this.showMainMenu();
  }

  sceneReady(scene: WorldScene): void {
    this.scene = scene;
    this.ui.setStatus(scene.room.status(this.state));
    this.ui.setInventoryCount(this.state.data.inventory.length);
  }

  sceneGone(scene: WorldScene): void {
    if (this.scene === scene) this.scene = null;
  }

  private startWorld(data: WorldSceneData): void {
    this.game.scene.start('world', data);
  }

  // ------------------------------------------------------------------ menus

  showMainMenu(): void {
    this.mode = 'menu';
    this.ui.closeAll();
    this.ui.setInGame(false);
    this.audio.duck(true);
    this.startWorld({ roomId: this.state.room, arrival: 'saved', attract: true });
    const info = this.hasSave
      ? `SPIELSTAND: ${ROOMS[this.state.room].title.toUpperCase()}${this.state.data.chapterComplete ? ' · ABGESCHLOSSEN' : ''}`
      : this.saveNotice || undefined;
    const menu = mainMenu({
      hasSave: this.hasSave,
      saveInfo: info,
      onContinue: () => {
        this.ui.closeModal(menu.el);
        this.continueGame();
      },
      onNew: () => {
        if (!this.hasSave) {
          this.ui.closeModal(menu.el);
          this.newGame();
          return;
        }
        const c = confirmPanel(
          'NEUES SPIEL',
          'Der vorhandene Spielstand wird überschrieben.',
          'Neu beginnen',
          () => {
            this.ui.closeModal(c.el);
            this.ui.closeModal(menu.el);
            this.newGame();
          },
          () => this.ui.closeModal(c.el),
        );
        this.ui.openModal(c);
      },
      onSettings: () => this.openSettings(),
      onAbout: () => {
        const a = aboutPanel(() => this.ui.closeModal(a.el));
        this.ui.openModal(a);
      },
    });
    this.ui.openModal(menu);
  }

  newGame(): void {
    this.audio.unlock();
    clearSave();
    this.state.reset(defaultSave());
    this.hasSave = true;
    this.persistNow();
    this.enterPlay({ roomId: 'wartungszelle', arrival: 'start' });
  }

  continueGame(): void {
    this.audio.unlock();
    this.enterPlay({ roomId: this.state.room, arrival: 'saved' });
  }

  private enterPlay(data: WorldSceneData): void {
    this.mode = 'play';
    this.ui.setInGame(true);
    this.ui.setPendingItem(null);
    this.audio.duck(false);
    this.lastTick = performance.now();
    this.startWorld(data);
  }

  togglePause(): void {
    if (this.mode === 'paused') this.resume();
    else if (this.mode === 'play') this.pause();
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.persistNow();
    this.game.scene.pause('world');
    this.audio.duck(true);
    const m = pauseMenu({
      room: ROOMS[this.state.room].title.toUpperCase(),
      onResume: () => this.resume(),
      onInventory: () => this.openInventory(),
      onSettings: () => this.openSettings(),
      onMenu: () => {
        this.persistNow();
        this.ui.closeAll();
        this.pauseModal = null;
        this.game.scene.resume('world');
        this.showMainMenu();
      },
    });
    m.onClose = () => {
      if (this.pauseModal === m.el) {
        this.pauseModal = null;
        this.resume();
      }
    };
    this.pauseModal = m.el;
    this.ui.openModal(m);
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    if (this.pauseModal) {
      const el = this.pauseModal;
      this.pauseModal = null;
      this.ui.closeModal(el);
    }
    this.mode = 'play';
    this.lastTick = performance.now();
    this.game.scene.resume('world');
    this.audio.duck(false);
  }

  private onAction(a: GameAction): void {
    if (a === 'pause') {
      if (this.ui.pendingItem) {
        this.ui.setPendingItem(null);
        return;
      }
      if (this.ui.hasModal) {
        this.ui.closeTop();
        return;
      }
      if (this.ui.dialogue.open) return;
      if (this.mode === 'play' || this.mode === 'paused') this.togglePause();
      return;
    }
    if (this.mode !== 'play') return;
    if (a === 'primary') this.scene?.focusAction();
    else if (a === 'look') this.scene?.focusAction('look');
    else if (a === 'inventory') this.openInventory();
    else if (a === 'markers') this.scene?.toggleMarkers();
  }

  openSettings(): void {
    const fsSupported = !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
    const panel = settingsPanel({
      settings: this.settings,
      onChange: (s) => this.applySettings(s, true),
      onClose: () => this.ui.closeModal(panel.el),
      onDeleteSave:
        this.mode === 'menu' && this.hasSave
          ? () => {
              const c = confirmPanel(
                'SPIELSTAND LÖSCHEN',
                'Der lokale Spielstand wird endgültig entfernt. Einstellungen bleiben erhalten.',
                'Löschen',
                () => {
                  clearSave();
                  this.hasSave = false;
                  this.state.reset(defaultSave());
                  this.ui.closeAll();
                  this.showMainMenu();
                },
                () => this.ui.closeModal(c.el),
              );
              this.ui.openModal(c);
            }
          : undefined,
      fullscreen: {
        supported: fsSupported,
        active: () => !!document.fullscreenElement,
        toggle: () => {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
          else void document.documentElement.requestFullscreen().catch(() => undefined);
        },
      },
    });
    this.ui.openModal(panel);
  }

  applySettings(s: Settings, save: boolean): void {
    this.settings = s;
    this.ui.applySettings(s);
    this.audio.setVolume(s.volume, s.muted);
    if (save) saveSettings(s);
  }

  openInventory(): void {
    if (this.mode !== 'play' && this.mode !== 'paused') return;
    if (this.ui.blocking && this.mode === 'play') return;
    const p = inventoryPanel({
      items: this.state.data.inventory.slice(),
      onUse: (item) => {
        this.ui.closeModal(p.el);
        if (this.mode === 'paused') this.resume();
        this.beginItemUse(item);
      },
      onClose: () => this.ui.closeModal(p.el),
    });
    this.ui.openModal(p);
  }

  private beginItemUse(item: ItemId): void {
    // If something that accepts items is in reach, use it right away; otherwise pick a target.
    const focus = this.scene?.focusedProp;
    if (focus && this.scene) {
      void this.scene.useItemOn(focus, item);
      return;
    }
    this.ui.setPendingItem(item);
  }

  // ------------------------------------------------------------------ content helpers

  openReader(title: string, lines: string[], paper = false): Promise<void> {
    return new Promise((resolve) => {
      const r = reader({
        title,
        lines,
        paper,
        speed: this.settings.textSpeed === 0 ? 0 : 140,
        onLine: () => this.audio.sfx('type', { volume: 0.6 }),
        onClose: () => this.ui.closeModal(r.el),
      });
      r.onClose = () => resolve();
      this.ui.openModal(r);
    });
  }

  /** Opens the Energiepfad panel. Resolves true when the puzzle got solved. */
  openPuzzle(): Promise<boolean> {
    return new Promise((resolve) => {
      const pz = this.state.puzzle;
      let solved = false;
      const panel = puzzlePanel({
        rot: pz.rot,
        moves: pz.moves,
        hints: pz.hints,
        reducedMotion: this.settings.reducedMotion,
        sfx: (n) => this.audio.sfx(n),
        onChange: (rot, moves) => {
          pz.rot = rot;
          pz.moves = moves;
          this.state.puzzleChanged();
          this.persist();
        },
        onHint: (stage) => {
          pz.hints = Math.max(pz.hints, stage);
          this.state.puzzleChanged();
          this.persist();
        },
        onSolved: () => {
          solved = true;
          pz.solved = true;
          this.state.puzzleChanged();
          this.ui.closeModal(panel.el);
        },
        onClose: () => this.ui.closeModal(panel.el),
      });
      panel.onClose = () => {
        panel.destroy();
        this.scene?.refreshProps();
        resolve(solved);
      };
      this.ui.openModal(panel);
    });
  }

  // ------------------------------------------------------------------ world flow

  async changeRoom(room: RoomId, arrival: string): Promise<void> {
    if (this.transitioning || !this.scene) return;
    this.transitioning = true;
    const scene = this.scene;
    scene.lockInput(true);
    const a = ROOMS[room].arrivals[arrival] ?? ROOMS[room].arrivals.start;
    await new Promise<void>((resolve) => {
      scene.cameras.main.fadeOut(this.settings.reducedMotion ? 150 : 500, 7, 8, 13);
      scene.cameras.main.once('camerafadeoutcomplete', () => resolve());
    });
    this.state.setRoom(room, a.x, a.y, a.facing);
    this.persistNow();
    this.transitioning = false;
    this.startWorld({ roomId: room, arrival });
  }

  ambience(name: Ambience): void {
    this.audio.ambience(name);
  }

  tick(): void {
    const now = performance.now();
    const dt = Math.min(1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (this.mode === 'play') this.state.data.playTime += dt;
  }

  async chapterComplete(): Promise<void> {
    this.state.data.chapterComplete = true;
    this.persistNow();
    this.mode = 'ending';
    this.ui.setInGame(false);
    this.audio.ambience('none');
    const p = endingPanel({
      playTime: this.state.data.playTime,
      hints: this.state.puzzle.hints,
      reducedMotion: this.settings.reducedMotion,
      onReplay: () => {
        this.ui.closeAll();
        this.newGame();
      },
      onMenu: () => {
        this.ui.closeAll();
        this.showMainMenu();
      },
    });
    this.ui.openModal(p);
  }

  // ------------------------------------------------------------------ persistence

  /** Debounced save of the current world state (positions are captured first). */
  persist(quiet = false): void {
    if (this.mode === 'menu' || this.mode === 'boot') return;
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.persistNow(), quiet ? 50 : 250);
  }

  persistNow(): void {
    window.clearTimeout(this.persistTimer);
    if (this.mode === 'menu' || this.mode === 'boot') return;
    if (this.scene && !this.scene.attract && !this.transitioning) this.scene.savePlayer();
    writeSave(this.state.data);
    this.hasSave = true;
  }

  /** Page (CSS pixel) coordinates of a world point – used by automated tests. */
  debugScreenPoint(x: number, y: number, z = 0): { x: number; y: number } | null {
    const s = this.scene;
    const l = this.ui.layout;
    if (!s || !l) return null;
    const p = s.worldToCanvas({ x, y, z });
    const r = this.game.canvas.getBoundingClientRect();
    return { x: r.left + p.x * (r.width / s.scale.width), y: r.top + p.y * (r.height / s.scale.height) };
  }

  /** Page coordinates of an interactive object's hotspot. */
  debugHotspot(id: string): { x: number; y: number } | null {
    const prop = this.scene?.room.props.find((p) => p.id === id);
    const h = prop?.interact?.hotspot;
    if (!h) return null;
    // Aim slightly below the marker so the click lands on the object itself.
    return this.debugScreenPoint(h.x, h.y, Math.max(0, h.z - 6));
  }

  /** Debug / test hook. */
  debugInfo() {
    const s = this.scene;
    return {
      mode: this.mode,
      room: this.state.room,
      player: s ? { x: s.player.x, y: s.player.y, facing: s.player.facing } : null,
      inventory: this.state.data.inventory.slice(),
      flags: { ...this.state.data.flags },
      doors: { ...this.state.data.doors },
      puzzle: { ...this.state.puzzle, rot: this.state.puzzle.rot.slice() },
      blocking: this.ui.blocking,
      focus: s?.focusedProp ?? null,
      light: s?.lightId ?? null,
      layout: this.ui.layout,
    };
  }
}
