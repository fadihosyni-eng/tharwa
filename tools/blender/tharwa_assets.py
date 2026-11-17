# «ثروة» premium sprites, rendered headless with Cycles (transparent WebP):
#   blender -b -P tools/blender/tharwa_assets.py -- <out_dir> [asset ...]
# Assets: car plane ship crown rocket diamond star hat  house hotel  coin bill  start jail vacation gotojail  hero
# (no names = everything). Every model is built from primitives + bevels here, so it can be re-rendered or tweaked.
# Look: Serva navy/cyan studio, chrome + crystal-blue glass + gold accents, soft contact shadow (shadow catcher).
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else "tharwa-assets")
ONLY = set(argv[1:])
os.makedirs(OUT, exist_ok=True)


# ---------------------------------------------------------------- scene
def reset(samples=96):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 10
    sc.cycles.transmission_bounces = 10
    sc.cycles.glossy_bounces = 6
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "CUDA"
        prefs.get_devices()
        ok = False
        for d in prefs.devices:
            d.use = d.type == "CUDA"
            ok = ok or d.use
        if ok:
            sc.cycles.device = "GPU"
    except Exception as e:  # CPU is fine, just slower
        print("GPU not used:", e)
    world()
    return sc


def world(strength=0.55):
    w = bpy.data.worlds.new("studio"); bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree; n = nt.nodes; l = nt.links
    n.clear()
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ")
    mr = n.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -1; mr.inputs["From Max"].default_value = 1
    ramp = n.new("ShaderNodeValToRGB"); cr = ramp.color_ramp
    stops = [(0.0, (0.004, 0.008, 0.025)), (0.47, (0.012, 0.04, 0.11)), (0.52, (0.25, 0.6, 1.0)),
             (0.60, (0.03, 0.12, 0.32)), (0.85, (0.10, 0.28, 0.62)), (1.0, (0.85, 0.93, 1.0))]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
    for p, c in stops[1:-1]:
        e = cr.elements.new(p); e.color = (*c, 1)
    bg = n.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = strength
    out = n.new("ShaderNodeOutputWorld")
    l.new(tc.outputs["Generated"], sep.inputs[0]); l.new(sep.outputs["Z"], mr.inputs["Value"])
    l.new(mr.outputs["Result"], ramp.inputs["Fac"]); l.new(ramp.outputs["Color"], bg.inputs["Color"])
    l.new(bg.outputs["Background"], out.inputs["Surface"])


def area(loc, target, energy, color, size):
    bpy.ops.object.light_add(type="AREA", location=loc)
    o = bpy.context.active_object
    o.data.energy = energy; o.data.color = color; o.data.size = size
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


def studio(scale=1.0, target=(0, 0, 0.8)):
    s = scale
    area((4 * s, -4 * s, 6 * s), target, 700 * s * s, (0.92, 0.97, 1.0), 4 * s)      # key (cool white)
    area((-5 * s, -1.5 * s, 2.5 * s), target, 420 * s * s, (0.15, 0.6, 1.0), 3 * s)   # fill (Serva cyan)
    area((1 * s, 5 * s, 4 * s), target, 900 * s * s, (0.35, 0.85, 1.0), 2.5 * s)     # rim
    area((0, -6 * s, 0.6 * s), target, 160 * s * s, (0.6, 0.8, 1.0), 6 * s)           # low front strip (chrome streak)


def shadow_floor(size=30):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    p = bpy.context.active_object
    p.is_shadow_catcher = True
    # what glass refracts / chrome reflects: the dark navy board, not a white floor
    p.data.materials.append(mat('floor', base=(0.006, 0.014, 0.04), rough=0.35))
    return p


def camera(elev=28, azim=-32, target=(0, 0, 0.85), ortho=3.6, dist=14):
    e, a = math.radians(elev), math.radians(azim)
    loc = Vector(target) + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    bpy.ops.object.camera_add(location=loc)
    c = bpy.context.active_object
    c.rotation_euler = (Vector(target) - loc).to_track_quat("-Z", "Y").to_euler()
    c.data.type = "ORTHO"; c.data.ortho_scale = ortho
    c.data.clip_end = 200
    bpy.context.scene.camera = c
    return c


