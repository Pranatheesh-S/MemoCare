#!/usr/bin/env python3
"""
Pre-generate the application's fixed accessibility narration.

Every button, screen title, instruction, confirmation and error message the app
speaks is generated once into a WAV file. The app then plays that file — no
model, no network, no waiting. Only text that genuinely changes is spoken at
runtime.

    python scripts/generate_static_voiceovers.py
    python scripts/generate_static_voiceovers.py --force
    python scripts/generate_static_voiceovers.py --category home --category games
    python scripts/generate_static_voiceovers.py --install-to-app

One failed line never stops the run: it is reported and the rest continue.
"""
from __future__ import annotations

import argparse
import asyncio
import re
import shutil
import sys
import time
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.config import settings  # noqa: E402
from app.models.qwen_tts import TTSUnavailableError, build_provider  # noqa: E402
from app.services.static_voice_service import ManifestEntry, StaticVoiceService  # noqa: E402
from app.services.tts_service import TTSService  # noqa: E402
from app.utils.audio import write_wav  # noqa: E402
from app.voice_registry import CATEGORY_PREFIXES, VoiceEntry, build_registry  # noqa: E402

LABEL_EN = re.compile(r'labelEn:\s*"([^"]+)"')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate every clip, even when one already exists. Use after changing the reference voice.",
    )
    parser.add_argument(
        "--category",
        action="append",
        choices=sorted(CATEGORY_PREFIXES),
        help="Generate only this category. May be repeated.",
    )
    parser.add_argument("--language", default=settings.language, help="Language to generate (default: %(default)s).")
    parser.add_argument(
        "--install-to-app",
        action="store_true",
        help="Copy the finished clips into the patient app and write its asset map, so narration works offline.",
    )
    parser.add_argument(
        "--include-content-packs",
        action="store_true",
        help="Also generate the regional packs' familiar-object labels — a finite set, better pre-generated than synthesised mid-game.",
    )
    parser.add_argument("--dry-run", action="store_true", help="List what would be generated and stop.")
    parser.add_argument("--limit", type=int, default=0, help="Generate at most N clips (for a quick trial).")
    return parser.parse_args()


def content_pack_phrases() -> dict[str, str]:
    """The English labels of the regional content packs: a known, countable set."""
    packs_dir = SERVICE_ROOT.parent.parent / "apps" / "patient-mobile" / "src" / "content" / "packs"
    phrases: dict[str, str] = {}
    for pack in sorted(packs_dir.glob("*.ts")):
        for label in LABEL_EN.findall(pack.read_text(encoding="utf-8")):
            cleaned = label.strip()
            if cleaned:
                phrases[f"content.{pack.stem}.{cleaned.lower().replace(' ', '_')}"] = cleaned
    return phrases


def needs_generation(entry: VoiceEntry, target: Path, known: dict[str, dict], force: bool) -> bool:
    """A clip is regenerated when it is missing, or when its words have changed."""
    if force or not target.is_file():
        return True
    recorded = known.get(entry.key)
    return not isinstance(recorded, dict) or recorded.get("hash") != entry.text_hash


async def generate(args: argparse.Namespace) -> int:
    language = args.language
    categories = tuple(args.category) if args.category else None

    extras = content_pack_phrases() if args.include_content_packs else None
    registry = build_registry(settings.locales_dir, language, categories, extras)
    if not registry:
        print(f"Nothing to generate for '{language}'. Check TTS_LOCALES_DIR ({settings.locales_dir}).")
        return 1

    static_service = StaticVoiceService(settings)
    known = static_service.entries(language)
    output_dir = settings.static_output_dir / language

    outstanding = {
        key: entry
        for key, entry in registry.items()
        if needs_generation(entry, output_dir / entry.filename, known, args.force)
    }
    up_to_date = len(registry) - len(outstanding)
    pending = dict(list(outstanding.items())[: args.limit]) if args.limit else outstanding

    print(f"Voice registry: {len(registry)} phrase(s) for '{language}'")
    print(f"  to generate:  {len(pending)}" + (f" (of {len(outstanding)} outstanding)" if args.limit else ""))
    print(f"  up to date:   {up_to_date}")
    print(f"  output:       {output_dir}")

    if args.dry_run:
        for key, entry in pending.items():
            print(f"  would generate  {key:38} -> {entry.filename}")
        return 0

    provider = build_provider(settings)
    problems = getattr(provider, "validate_reference", list)()
    if problems:
        print("\nThe reference voice is not usable yet:\n")
        for problem in problems:
            print(f"  · {problem}")
        return 2

    tts = TTSService(settings, provider)
    print(f"\nLoading {settings.model_id} … (once — not per phrase)")
    started = time.perf_counter()
    await tts.start()
    if not tts.ready:
        print(f"\nThe voice could not be loaded: {getattr(provider, 'load_error', 'unknown')}")
        return 2
    print(f"Ready on {getattr(provider, 'device', 'unknown')} in {time.perf_counter() - started:.1f}s\n")

    entries: dict[str, ManifestEntry] = {
        key: ManifestEntry(
            file=f"{language}/{registry[key].filename}",
            hash=str(value.get("hash", "")),
            duration=float(value.get("duration", 0.0)),
            category=str(value.get("category", "other")),
        )
        for key, value in known.items()
        if key in registry and isinstance(value, dict) and (output_dir / registry[key].filename).is_file()
    }

    failures: list[tuple[str, str]] = []
    generated = 0
    total_seconds = 0.0

    for index, (key, entry) in enumerate(pending.items(), start=1):
        target = output_dir / entry.filename
        prefix = f"[{index:3}/{len(pending)}]"
        try:
            result = await tts.synthesize(entry.text, language)
            duration = write_wav(target, result.audio, result.sample_rate)
            entries[key] = ManifestEntry(
                file=f"{language}/{entry.filename}",
                hash=entry.text_hash,
                duration=duration,
                category=entry.category,
            )
            generated += 1
            total_seconds += duration
            print(f"{prefix} {key:38} -> {entry.filename}  ({duration:.1f}s)")
        except (TTSUnavailableError, OSError, ValueError) as error:
            failures.append((key, str(error)))
            print(f"{prefix} FAILED: {key}\n          {error}")

    manifest_path = static_service.write(language, entries, voice=settings.reference_audio.name)

    print("\n" + "─" * 68)
    print(f"Generated   {generated}")
    print(f"Up to date  {up_to_date}")
    print(f"Failed      {len(failures)}")
    print(f"Narration   {total_seconds:.0f}s of new audio")
    print(f"Manifest    {manifest_path}")
    if failures:
        print("\nFailed phrases (the rest were generated):")
        for key, error in failures:
            print(f"  FAILED: {key} — {error}")

    if args.install_to_app:
        install_to_app(static_service, language)

    return 0 if not failures else 3


