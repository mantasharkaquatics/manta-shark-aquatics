"""Builds the version-B swimmer: one rigged, animated character with every
swappable part (hair styles, suits, goggles, cap, fins) as its own mesh, all
skinned to one armature, exported as a single GLB. The web page shows or hides
parts and recolours their materials.

Blender is Z-up with the character facing -Y; the glTF export turns that into
Y-up facing +Z, which is what the three.js stage expects."""
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix, Quaternion

OUT = sys.argv[-1] if sys.argv[-1].endswith('.glb') else '/tmp/swimmer.glb'

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

def link(obj):
    scene.collection.objects.link(obj)
    return obj

MATS = {}
def mat(name, color, rough=0.55, alpha=1.0, metal=0.0):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    b.inputs['Base Color'].default_value = (*lin, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False
    MATS[name] = m
    return m

def mesh_obj(name, verts, faces, material, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(material)
    return link(bpy.data.objects.new(name, me))

# ---------------------------------------------------------------- body version
import os
VERSION = os.environ.get('MSA_BODY', 'bean')
BODIES = {
    # 豆豆身: one rounded bean for the trunk, the head resting on it, a neck you barely see
    'bean': dict(HC=1.84,
                 torso=[((0, 0, 0.9), (0.33, 0.26, 0.42), 2.0)],
                 neck=((0, 0, 1.2), (0, 0, 1.5), 0.11, 2.0),
                 SH=(0.26, 0, 1.1), EL=(0.43, 0, 0.92), WR=(0.55, -0.02, 0.75), HA=(0.6, -0.03, 0.67),
                 HIP=(0.15, 0, 0.6), KN=(0.155, 0, 0.36), AN=(0.155, 0, 0.12),
                 arm_r=(0.095, 0.083), leg_r=(0.13, 0.098),
                 waist=0.8, leg_cut=0.54, top=1.12, armhole=0.29, jam_bottom=0.4),
    # 短頸圓肩: a short, thick neck and round shoulder caps, like a little child
    'kid': dict(HC=1.9,
                torso=[((0, 0, 1.05), (0.3, 0.22, 0.22), 2.0), ((0, 0, 0.83), (0.31, 0.25, 0.25), 2.0), ((0, 0, 0.66), (0.29, 0.22, 0.15), 2.0)],
                neck=((0, 0, 1.12), (0, 0, 1.52), 0.135, 3.0),
                delt=((0.27, 0, 1.1), (0.12, 0.11, 0.11), 2.6),
                SH=(0.28, 0, 1.1), EL=(0.45, 0, 0.92), WR=(0.57, -0.02, 0.75), HA=(0.62, -0.03, 0.67),
                HIP=(0.15, 0, 0.62), KN=(0.155, 0, 0.36), AN=(0.155, 0, 0.06),
                arm_r=(0.098, 0.085), leg_r=(0.14, 0.112),
                waist=0.82, leg_cut=0.56, top=1.14, armhole=0.3, jam_bottom=0.42),
    # Q版公仔: no neck at all, the head sits right on a small pear-shaped body
    'toy': dict(HC=1.72,
                torso=[((0, 0, 0.86), (0.31, 0.25, 0.36), 2.0)],
                neck=None,
                SH=(0.24, 0, 1.04), EL=(0.38, 0, 0.89), WR=(0.48, -0.02, 0.74), HA=(0.52, -0.03, 0.67),
                HIP=(0.14, 0, 0.56), KN=(0.145, 0, 0.32), AN=(0.145, 0, 0.06),
                arm_r=(0.09, 0.08), leg_r=(0.13, 0.108),
                waist=0.78, leg_cut=0.52, top=1.06, armhole=0.27, jam_bottom=0.38),
}
P = BODIES[VERSION]

# ---------------------------------------------------------------- head surface
HC = Vector((0, 0, P['HC']))
HA, HB, HCZ = 0.565, 0.53, 0.545          # half-width, half-depth, half-height

def head_r(d):
    """Distance from the head centre to its surface along unit direction d."""
    t = 1 / math.sqrt((d.x / HA) ** 2 + (d.y / HB) ** 2 + (d.z / HCZ) ** 2)
    lo = max(0.0, -d.z)
    bulge = 1 + 0.22 * lo * (1 - lo) * max(0.0, -d.y + 0.2)   # round lower cheeks
    return t * bulge

def surf(d, off=1.0):
    d = d.normalized()
    return HC + d * head_r(d) * off

def frame(d0):
    """Tangent frame on the head at direction d0: (dir, right, up)."""
    d0 = d0.normalized()
    up = Vector((0, 0, 1))
    right = up.cross(d0)
    if right.length < 1e-4:
        right = Vector((1, 0, 0))
    right.normalize()
    upv = d0.cross(right).normalized()
    return d0, right, upv

def onhead(d0, u, v, off):
    d, r, up = frame(d0)
    return surf(d + r * u + up * v, off)

def decal_disc(name, d0, boundary, off, material, rings=5, segs=40):
    """A filled shape lying on the head; boundary(theta) -> (u, v)."""
    verts = [onhead(d0, 0, 0, off)]
    for k in range(1, rings + 1):
        f = k / rings
        for s in range(segs):
            u, v = boundary(2 * math.pi * s / segs)
            verts.append(onhead(d0, u * f, v * f, off))
    faces = []
    for s in range(segs):
        faces.append((0, 1 + s, 1 + (s + 1) % segs))
    for k in range(rings - 1):
        a, b = 1 + k * segs, 1 + (k + 1) * segs
        for s in range(segs):
            s2 = (s + 1) % segs
            faces.append((a + s, b + s, b + s2, a + s2))
    return mesh_obj(name, verts, faces, material)

def decal_strip(name, d0, pts, widths, off, material):
    """A band on the head along (u, v) points, width per point."""
    verts, faces = [], []
    n = len(pts)
    for i, (u, v) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(n - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L
        w = widths[i] / 2
        verts.append(onhead(d0, u + nx * w, v + ny * w, off))
        verts.append(onhead(d0, u - nx * w, v - ny * w, off))
    for i in range(n - 1):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    return mesh_obj(name, verts, faces, material)

def ellipse(a, b, cx=0.0, cy=0.0):
    return lambda t: (cx + a * math.cos(t), cy + b * math.sin(t))

def tube(name, path, radius, material, segs=12, flat=1.0, normal_fn=None, cap=True):
    """A tube along world points; radius per point; flat squashes it along the normal."""
    n = len(path)
    verts, faces = [], []
    for i, p in enumerate(path):
        a = path[max(0, i - 1)]; b = path[min(n - 1, i + 1)]
        t = (b - a).normalized()
        nrm = normal_fn(p) if normal_fn else Vector((0, 0, 1))
        side = t.cross(nrm)
        if side.length < 1e-5:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        nn = side.cross(t).normalized()
        r = radius[i] if isinstance(radius, (list, tuple)) else radius
        for s in range(segs):
            th = 2 * math.pi * s / segs
            verts.append(p + side * math.cos(th) * r + nn * math.sin(th) * r * flat)
    for i in range(n - 1):
        for s in range(segs):
            s2 = (s + 1) % segs
            faces.append((i * segs + s, i * segs + s2, (i + 1) * segs + s2, (i + 1) * segs + s))
    if cap:
        verts.append(path[0]); verts.append(path[-1])
        c0, c1 = len(verts) - 2, len(verts) - 1
        for s in range(segs):
            s2 = (s + 1) % segs
            faces.append((c0, s2, s))
            faces.append((c1, (n - 1) * segs + s, (n - 1) * segs + s2))
    return mesh_obj(name, verts, faces, material)

def ellipsoid(name, center, radii, material, seg=32, rings=20, rot=None):
    verts, faces = [], []
    for i in range(rings + 1):
        ph = math.pi * i / rings
        for j in range(seg):
            th = 2 * math.pi * j / seg
            v = Vector((math.sin(ph) * math.cos(th) * radii[0], math.sin(ph) * math.sin(th) * radii[1], math.cos(ph) * radii[2]))
            if rot:
                v = rot @ v
            verts.append(center + v)
    for i in range(rings):
        for j in range(seg):
            j2 = (j + 1) % seg
            faces.append((i * seg + j, i * seg + j2, (i + 1) * seg + j2, (i + 1) * seg + j))
    o = mesh_obj(name, verts, faces, material)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(o.data); bm.free()
    for p in o.data.polygons:
        p.use_smooth = True
    return o

# ---------------------------------------------------------------- materials
SKIN = mat('Skin', '#f3c9a8', 0.6)
HAIR = mat('Hair', '#2b1d16', 0.48)
SUIT = mat('Suit', '#2050a0', 0.42)
EYEW = mat('EyeWhite', '#ffffff', 0.25)
IRIS = mat('Iris', '#5a3a22', 0.2)
PUPIL = mat('Pupil', '#15110f', 0.15)
SHINE = mat('Shine', '#ffffff', 0.1)
LASH = mat('Lash', '#1d1512', 0.5)
MOUTH = mat('Mouth', '#8e2f3c', 0.5)
TONGUE = mat('Tongue', '#f08a8f', 0.5)
BLUSH = mat('Blush', '#ff8a8a', 0.9, alpha=0.42)
GOG = mat('Goggle', '#f09800', 0.3)
LENS = mat('Lens', '#7cc8ee', 0.05, alpha=0.45)
CAP = mat('Cap', '#2050a0', 0.28)
FIN = mat('Fin', '#16a37a', 0.35)
TIE = mat('HairTie', '#ff7aa8', 0.4)
INNER = mat('EarInner', '#e9a98c', 0.6)

# ---------------------------------------------------------------- body (metaballs)
# The body is a set of soft shapes that melt into one another (metaballs), so
# the shoulders come out round instead of sloping up into the neck.
def mb_ell(mb, c, axes, rot=None, stiff=2.0):
    e = mb.elements.new(type='ELLIPSOID')
    e.co = c; e.radius = 1.745; e.stiffness = stiff
    e.size_x, e.size_y, e.size_z = axes
    if rot is not None:
        e.rotation = rot
    return e

def mb_cap(mb, p0, p1, r, stiff=2.0):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    e = mb.elements.new(type='CAPSULE')
    e.co = (p0 + p1) / 2; e.radius = r * 1.745; e.stiffness = stiff
    e.size_x = d.length / 2
    e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
    return e

def mirror(v, x):
    return Vector((v[0] * x, v[1], v[2]))

mbd = bpy.data.metaballs.new('BodyMB')
mbd.resolution = 0.018; mbd.render_resolution = 0.018; mbd.threshold = 0.6
mbo = link(bpy.data.objects.new('BodyMB', mbd))
for (c, axes, st) in P['torso']:
    mb_ell(mbd, c, axes, stiff=st)
if P.get('neck'):
    n0, n1, nr, ns = P['neck']
    mb_cap(mbd, n0, n1, nr, ns)
for x in (1, -1):
    sh, el, wr, ha = (mirror(P[k], x) for k in ('SH', 'EL', 'WR', 'HA'))
    if P.get('delt'):
        mb_ell(mbd, mirror(P['delt'][0], x), P['delt'][1], stiff=P['delt'][2])
    mb_cap(mbd, sh, wr, (P['arm_r'][0] + P['arm_r'][1]) / 2, 2.4)    # one smooth arm, no lump at the elbow
    a = (ha - wr).normalized()
    nn = Vector((-a.z, 0, a.x)).normalized() * -x
    w = nn.cross(a).normalized()
    rot = Matrix((w, nn, a)).transposed().to_quaternion()
    mb_ell(mbd, wr + a * 0.06, (0.062, 0.04, 0.07), rot, 2.6)
    hip, kn, an = (mirror(P[k], x) for k in ('HIP', 'KN', 'AN'))
    # Thigh then a slimmer shin, ending inside the heel so no leg shows below the foot or the fin.
    mb_cap(mbd, hip, kn, P['leg_r'][0], 2.2)
    mb_cap(mbd, kn, an, P['leg_r'][1], 2.6)
bpy.ops.object.select_all(action='DESELECT')
mbo.select_set(True); bpy.context.view_layer.objects.active = mbo
bpy.ops.object.convert(target='MESH')
body = bpy.context.view_layer.objects.active
body.name = 'Body'; body.data.name = 'Body'
sm = body.modifiers.new('Smooth', 'SMOOTH'); sm.factor = 0.5; sm.iterations = 3
bpy.ops.object.modifier_apply(modifier='Smooth')
for p in body.data.polygons:
    p.use_smooth = True
body.data.materials.clear(); body.data.materials.append(SKIN)
body.select_set(False)

# ---------------------------------------------------------------- head + face
def head_mesh():
    verts, faces = [], []
    R, S = 48, 72
    for i in range(R + 1):
        ph = math.pi * i / R
        for j in range(S):
            th = 2 * math.pi * j / S
            d = Vector((math.sin(ph) * math.cos(th), math.sin(ph) * math.sin(th), math.cos(ph)))
            verts.append(surf(d))
    for i in range(R):
        for j in range(S):
            j2 = (j + 1) % S
            faces.append((i * S + j, i * S + j2, (i + 1) * S + j2, (i + 1) * S + j))
    o = mesh_obj('Head', verts, faces, SKIN)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(o.data); bm.free()
    for p in o.data.polygons:
        p.use_smooth = True
    return o
head_parts = [head_mesh()]

for s in (1, -1):
    ed = Vector((0.38 * s, -1, -0.1))
    head_parts.append(decal_disc('EyeWhite' + ('L' if s > 0 else 'R'), ed, ellipse(0.15, 0.178), 1.004, EYEW))
    head_parts.append(decal_disc('Iris' + ('L' if s > 0 else 'R'), ed, ellipse(0.126, 0.152, 0.0, -0.016), 1.008, IRIS))
    head_parts.append(decal_disc('Pupil' + ('L' if s > 0 else 'R'), ed, ellipse(0.07, 0.09, 0.0, -0.02), 1.011, PUPIL))
    head_parts.append(decal_disc('Shine1' + ('L' if s > 0 else 'R'), ed, ellipse(0.04, 0.046, 0.04 * s, 0.05), 1.014, SHINE))
    head_parts.append(decal_disc('Shine2' + ('L' if s > 0 else 'R'), ed, ellipse(0.02, 0.022, -0.04 * s, -0.07), 1.014, SHINE))
    # upper lash line
    pts = [(math.cos(t) * 0.158, math.sin(t) * 0.186 + 0.004) for t in [math.pi * (0.06 + 0.88 * k / 16) for k in range(17)]]
    head_parts.append(decal_strip('LashLine' + ('L' if s > 0 else 'R'), ed, pts, [0.016 + 0.018 * math.sin(math.pi * k / 16) for k in range(17)], 1.016, LASH))
    # brow
    bd = Vector((0.39 * s, -1, 0.3))
    bp = [(u * s, 0.03 - 9 * (u ** 2)) for u in [-0.07 + 0.14 * k / 10 for k in range(11)]]
    head_parts.append(decal_strip('Brow' + ('L' if s > 0 else 'R'), bd, bp, [0.022 - 0.012 * abs(k - 5) / 5 for k in range(11)], 1.006, HAIR))
    # blush
    head_parts.append(decal_disc('Blush' + ('L' if s > 0 else 'R'), Vector((0.62 * s, -1, -0.42)), ellipse(0.1, 0.06), 1.003, BLUSH))
    # ear
    ec = Vector((0.548 * s, 0.03, 1.81))
    rot = Matrix.Rotation(-0.25 * s, 3, 'Z')
    head_parts.append(ellipsoid('Ear' + ('L' if s > 0 else 'R'), ec, (0.06, 0.085, 0.11), SKIN, 20, 14, rot))
    head_parts.append(ellipsoid('EarIn' + ('L' if s > 0 else 'R'), ec + Vector((0.035 * s, -0.012, 0)), (0.02, 0.05, 0.07), INNER, 16, 10, rot))

# girls' lash flicks
lash_flicks = []
for s in (1, -1):
    ed = Vector((0.38 * s, -1, -0.1))
    for k, (u, v) in enumerate([(0.15, 0.08), (0.13, 0.13), (0.09, 0.172)]):
        pts = [(u * s, v), ((u + 0.045) * s, v + 0.03 + 0.008 * k)]
        lash_flicks.append(decal_strip('Flick%d%s' % (k, 'L' if s > 0 else 'R'), ed, pts, [0.016, 0.004], 1.016, LASH))

# nose and mouth
head_parts.append(ellipsoid('Nose', surf(Vector((0, -1, -0.24)), 0.995), (0.045, 0.032, 0.03), SKIN, 16, 10))
md = Vector((0, -1, -0.5))
def mouth_b(t):
    u = math.cos(t) * 0.11
    v = (0.012 - 0.6 * u * u) if math.sin(t) > 0 else (-math.sin(-t) * 0.085 + 0.012 - 0.6 * u * u * 0.4)
    return (u, v)
head_parts.append(decal_disc('Mouth', md, mouth_b, 1.005, MOUTH, rings=4, segs=48))
head_parts.append(decal_disc('Tongue', md, ellipse(0.055, 0.03, 0.0, -0.045), 1.009, TONGUE))

# ---------------------------------------------------------------- hair
def lerp(a, b, t):
    return a + (b - a) * t

def shell(name, hairline, off, material, rows=26, cols=120, thick=0.035):
    """A shell over the head down to hairline(phi) (z of the unit direction).
    phi = 0 is the face (-Y)."""
    verts, faces = [], []
    verts.append(surf(Vector((0, 0, 1)), off))
    for i in range(1, rows + 1):
        for j in range(cols):
            phi = 2 * math.pi * j / cols
            zt = hairline(phi)
            pol = math.acos(max(-1, min(1, zt))) * i / rows
            d = Vector((math.sin(pol) * math.sin(phi), -math.sin(pol) * math.cos(phi), math.cos(pol)))
            flare = 1 + 0.03 * (i / rows) ** 3
            verts.append(surf(d, off * flare))
    for j in range(cols):
        faces.append((0, 1 + (j + 1) % cols, 1 + j))
    for i in range(rows - 1):
        a, b = 1 + i * cols, 1 + (i + 1) * cols
        for j in range(cols):
            j2 = (j + 1) % cols
            faces.append((a + j, a + j2, b + j2, b + j))
    o = mesh_obj(name, verts, faces, material)
    so = o.modifiers.new('Thick', 'SOLIDIFY'); so.thickness = thick; so.offset = -1
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='Thick')
    return o

def clump(name, phi, pol0, pol1, width, off0, off1, material, curl=0.0, steps=14):
    """A tapered hair lock lying on the head from polar angle pol0 to pol1 at azimuth phi."""
    path, radii = [], []
    for k in range(steps + 1):
        t = k / steps
        pol = lerp(pol0, pol1, t)
        ph = phi + curl * t * t
        d = Vector((math.sin(pol) * math.sin(ph), -math.sin(pol) * math.cos(ph), math.cos(pol)))
        path.append(surf(d, lerp(off0, off1, t)))
        radii.append(width * max(0.0, 1 - t ** 3) ** 0.6 * (0.8 + 0.3 * math.sin(math.pi * min(1, t * 1.4))) + 0.006)
    return tube(name, path, radii, material, segs=12, flat=0.5, normal_fn=lambda p: (p - HC).normalized())

def front_hairline(phi, front, side, back):
    c = math.cos(phi)              # 1 at the face, -1 at the back
    w = (1 - c) / 2
    if w < 0.5:
        return lerp(front, side, (w / 0.5) ** 1.3)
    return lerp(side, back, (w - 0.5) / 0.5)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]

def bangs(prefix, phis, pol_tip, width, material, curls=None):
    out = []
    for i, ph in enumerate(phis):
        c = curls[i] if curls else -0.25 * math.copysign(1, ph) * min(1, abs(ph) / 0.5)
        out.append(clump('%s%d' % (prefix, i), ph, 0.3, pol_tip(ph), width, 1.075, 1.02, material, curl=c))
    return out

hair = {}
# short (boy): hairline at the forehead, above the ears, nape at the back
short_line = lambda ph: front_hairline(ph, 0.42, 0.05, -0.38)
parts = [shell('HairShort', short_line, 1.03, HAIR)]
parts += bangs('ShortBang', [-0.6, -0.3, 0.0, 0.3, 0.6], lambda ph: math.acos(0.42) + 0.13 + 0.06 * abs(ph), 0.14, HAIR,
               curls=[0.22, 0.14, -0.05, -0.14, -0.22])
for k, ph in enumerate([1.2, 1.7, 2.3, 2.9, -2.9, -2.3, -1.7, -1.2]):     # tufts around the sides and back
    parts.append(clump('ShortTuft%d' % k, ph, 0.6, math.acos(short_line(ph)) + 0.12, 0.09, 1.065, 1.02, HAIR, curl=0.12 * math.copysign(1, ph)))
parts.append(clump('Ahoge', 0.4, 0.02, 0.5, 0.05, 1.12, 1.24, HAIR, curl=1.2))
hair['HairShort'] = join(parts, 'HairShort')

# spiky
parts = [shell('HairSpiky', short_line, 1.03, HAIR)]
for k in range(14):
    ph = 2 * math.pi * k / 14 + 0.1
    pol0 = 0.32 + 0.16 * (k % 2)
    path, radii = [], []
    d0 = Vector((math.sin(pol0) * math.sin(ph), -math.sin(pol0) * math.cos(ph), math.cos(pol0)))
    base = surf(d0, 1.02)
    out = (d0 + Vector((0, 0, 0.35))).normalized()
    for t in [i / 8 for i in range(9)]:
        path.append(base + out * 0.32 * t)
        radii.append(0.11 * (1 - t) + 0.004)
    parts.append(tube('Spike%d' % k, path, radii, HAIR, segs=10))
parts += bangs('SpikyBang', [-0.42, -0.14, 0.14, 0.42], lambda ph: math.acos(0.42) + 0.1, 0.12, HAIR)
hair['HairSpiky'] = join(parts, 'HairSpiky')

# bob (girl): bangs at the front, down to the jaw at the sides and back
bob_line = lambda ph: front_hairline(ph, 0.4, -0.62, -0.7)
parts = [shell('HairBob', bob_line, 1.045, HAIR, thick=0.05)]
parts += bangs('BobBang', [-0.78, -0.47, -0.16, 0.16, 0.47, 0.78], lambda ph: math.acos(0.4) + 0.15 + 0.25 * max(0, abs(ph) - 0.4), 0.14, HAIR)
for k, ph in enumerate([1.05, 1.35, 1.7, 2.1, 2.5, 2.85, -2.85, -2.5, -2.1, -1.7, -1.35, -1.05]):
    parts.append(clump('BobEnd%d' % k, ph, 1.2, math.acos(bob_line(ph)) + 0.18, 0.1, 1.09, 1.03, HAIR, curl=-0.1 * math.copysign(1, ph)))
hair['HairBob'] = join(parts, 'HairBob')

# ponytail
pony_line = lambda ph: front_hairline(ph, 0.4, 0.0, -0.42)
parts = [shell('HairPony', pony_line, 1.035, HAIR)]
parts += bangs('PonyBang', [-0.58, -0.29, 0.0, 0.29, 0.58], lambda ph: math.acos(0.4) + 0.13 + 0.1 * abs(ph), 0.135, HAIR)
for k, ph in enumerate([1.3, 1.9, -1.9, -1.3]):
    parts.append(clump('PonySide%d' % k, ph, 0.7, math.acos(pony_line(ph)) + 0.15, 0.08, 1.06, 1.02, HAIR))
root = surf(Vector((0, 0.75, 0.55)), 1.07)
path, radii = [], []
for k in range(19):
    t = k / 18
    p = root + Vector((0, 0.16 * math.sin(t * 2.2) + 0.1 * t, -0.62 * t)) + Vector((0.04 * math.sin(t * 5), 0, 0))
    path.append(p)
    radii.append((0.1 + 0.07 * math.sin(math.pi * min(1, t * 1.3))) * (1 - t ** 2.2) + 0.008)
parts.append(tube('PonyTail', path, radii, HAIR, segs=14))
hair['HairPony'] = join(parts, 'HairPony')
tie = tube('PonyTie', [root + Vector((0.11 * math.cos(a), 0.02, 0.11 * math.sin(a))) for a in [2 * math.pi * k / 24 for k in range(25)]], 0.03, TIE, segs=10, normal_fn=lambda p: Vector((0, 1, 0)), cap=False)
tie.data.materials[0] = TIE

# buns
parts = [shell('HairBuns', pony_line, 1.035, HAIR)]
parts += bangs('BunBang', [-0.58, -0.29, 0.0, 0.29, 0.58], lambda ph: math.acos(0.4) + 0.13 + 0.1 * abs(ph), 0.135, HAIR)
for s in (1, -1):
    c = surf(Vector((0.62 * s, 0.25, 0.75)), 1.12)
    parts.append(ellipsoid('Bun' + str(s), c, (0.18, 0.18, 0.17), HAIR, 28, 18))
    for k in range(5):     # a swirl on the bun
        a0 = 2 * math.pi * k / 5
        pts = []
        for i in range(10):
            t = i / 9
            a = a0 + t * 2.2
            d = Vector((math.cos(a) * (0.7 - 0.5 * t), math.sin(a) * (0.7 - 0.5 * t), 0.75 + 0.25 * t)).normalized()
            pts.append(c + Vector((d.x * 0.18, d.y * 0.18, d.z * 0.17)) * 1.02)
        parts.append(tube('BunSw%d%d' % (s, k), pts, [0.03 * (1 - i / 10) + 0.005 for i in range(10)], HAIR, segs=8))
hair['HairBuns'] = join(parts, 'HairBuns')

# ---------------------------------------------------------------- swim cap
cap_line = lambda ph: front_hairline(ph, 0.36, -0.12, -0.42)
capo = shell('Cap', cap_line, 1.075, CAP, rows=28, thick=0.03)
band = []
for j in range(121):
    ph = 2 * math.pi * j / 120
    zt = cap_line(ph)
    pol = math.acos(zt)
    band.append(surf(Vector((math.sin(pol) * math.sin(ph), -math.sin(pol) * math.cos(ph), math.cos(pol))), 1.08))
capo = join([capo, tube('CapRim', band, 0.022, CAP, segs=10, normal_fn=lambda p: (p - HC).normalized(), cap=False)], 'Cap')

# ---------------------------------------------------------------- goggles
def goggles(name, lift, off):
    objs = []
    for s in (1, -1):
        ed = Vector((0.38 * s, -1, -0.1 + lift))
        d, r, up = frame(ed)
        ring = []
        for k in range(41):
            t = 2 * math.pi * k / 40
            ring.append(surf(d + r * math.cos(t) * 0.19 + up * math.sin(t) * 0.2, off + 0.045))
        objs.append(tube(name + 'Rim' + str(s), ring, 0.026, GOG, segs=12, normal_fn=lambda p: (p - HC).normalized(), cap=False))
        objs.append(decal_disc(name + 'Cup' + str(s), ed, ellipse(0.19, 0.2), off + 0.035, GOG, rings=3))
    lens = []
    for s in (1, -1):
        ed = Vector((0.38 * s, -1, -0.1 + lift))
        lens.append(decal_disc(name + 'Lens' + str(s), ed, ellipse(0.175, 0.185), off + 0.07, LENS, rings=4))
    # the cups are opaque only round the rim: hollow them by removing the middle
    for o in objs:
        if 'Cup' in o.name:
            bm = bmesh.new(); bm.from_mesh(o.data)
            cen = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
            far = max((v.co - cen).length for v in bm.verts)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co - cen).length < far * 0.62], context='VERTS')
            bm.to_mesh(o.data); bm.free()
    bridge = [onhead(Vector((0.38 * s, -1, -0.1 + lift)), -0.19 * s, 0.0, off + 0.045) for s in (1, -1)]
    mid = surf(Vector((0, -1, -0.1 + lift)), off + 0.06)
    objs.append(tube(name + 'Bridge', [bridge[0], mid, bridge[1]], 0.018, GOG, segs=8))
    strap = []
    zz = -0.1 + lift
    for k in range(61):
        ph = math.radians(30) + (2 * math.pi - math.radians(60)) * k / 60
        d = Vector((math.sin(ph), -math.cos(ph), zz * (1 if abs(math.cos(ph)) < 0.95 else 1)))
        back = max(0.0, -math.cos(ph) + 0.3)
        strap.append(surf(d, off + 0.03 + 0.06 * min(1, back * 2)))
    objs.append(tube(name + 'Strap', strap, 0.02, GOG, segs=8, flat=0.5, normal_fn=lambda p: (p - HC).normalized(), cap=False))
    frame_obj = join(objs, name)
    lens_obj = join(lens, name + 'Lens')
    return frame_obj, lens_obj