# ---------------------------------------------------------------- materials
def mat(name, base=(0.8, 0.8, 0.8), metal=0.0, rough=0.2, trans=0.0, ior=1.45, coat=0.0, emit=None, estr=0.0, spec=0.5, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["Transmission Weight"].default_value = trans
    b.inputs["IOR"].default_value = ior
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Alpha"].default_value = alpha
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = estr
    return m


def window_mat(name, glass=(0.06, 0.32, 0.9), glow=(0.55, 0.9, 1.0), cols=7.0, rows=6.0, strength=5.0, zmin=0.18, trans=0.55, metal=0.0, wu=(0.28, 0.82), wv=(0.3, 0.8)):
    """Blue glass with a glowing window grid (procedural, object space: columns on x+y, rows on z)."""
    m = mat(name, base=glass, rough=0.05, trans=trans, metal=metal, ior=1.45, coat=1.0, emit=glow, estr=0.0, spec=0.8)
    nt = m.node_tree; n = nt.nodes; l = nt.links
    b = n["Principled BSDF"]
    tc = n.new("ShaderNodeTexCoord"); sep = n.new("ShaderNodeSeparateXYZ")
    l.new(tc.outputs["Object"], sep.inputs[0])

    def op(kind, a, bval=None):
        node = n.new("ShaderNodeMath"); node.operation = kind
        if isinstance(a, (int, float)): node.inputs[0].default_value = a
        else: l.new(a, node.inputs[0])
        if bval is not None:
            if isinstance(bval, (int, float)): node.inputs[1].default_value = bval
            else: l.new(bval, node.inputs[1])
        return node.outputs[0]
    u = op("ADD", sep.outputs["X"], sep.outputs["Y"])
    fu = op("FRACT", op("MULTIPLY", u, cols))
    fv = op("FRACT", op("MULTIPLY", sep.outputs["Z"], rows))
    cu = op("MULTIPLY", op("GREATER_THAN", fu, wu[0]), op("LESS_THAN", fu, wu[1]))
    cv = op("MULTIPLY", op("GREATER_THAN", fv, wv[0]), op("LESS_THAN", fv, wv[1]))
    mask = op("MULTIPLY", op("MULTIPLY", cu, cv), op("GREATER_THAN", sep.outputs["Z"], zmin))
    l.new(op("MULTIPLY", mask, strength), b.inputs["Emission Strength"])
    return m


M = {}
def materials():
    M["chrome"] = mat("chrome", base=(0.93, 0.95, 0.98), metal=1.0, rough=0.07)
    M["dchrome"] = mat("dchrome", base=(0.32, 0.36, 0.42), metal=1.0, rough=0.14)
    M["gold"] = mat("gold", base=(1.0, 0.72, 0.26), metal=1.0, rough=0.13)
    M["glass"] = mat("glass", base=(0.05, 0.38, 1.0), rough=0.02, trans=1.0, ior=1.5, coat=1.0, emit=(0.0, 0.38, 1.0), estr=0.7)
    M["crystal"] = mat("crystal", base=(0.62, 0.86, 1.0), rough=0.0, trans=1.0, ior=2.2, emit=(0.1, 0.55, 1.0), estr=0.35)
    M["paint"] = mat("paint", base=(0.0, 0.42, 1.0), metal=0.45, rough=0.28, coat=1.0, emit=(0.0, 0.3, 1.0), estr=0.45)
    M["navy"] = mat("navy", base=(0.015, 0.05, 0.16), metal=0.3, rough=0.2, coat=1.0)
    M["glow"] = mat("glow", base=(0.05, 0.45, 0.8), emit=(0.1, 0.75, 1.0), estr=3.2)
    M["gglow"] = mat("gglow", base=(1.0, 0.7, 0.25), emit=(1.0, 0.66, 0.16), estr=3.0)
    M["note"] = mat("note", base=(0.02, 0.24, 0.62), metal=0.2, rough=0.35, coat=0.6)


# ---------------------------------------------------------------- modelling helpers
def finish(o, m, bevel=0.03, seg=3, smooth=True, angle=35):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True); bpy.context.view_layer.objects.active = o
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL"); b.width = bevel; b.segments = seg
        b.limit_method = "ANGLE"; b.angle_limit = math.radians(30)
        bpy.ops.object.modifier_apply(modifier=b.name)
    if smooth:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    o.data.materials.clear(); o.data.materials.append(m)
    return o


