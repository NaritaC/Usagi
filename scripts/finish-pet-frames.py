"""Deterministic finishing of already generated frames: key despill and framing.

Run hatch-pet extraction first, then this file. No character art or poses are
drawn here. Each row uses one scale; jump offsets preserve the generated order.
The extracted inputs are preserved separately so repeated runs do not shrink art.
"""
from pathlib import Path
import json
import shutil

import numpy as np
from PIL import Image
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "art/codex-pet-v1"
RAW = RUN / "frames-extracted"
OUT = RUN / "frames"
STATES = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]


def despill(image):
    rgba = np.array(image.convert("RGBA"), dtype=np.float32)
    rgb, alpha = rgba[:, :, :3], rgba[:, :, 3]
    # Usagi's palette has no blue. Only key-contaminated boundary pixels qualify.
    excess = rgb[:, :, 2] - np.maximum(rgb[:, :, 0], rgb[:, :, 1])
    affected = (excess > 10) & (alpha > 0)
    coverage = np.clip(1 - excess / 255, 0, 1)
    factor = np.maximum(coverage, 0.001)
    for channel in (0, 1):
        rgb[:, :, channel][affected] /= factor[affected]
    rgb[:, :, 2][affected] = np.minimum(rgb[:, :, 2], rgb[:, :, 1])[affected]
    alpha[affected] *= coverage[affected]
    rgba = np.clip(rgba, 0, 255).astype(np.uint8)
    # Discard only disconnected raster specks; facial lines lie inside the body.
    components, count = label(rgba[:, :, 3] > 16)
    removed = 0
    for number in range(1, count + 1):
        part = components == number
        if part.sum() < 8:
            removed += int(part.sum())
            rgba[part] = 0
    rgba[rgba[:, :, 3] <= 3] = 0
    return Image.fromarray(rgba), int(affected.sum()), removed


def main():
    if not RAW.exists():
        shutil.copytree(OUT, RAW)
    report = {"operation": "key-despill + row-stable framing; no new artwork", "rows": []}
    for state in STATES:
        sources = sorted((RAW / state).glob("*.png"))
        assert sources, f"Missing extracted row: {state}"
        cleaned = [despill(Image.open(path)) for path in sources]
        bounds = [image.getbbox() for image, _, _ in cleaned]
        source_baseline = max(box[3] for box in bounds)
        scale = 1.18 if state == "jumping" else 0.80
        offset_scale = 0.55 if state == "jumping" else scale
        row_report = {"state": state, "scale": scale, "vertical_offset_scale": offset_scale, "baseline": 198, "frames": []}
        for source, (image, despilled, specks), box in zip(sources, cleaned, bounds):
            sprite = image.crop(box)
            sprite = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)), Image.Resampling.LANCZOS)
            bottom = 198 - round((source_baseline - box[3]) * offset_scale)
            top = bottom - sprite.height
            left = (192 - sprite.width) // 2
            assert top >= 3 and left >= 3, f"Frame clipping: {state}/{source.name}"
            cell = Image.new("RGBA", (192, 208))
            cell.alpha_composite(sprite, (left, top))
            pixels = np.array(cell)
            # Lanczos can reintroduce a few blue values at very low alpha.
            channels = pixels[:, :, :3].astype(np.int16)
            fringe = channels[:, :, 2] > np.maximum(channels[:, :, 0], channels[:, :, 1]) + 10
            pixels[:, :, 2][fringe] = np.minimum(pixels[:, :, 0], pixels[:, :, 1])[fringe]
            pixels[pixels[:, :, 3] == 0] = 0
            output = OUT / state / source.name
            Image.fromarray(pixels).save(output)
            row_report["frames"].append({"file": str(output.relative_to(ROOT)), "bbox": cell.getbbox(), "despilled_pixels": despilled, "removed_speck_pixels": specks})
        report["rows"].append(row_report)
    # Keep source method and count metadata, annotate the deterministic finishing.
    manifest = json.loads((RAW / "frames-manifest.json").read_text(encoding="utf-8"))
    manifest["finishing"] = "scripts/finish-pet-frames.py; row-stable scale, baseline 198, key despill"
    (OUT / "frames-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (RUN / "qa/finishing.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("Finished 57 generated frames; preserved source extraction separately.")


if __name__ == "__main__":
    main()