gog_eyes, gog_eyes_lens = goggles('GogglesEyes', 0.0, 1.0)
gog_up, gog_up_lens = goggles('GogglesUp', 0.62, 1.07)

# ---------------------------------------------------------------- armature
arm_data = bpy.data.armatures.new('Rig')
rig = link(bpy.data.objects.new('Rig', arm_data))
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
B = {}
def bone(n, h, t, parent=None, connect=False):
    b = arm_data.edit_bones.new(n)
    b.head = h; b.tail = t
    if parent:
        b.parent = B[parent]; b.use_connect = connect
    B[n] = b
bone('hips', (0, 0, 0.66), (0, 0, 0.86))
bone('spine', (0, 0, 0.86), (0, 0, 1.04), 'hips', True)
bone('chest', (0, 0, 1.04), (0, 0, HC.z - 0.62), 'spine', True)
bone('neck', (0, 0, HC.z - 0.62), (0, 0, HC.z - 0.42), 'chest', True)
bone('head', (0, 0, HC.z - 0.42), (0, 0, HC.z + 0.4), 'neck', True)
for s, x in (('L', 1), ('R', -1)):
    sh, el, wr, ha = (mirror(P[k], x) for k in ('SH', 'EL', 'WR', 'HA'))
    hip, kn, an = (mirror(P[k], x) for k in ('HIP', 'KN', 'AN'))
    bone('upperarm.' + s, sh * 0.85 + Vector((0, 0, 0.02)), el, 'chest')
    bone('forearm.' + s, el, wr, 'upperarm.' + s, True)
    bone('hand.' + s, wr, wr + (ha - wr) * 1.6, 'forearm.' + s, True)
    bone('thigh.' + s, hip + Vector((0, 0, 0.04)), kn, 'hips')
    ankle = Vector((an.x, an.y, 0.1))      # the ankle sits in the heel, whatever the leg's end
    bone('shin.' + s, kn, ankle, 'thigh.' + s, True)
    bone('foot.' + s, ankle, Vector((an.x, -0.15, 0.04)), 'shin.' + s, True)