def box(size, loc, m, bevel=0.04, rot=(0, 0, 0), seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, m, bevel, seg)


def shaped(size, loc, m, bevel, edit, seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    edit(o)
    return finish(o, m, bevel, seg)


def cyl(r, h, loc, m, bevel=0.02, rot=(0, 0, 0), verts=48, r2=None, seg=3):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=verts)
    return finish(bpy.context.active_object, m, bevel, seg)


def sphere(r, loc, m, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24)
    o = bpy.context.active_object; o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, m, 0, smooth=True, angle=80)


def prism(points, depth, m, bevel=0.05, axis="Y", loc=(0, 0, 0), seg=3):
    """Extrude a 2D outline (list of (a, b)) by `depth`. axis Y: outline in XZ (stands up); Z: lies flat in XY."""
    me = bpy.data.meshes.new("prism"); bm = bmesh.new()
    vs = []
    for a, b in points:
        vs.append(bm.verts.new((a, -depth / 2, b) if axis == "Y" else (a, b, -depth / 2)))
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    off = (0, depth, 0) if axis == "Y" else (0, 0, depth)
    bmesh.ops.translate(bm, vec=off, verts=[v for v in ext["geom"] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new("prism", me); bpy.context.collection.objects.link(o)
    o.location = loc
    return finish(o, m, bevel, seg, angle=30)


def star_pts(r=1.0, inner=0.45, n=5, rot=90):
    out = []
    for k in range(n * 2):
        rr = r if k % 2 == 0 else r * inner
        a = math.radians(rot + k * 180 / n)
        out.append((math.cos(a) * rr, math.sin(a) * rr))
    return out


def text(s, size, loc, m, depth=0.03, rot=(0, 0, 0)):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.active_object
    o.data.body = s; o.data.size = size; o.data.extrude = depth
    o.data.align_x = "CENTER"; o.data.align_y = "CENTER"
    o.data.bevel_depth = depth * 0.3
    o.data.materials.append(m)
    return o


def normalize(objs, span=2.0, height=2.3, lift=0.0):
    """Scale/move a model so it fits span x span on the floor and height tall, standing at z=lift."""
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    s = min(span / max(mx.x - mn.x, mx.y - mn.y), height / (mx.z - mn.z))
    c = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in objs:
        o.location = (o.location - c) * s + Vector((0, 0, lift))
        o.scale = o.scale * s
    bpy.context.view_layer.update()


def render(name, sizes, w_over_h=1.0, quality=88):
    sc = bpy.context.scene
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.quality = quality
    for s in sizes:
        sc.render.resolution_x = int(round(s * w_over_h)); sc.render.resolution_y = s
        sc.render.resolution_percentage = 100
        path = os.path.join(OUT, f"{name}-{s}.webp")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print("wrote", path, os.path.getsize(path))


def objs_now(before):
    return [o for o in bpy.context.scene.objects if o.name not in before and o.type in ("MESH", "FONT")]


# ---------------------------------------------------------------- the 8 player pieces
def piece_car():
    def hood(o):
        for v in o.data.vertices:
            if v.co.x > 0 and v.co.z > 0: v.co.z -= 0.08
    shaped((2.0, 0.92, 0.38), (0, 0, 0.4), M['chrome'], 0.15, hood, seg=5)
    def cabin(o):
        for v in o.data.vertices:
            if v.co.z > 0: v.co.x = v.co.x * 0.66 - 0.06
    shaped((1.1, 0.8, 0.4), (-0.12, 0, 0.78), M['glass'], 0.1, cabin, seg=4)
    box((0.62, 0.84, 0.05), (-0.16, 0, 0.99), M['chrome'], 0.02)
    for x in (0.62, -0.62):
        for y in (0.47, -0.47):
            cyl(0.24, 0.16, (x, y, 0.25), M['dchrome'], 0.04, rot=(math.pi / 2, 0, 0))
            cyl(0.11, 0.18, (x, y, 0.25), M['glow'], 0.0, rot=(math.pi / 2, 0, 0))
    for y in (0.28, -0.28):
        sphere(0.075, (1.0, y, 0.44), M['glow'], (0.6, 1, 1))
    box((2.03, 0.95, 0.045), (0, 0, 0.44), M['gold'], 0.015)


def piece_plane():
    sphere(1.0, (0, 0, 1.05), M["chrome"], (1.05, 0.2, 0.2))
    sphere(0.3, (0.55, 0, 1.14), M["glass"], (0.9, 0.42, 0.38))
    box((0.5, 2.1, 0.07), (0.05, 0, 1.0), M["chrome"], 0.03)
    box((0.28, 0.75, 0.05), (-0.88, 0, 1.08), M["chrome"], 0.02)
    box((0.3, 0.05, 0.38), (-0.9, 0, 1.3), M["glass"], 0.02)
    for y in (0.55, -0.55):
        cyl(0.08, 0.32, (0.1, y, 0.92), M["dchrome"], 0.02, rot=(0, math.pi / 2, 0))
        sphere(0.06, (0.27, y, 0.92), M["glow"])
    cyl(0.05, 0.85, (0, 0, 0.5), M["chrome"], 0.0)
    cyl(0.5, 0.1, (0, 0, 0.05), M["chrome"], 0.03)
    cyl(0.42, 0.11, (0, 0, 0.06), M["glow"], 0.0)


def piece_ship():
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.32))
    hull = bpy.context.active_object; hull.scale = (2.1, 0.8, 0.5)
    bpy.ops.object.transform_apply(scale=True)
    for v in hull.data.vertices:
        if v.co.z < 0: v.co.y *= 0.55; v.co.x *= 0.82
        if v.co.x > 0: v.co.y *= 0.25; v.co.x += 0.18
    finish(hull, M["chrome"], 0.08, seg=4)
    box((2.0, 0.7, 0.05), (0.02, 0, 0.47), M["gold"], 0.02)
    box((0.9, 0.56, 0.3), (-0.25, 0, 0.72), M["glass"], 0.06)
    box((0.5, 0.46, 0.22), (-0.3, 0, 0.98), M["glass"], 0.05)
    cyl(0.13, 0.5, (-0.62, 0, 1.12), M["chrome"], 0.02)
    cyl(0.135, 0.1, (-0.62, 0, 1.27), M["glow"], 0.0)
    cyl(0.025, 0.5, (0.3, 0, 0.95), M["chrome"], 0.0)


