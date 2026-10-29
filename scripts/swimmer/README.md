# The app's 3D swimmer model

`public/3d/swimmer-v1.glb` is the swimmer on the app's home cards
(components/swimmer). It is made by code, not drawn by hand, so a change is a
change to `swimmer.py` and a rebuild.

- `swimmer.py` -- builds the character in Blender (body, head and face, every
  hair style, suit, goggles, cap, fins, hands and feet, a skeleton and the
  slow breathing) and exports one GLB. The owner chose body version `bean`
  (版本一 豆豆身, 2026-10-29); `kid` and `toy` were the other two he compared.
- `pack.mjs` -- shrinks that GLB for the phone (simplify, meshopt compression).
  The page decodes it with three.js's MeshoptDecoder.

Rebuild (any machine with Python 3.13 and Node):

```
pip install bpy==5.2.3
MSA_BODY=bean python3 -c "import sys; sys.argv=['x','/tmp/swimmer.glb']; exec(open('scripts/swimmer/swimmer.py').read())"
mkdir -p /tmp/pack && cd /tmp/pack && npm init -y >/dev/null && npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer@0.22
cp /path/to/repo/scripts/swimmer/pack.mjs /tmp/pack/   # run from there, where its packages are
node /tmp/pack/pack.mjs /tmp/swimmer.glb /path/to/repo/public/3d/swimmer-v1.glb
```

Part names the page relies on (engine.ts): HairShort, HairSpiky, HairBob,
HairPony, HairPonyTie, HairBuns, Cap, GogglesEyes(+Lens), GogglesUp(+Lens),
SuitJammer, SuitBrief, SuitOnepiece, Fins, Lashes; materials Skin, Hair, Suit,
HairTie, Goggle, Cap, Fin, EarInner. Renaming one breaks dressing.
Rebuilding over the same file name is fine: Vercel serves public files with
`max-age=0, must-revalidate`, so phones check for the new one on the next
open. Rename it only if that header ever changes.

History: 2026-10-29 the fin's foot pocket was made from the foot itself (the
heel showed behind the fin) and the shin was slimmed to end inside the heel.