bpy.ops.object.mode_set(mode='OBJECT')

# body: automatic weights
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# keep the neck and the top of the chest stiff so the head never shears
def rigid(obj, group):
    vg = obj.vertex_groups.get(group) or obj.vertex_groups.new(name=group)
    vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    obj.parent = rig
    m = obj.modifiers.new('Rig', 'ARMATURE'); m.object = rig

head_obj = join(head_parts, 'Head')
rigid(head_obj, 'head')
lashes = join(lash_flicks, 'Lashes'); rigid(lashes, 'head')
for o in list(hair.values()) + [tie, capo, gog_eyes, gog_eyes_lens, gog_up, gog_up_lens]:
    rigid(o, 'head')
tie.name = 'HairPonyTie'

# ---------------------------------------------------------------- suits (cut from the weighted body, keep the weights)
def suit(name, planes, push=0.014):
    """Cut the weighted body with planes (point, normal: keep the side the normal
    points to), keep only the trunk, puff it out a little and give it a hem."""
    o = body.copy(); o.data = body.data.copy(); o.name = name; o.data.name = name
    link(o)
    o.data.materials.clear(); o.data.materials.append(SUIT)
    bm = bmesh.new(); bm.from_mesh(o.data)
    for co, no in planes:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_inner=True, dist=1e-5)
    bm.faces.ensure_lookup_table()
    # the arms hang beside the trunk: drop anything far out to the side
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.calc_center_median().x) > P['armhole'] + 0.1], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * push
    bm.to_mesh(o.data); bm.free()
    o.modifiers.clear()
    so = o.modifiers.new('Hem', 'SOLIDIFY'); so.thickness = 0.012; so.offset = -1
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='Hem')
    for p in o.data.polygons:
        p.use_smooth = True
    m = o.modifiers.new('Rig', 'ARMATURE'); m.object = rig
    return o