def piece_crown():
    bpy.ops.mesh.primitive_cylinder_add(radius=0.9, depth=0.62, location=(0, 0, 0.36), vertices=64)
    band = bpy.context.active_object
    bm = bmesh.new(); bm.from_mesh(band.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.9], context="FACES_ONLY")
    bm.to_mesh(band.data); bm.free()
    sol = band.modifiers.new("s", "SOLIDIFY"); sol.thickness = 0.12
    bpy.context.view_layer.objects.active = band; bpy.ops.object.modifier_apply(modifier=sol.name)
    finish(band, M["gold"], 0.03)
    for k in range(5):
        a = math.radians(-90 + k * 72)
        x, y = math.cos(a) * 0.86, math.sin(a) * 0.86
        cyl(0.24, 0.72, (x, y, 0.98), M["gold"], 0.02, r2=0.04, verts=32)
        sphere(0.11, (x * 1.0, y * 1.0, 1.36), M["crystal"])
        sphere(0.12, (math.cos(a + 0.63) * 0.95, math.sin(a + 0.63) * 0.95, 0.38), M["glass"], (1, 1, 1.2))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.92, minor_radius=0.07, location=(0, 0, 0.07))
    finish(bpy.context.active_object, M["chrome"], 0)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.92, minor_radius=0.05, location=(0, 0, 0.66))
    finish(bpy.context.active_object, M["chrome"], 0)


def piece_rocket():
    cyl(0.36, 1.25, (0, 0, 0.95), M["chrome"], 0.03)
    cyl(0.36, 0.72, (0, 0, 1.935), M["glass"], 0.02, r2=0.0)
    cyl(0.3, 0.3, (0, 0, 0.2), M["dchrome"], 0.02, r2=0.36)
    cyl(0.2, 0.1, (0, 0, 0.04), M["glow"], 0.0)
    cyl(0.375, 0.07, (0, 0, 1.55), M["gold"], 0.01)
    cyl(0.375, 0.07, (0, 0, 0.4), M["gold"], 0.01)
    sphere(0.16, (0, -0.33, 1.15), M["glow"], (1, 0.45, 1))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.035, location=(0, -0.355, 1.15), rotation=(math.pi / 2, 0, 0))
    finish(bpy.context.active_object, M["gold"], 0)
    for k in range(3):
        a = math.radians(90 + k * 120)
        fin = prism([(0, 0), (0.55, 0), (0.5, 0.25), (0, 0.85)], 0.07, M["glass"], 0.02)
        fin.location = (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.05)
        fin.rotation_euler = (0, 0, a)


