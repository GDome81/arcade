"""
Make near-white background pixels transparent on every PNG in this directory
that ISN'T already mostly transparent.

Strategy:
  1. For each PNG, scan the four corners and the four edge midpoints.
  2. If most of those probe pixels are already alpha-0 → image is already
     transparent; skip it.
  3. Otherwise treat the most common probe color as the "background colour"
     and flood-fill from each edge pixel, turning anything that's close to
     that colour (Δ < 20) AND connected to the border into alpha-0.

This is a CONNECTED-BORDER flood fill, so white pixels INSIDE the subject
(eyes, glints) stay opaque.
"""
import os, sys
from collections import deque
from PIL import Image

DIR = os.path.dirname(__file__)
TOLERANCE = 25   # per-channel diff allowed when "this pixel matches bg"

def color_diff(a, b):
    return max(abs(a[0]-b[0]), abs(a[1]-b[1]), abs(a[2]-b[2]))

def already_transparent(im):
    # Sample the 4 corners + 4 edge midpoints; if most are alpha-0, skip.
    w, h = im.size
    probes = [(0,0),(w-1,0),(0,h-1),(w-1,h-1),
              (w//2,0),(w//2,h-1),(0,h//2),(w-1,h//2)]
    px = im.load()
    alpha_zero = sum(1 for p in probes if px[p][3] < 8)
    return alpha_zero >= 5

def fix_one(path):
    im = Image.open(path).convert('RGBA')
    if already_transparent(im):
        return False, 'already transparent'

    w, h = im.size
    px = im.load()

    # Pick background colour = mode RGB of the 4 corners + 4 mids.
    probes = [(0,0),(w-1,0),(0,h-1),(w-1,h-1),
              (w//2,0),(w//2,h-1),(0,h//2),(w-1,h//2)]
    samples = [px[p][:3] for p in probes]
    # Most common probe colour (handles cases like an off-white border).
    from collections import Counter
    bg = Counter(samples).most_common(1)[0][0]

    # Flood-fill from every border pixel that matches bg.
    visited = [[False]*h for _ in range(w)]
    queue = deque()
    for x in range(w):
        for y in (0, h-1):
            if not visited[x][y] and color_diff(px[x, y][:3], bg) <= TOLERANCE:
                queue.append((x, y))
                visited[x][y] = True
    for y in range(h):
        for x in (0, w-1):
            if not visited[x][y] and color_diff(px[x, y][:3], bg) <= TOLERANCE:
                queue.append((x, y))
                visited[x][y] = True

    cleared = 0
    while queue:
        x, y = queue.popleft()
        px[x, y] = (0, 0, 0, 0)
        cleared += 1
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                if color_diff(px[nx, ny][:3], bg) <= TOLERANCE:
                    visited[nx][ny] = True
                    queue.append((nx, ny))

    im.save(path)
    return True, f'cleared {cleared}px (bg~{bg})'

if __name__ == '__main__':
    targets = [f for f in os.listdir(DIR) if f.lower().endswith('.png')]
    # Don't process the tile-able backgrounds — those ARE supposed to be solid.
    skip = {'grass.png', 'path.png'}
    for f in sorted(targets):
        if f in skip:
            print(f'{f:20} SKIP (background tile)')
            continue
        changed, msg = fix_one(os.path.join(DIR, f))
        print(f'{f:20} {"FIX " if changed else "ok   "} {msg}')