LEG_L = ((0.05, 0, P['leg_cut']), (-0.75, 0, 1))      # brief leg openings rise toward the hips
LEG_R = ((-0.05, 0, P['leg_cut']), (0.75, 0, 1))
suit('SuitJammer', [((0, 0, P['waist'] + 0.04), (0, 0, -1)), ((0, 0, P['jam_bottom']), (0, 0, 1))])
suit('SuitBrief', [((0, 0, P['waist']), (0, 0, -1)), LEG_L, LEG_R])
one = suit('SuitOnepiece', [((0, 0, P['top']), (0, 0, -1)), LEG_L, LEG_R,
                            ((P['armhole'], 0, P['top'] - 0.18), (-1, 0, -0.5)), ((-P['armhole'], 0, P['top'] - 0.18), (1, 0, -0.5))])
# shoulder straps over the top
straps = []
for x in (1, -1):
    # each strap follows the shoulder: rays from outside onto the body
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    c = Vector((0.15 * x, 0, P['top'] - 0.04))
    pts = []
    for k in range(15):
        a = math.pi * k / 14
        d = Vector((0, -math.cos(a), math.sin(a)))
        hit = tree.ray_cast(c + d * 0.8, -d)
        if hit[0] is not None:
            pts.append(hit[0] + hit[1] * 0.016)
    straps.append(tube('Strap%d' % x, pts, 0.028, SUIT, segs=10, flat=0.45, normal_fn=lambda p, c=c: (p - c).normalized()))