def piece_diamond():
    me = bpy.data.meshes.new("gem"); bm = bmesh.new()
    n = 8
    table = [bm.verts.new((math.cos(2 * math.pi * k / n + math.pi / n) * 0.55, math.sin(2 * math.pi * k / n + math.pi / n) * 0.55, 1.85)) for k in range(n)]
    gird = [bm.verts.new((math.cos(2 * math.pi * k / (2 * n)) * 1.0, math.sin(2 * math.pi * k / (2 * n)) * 1.0, 1.42)) for k in range(2 * n)]
    tip = bm.verts.new((0, 0, 0.32))
    bm.faces.new(table)
    G = lambda i: gird[i % (2 * n)]
    for k in range(n):  # table vertex k sits above girdle vertex 2k+1
        t0, t1 = table[k], table[(k + 1) % n]
        bm.faces.new((t0, G(2 * k + 1), G(2 * k + 2)))
        bm.faces.new((t0, G(2 * k + 2), t1))
        bm.faces.new((t1, G(2 * k + 2), G(2 * k + 3)))
    for k in range(2 * n):
        bm.faces.new((gird[(k + 1) % (2 * n)], gird[k], tip))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    gem = bpy.data.objects.new("gem", me); bpy.context.collection.objects.link(gem)
    finish(gem, M["crystal"], 0, smooth=False)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.28, minor_radius=0.06, location=(0, 0, 0.42))
    finish(bpy.context.active_object, M["chrome"], 0)
    cyl(0.07, 0.3, (0, 0, 0.22), M["chrome"], 0.0)
    cyl(0.55, 0.1, (0, 0, 0.05), M["chrome"], 0.03)
    cyl(0.47, 0.11, (0, 0, 0.06), M["glow"], 0.0)


def piece_star():
    pts = [(x, z + 1.12) for x, z in star_pts(1.0, 0.46)]
    prism(pts, 0.36, M["gold"], 0.07, axis="Y")
    pts2 = [(x * 0.55, z * 0.55 + 1.12) for x, z in star_pts(1.0, 0.46)]
    prism(pts2, 0.42, M["glass"], 0.04, axis="Y")
    cyl(0.62, 0.12, (0, 0, 0.06), M["chrome"], 0.04)
    cyl(0.54, 0.13, (0, 0, 0.07), M["glow"], 0.0)
    cyl(0.09, 0.3, (0, 0, 0.2), M["chrome"], 0.0)


def piece_hat():
    cyl(0.95, 0.08, (0, 0, 0.1), M["navy"], 0.04, verts=64)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.95, minor_radius=0.05, location=(0, 0, 0.12), major_segments=64)
    finish(bpy.context.active_object, M["chrome"], 0)
    cyl(0.56, 1.1, (0, 0, 0.7), M["navy"], 0.06, r2=0.62, verts=64)
    cyl(0.575, 0.2, (0, 0, 0.3), M["glow"], 0.0, r2=0.585, verts=64)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.6, minor_radius=0.035, location=(0, 0, 0.42), major_segments=64)
    finish(bpy.context.active_object, M["gold"], 0)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.6, minor_radius=0.035, location=(0, 0, 1.25), major_segments=64)
    finish(bpy.context.active_object, M["chrome"], 0)


PIECES = {"car": piece_car, "plane": piece_plane, "ship": piece_ship, "crown": piece_crown,
          "rocket": piece_rocket, "diamond": piece_diamond, "star": piece_star, "hat": piece_hat}


def do_piece(key):
    reset(128); materials()
    before = {o.name for o in bpy.context.scene.objects}
    PIECES[key]()
    normalize(objs_now(before), span=2.1, height=2.15)
    shadow_floor(); studio(); camera(elev=26, azim=-34, target=(0, 0, 0.98), ortho=2.85)
    render("piece-" + key, [128, 256])


