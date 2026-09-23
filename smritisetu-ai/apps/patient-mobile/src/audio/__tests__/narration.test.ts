import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NarrationEngine,
  PRIORITY_ORDER,
  type NarrationPlayer,
  type PlayableNarration,
} from "../narration";

/** A player that records what it was asked to say and finishes only when told. */
function fakePlayer() {
  const spoken: PlayableNarration[] = [];
  let finish: (() => void) | null = null;
  let stops = 0;
  let refuse = false;

  const player: NarrationPlayer = {
    async play(narration, onFinished) {
      if (refuse) return false;
      spoken.push(narration);
      finish = onFinished;
      return true;
    },
    async stop() {
      stops += 1;
      finish = null;
    },
  };

  return {
    player,
    spoken,
    get stops() {
      return stops;
    },
    refuseNext() {
      refuse = true;
    },
    /**
     * Ends the clip that is playing, as the audio layer would, and lets the
     * engine start whatever comes next.
     */
    async endClip() {
      const callback = finish;
      finish = null;
      callback?.();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

const says = (text: string) => async (): Promise<PlayableNarration> => ({
  kind: "system",
  text,
  language: "en",
});

describe("one voice at a time", () => {
  it("stops what it is saying before starting something else", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.speak({ resolve: says("Welcome home.") });
    await engine.speak({ resolve: says("Open games.") });

    assert.deepEqual(
      harness.spoken.map((item) => (item.kind === "system" ? item.text : "")),
      ["Welcome home.", "Open games."],
    );
    // Home narration was stopped rather than left to overlap.
    assert.ok(harness.stops >= 2);
  });

  it("reports that it is speaking, and that it has stopped", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    assert.equal(engine.isSpeaking(), false);
    await engine.speak({ resolve: says("Take your time.") });
    assert.equal(engine.isSpeaking(), true);

    await harness.endClip();
    assert.equal(engine.isSpeaking(), false);
  });

  it("goes quiet on stop", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.speak({ resolve: says("Find two matching cards.") });
    await engine.stop();

    assert.equal(engine.isSpeaking(), false);
  });
});

describe("what matters more is heard", () => {
  it("ranks a warning above everything and background help below it", () => {
    assert.ok(PRIORITY_ORDER.warning > PRIORITY_ORDER.user);
    assert.ok(PRIORITY_ORDER.user > PRIORITY_ORDER.response);
    assert.ok(PRIORITY_ORDER.response > PRIORITY_ORDER.background);
  });

  it("lets a warning interrupt what the patient is being told", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.speak({ resolve: says("Open your memories."), priority: "user" });
    const interrupted = await engine.speak({
      resolve: says("Your family has been told."),
      priority: "warning",
    });

    assert.equal(interrupted, true);
    assert.equal(engine.activePriority(), "warning");
  });

  it("drops background help rather than queueing it behind a warning", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.speak({ resolve: says("Your family has been told."), priority: "warning" });
    const spoke = await engine.speak({ resolve: says("Would you like a hint?"), priority: "background" });

    assert.equal(spoke, false);
    assert.equal(harness.spoken.length, 1);
  });

  it("lets a tap interrupt a companion reply, because the patient moved on", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.speak({ resolve: says("That is lovely to hear."), priority: "response" });
    const spoke = await engine.speak({ resolve: says("Open games."), priority: "user" });

    assert.equal(spoke, true);
    assert.equal(engine.activePriority(), "user");
  });
});

describe("guided sequences", () => {
  it("says each line only when the one before it has finished", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.queue([
      { resolve: says("Welcome to the memory game.") },
      { resolve: says("You will see several familiar objects.") },
      { resolve: says("Tap two matching objects.") },
    ]);

    assert.equal(harness.spoken.length, 1);
    await harness.endClip();
    assert.equal(harness.spoken.length, 2);
    await harness.endClip();
    assert.equal(harness.spoken.length, 3);

    await harness.endClip();
    assert.equal(engine.isSpeaking(), false);
  });

  it("abandons the rest of a sequence when something more important arrives", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.queue([{ resolve: says("First.") }, { resolve: says("Second.") }]);
    await engine.speak({ resolve: says("Your family has been told."), priority: "warning" });

    await harness.endClip();
    assert.deepEqual(
      harness.spoken.map((item) => (item.kind === "system" ? item.text : "")),
      ["First.", "Your family has been told."],
    );
  });

  it("says nothing when handed an empty sequence", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    assert.equal(await engine.queue([]), false);
    assert.equal(harness.spoken.length, 0);
  });
});

describe("repeating", () => {
  it("says the last thing again", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    await engine.speak({ resolve: says("Touch a card, then touch where it belongs.") });
    await harness.endClip();
    await engine.replayLast();

    assert.deepEqual(
      harness.spoken.map((item) => (item.kind === "system" ? item.text : "")),
      ["Touch a card, then touch where it belongs.", "Touch a card, then touch where it belongs."],
    );
  });

  it("does nothing when nothing has been said yet", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);
    assert.equal(await engine.replayLast(), false);
  });
});

describe("when audio cannot be produced", () => {
  it("does not sit silently marked as speaking", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    const spoke = await engine.speak({ resolve: async () => null });

    assert.equal(spoke, false);
    assert.equal(engine.isSpeaking(), false);
  });

  it("recovers when the player itself refuses", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);
    harness.refuseNext();

    assert.equal(await engine.speak({ resolve: says("Anything.") }), false);
    assert.equal(engine.isSpeaking(), false);
  });

  it("treats a thrown resolver as silence, never as a crash", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    const spoke = await engine.speak({
      resolve: async () => {
        throw new Error("the voice service is unreachable");
      },
    });

    assert.equal(spoke, false);
    assert.equal(engine.isSpeaking(), false);
  });

  it("stays silent when audio arrives after the patient has moved on", async () => {
    const harness = fakePlayer();
    const engine = new NarrationEngine(harness.player);

    let release: (value: PlayableNarration) => void = () => undefined;
    const slow = new Promise<PlayableNarration>((resolve) => {
      release = resolve;
    });

    const pending = engine.speak({ resolve: () => slow, priority: "response" });
    await engine.speak({ resolve: says("Open games."), priority: "user" });

    release({ kind: "system", text: "A slow companion reply.", language: "en" });
    assert.equal(await pending, false);

    assert.deepEqual(
      harness.spoken.map((item) => (item.kind === "system" ? item.text : "")),
      ["Open games."],
    );
  });
});