for s in straps:
    s.parent = rig
    vg = s.vertex_groups.new(name='chest'); vg.add(list(range(len(s.data.vertices))), 1.0, 'REPLACE')
one = join([one] + straps, 'SuitOnepiece')

# fins: one per foot, weighted to the foot
for s, x in (('L', 1), ('R', -1)):
    sh = [(-0.1, 0.0), (0.1, 0.0), (0.16, -0.25), (0.15, -0.46), (0.06, -0.42), (0.0, -0.46), (-0.06, -0.42), (-0.15, -0.46), (-0.16, -0.25)]
    top, bot = [], []
    for (u, v) in sh:
        top.append(Vector((P['AN'][0] * x + u, -0.06 + v, 0.03 + 0.03 * (v / -0.46) * -0.4)))
        bot.append(Vector((P['AN'][0] * x + u, -0.06 + v, 0.0 + 0.03 * (v / -0.46) * -0.4)))
    n = len(sh)
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    fo = mesh_obj('Fin' + s, top + bot, faces, FIN, smooth=False)
    bv = fo.modifiers.new('Bevel', 'BEVEL'); bv.width = 0.012; bv.segments = 3
    bpy.context.view_layer.objects.active = fo
    bpy.ops.object.modifier_apply(modifier='Bevel')
    # The foot pocket is the foot itself, a little bigger, so the whole foot --
    # heel included -- is inside the fin (owner, 2026-10-29: the heel showed).
    cx = P['AN'][0] * x
    pocket = [ellipsoid('FinSole' + s, Vector((cx + 0.005 * x, -0.07, 0.072)), (0.128, 0.2, 0.09), FIN, 28, 18),
              ellipsoid('FinHeel' + s, Vector((cx, 0.0, 0.1)), (0.108, 0.108, 0.098), FIN, 24, 16),
              ellipsoid('FinToes' + s, Vector((cx, -0.215, 0.058)), (0.12, 0.08, 0.062), FIN, 24, 14)]
    f = join([fo] + pocket, 'Fins' + s)
    rigid(f, 'foot.' + s)
