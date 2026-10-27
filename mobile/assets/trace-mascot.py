# The mascot of app/icon.png traced into vector shapes, so the app icon and the
# opening screens are sharp at any size. Run from this folder:
#   pip install potracer scipy numpy pillow && python3 trace-mascot.py
import numpy as np, potrace
from PIL import Image
im = Image.open('../../app/icon.png').convert('RGBA')
S = 4
big = im.resize((im.width*S, im.height*S), Image.LANCZOS)
a = np.asarray(big).astype(int)
r,g,b,al = a[...,0],a[...,1],a[...,2],a[...,3]
def dist(c): return np.sqrt((r-c[0])**2+(g-c[1])**2+(b-c[2])**2)
BLUE=(35,81,163); ORANGE=(243,152,0); WHITE=(255,255,255)
opaque = al>128
dB,dO,dW = dist(BLUE),dist(ORANGE),dist(WHITE)
blue = opaque & (dB<dO) & (dB<dW)
orange = opaque & (dO<dB) & (dO<dW)
def path(mask):
    bm = potrace.Bitmap(~mask)
    pl = bm.trace(turdsize=8, alphamax=1.0, opticurve=True, opttolerance=0.2)
    out=[]
    for c in pl:
        s=c.start_point; d=[f"M{s.x/S:.2f},{s.y/S:.2f}"]
        for seg in c.segments:
            if seg.is_corner: d.append(f"L{seg.c.x/S:.2f},{seg.c.y/S:.2f}L{seg.end_point.x/S:.2f},{seg.end_point.y/S:.2f}")
            else: d.append(f"C{seg.c1.x/S:.2f},{seg.c1.y/S:.2f} {seg.c2.x/S:.2f},{seg.c2.y/S:.2f} {seg.end_point.x/S:.2f},{seg.end_point.y/S:.2f}")
        d.append('Z'); out.append(''.join(d))
    return ' '.join(out)
from scipy import ndimage
art = blue|orange
filled = ndimage.binary_fill_holes(ndimage.binary_closing(art, iterations=6*S))
yy,xx=np.ogrid[-9*S:9*S+1,-9*S:9*S+1]
disk = xx*xx+yy*yy <= (9*S)**2
halo = ndimage.binary_dilation(filled, structure=disk)
body = filled  # white under the art (belly etc.)
W,H=im.size
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">
<g id="halo"><path fill="#ffffff" d="{path(halo)}"/></g>
<g id="body"><path fill="#ffffff" d="{path(body)}"/></g>
<path id="blue" fill="#2351a3" fill-rule="evenodd" d="{path(blue)}"/>
<path id="amber" fill="#f39800" fill-rule="evenodd" d="{path(orange)}"/>
</svg>'''
open('mascot.svg','w').write(svg)
print(len(svg))
