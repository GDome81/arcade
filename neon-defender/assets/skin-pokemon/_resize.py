"""
One-shot helper: shrink the Pokemon skin PNGs in this folder to TARGET
pixels on the long edge. Originals get copied to ../skin-pokemon-original/
first (idempotent — won't overwrite an existing backup).

We never need more than ~512 px because the largest in-game render is the
gol celebration at ~9× a 80 px base = 720 px on a retina display. Source
files at 1254 px were just web-art defaults; they made tile load slow
without adding any visible quality.
"""
import os, shutil
from PIL import Image

SRC = os.path.dirname(__file__)
BACKUP = os.path.normpath(os.path.join(SRC, '..', 'skin-pokemon-original'))
TARGET = 128

os.makedirs(BACKUP, exist_ok=True)
files = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.png'))
for f in files:
    src_path = os.path.join(SRC, f)
    backup_path = os.path.join(BACKUP, f)
    # Only back up the original once; subsequent runs skip this.
    if not os.path.exists(backup_path):
        shutil.copy2(src_path, backup_path)
    # ALWAYS resize from the pristine original — otherwise re-running the
    # script with a smaller TARGET would re-resize an already-resized image
    # and double-degrade the quality.
    source = backup_path if os.path.exists(backup_path) else src_path
    im = Image.open(source).convert('RGBA')
    im.thumbnail((TARGET, TARGET), Image.LANCZOS)
    im.save(src_path, optimize=True)
    new_kb = os.path.getsize(src_path) / 1024
    print(f'{f:20} -> {im.size[0]}x{im.size[1]}  ({new_kb:.0f} KB)')
