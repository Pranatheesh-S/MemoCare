/**
 * Narration scheduling.
 *
 * Two voices talking at once is worse than no voice at all, so exactly one
 * utterance is ever in flight. When something more important arrives — a
 * warning, or the screen the patient just tapped — the current narration stops
 * and the new one begins. When something less important arrives while the app
 * is already speaking, it is dropped rather than stacked up behind it.
 *
 * This file holds no audio code at all, so the rules above are testable as
 * plain functions.
 */

export type NarrationPriority = "warning" | "user" | "response" | "background";

/** 1. warnings · 2. what the patient just touched · 3. a reply · 4. help offered unasked. */
export const PRIORITY_ORDER: Record<NarrationPriority, number> = {
  warning: 3,
  user: 2,
  response: 1,
  background: 0,
};

export type PlayableNarration =
  | { kind: "asset"; source: number }
  | { kind: "uri"; uri: string }
  | { kind: "system"; text: string; language: string; key?: string };

export type NarrationRequest = {
  /** Resolved only once the request is certain to be spoken. */
  resolve: () => Promise<PlayableNarration | null>;
  priority?: NarrationPriority;
  /** Identifies the utterance for `replayLast`. */
  id?: string;
};

export interface NarrationPlayer {
  /** Starts playing. `onFinished` fires once, when the words end. */
  play(narration: PlayableNarration, onFinished: () => void): Promise<boolean>;
  stop(): Promise<void>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
}

export class NarrationEngine {
  private readonly player: NarrationPlayer;
  private speaking = false;
  private currentPriority: NarrationPriority | null = null;
  private queued: NarrationRequest[] = [];
  private last: NarrationRequest | null = null;
  /**
   * Guards the gap between asking for audio and receiving it: generating a
   * chatbot reply takes a moment, and by then the patient may have moved on.
   */
  private token = 0;

  constructor(player: NarrationPlayer) {
    this.player = player;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  /** What is being said right now, so a caller can see why it was refused. */
  activePriority(): NarrationPriority | null {
    return this.currentPriority;
  }

  /**
   * Says one thing, stopping whatever is being said now.
   *
   * Returns false when the request was refused because something more
   * important is already speaking, or when no audio could be resolved.
   */
  async speak(request: NarrationRequest): Promise<boolean> {
    const priority = request.priority ?? "user";
    if (!this.canInterrupt(priority)) return false;

    this.queued = [];
    this.last = request;
    return this.start(request, priority);
  }

  /**
   * Says several things in order — a guided introduction, not a button label.
   *
   * The first is spoken immediately; each following one waits for the previous
   * to finish. Anything of equal or higher priority cancels the rest.
   */
  async queue(requests: NarrationRequest[], priority: NarrationPriority = "background"): Promise<boolean> {
    const [first, ...rest] = requests;
    if (!first) return false;
    if (!this.canInterrupt(priority)) return false;

    this.queued = rest.map((request) => ({ ...request, priority: request.priority ?? priority }));
    this.last = first;
    return this.start({ ...first, priority: first.priority ?? priority }, first.priority ?? priority);
  }

  /** Repeats the last thing said, however it was produced. */
  async replayLast(): Promise<boolean> {
    if (!this.last) return false;
    return this.speak({ ...this.last, priority: "user" });
  }

  async stop(): Promise<void> {
    this.token += 1;
    this.queued = [];
    this.speaking = false;
    this.currentPriority = null;
    await this.player.stop();
  }

  async pause(): Promise<void> {
    if (this.player.pause) await this.player.pause();
    else await this.stop();
  }

  async resume(): Promise<void> {
    if (this.player.resume) await this.player.resume();
  }

  private canInterrupt(priority: NarrationPriority): boolean {
    if (!this.speaking || this.currentPriority === null) return true;
    return PRIORITY_ORDER[priority] >= PRIORITY_ORDER[this.currentPriority];
  }

  private async start(request: NarrationRequest, priority: NarrationPriority): Promise<boolean> {
    const token = ++this.token;
    this.speaking = true;
    this.currentPriority = priority;

    await this.player.stop();

    let narration: PlayableNarration | null = null;
    try {
      narration = await request.resolve();
    } catch {
      narration = null;
    }

    // Superseded while the audio was being fetched: stay silent.
    if (token !== this.token) return false;

    if (!narration) {
      this.finish(token);
      return false;
    }

    const started = await this.player.play(narration, () => this.finish(token));
    if (token !== this.token) return false;
    if (!started) {
      this.finish(token);
      return false;
    }
    return true;
  }

  private finish(token: number): void {
    if (token !== this.token) return;

    const next = this.queued.shift();
    if (next) {
      void this.start(next, next.priority ?? "background");
      return;
    }
    this.speaking = false;
    this.currentPriority = null;
  }
}