# ---------------------------------------------------------------- buildings
def do_house():
    reset(128); materials()
    before = {o.name for o in bpy.context.scene.objects}
    box((1.5, 1.5, 0.12), (0, 0, 0.06), M["chrome"], 0.04)
    box((1.24, 1.24, 0.95), (0, 0, 0.6), window_mat("hw", cols=2.2, rows=2.4, strength=7.0, zmin=0.25), 0.03)
    def ridge(o):
        bm = bmesh.new(); bm.from_mesh(o.data)
        for v in bm.verts:
            if v.co.z > 0: v.co.y = 0
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bm.to_mesh(o.data); bm.free()
    shaped((1.5, 1.46, 0.62), (0, 0, 1.38), M["paint"], 0.03, ridge)
    box((0.3, 0.06, 0.45), (0.2, -0.63, 0.35), M["gglow"], 0.01)
    box((0.22, 0.22, 0.5), (0.4, 0.3, 1.6), M["chrome"], 0.02)
    normalize(objs_now(before), span=2.0, height=2.1)
    shadow_floor(); studio(); camera(elev=30, azim=-36, target=(0, 0, 0.9), ortho=3.1)
    render("house", [64, 128])


def do_hotel():
    reset(128); materials()
    before = {o.name for o in bpy.context.scene.objects}
    box((2.2, 1.5, 0.14), (0, 0, 0.07), M["chrome"], 0.04)
    box((1.9, 1.2, 2.3), (0, 0, 1.29), window_mat("tw", cols=2.6, rows=3.2, strength=6.0, zmin=0.35), 0.03)
    box((2.0, 1.3, 0.12), (0, 0, 2.48), M["gold"], 0.03)
    box((1.4, 0.9, 0.35), (0, 0, 2.7), window_mat("tw2", cols=3, rows=4, strength=4.0, zmin=0), 0.03)
    box((1.5, 1.0, 0.08), (0, 0, 2.9), M["gold"], 0.02)
    box((0.9, 0.06, 0.32), (0, -0.63, 2.7), M["gglow"], 0.01)
    box((0.6, 0.08, 0.5), (0, -0.62, 0.4), M["gglow"], 0.01)
    cyl(0.05, 0.6, (0.5, 0.2, 3.2), M["chrome"], 0.0)
    sphere(0.09, (0.5, 0.2, 3.52), M["gglow"])
    normalize(objs_now(before), span=2.0, height=2.9)
    shadow_floor(); studio(); camera(elev=24, azim=-36, target=(0, 0, 1.35), ortho=3.6)
    render("hotel", [64, 128])


# ---------------------------------------------------------------- money
def do_coin():
    reset(96); materials()
    cyl(1.0, 0.2, (0, 0, 0), M["gold"], 0.05, verts=96)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.86, minor_radius=0.04, location=(0, 0, 0.1), major_segments=96)
    finish(bpy.context.active_object, M["gold"], 0)
    prism([(x * 0.55, y * 0.55) for x, y in star_pts(1.0, 0.45)], 0.08, M["gold"], 0.025, axis="Z", loc=(0, 0, 0.12))
    studio(1.0, (0, 0, 0)); camera(elev=58, azim=-20, target=(0, 0, 0.1), ortho=2.3)
    render("coin", [64, 128])


def do_bill():
    reset(96); materials()
    before = {o.name for o in bpy.context.scene.objects}
    box((2.4, 1.15, 0.03), (0, 0, 0), M["note"], 0.01)
    for (sx, sy, x, y) in [(2.2, 0.05, 0, 0.47), (2.2, 0.05, 0, -0.47), (0.05, 0.94, 1.08, 0), (0.05, 0.94, -1.08, 0)]:
        box((sx, sy, 0.02), (x, y, 0.02), M["gold"], 0.005)
    cyl(0.36, 0.03, (0, 0, 0.02), M["chrome"], 0.01)
    t = text("$", 0.5, (0, 0, 0.04), M["gold"], 0.02)
    for x in (-0.8, 0.8):
        cyl(0.13, 0.03, (x, 0.25, 0.02), M["glow"], 0.0)
        cyl(0.13, 0.03, (x, -0.25, 0.02), M["glow"], 0.0)
    bpy.ops.object.empty_add(location=(0, 0, 0)); root = bpy.context.active_object
    for o in objs_now(before):
        o.parent = root
    bend = None
    root.rotation_euler = (0, math.radians(6), math.radians(-14))
    studio(1.0, (0, 0, 0)); camera(elev=58, azim=-10, target=(0, 0, 0), ortho=2.7)
    render("bill", [64, 128])