fins = join([bpy.data.objects['FinsL'], bpy.data.objects['FinsR']], 'Fins')

# ---------------------------------------------------------------- hands and feet
def hand(s, x):
    w0 = mirror(P['WR'], x); tip = w0 + (mirror(P['HA'], x) - w0) * 1.5
    a = (tip - w0).normalized()                       # down the hand
    n = Vector((-a.z, 0, a.x)).normalized() * -x       # palm side, toward the body
    w = n.cross(a).normalized()                        # across the knuckles
    if w.y > 0:
        w = -w                                         # -Y (the front) is the thumb side
    parts = []   # the palm is part of the body (a soft ellipsoid); only fingers here
    for k, (off, ln) in enumerate([(-0.045, 0.085), (-0.015, 0.1), (0.015, 0.095), (0.044, 0.078)]):
        base = w0 + a * 0.115 + w * off * 0.85
        pts = []
        for i in range(7):
            t = i / 6
            pts.append(base + a * ln * t + n * 0.035 * t * t + w * off * 0.35 * t)
        parts.append(tube('Finger%d%s' % (k, s), pts, [0.023 - 0.003 * (i / 6) for i in range(7)], SKIN, segs=12))
        parts.append(ellipsoid('Tip%d%s' % (k, s), pts[-1], (0.02, 0.02, 0.02), SKIN, 12, 8))
    tb = w0 + a * 0.06 + w * 0.045 + n * 0.012
    td = (a * 0.55 + w * 0.65 + n * 0.35).normalized()
    pts = [tb + td * 0.08 * (i / 6) + n * 0.015 * (i / 6) ** 2 for i in range(7)]
    parts.append(tube('Thumb' + s, pts, [0.027 - 0.004 * (i / 6) for i in range(7)], SKIN, segs=12))
    parts.append(ellipsoid('ThumbTip' + s, pts[-1], (0.023, 0.023, 0.023), SKIN, 12, 8))
    o = join(parts, 'Hand' + s)
    rigid(o, 'hand.' + s)
    return o

