# «ثروة» player tokens: premium chrome / blue-crystal miniatures, rendered headless with Cycles (CPU, low priority).
#   blender -b -P tools/blender/tharwa_tokens.py -- <raw_out_dir> [car plane ship crown rocket diamond star hat]
# Writes piece-<key>-512.png (transparent RGBA, soft contact shadow baked in). Then run
#   python tools/blender/tokens_post.py <raw_out_dir>
# to make the 256/128 PNGs in public/tharwa/img and the contact sheet.
# Every model is built here from lofts / lathes / prisms (no external meshes), so it can be tweaked and re-rendered.
import bpy, bmesh, math, sys, os, ctypes
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "tharwa-tokens")
ONLY = set(argv[1:])
RES, SAMPLES, THREADS = 512, 40, 6
os.makedirs(OUT, exist_ok=True)

try:  # the owner may be gaming: below-normal priority, fixed CPU threads, no GPU
    k32 = ctypes.windll.kernel32
    k32.SetPriorityClass(k32.GetCurrentProcess(), 0x4000)
except Exception:
    pass


# ---------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.render.threads_mode = "FIXED"; sc.render.threads = THREADS
    sc.cycles.samples = SAMPLES
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 10; sc.cycles.transmission_bounces = 10; sc.cycles.glossy_bounces = 6
    sc.cycles.diffuse_bounces = 2
    sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 0.5
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Punchy"
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    world()
    return sc


def world(strength=0.6):
    """Navy studio dome with a bright cyan horizon band and a white top: chrome reflects it as the Serva blue-chrome look."""
    w = bpy.data.worlds.new("studio"); bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree; n = nt.nodes; l = nt.links
    n.clear()
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ")
    mr = n.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -1; mr.inputs["From Max"].default_value = 1
    ramp = n.new("ShaderNodeValToRGB"); cr = ramp.color_ramp
    # below the horizon too: a bright band at the camera's mirror angle so vertical chrome facing us is not black
    stops = [(0.0, (0.008, 0.02, 0.06)), (0.22, (0.04, 0.13, 0.36)), (0.30, (0.45, 0.75, 1.0)), (0.36, (0.05, 0.16, 0.42)),
             (0.46, (0.01, 0.04, 0.12)), (0.515, (0.3, 0.7, 1.0)),
             (0.57, (0.03, 0.12, 0.34)), (0.66, (0.12, 0.36, 0.8)), (0.72, (0.55, 0.8, 1.0)), (0.78, (0.06, 0.2, 0.5)),
             (0.9, (0.15, 0.35, 0.75)), (1.0, (0.95, 0.98, 1.0))]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = cr.elements.new(p); e.color = (*c, 1)
    bg = n.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = strength
    out = n.new("ShaderNodeOutputWorld")
    l.new(tc.outputs["Generated"], sep.inputs[0]); l.new(sep.outputs["Z"], mr.inputs["Value"])
    l.new(mr.outputs["Result"], ramp.inputs["Fac"]); l.new(ramp.outputs["Color"], bg.inputs["Color"])
    l.new(bg.outputs["Background"], out.inputs["Surface"])


def area(loc, target, energy, color, size, sx=None):
    bpy.ops.object.light_add(type="AREA", location=loc)
    o = bpy.context.active_object
    o.data.energy = energy; o.data.color = color
    if sx:
        o.data.shape = "RECTANGLE"; o.data.size = size; o.data.size_y = sx
    else:
        o.data.size = size
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    o.visible_camera = False
    return o


def studio(target=(0, 0, 0.9)):
    """Three-point + double rim: cool key, cyan fill, two strong cyan/ice rims from behind, a top softbox for chrome."""
    area((3.6, -4.2, 5.2), target, 650, (0.94, 0.97, 1.0), 3.0)            # key
    area((-5.0, -2.4, 2.2), target, 260, (0.18, 0.62, 1.0), 4.0)           # fill (Serva cyan)
    area((-3.2, 4.2, 3.2), target, 1300, (0.2, 0.75, 1.0), 1.4, 3.0)       # rim left (cyan)
    area((3.8, 3.6, 2.6), target, 1000, (0.62, 0.85, 1.0), 1.4, 3.0)       # rim right (ice)
    area((0.0, 0.0, 6.5), target, 260, (0.85, 0.92, 1.0), 4.0)             # top softbox
    area((0.4, -6.0, 0.7), target, 120, (0.55, 0.8, 1.0), 6.0, 0.6)        # low front strip (chrome streak)
    area((-6.4, -3.6, 3.4), target, 220, (0.75, 0.9, 1.0), 0.5, 5.0)       # vertical strip, camera-left (chrome edge)
    area((2.4, -7.0, 3.6), target, 160, (0.85, 0.94, 1.0), 0.5, 5.0)       # vertical strip, camera-right