# ---------------------------------------------------------------- corner icons
def do_start():
    reset(128); materials()
    before = {o.name for o in bpy.context.scene.objects}
    pts = [(1.2, -0.32), (0.05, -0.32), (0.05, -0.8), (-1.2, 0.0), (0.05, 0.8), (0.05, 0.32), (1.2, 0.32)]
    prism(pts, 0.34, M["gold"], 0.08, axis="Z", loc=(0, 0, 0.3))
    prism([(x * 0.8 - 0.06, y * 0.62) for x, y in pts], 0.38, M["glass"], 0.04, axis="Z", loc=(0, 0, 0.32))
    normalize(objs_now(before), span=2.2, height=1.2)
    shadow_floor(); studio(); camera(elev=38, azim=-20, target=(0, 0, 0.3), ortho=3.0)
    render("corner-start", [128, 256])


def do_jail():
    reset(128); materials()
    before = {o.name for o in bpy.context.scene.objects}
    box((1.7, 1.7, 0.14), (0, 0, 0.07), M["chrome"], 0.04)
    box((1.4, 1.4, 1.4), (0, 0, 0.84), M["glass"], 0.06)
    box((1.6, 1.6, 0.12), (0, 0, 1.6), M["chrome"], 0.04)
    for k in range(5):
        x = -0.56 + k * 0.28
        cyl(0.05, 1.42, (x, -0.74, 0.84), M["chrome"], 0.0)
        cyl(0.05, 1.42, (-0.74, x, 0.84), M["chrome"], 0.0)
    box((1.6, 0.08, 0.08), (0, -0.74, 1.2), M["chrome"], 0.02)
    box((0.08, 1.6, 0.08), (-0.74, 0, 1.2), M["chrome"], 0.02)
    sphere(0.16, (0, 0, 1.78), M["gglow"])
    normalize(objs_now(before), span=2.0, height=2.0)
    shadow_floor(); studio(); camera(elev=26, azim=-45, target=(0, 0, 0.95), ortho=3.1)
    render("corner-jail", [128, 256])


def do_vacation():
    reset(128); materials()
    before = {o.name for o in bpy.context.scene.objects}
    cyl(1.15, 0.14, (0, 0, 0.07), M["gold"], 0.05, verts=64)
    cyl(1.0, 0.15, (0, 0, 0.08), M["glow"], 0.0, verts=64)
    cyl(0.05, 1.7, (0.0, 0, 0.95), M["chrome"], 0.0)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.15, radius2=0.0, depth=0.5, location=(0, 0, 1.85))
    can = bpy.context.active_object
    finish(can, M["glass"], 0.02, smooth=False)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=1.17, radius2=0.0, depth=0.51, location=(0, 0, 1.855))
    rib = bpy.context.active_object
    wf = rib.modifiers.new("w", "WIREFRAME"); wf.thickness = 0.04
    bpy.context.view_layer.objects.active = rib; bpy.ops.object.modifier_apply(modifier=wf.name)
    finish(rib, M["chrome"], 0, smooth=False)
    sphere(0.1, (0, 0, 2.15), M["gglow"])
    # lounge chair
    box((0.9, 0.42, 0.06), (0.35, -0.45, 0.42), M["paint"], 0.02, rot=(0, math.radians(-10), 0))
    box((0.4, 0.42, 0.06), (-0.12, -0.45, 0.62), M["paint"], 0.02, rot=(0, math.radians(-55), 0))
    for x in (0.7, 0.0):
        cyl(0.025, 0.36, (x, -0.45, 0.25), M["chrome"], 0.0)
    normalize(objs_now(before), span=2.2, height=2.2)
    shadow_floor(); studio(); camera(elev=24, azim=-30, target=(0, 0, 1.0), ortho=3.1)
    render("corner-vacation", [128, 256])