def foot(s, x):
    cx = P['AN'][0] * x
    parts = [ellipsoid('Sole' + s, Vector((cx + 0.005 * x, -0.06, 0.07)), (0.11, 0.17, 0.075), SKIN, 28, 18),
             ellipsoid('Heel' + s, Vector((cx, 0.0, 0.1)), (0.09, 0.09, 0.08), SKIN, 20, 14)]
    # five toes along the front, the big toe on the inside
    for k, (dx, r) in enumerate([(-0.06, 0.036), (-0.025, 0.029), (0.006, 0.027), (0.035, 0.025), (0.062, 0.022)]):
        tx = cx + dx * x
        ty = -0.222 + 0.0045 * k * k * 0.5 + 0.004 * k
        parts.append(ellipsoid('Toe%d%s' % (k, s), Vector((tx, ty, 0.035 + r * 0.8)), (r * 1.05, r * 1.25, r), SKIN, 14, 10))
    o = join(parts, 'Foot' + s)
    rigid(o, 'foot.' + s)
    return o

hands = join([hand('L', 1), hand('R', -1)], 'Hands')
feet = join([foot('L', 1), foot('R', -1)], 'Feet')

# ---------------------------------------------------------------- animation
pb = rig.pose.bones
for p in pb:
    p.rotation_mode = 'QUATERNION'

