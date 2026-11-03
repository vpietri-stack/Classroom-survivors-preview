"""Export approved notes PNGs as full-resolution WebP (requires Pillow)."""
import argparse
from io import BytesIO
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("images", nargs="+", type=Path)
args = parser.parse_args()

for source in args.images:
    if source.suffix.lower() != ".png":
        parser.error(f"Expected a PNG master: {source}")
    output = source.with_suffix(".webp")
    with Image.open(source) as image:
        encoded = BytesIO()
        mode = "RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB"
        image.convert(mode).save(encoded, format="WEBP", quality=90, method=6)
    data = encoded.getvalue()
    if len(data) > 450_000:
        parser.error(f"{output.name}: {len(data)} bytes exceeds 450 KB. Review the export before publishing.")
    output.write_bytes(data)
    print(f"{output}: {len(data)} bytes")