def contact_shadow(rx=1.1, ry=0.9, strength=0.8, z=0.002):
    """Soft elliptical shadow baked into the sprite: black with a radial alpha falloff to exactly 0 (no plane edge, no box)."""
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, z))
    p = bpy.context.active_object; p.scale = (rx, ry, 1)
    m = bpy.data.materials.new("cshadow"); m.use_nodes = True
    nt = m.node_tree; n = nt.nodes; l = nt.links; n.clear()
    tc = n.new("ShaderNodeTexCoord"); gr = n.new("ShaderNodeTexGradient"); gr.gradient_type = "SPHERICAL"
    l.new(tc.outputs["Object"], gr.inputs["Vector"])
    pw = n.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 1.6
    l.new(gr.outputs["Fac"], pw.inputs[0])
    mul = n.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = strength
    l.new(pw.outputs[0], mul.inputs[0])
    tr = n.new("ShaderNodeBsdfTransparent"); em = n.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (0, 0, 0, 1)
    mix = n.new("ShaderNodeMixShader")
    l.new(mul.outputs[0], mix.inputs[0]); l.new(tr.outputs[0], mix.inputs[1]); l.new(em.outputs[0], mix.inputs[2])
    out = n.new("ShaderNodeOutputMaterial"); l.new(mix.outputs[0], out.inputs["Surface"])
    p.data.materials.append(m)
    for attr in ("visible_glossy", "visible_transmission", "visible_diffuse", "visible_shadow", "visible_volume_scatter"):
        setattr(p, attr, False)
    return p


def camera(elev=24, azim=-32, target=(0, 0, 0.94), ortho=2.62, dist=14):
    e, a = math.radians(elev), math.radians(azim)
    loc = Vector(target) + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.active_object
    c.rotation_euler = (Vector(target) - loc).to_track_quat("-Z", "Y").to_euler()
    c.data.type = "ORTHO"; c.data.ortho_scale = ortho; c.data.clip_end = 200
    bpy.context.scene.camera = c
    return c


# ---------------------------------------------------------------- materials
def mat(name, base=(0.8, 0.8, 0.8), metal=0.0, rough=0.2, trans=0.0, ior=1.45, coat=0.0, coat_rough=0.03,
        emit=None, estr=0.0, spec=0.5, sheen=0.0, disp=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Transmission Weight"].default_value = trans
    b.inputs["IOR"].default_value = ior
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Specular IOR Level"].default_value = spec
    if sheen and "Sheen Weight" in b.inputs:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (0.4, 0.75, 1.0, 1)
    if disp and "Dispersion" in b.inputs:
        b.inputs["Dispersion"].default_value = disp
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = estr
    return m


M = {}
def materials():
    M["chrome"] = mat("chrome", base=(0.93, 0.96, 1.0), metal=1.0, rough=0.06)
    M["bchrome"] = mat("bchrome", base=(0.42, 0.66, 1.0), metal=1.0, rough=0.09)        # blue-tinted chrome
    M["dchrome"] = mat("dchrome", base=(0.22, 0.27, 0.36), metal=1.0, rough=0.14)
    M["paint"] = mat("paint", base=(0.0, 0.12, 0.7), metal=0.6, rough=0.2, coat=1.0, emit=(0.0, 0.25, 1.0), estr=0.18)
    M["crystal"] = mat("crystal", base=(0.3, 0.66, 1.0), rough=0.0, trans=1.0, ior=2.1, disp=0.25, emit=(0.0, 0.35, 1.0), estr=0.3)
    M["glass"] = mat("glass", base=(0.08, 0.42, 1.0), rough=0.02, trans=1.0, ior=1.52, coat=1.0, emit=(0.0, 0.32, 1.0), estr=0.45)
    M["tint"] = mat("tint", base=(0.006, 0.02, 0.07), rough=0.04, coat=1.0, spec=1.0, emit=(0.0, 0.2, 0.7), estr=0.25)
    M["navy"] = mat("navy", base=(0.01, 0.028, 0.09), metal=0.35, rough=0.2, coat=1.0)
    M["velvet"] = mat("velvet", base=(0.01, 0.04, 0.22), rough=0.6, sheen=0.15, emit=(0.0, 0.1, 0.55), estr=0.25)
    M["rubber"] = mat("rubber", base=(0.015, 0.02, 0.03), rough=0.38, coat=0.4)
    M["glow"] = mat("glow", base=(0.1, 0.6, 1.0), emit=(0.15, 0.78, 1.0), estr=7.0)
    M["glowsoft"] = mat("glowsoft", base=(0.1, 0.5, 1.0), emit=(0.1, 0.6, 1.0), estr=2.5)


# ---------------------------------------------------------------- modelling helpers
def link(o):
    bpy.context.collection.objects.link(o)
    return o


def make(name, verts, faces, m, sub=0, smooth=True):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = smooth
    if sub:
        s = o.modifiers.new("sub", "SUBSURF"); s.levels = sub; s.render_levels = sub
    return o


def loft(rings, m, sub=2, loop=False, smooth=True, name="loft"):
    """Connect rings of points (same count; a 1-point ring is a pole). loop=True also joins the last ring to the first."""
    verts, idx, faces = [], [], []
    for r in rings:
        s = len(verts); verts.extend(r); idx.append(list(range(s, s + len(r))))
    pairs = list(zip(idx, idx[1:])) + ([(idx[-1], idx[0])] if loop else [])
    for a, b in pairs:
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            faces += [(a[0], b[(j + 1) % len(b)], b[j]) for j in range(len(b))]
        elif len(b) == 1:
            faces += [(a[j], a[(j + 1) % len(a)], b[0]) for j in range(len(a))]
        else:
            n = len(a)
            faces += [(a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]) for j in range(n)]
    return make(name, verts, faces, m, sub, smooth)


