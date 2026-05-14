"""
Make near-white background pixels transparent on every PNG in this directory
that ISN'T already mostly transparent.

Strategy:
  1. For each PNG, scan the four corners and the four edge midpoints.
  2. If most of those probe pixels are already alpha-0, the image is already
     transparent; skip it.
  3. Otherwise treat the most common probe colour as the "background colour"
     and flood-fill from each border pixel, turning anything that's close to
     that colour AND connected to the border into alpha-0.
  4. Halo trim: for any remaining opaque pixel adjacent to a transparent
     pixel, fade its alpha proportional to how close to bg it is. This
     cleans up the anti-aliased fringe that the strict flood fill leaves
     behind (the white halo around the subject's silhouette).

This is a CONNECTED-BORDER flood fill, so white pixels INSIDE the subject
(eyes, glints) stay opaque.
"""
import os
from collections import deque
from PIL import Image

DIR = os.path.dirname(__file__)
# Per-channel diff allowed when "this pixel matches bg" in the flood fill.
# Higher = more aggressive cut. 40 catches off-white anti-aliasing without
# eating internal detail.
TOLERANCE = 40
# Pixels in the halo-trim band are at most this far from bg (in any channel).
HALO_TOL = 70

def color_diff(a, b):
    return max(abs(a[0]-b[0]), abs(a[1]-b[1]), abs(a[2]-b[2]))

def already_transparent(im):
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

    probes = [(0,0),(w-1,0),(0,h-1),(w-1,h-1),
              (w//2,0),(w//2,h-1),(0,h//2),(w-1,h//2)]
    # Ignore probes that are already transparent — their RGB is meaningless
    # (typically 0,0,0) and would poison the bg vote.
    samples = [px[p][:3] for p in probes if px[p][3] > 8]
    if not samples:
        return False, 'no opaque border pixels'
    from collections import Counter
    bg = Counter(samples).most_common(1)[0][0]

    # ── PASS 1: connected-border flood fill ──
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

    # ── PASS 2: halo trim ──
    # Each opaque pixel adjacent to a transparent pixel whose colour is in
    # the "near bg" band [TOLERANCE..HALO_TOL] gets its alpha faded by how
    # close to bg it is. Doesn't erase, only softens the fringe.
    faded = 0
    for x in range(w):
        for y in range(h):
            r,g,b,a = px[x, y]
            if a == 0: continue
            d = color_diff((r,g,b), bg)
            if d > HALO_TOL: continue
            # Adjacent to any transparent pixel?
            adj_transparent = False
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    adj_transparent = True
                    break
            if not adj_transparent: continue
            # Fade. d == TOLERANCE → alpha ~ 0; d == HALO_TOL → alpha unchanged.
            if d <= TOLERANCE:
                new_a = 0
            else:
                fade = (d - TOLERANCE) / max(1, (HALO_TOL - TOLERANCE))
                new_a = int(a * fade)
            if new_a < a:
                px[x, y] = (r, g, b, new_a)
                faded += 1

    im.save(path)
    return True, f'cleared {cleared}px, faded {faded}px halo (bg~{bg})'

if __name__ == '__main__':
    targets = [f for f in os.listdir(DIR) if f.lower().endswith('.png')]
    # Tile-able backgrounds — those ARE supposed to be solid.
    skip = {'grass.png', 'path.png', 'tower-base.png'}
    for f in sorted(targets):
        if f in skip:
            print(f'{f:20} SKIP (tile)')
            continue
        changed, msg = fix_one(os.path.join(DIR, f))
        print(f'{f:20} {"FIX " if changed else "ok   "} {msg}')
