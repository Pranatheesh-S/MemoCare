"""
Generates safe, synthetic placeholder media for the demo seed.

No real patient data and no real photographs of real people are used anywhere
in this repository. Each "photo" is a generated abstract portrait card: a soft
background wash, a simple figure silhouette and a coloured band, so the four
family members are visually distinguishable in the "Who Is This?" activity.

Pure standard library (zlib + struct) so it runs with no Python dependencies.
"""
import os
import struct
import zlib
import math

OUT = os.path.join(os.path.dirname(__file__), "..", "storage", "media", "seed")
os.makedirs(OUT, exist_ok=True)

W = H = 512


def png(path, pixels):
    raw = b"".join(b"\x00" + bytes(row) for row in pixels)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    header = struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)  # 8-bit truecolour
    blob = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(blob)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def portrait(name, base, accent):
    """Abstract portrait card: wash background, head + shoulders, accent band."""
    rows = []
    cx, cy, head_r = W // 2, int(H * 0.38), int(W * 0.15)
    for y in range(H):
        row = []
        for x in range(W):
            t = (x / W * 0.35) + (y / H * 0.65)
            c = mix(mix(base, (255, 255, 255), 0.55), base, t * 0.6)
            # accent band across the lower third
            if H * 0.72 < y < H * 0.80:
                c = accent
            # shoulders
            sh_y = int(H * 0.60)
            if y > sh_y:
                half = int(W * 0.30 * min(1.0, (y - sh_y) / (H * 0.22)) + W * 0.12)
                if abs(x - cx) < half and y < H * 0.72:
                    c = mix(accent, (255, 255, 255), 0.25)
            # head
            if (x - cx) ** 2 + (y - cy) ** 2 < head_r ** 2:
                c = mix(accent, (255, 255, 255), 0.35)
            row.extend(c)
        rows.append(row)
    png(os.path.join(OUT, name), rows)


def object_tile(name, base, accent, shape):
    """Simple high-contrast object tile used for game and memory placeholders."""
    rows = []
    cx, cy = W // 2, H // 2
    for y in range(H):
        row = []
        for x in range(W):
            c = mix(base, (255, 255, 255), 0.72)
            dx, dy = x - cx, y - cy
            if shape == "circle" and dx * dx + dy * dy < (W * 0.30) ** 2:
                c = accent
            elif shape == "leaf" and (dx * dx) / (W * 0.18) ** 2 + (dy * dy) / (H * 0.32) ** 2 < 1:
                c = accent
            elif shape == "band" and abs(dy) < H * 0.16:
                c = accent
            elif shape == "wave" and abs(dy - math.sin(x / 40.0) * H * 0.12) < H * 0.10:
                c = accent
            row.extend(c)
        rows.append(row)
    png(os.path.join(OUT, name), rows)


PALETTE = {
    "patient":   ((35, 83, 71),  (142, 182, 155)),
    "daughter":  ((176, 96, 74),  (240, 190, 150)),
    "son":       ((60, 90, 150),  (150, 185, 235)),
    "grandson":  ((150, 120, 60), (235, 205, 140)),
    "neighbour": ((110, 70, 130), (200, 165, 220)),
    "asha":      ((45, 120, 110), (150, 210, 200)),
}

for who, (base, accent) in PALETTE.items():
    portrait(f"{who}.png", base, accent)

OBJECTS = [
    ("home.png",      (35, 83, 71),  (142, 182, 155), "band"),
    ("festival.png",  (190, 120, 40), (250, 200, 120), "circle"),
    ("place.png",     (60, 110, 90),  (170, 210, 180), "wave"),
    ("wedding.png",   (170, 70, 90),  (240, 175, 190), "circle"),
    ("tea-garden.png",(40, 95, 60),   (150, 200, 140), "leaf"),
    ("river.png",     (45, 95, 140),  (160, 200, 235), "wave"),
]
for name, base, accent, shape in OBJECTS:
    object_tile(name, base, accent, shape)

# A short, silent placeholder audio clip so audio playback paths are exercised
# end to end. Real family voice recordings replace these in a deployment.
def silent_wav(path, seconds=2, rate=16000):
    frames = b"\x00\x00" * rate * seconds
    header = (b"RIFF" + struct.pack("<I", 36 + len(frames)) + b"WAVEfmt "
              + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
              + b"data" + struct.pack("<I", len(frames)))
    with open(path, "wb") as fh:
        fh.write(header + frames)


for clip in ["daughter-voice.wav", "son-voice.wav", "grandson-voice.wav",
             "bihu-song.wav", "story-tea-garden.wav"]:
    silent_wav(os.path.join(OUT, clip))

print(f"generated {len(os.listdir(OUT))} placeholder assets in {os.path.abspath(OUT)}")