def reset():
    for p in pb:
        p.rotation_quaternion = (1, 0, 0, 0); p.location = (0, 0, 0)
    bpy.context.view_layer.update()

def turn(name, axis, deg):
    """Turn a bone about an armature-space axis through its head (after its parents)."""
    p = pb[name]
    bpy.context.view_layer.update()
    m = p.matrix.copy()
    head = m.to_translation()
    R = Matrix.Rotation(math.radians(deg), 4, Vector(axis))
    p.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ m
    bpy.context.view_layer.update()

def lift(dz):
    pb['hips'].location = (0, dz, 0)    # bone-local Y is up the spine

def key(frame):
    for p in pb:
        p.keyframe_insert('rotation_quaternion', frame=frame)
        p.keyframe_insert('location', frame=frame)

def arm(side, deg):
    """Swing an upper arm in the body's side plane: positive lowers it, negative raises it."""
    turn('upperarm.' + side, (0, 1, 0), deg if side == 'L' else -deg)

def elbow(side, deg):
    """Bend the forearm in the side plane: positive bends it up/in."""
    turn('forearm.' + side, (0, 1, 0), -deg if side == 'L' else deg)

def arms_down(extra=0.0, swing=0.0):
    arm('L', 22 + extra); arm('R', 22 + extra)
    turn('forearm.L', (1, 0, 0), 8 + swing); turn('forearm.R', (1, 0, 0), 8 - swing)

def new_action(name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    return act

ACTIONS = []
# Idle: breathing, a slow sway
a = new_action('Idle'); ACTIONS.append(a)
for f, ph in [(1, 0), (16, 1), (31, 2), (46, 3), (61, 4)]:
    reset()
    k = math.sin(ph * math.pi / 2)
    lift(0.012 * k)
    turn('spine', (0, 1, 0), 1.5 * k)
    turn('head', (0, 1, 0), -3 * k)
    turn('head', (1, 0, 0), 2 * math.cos(ph * math.pi / 2))
    arms_down(extra=2 * k)
    key(f)

# push each action to its own NLA track so the exporter sees them all
rig.animation_data.action = None
for act in ACTIONS:
    tr = rig.animation_data.nla_tracks.new(); tr.name = act.name
    tr.strips.new(act.name, 1, act)
reset()

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_yup=True,
                          export_apply=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_morph=False, export_def_bones=False,
                          export_force_sampling=True, export_frame_step=1)
print('WROTE', OUT, [o.name for o in scene.objects if o.type == 'MESH'])