def lathe(profile, m, n=64, sub=2, loop=False, smooth=True):
    """Revolve a (r, z) profile around Z; r == 0 makes a pole."""
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([(0.0, 0.0, z)])
        else:
            rings.append([(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n), z) for k in range(n)])
    return loft(rings, m, sub, loop, smooth, "lathe")


def sgn(v):
    return 1.0 if v >= 0 else -1.0


def sect(x, w, zb, zt, n=24, p=3.0, y0=0.0):
    """Super-ellipse cross-section in the YZ plane at x (half-width w, from zb to zt). p: 2 = ellipse, higher = boxier."""
    zc, h = (zb + zt) / 2, (zt - zb) / 2
    out = []
    for k in range(n):
        a = 2 * math.pi * k / n
        c, s = math.cos(a), math.sin(a)
        out.append((x, y0 + w * sgn(c) * abs(c) ** (2 / p), zc + h * sgn(s) * abs(s) ** (2 / p)))
    return out


def pole(x, z, y=0.0):
    return [(x, y, z)]


def prism(points, depth, m, bevel=0.03, axis="Y", seg=3, loc=(0, 0, 0)):
    """Extrude a 2D outline by depth. axis Y: outline in XZ (stands up). Z: outline in XY (lies flat)."""
    me = bpy.data.meshes.new("prism"); bm = bmesh.new()
    vs = [bm.verts.new((a, -depth / 2, b) if axis == "Y" else (a, b, -depth / 2)) for a, b in points]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    off = (0, depth, 0) if axis == "Y" else (0, 0, depth)
    bmesh.ops.translate(bm, vec=off, verts=[v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new("prism", me)); o.location = loc
    me.materials.append(m)
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL"); b.width = bevel; b.segments = seg
        b.limit_method = "ANGLE"; b.angle_limit = math.radians(30)
        b.harden_normals = False
    for p in me.polygons:
        p.use_smooth = True
    smooth_angle(o)
    return o


def smooth_angle(o, deg=35):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))


def sphere(r, loc, m, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24, rotation=rot)
    o = bpy.context.active_object; o.scale = scale
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    return o


def torus(R, r, loc, m, rot=(0, 0, 0), seg=72, half=False, zscale=1.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=(0, 0, 0), major_segments=seg, minor_segments=16)
    o = bpy.context.active_object
    if half:  # keep the y >= 0 half (an arch once rotated upright)
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -1e-4], context="VERTS")
        bm.to_mesh(o.data); bm.free()
    if zscale != 1.0:
        for v in o.data.vertices:
            v.co.y *= zscale
    o.location = loc; o.rotation_euler = rot
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    return o


def cyl(r, h, loc, m, rot=(0, 0, 0), verts=48, r2=None, bevel=0.0):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL"); b.width = bevel; b.segments = 3
        b.limit_method = "ANGLE"
    smooth_angle(o, 40)
    return o


def rod(p1, p2, r, m, r2=None, verts=24):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    o = cyl(r, d.length, (p1 + p2) / 2, m, verts=verts, r2=r2)
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return o


def xform(objs, mtx):
    bpy.context.view_layer.update()
    for o in objs:
        o.matrix_world = mtx @ o.matrix_world


