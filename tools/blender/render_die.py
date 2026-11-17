# Serva-style crystal die, rendered headless:
#   blender -b -P tools/blender/render_die.py -- <out.png> [value]
import bpy, bmesh, math, sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "die.png"
VALUE = int(argv[1]) if len(argv) > 1 else 5

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.film_transparent = True
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

# --- die body: rounded cube
bpy.ops.mesh.primitive_cube_add(size=2)
die = bpy.context.active_object
bev = die.modifiers.new("bevel", "BEVEL"); bev.width = 0.28; bev.segments = 8
bpy.ops.object.shade_smooth()

body = bpy.data.materials.new("crystal"); body.use_nodes = True
bsdf = body.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.02, 0.12, 0.45, 1)
bsdf.inputs["Roughness"].default_value = 0.06
bsdf.inputs["Transmission Weight"].default_value = 0.85
bsdf.inputs["IOR"].default_value = 1.55
bsdf.inputs["Coat Weight"].default_value = 1.0
bsdf.inputs["Emission Color"].default_value = (0.0, 0.35, 1.0, 1)
bsdf.inputs["Emission Strength"].default_value = 0.25
die.data.materials.append(body)

# --- pips: glowing cyan, only on the faces we see (front face carries the value)
pip = bpy.data.materials.new("pip"); pip.use_nodes = True
pb = pip.node_tree.nodes["Principled BSDF"]
pb.inputs["Base Color"].default_value = (0.75, 0.97, 1.0, 1)
pb.inputs["Emission Color"].default_value = (0.18, 0.89, 1.0, 1)
pb.inputs["Emission Strength"].default_value = 6.0
pb.inputs["Metallic"].default_value = 0.6
pb.inputs["Roughness"].default_value = 0.15

LAYOUT = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)],
          4: [(-1, -1), (1, -1), (-1, 1), (1, 1)], 5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)],
          6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)]}
def pips(value, place):
    for (a, b) in LAYOUT[value]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, segments=24, ring_count=12)
        s = bpy.context.active_object
        s.scale = (1, 1, 0.35)
        place(s, a * 0.5, b * 0.5)
        s.data.materials.append(pip)
        bpy.ops.object.shade_smooth()

def front(s, a, b):  # -Y face (towards the camera)
    s.location = (a, -1.0, b); s.rotation_euler = (math.pi / 2, 0, 0)
def top(s, a, b):
    s.location = (a, b, 1.0)
def right(s, a, b):
    s.location = (1.0, a, b); s.rotation_euler = (0, math.pi / 2, 0)

pips(VALUE, front)
pips(3 if VALUE != 3 else 2, top)
pips(2 if VALUE not in (2, 5) else 4, right)

# --- camera + studio light (Serva blue)
bpy.ops.object.camera_add(location=(3.6, -5.6, 3.4))
cam = bpy.context.active_object
cam.rotation_euler = (math.radians(63), 0, math.radians(33))
cam.data.lens = 70
scene.camera = cam

def area(loc, rot, energy, color, size):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.active_object; l.rotation_euler = rot
    l.data.energy = energy; l.data.color = color; l.data.size = size
area((4, -3, 5), (math.radians(40), 0, math.radians(50)), 900, (0.7, 0.9, 1.0), 4)
area((-4, -2, 2), (math.radians(70), 0, math.radians(-60)), 500, (0.1, 0.55, 1.0), 3)
area((0, 4, 3), (math.radians(-60), 0, 0), 600, (0.2, 0.9, 1.0), 3)

world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.005, 0.02, 0.06, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6

scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)