def do_gotojail():
    reset(128); materials()
    before = {o.name for o in bpy.context.scene.objects}
    shield = [(0, -1.1), (0.55, -0.75), (0.85, -0.25), (0.9, 0.75), (0.45, 0.9), (0, 1.05), (-0.45, 0.9), (-0.9, 0.75), (-0.85, -0.25), (-0.55, -0.75)]
    prism([(x, z + 1.15) for x, z in shield], 0.26, M["chrome"], 0.08, axis="Y")
    prism([(x * 0.82, z * 0.82 + 1.15) for x, z in shield], 0.32, M["glass"], 0.04, axis="Y")
    prism([(x * 0.48, z * 0.48 + 1.18) for x, z in star_pts(1.0, 0.45)], 0.42, M["gold"], 0.03, axis="Y")
    cyl(0.55, 0.12, (0, 0, 0.06), M["chrome"], 0.04)
    cyl(0.47, 0.13, (0, 0, 0.07), M["glow"], 0.0)
    normalize(objs_now(before), span=2.0, height=2.3)
    shadow_floor(); studio(); camera(elev=18, azim=-24, target=(0, 0, 1.1), ortho=2.9)
    render("corner-gotojail", [128, 256])


# ---------------------------------------------------------------- centre hero: glass skyline + gold coins
def do_hero():
    reset(160); materials()
    import random
    rnd = random.Random(7)
    towers = [(-3.4, 1.4, 0.7, 2.2), (-2.6, 0.8, 0.8, 3.4), (-1.7, 1.6, 0.7, 2.6), (-0.9, 0.9, 0.9, 4.6), (0.0, 1.8, 1.0, 5.6),
              (0.95, 1.0, 0.85, 4.0), (1.8, 1.7, 0.7, 3.0), (2.6, 0.9, 0.8, 3.7), (3.4, 1.5, 0.7, 2.3), (-4.2, 2.2, 0.6, 1.6), (4.2, 2.1, 0.6, 1.7)]
    for k, (x, y, w, h) in enumerate(towers):
        wm = window_mat(f"tw{k}", glass=(0.004, 0.025 + 0.02 * rnd.random(), 0.11), glow=(0.18, 0.66, 1.0), cols=5.0 + 2 * rnd.random(), rows=7.0, strength=0.9 + 1.1 * rnd.random(), zmin=-99, trans=0.0, metal=0.35, wu=(0.2, 0.75), wv=(0.42, 0.62))
        box((w, w * 0.9, h), (x, y, h / 2), wm, 0.03)
        top = M["gold"] if k in (4, 1, 7) else M["chrome"]
        box((w * 1.04, w * 0.94, 0.08), (x, y, h + 0.04), top, 0.02)
        if k == 4:
            cyl(0.05, 1.2, (x, y, h + 0.6), M["chrome"], 0.0)
            sphere(0.1, (x, y, h + 1.22), M["gglow"])
        if k in (3, 5):
            box((w * 0.6, w * 0.55, 0.5), (x, y, h + 0.3), wm, 0.03)
    # coin stacks in front
    for (x, y, n) in [(-2.3, -2.2, 7), (-1.5, -2.8, 4), (1.7, -2.5, 8), (2.5, -2.0, 4), (0.4, -3.1, 2), (-0.5, -3.3, 3)]:
        for k in range(n):
            cyl(0.46, 0.13, (x + rnd.uniform(-0.03, 0.03), y + rnd.uniform(-0.03, 0.03), 0.07 + k * 0.135), M["gold"], 0.03, verts=64)
    c = cyl(0.46, 0.13, (0.9, -3.2, 0.42), M["gold"], 0.03, verts=64); c.rotation_euler = (math.radians(68), 0, math.radians(-25))
    shadow_floor(60)
    studio(2.0, (0, 0, 1.5))
    camera(elev=12, azim=0, target=(0, 0, 3.0), ortho=12.6, dist=30)
    render("hero", [300, 600], w_over_h=1.6, quality=80)


JOBS = {**{k: (lambda k=k: do_piece(k)) for k in PIECES}, "house": do_house, "hotel": do_hotel, "coin": do_coin, "bill": do_bill,
        "start": do_start, "jail": do_jail, "vacation": do_vacation, "gotojail": do_gotojail, "hero": do_hero}
for name, job in JOBS.items():
    if ONLY and name not in ONLY:
        continue
    job()
print("done:", OUT)