def install_to_app(static_service: StaticVoiceService, language: str) -> None:
    """
    Copies the clips into the patient app and writes its asset map.

    The app bundles these, so narration is instant and works with no network —
    which is the point: navigation accessibility must never need the internet.
    """
    source_dir = settings.static_output_dir / language
    target_dir = settings.app_voice_dir / language
    target_dir.mkdir(parents=True, exist_ok=True)

    manifest = static_service.flat_map(language)
    copied = 0
    for key, relative in sorted(manifest.items()):
        source = settings.static_output_dir / relative
        if not source.is_file():
            continue
        shutil.copy2(source, target_dir / source.name)
        copied += 1

    stale = [path.name for path in target_dir.glob("*.wav") if not (source_dir / path.name).is_file()]

    map_path = write_asset_map(static_service)
    print(f"\nInstalled   {copied} clip(s) -> {target_dir}")
    print(f"Asset map   {map_path}")
    if stale:
        print(f"Note        {len(stale)} unused clip(s) remain in the app: {', '.join(sorted(stale)[:5])}…")
        print("            Remove them by hand if you no longer want them bundled.")


def write_asset_map(static_service: StaticVoiceService) -> Path:
    """
    Writes the TypeScript require map, for every language at once.

    Metro cannot resolve a computed `require`, so each bundled clip is listed
    explicitly. Only files that actually exist are listed, so a fresh clone with
    no generated audio still builds — it simply falls back to the device voice.

    Every language in the manifest is rewritten together, so generating English
    can never quietly unbundle a language generated earlier.
    """
    map_path = settings.app_voice_dir.parent.parent / "src" / "audio" / "staticVoiceAssets.ts"
    map_path.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "/**",
        " * Bundled cloned-voice narration.",
        " *",
        " * Generated by services/tts-service/scripts/generate_static_voiceovers.py",
        " * — do not edit by hand. Regenerate with:",
        " *",
        " *   python scripts/generate_static_voiceovers.py --install-to-app",
        " *",
        " * An empty map is valid and expected before any voice has been generated:",
        " * the app then narrates with the device's own speech engine.",
        " */",
        "export const STATIC_VOICE_ASSETS: Record<string, number> = {",
    ]
    listed = 0
    languages = static_service.load().get("languages", {})
    for language in sorted(languages if isinstance(languages, dict) else {}):
        target_dir = settings.app_voice_dir / language
        for key, relative in sorted(static_service.flat_map(language).items()):
            filename = Path(relative).name
            if not (target_dir / filename).is_file():
                continue
            lines.append(f'  "{language}:{key}": require("../../assets/voice/{language}/{filename}"),')
            listed += 1
    lines.append("};")
    lines.append("")
    lines.append(f"export const STATIC_VOICE_COUNT = {listed};")
    lines.append("")

    map_path.write_text("\n".join(lines), encoding="utf-8")
    return map_path


def main() -> int:
    args = parse_args()
    try:
        return asyncio.run(generate(args))
    except FileNotFoundError as error:
        print(f"\n{error}")
        return 1
    except KeyboardInterrupt:
        print("\nStopped. Clips already written are kept; run again to continue.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