def normalize(objs, span=2.0, height=2.3, lift=0.0):
    """Scale/move a model so it fits span x span on the floor and `height` tall, standing at z = lift."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        if o.type == "MESH":
            me = ev.to_mesh()
            pts += [ev.matrix_world @ v.co for v in me.vertices]
            ev.to_mesh_clear()
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    s = min(span / max(mx.x - mn.x, mx.y - mn.y), height / (mx.z - mn.z))
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    xform(objs, Matrix.Translation((0, 0, lift)) @ Matrix.Scale(s, 4) @ Matrix.Translation(-c))


def objs_now(before):
    return [o for o in bpy.context.scene.objects if o.name not in before and o.type == "MESH" and not o.hide_render]


def yaw(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


# ---------------------------------------------------------------- token base (shared)
def token_base():
    """Chrome coin base with a navy glass inlay and a glowing cyan ring (the piece stands on it)."""
    lathe([(0, 0.0), (0.80, 0.0), (0.845, 0.025), (0.85, 0.115), (0.83, 0.15), (0.79, 0.158), (0.735, 0.15),
           (0.715, 0.135), (0.0, 0.135)], M["chrome"], n=96, sub=2)
    cyl(0.705, 0.012, (0, 0, 0.134), M["tint"], verts=96)
    torus(0.765, 0.02, (0, 0, 0.152), M["glow"], seg=96)


# ---------------------------------------------------------------- the 8 pieces (x = forward)
def piece_car():
    """Low, wedge-shaped sports coupe: candy-blue body with cut wheel arches, dark glass canopy, chrome rims, glowing lights."""
    S = [(-1.0, 0.40, 0.20, 0.44), (-0.94, 0.47, 0.15, 0.51), (-0.70, 0.5, 0.12, 0.53), (-0.35, 0.5, 0.12, 0.5),
         (0.05, 0.5, 0.12, 0.47), (0.40, 0.5, 0.12, 0.43), (0.70, 0.48, 0.12, 0.36), (0.90, 0.44, 0.13, 0.28),
         (1.0, 0.36, 0.15, 0.23)]
    rings = [pole(-1.04, 0.32)] + [sect(x, w, zb, zt, 28, 4.0) for x, w, zb, zt in S] + [pole(1.04, 0.19)]
    body = loft(rings, M["paint"], sub=2, name="body")
    C = [(-0.70, 0.30, 0.44, 0.50), (-0.48, 0.385, 0.44, 0.74), (-0.15, 0.40, 0.44, 0.82), (0.12, 0.38, 0.42, 0.75),
         (0.36, 0.31, 0.40, 0.51)]
    loft([pole(-0.76, 0.48)] + [sect(x, w, zb, zt, 24, 2.6) for x, w, zb, zt in C] + [pole(0.42, 0.45)], M["tint"], sub=2, name="cabin")
    r90 = (math.pi / 2, 0, 0)
    for x in (0.6, -0.6):
        for y in (0.4, -0.4):
            cut = cyl(0.255, 0.26, (x, y * 1.18, 0.215), M["chrome"], rot=r90, verts=48)
            cut.hide_render = True; cut.display_type = "WIRE"; cut.name = "cutter"
            cut.parent = body; cut.matrix_parent_inverse = body.matrix_world.inverted()
            bo = body.modifiers.new("arch", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cut; bo.solver = "EXACT"
            cyl(0.21, 0.17, (x, y, 0.215), M["rubber"], rot=r90, verts=48, bevel=0.06)
            cyl(0.145, 0.18, (x, y, 0.215), M["chrome"], rot=r90, verts=48, bevel=0.02)
            torus(0.1, 0.015, (x, y * 1.23, 0.215), M["glow"], rot=r90, seg=48)
            cyl(0.045, 0.19, (x, y, 0.215), M["dchrome"], rot=r90, verts=24)
    for y in (0.29, -0.29):  # headlights
        sphere(0.07, (0.95, y, 0.28), M["glow"], (0.45, 1.6, 0.45), rot=(0, 0, math.radians(-14 if y > 0 else 14)))
    sphere(0.06, (-1.0, 0, 0.42), M["glow"], (0.4, 5.6, 0.35))  # rear light bar
    prism([(-0.84, 0.0), (-0.98, 0.0), (-1.01, 0.05), (-0.86, 0.045)], 0.78, M["chrome"], 0.01, loc=(0, 0, 0.58))  # spoiler
    for y in (0.28, -0.28):
        rod((-0.9, y, 0.5), (-0.92, y, 0.6), 0.016, M["chrome"])
    prism([(1.02, 0.0), (0.8, 0.0), (0.82, 0.03), (1.03, 0.03)], 0.62, M["chrome"], 0.008, loc=(0, 0, 0.13))  # splitter
    for y in (1, -1):  # chrome side skirts
        rod((-0.36, y * 0.47, 0.15), (0.36, y * 0.47, 0.15), 0.02, M["chrome"])


def piece_plane():
    """Swept-wing jet on a chrome stand, nose pitched up: chrome fuselage, candy-blue wings and tail, glowing engines."""
    F = [(1.0, 0.055, 0.0), (0.9, 0.12, 0.0), (0.72, 0.16, 0.0), (0.3, 0.17, 0.0), (-0.3, 0.17, 0.01),
         (-0.62, 0.135, 0.04), (-0.86, 0.085, 0.09), (-1.0, 0.04, 0.12)]
    rings = [pole(1.05, 0.0)] + [sect(x, r, z - r, z + r, 24, 2.0) for x, r, z in F] + [pole(-1.04, 0.125)]
    loft(rings, M["chrome"], sub=2, name="fuselage")
    sphere(0.15, (0.8, 0, 0.075), M["tint"], (0.9, 0.62, 0.42))  # cockpit glass
    wing = [(0.32, 0.12), (-0.36, 1.06), (-0.56, 1.06), (-0.24, 0.12), (-0.24, -0.12), (-0.56, -1.06), (-0.36, -1.06), (0.32, -0.12)]
    prism(wing, 0.05, M["paint"], 0.022, axis="Z", loc=(0, 0, -0.07))
    tail = [(-0.74, 0.06), (-0.98, 0.44), (-1.08, 0.44), (-1.02, 0.06), (-1.02, -0.06), (-1.08, -0.44), (-0.98, -0.44), (-0.74, -0.06)]
    prism(tail, 0.035, M["paint"], 0.014, axis="Z", loc=(0, 0, 0.11))
    prism([(-0.6, 0.08), (-0.94, 0.58), (-1.07, 0.58), (-1.03, 0.08)], 0.045, M["paint"], 0.018, axis="Y")
    for y in (0.45, -0.45):  # engines under the wings
        eng = lathe([(0, -0.15), (0.06, -0.15), (0.085, -0.1), (0.09, 0.05), (0.08, 0.17), (0.0, 0.17)], M["chrome"], n=32, sub=1)
        eng.rotation_euler = (0, math.pi / 2, 0); eng.location = (0.0, y, -0.17)
        cyl(0.062, 0.02, (0.17, y, -0.17), M["glow"], rot=(0, math.pi / 2, 0), verts=32)
        prism([(-0.08, 0.0), (0.08, 0.0), (0.03, 0.08), (-0.1, 0.08)], 0.025, M["chrome"], 0.008, axis="Y", loc=(0, y, -0.16))
    for y in (1.05, -1.05):
        sphere(0.035, (-0.47, y, -0.07), M["glow"])
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    xform(objs, Matrix.Translation((0, 0, 1.1)) @ Matrix.Rotation(math.radians(-12), 4, "Y"))
    rod((0, 0, -0.2), (0.02, 0, 0.96), 0.045, M["chrome"])  # stand


def hull_sect(x, b, d, k, n=12):
    h = d - k
    half = [(0.6 * b, d + 0.008), (b, d), (b * 1.0, d - 0.08 * h), (b * 0.88, d - 0.5 * h), (b * 0.5, k + 0.12 * h)]
    pts = [(0.0, d + 0.012)] + half + [(0.0, k)] + [(-y, z) for y, z in reversed(half)]
    return [(x, y, z) for y, z in pts]


def piece_ship():
    """Motor yacht: candy-blue hull with a raked bow, chrome decks, wrap-around dark glass, glowing waterline lights."""
    H = [(-1.0, 0.36, 0.50, 0.24), (-0.6, 0.40, 0.50, 0.13), (0.0, 0.42, 0.51, 0.10), (0.5, 0.35, 0.53, 0.14),
         (0.85, 0.19, 0.56, 0.27), (1.04, 0.03, 0.60, 0.52)]
    st = hull_sect(-1.0, 0.36, 0.5, 0.24)
    tr = [(-1.012, y * 0.6, 0.37 + (z - 0.37) * 0.6) for _, y, z in st]
    rings = [pole(-1.012, 0.37), tr] + [hull_sect(*h) for h in H] + [pole(1.07, 0.6)]
    loft(rings, M["paint"], sub=2, name="hull")
    # chrome sheer line / deck
    D = [(-0.98, 0.35), (-0.6, 0.39), (0.0, 0.41), (0.5, 0.34), (0.85, 0.18), (1.02, 0.03)]
    loft([pole(-0.99, 0.515)] + [sect(x, w, 0.47, 0.535, 16, 6.0) for x, w in D] + [pole(1.05, 0.56)], M["chrome"], sub=1, name="deck")
    # superstructure tiers + window bands
    T1 = [(-0.78, 0.29, 0.5, 0.71), (-0.4, 0.33, 0.5, 0.72), (0.15, 0.31, 0.5, 0.71), (0.42, 0.22, 0.5, 0.60)]
    loft([pole(-0.8, 0.6)] + [sect(x, w, a, b, 24, 5.0) for x, w, a, b in T1] + [pole(0.5, 0.56)], M["chrome"], sub=2, name="t1")
    W1 = [(-0.72, 0.30, 0.575, 0.665), (-0.4, 0.338, 0.575, 0.67), (0.15, 0.318, 0.575, 0.665), (0.38, 0.235, 0.56, 0.61)]
    loft([pole(-0.74, 0.62)] + [sect(x, w, a, b, 24, 6.0) for x, w, a, b in W1] + [pole(0.44, 0.585)], M["tint"], sub=1, name="w1")
    T2 = [(-0.62, 0.25, 0.68, 0.87), (-0.25, 0.27, 0.68, 0.88), (0.1, 0.24, 0.68, 0.82), (0.24, 0.17, 0.68, 0.74)]
    loft([pole(-0.64, 0.78)] + [sect(x, w, a, b, 24, 5.0) for x, w, a, b in T2] + [pole(0.3, 0.71)], M["chrome"], sub=2, name="t2")
    W2 = [(-0.56, 0.258, 0.745, 0.825), (-0.25, 0.278, 0.745, 0.83), (0.08, 0.25, 0.73, 0.79), (0.2, 0.18, 0.71, 0.74)]
    loft([pole(-0.58, 0.785)] + [sect(x, w, a, b, 24, 6.0) for x, w, a, b in W2] + [pole(0.25, 0.725)], M["tint"], sub=1, name="w2")
    T3 = [(-0.46, 0.19, 0.84, 0.96), (-0.2, 0.2, 0.84, 0.97), (0.0, 0.15, 0.84, 0.9)]
    loft([pole(-0.48, 0.9)] + [sect(x, w, a, b, 24, 4.0) for x, w, a, b in T3] + [pole(0.05, 0.87)], M["tint"], sub=2, name="t3")
    rod((-0.3, 0, 0.95), (-0.34, 0, 1.24), 0.025, M["chrome"])
    sphere(0.045, (-0.34, 0, 1.25), M["glow"])
    rod((-0.3, -0.12, 1.08), (-0.3, 0.12, 1.08), 0.016, M["chrome"])
    def beam(x):  # hull half-beam at x (linear between the sections), at porthole height
        for (x0, b0, *_), (x1, b1, *_) in zip(H, H[1:]):
            if x0 <= x <= x1:
                return b0 + (b1 - b0) * (x - x0) / (x1 - x0)
        return H[0][1]
    for x in (0.4, 0.12, -0.16, -0.44):  # glowing portholes along the hull
        for y in (1, -1):
            sphere(0.032, (x, y * beam(x) * 0.985, 0.4), M["glow"], (1.3, 0.35, 0.75))


def piece_crown():
    """Royal crown: chrome band with crystal gems, fleur points, arches over a blue velvet cap, orb and cross on top."""
    lathe([(0.735, 0.02), (0.79, 0.0), (0.83, 0.03), (0.87, 0.47), (0.865, 0.53), (0.81, 0.53), (0.775, 0.49), (0.735, 0.06)],
          M["chrome"], n=96, sub=2, loop=True)
    torus(0.82, 0.042, (0, 0, 0.04), M["chrome"], seg=96)
    torus(0.868, 0.036, (0, 0, 0.52), M["chrome"], seg=96)
    sphere(0.76, (0, 0, 0.42), M["velvet"], (1, 1, 0.62))
    tall = [(-0.2, 0.0), (0.2, 0.0), (0.16, 0.12), (0.06, 0.3), (0.0, 0.44), (-0.06, 0.3), (-0.16, 0.12)]
    small = [(-0.15, 0.0), (0.15, 0.0), (0.04, 0.17), (0.0, 0.25), (-0.04, 0.17)]
    for k in range(8):
        a = math.radians(-120 + k * 45)
        r = 0.84
        is_tall = k % 2 == 0
        p = prism(tall if is_tall else small, 0.09, M["chrome"], 0.025, axis="Y")
        p.location = (math.cos(a) * r, math.sin(a) * r, 0.5)
        p.rotation_euler = (0, 0, a - math.pi / 2)
        top = 0.5 + (0.46 if is_tall else 0.24)
        sphere(0.075 if is_tall else 0.045, (math.cos(a) * r, math.sin(a) * r, top + (0.04 if is_tall else 0.02)),
               M["crystal"] if is_tall else M["chrome"])
        # gems on the band
        g = math.radians(-120 + k * 45)
        sphere(0.07, (math.cos(g) * 0.875, math.sin(g) * 0.875, 0.27), M["crystal"], (0.55, 0.9, 1.15), rot=(0, 0, g))
        h = g + math.radians(22.5)
        sphere(0.032, (math.cos(h) * 0.872, math.sin(h) * 0.872, 0.27), M["chrome"])
    for a in (0, 90):  # two crossing arches
        torus(0.8, 0.04, (0, 0, 0.5), M["chrome"], rot=(math.pi / 2, 0, math.radians(a + 15)), half=True, zscale=0.72)
    sphere(0.12, (0, 0, 1.2), M["crystal"])
    torus(0.12, 0.018, (0, 0, 1.2), M["chrome"], seg=48)
    prism([(-0.025, 0.0), (0.025, 0.0), (0.025, 0.09), (0.075, 0.09), (0.075, 0.14), (0.025, 0.14), (0.025, 0.2),
           (-0.025, 0.2), (-0.025, 0.14), (-0.075, 0.14), (-0.075, 0.09), (-0.025, 0.09)], 0.05, M["chrome"], 0.01, loc=(0, 0, 1.3))
    bpy.context.active_object.rotation_euler = (0, 0, math.radians(-32))


def piece_rocket():
    """Retro-future rocket: chrome body, blue crystal nose, porthole, four swept candy fins, glowing engine."""
    lathe([(0.0, 0.42), (0.25, 0.42), (0.3, 0.48), (0.335, 0.65), (0.35, 1.0), (0.34, 1.4), (0.32, 1.56), (0.0, 1.56)],
          M["chrome"], n=64, sub=2)
    lathe([(0.0, 1.54), (0.325, 1.54), (0.3, 1.78), (0.23, 2.0), (0.12, 2.16), (0.0, 2.24)], M["glass"], n=64, sub=2)
    torus(0.327, 0.03, (0, 0, 1.55), M["bchrome"], seg=64)
    torus(0.35, 0.026, (0, 0, 0.84), M["bchrome"], seg=64)
    lathe([(0.0, 0.43), (0.2, 0.43), (0.25, 0.32), (0.29, 0.2), (0.255, 0.19), (0.2, 0.3), (0.0, 0.32)], M["dchrome"], n=48, sub=1)
    cyl(0.18, 0.02, (0, 0, 0.3), M["glow"], verts=48)
    lathe([(0.0, 0.3), (0.17, 0.28), (0.1, 0.14), (0.0, 0.04)], M["glowsoft"], n=32, sub=1)  # flame core
    a = math.radians(-112)
    rr = 0.345
    torus(0.1, 0.026, (math.cos(a) * rr, math.sin(a) * rr, 1.2), M["chrome"], rot=(0, math.pi / 2, a), seg=48)
    sphere(0.085, (math.cos(a) * (rr - 0.02), math.sin(a) * (rr - 0.02), 1.2), M["glow"], (0.45, 1, 1), rot=(0, 0, a))
    fin = [(0.30, 0.98), (0.44, 0.74), (0.64, 0.4), (0.76, 0.1), (0.78, 0.0), (0.62, 0.0), (0.46, 0.14), (0.30, 0.36)]
    for k in range(4):
        b = math.radians(45 + k * 90 - 32)
        p = prism(fin, 0.07, M["paint"], 0.025, axis="Y")
        p.rotation_euler = (0, 0, b)
        sphere(0.04, (math.cos(b) * 0.77, math.sin(b) * 0.77, 0.04), M["glow"])


def piece_diamond():
    """Brilliant-cut blue diamond (table, crown, girdle, pavilion facets) held in a chrome four-prong cup."""
    pts = []
    n = 8
    zg = 1.12
    for k in range(n):
        a = 2 * math.pi * k / n
        pts.append((math.cos(a) * 0.56, math.sin(a) * 0.56, zg + 0.36))                       # table
        b = a + math.pi / n
        pts.append((math.cos(b) * 0.84, math.sin(b) * 0.84, zg + 0.2))                        # crown (bezel) points
        pts.append((math.cos(a) * 0.5, math.sin(a) * 0.5, zg - 0.48))                         # pavilion mains
    for k in range(2 * n):
        a = 2 * math.pi * k / (2 * n)
        pts.append((math.cos(a) * 1.0, math.sin(a) * 1.0, zg + 0.035))                        # girdle top
        pts.append((math.cos(a) * 1.0, math.sin(a) * 1.0, zg - 0.035))                        # girdle bottom
    pts.append((0, 0, zg - 0.98))                                                            # culet
    me = bpy.data.meshes.new("gem"); bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    gem = link(bpy.data.objects.new("gem", me)); me.materials.append(M["crystal"])
    gem.rotation_euler = (0, 0, math.radians(11))
    lathe([(0.0, 0.0), (0.07, 0.0), (0.06, 0.12), (0.09, 0.2), (0.27, 0.36), (0.3, 0.4), (0.0, 0.4)], M["chrome"], n=48, sub=2)
    for k in range(4):
        a = math.radians(45 + 90 * k - 21)
        c, s = math.cos(a), math.sin(a)
        rod((c * 0.26, s * 0.26, 0.38), (c * 1.0, s * 1.0, zg + 0.04), 0.03, M["chrome"], r2=0.022)
        sphere(0.04, (c * 1.0, s * 1.0, zg + 0.06), M["chrome"])


def piece_star():
    """Five-point faceted crystal star in a chrome frame, on a short chrome stem."""
    R, r_in = 1.0, 0.46
    outline = []
    for k in range(10):
        rr = R if k % 2 == 0 else r_in
        a = math.radians(90 + k * 36)
        outline.append((math.cos(a) * rr, math.sin(a) * rr))
    zc = 1.08
    verts = [(x, 0.0, z + zc) for x, z in outline] + [(0, -0.34, zc), (0, 0.34, zc)]
    faces = [(i, (i + 1) % 10, 10) for i in range(10)] + [((i + 1) % 10, i, 11) for i in range(10)]
    make("star", verts, faces, M["crystal"], 0, smooth=False)
    inner = [(x * 0.8, z * 0.8) for x, z in outline]
    t = 0.06
    rings = [[(x, -t, z + zc) for x, z in outline], [(x, -t, z + zc) for x, z in inner],
             [(x, t, z + zc) for x, z in inner], [(x, t, z + zc) for x, z in outline]]
    fr = loft(rings, M["chrome"], sub=0, loop=True, smooth=False, name="frame")
    b = fr.modifiers.new("bevel", "BEVEL"); b.width = 0.018; b.segments = 2
    smooth_angle(fr, 40)
    rod((0, 0, 0.0), (0, 0, zc - r_in * 0.95), 0.06, M["chrome"])
    torus(0.07, 0.02, (0, 0, 0.22), M["glow"], seg=32)
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in BASE_NAMES]
    xform(objs, yaw(14))


def piece_hat():
    """Top hat in midnight-blue lacquer, curled brim, glowing crystal band and a chrome buckle."""
    lathe([(0.0, 1.42), (0.50, 1.42), (0.565, 1.405), (0.585, 1.36), (0.53, 0.32), (0.53, 0.17), (0.7, 0.15), (0.8, 0.19),
           (0.85, 0.23), (0.87, 0.19), (0.83, 0.115), (0.7, 0.085), (0.5, 0.075), (0.0, 0.075)], M["navy"], n=96, sub=2)
    lathe([(0.536, 0.2), (0.552, 0.21), (0.556, 0.42), (0.538, 0.43)], M["glass"], n=96, sub=1, loop=True)
    torus(0.553, 0.012, (0, 0, 0.2), M["glow"], seg=96)
    torus(0.557, 0.012, (0, 0, 0.43), M["glow"], seg=96)
    a = math.radians(-112)
    rr = 0.56
    bk = prism([(-0.1, -0.08), (0.1, -0.08), (0.1, 0.08), (-0.1, 0.08)], 0.04, M["chrome"], 0.015, axis="Y")
    bk.location = (math.cos(a) * rr, math.sin(a) * rr, 0.315); bk.rotation_euler = (0, 0, a - math.pi / 2)
    hole = prism([(-0.055, -0.04), (0.055, -0.04), (0.055, 0.04), (-0.055, 0.04)], 0.05, M["tint"], 0.008, axis="Y")
    hole.location = (math.cos(a) * (rr + 0.003), math.sin(a) * (rr + 0.003), 0.315); hole.rotation_euler = (0, 0, a - math.pi / 2)


# key: (builder, yaw towards the camera, floor span) — the long pieces get a smaller span so nothing touches the frame
PIECES = {"car": (piece_car, -52, 1.9), "plane": (piece_plane, -40, 1.72), "ship": (piece_ship, -50, 1.8),
          "crown": (piece_crown, 0, 1.95), "rocket": (piece_rocket, 0, 1.95), "diamond": (piece_diamond, 0, 1.95),
          "star": (piece_star, 0, 1.95), "hat": (piece_hat, 0, 1.95)}
BASE_NAMES = set()


def do_piece(key):
    reset(); materials()
    before = {o.name for o in bpy.context.scene.objects}
    fn, turn, span = PIECES[key]
    fn()
    objs = objs_now(before)
    if turn:
        xform(objs, yaw(turn))
    normalize(objs, span=span, height=1.95, lift=0.135)
    token_base(); contact_shadow()
    studio(); camera()
    sc = bpy.context.scene
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.color_depth = "8"
    sc.render.filepath = os.path.join(OUT, f"piece-{key}-{RES}.png")
    bpy.ops.render.render(write_still=True)
    print("wrote", sc.render.filepath, flush=True)


for name in PIECES:
    if ONLY and name not in ONLY:
        continue
    do_piece(name)
print("done:", OUT)
