// @ts-nocheck — ported plain JS (three.js scene code); typed boundaries live in pages/index.astro.
// «مدينة Serva» — the optional real-time 3D tour of the homepage (three.js). Never loaded by default: the page
// itself is pre-rendered stills. This module is imported only when a capable desktop turns «جولة 3D» on.
// Light by design: no post-processing (glow is faked with sprites), DPR ≤ 1.25, frames only on demand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease3 = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export async function start(ctx) {
  const H = document.documentElement, canvas = document.getElementById('hxWorld');
  let introDone = false, stopped = false, raf = 0, keep = 0, tPrev = performance.now(), looping = false;
  const ac = new AbortController();
  const on = (t, ty, fn, o = {}) => t.addEventListener(ty, fn, { ...o, signal: ac.signal });
  const coarse = false;
  const Q = { dprMax: 1.25, motes: 360, falls: 100, shadow: 1024, coins: 18, cards: 8, clouds: 14 };
  const setLoad = () => {};

  // ---------------------------------------------------------------- renderer / composer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  // integrated / low-power GPUs start lighter (no MSAA, DPR 1); the adaptive loop below can go further
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    if (/Intel|UHD|Iris|Radeon\(TM\) Graphics|Vega \d+ Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(gpu)) { Q.dprMax = 1; Q.motes = 200; }
  } catch (e) { /* keep defaults */ }
  let dpr = Math.min(devicePixelRatio || 1, Q.dprMax);
  let W = innerWidth, Hh = innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, Hh, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0.05, 0.1, 0.21);
  scene.fog = new THREE.FogExp2(FOG, 0.0036);
  const camera = new THREE.PerspectiveCamera(34, W / Hh, 0.5, 2600);


  const U = { uTime: { value: 0 } };
  const MOON_DIR = V(-0.46, 0.25, -0.85).normalize();

  // ---------------------------------------------------------------- sky (gradient, moon, twinkling stars)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: U.uTime, uMoon: { value: MOON_DIR }, uFog: { value: FOG } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uMoon; uniform vec3 uFog; varying vec3 vDir;
      float h31(vec3 p){ p = fract(p*0.3183099+vec3(.1,.2,.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 zen = vec3(0.003,0.007,0.024), mid = vec3(0.012,0.032,0.09);
        vec3 col = mix(uFog, mid, smoothstep(-0.02, 0.2, y));
        col = mix(col, zen, smoothstep(0.2, 0.85, y));
        float md = max(dot(d, uMoon), 0.0);
        col += vec3(0.3,0.45,0.85)*pow(md, 30.0)*0.18 + vec3(0.65,0.78,1.0)*pow(md, 700.0)*0.22 + vec3(0.8,0.88,1.0)*pow(md, 6000.0)*0.25;
        vec3 mt1 = normalize(cross(uMoon, vec3(0.0,1.0,0.0))); vec3 mt2 = cross(mt1, uMoon);
        vec2 mu = vec2(dot(d, mt1), dot(d, mt2)) / 0.036;            // disc radius ~2 degrees
        float mr = length(mu);
        if (mr < 1.0 && md > 0.0) {
          float mz = sqrt(1.0 - mr*mr);
          vec2 q = mu*3.2; float mn = 0.0, ma = 0.5;
          for (int o = 0; o < 4; o++) { vec2 i = floor(q), f = fract(q); f = f*f*(3.0-2.0*f);
            float a = h31(vec3(i,1.0)), b = h31(vec3(i+vec2(1,0),1.0)), c = h31(vec3(i+vec2(0,1),1.0)), e = h31(vec3(i+vec2(1,1),1.0));
            mn += ma*mix(mix(a,b,f.x), mix(c,e,f.x), f.y); q *= 2.1; ma *= 0.5; }
          vec3 mc = mix(vec3(1.25,1.28,1.36), vec3(0.62,0.68,0.82), smoothstep(0.45, 0.75, mn)) * (0.55 + 0.45*mz);
          col = mix(col, mc, smoothstep(1.0, 0.94, mr));
        }
        vec3 p = d*240.0; vec3 i = floor(p); vec3 f = fract(p);
        float r = h31(i);
        if (r > 0.955) {
          vec3 c = vec3(h31(i+1.3), h31(i+2.7), h31(i+4.1))*0.6+0.2;
          float s = smoothstep(0.16, 0.0, length(f-c));
          float tw = 0.55 + 0.45*sin(uTime*(0.8+r*3.0) + r*91.0);
          col += mix(vec3(0.7,0.85,1.0), vec3(1.0,0.85,0.6), step(0.985, r)) * s * tw * (r-0.955)*55.0 * smoothstep(0.03, 0.35, y) * (1.0 - smoothstep(0.995, 0.9993, md));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // ---------------------------------------------------------------- cloud sea (tileable noise texture made here)
  const noiseTex = (() => {
    const N = 256, data = new Uint8Array(N * N), acc = new Float32Array(N * N);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const oct = [[4, .42], [8, .26], [16, .16], [32, .1], [64, .06]];
    for (const [P, w] of oct) {
      const g = new Float32Array(P * P).map(rnd), cell = N / P;
      for (let y = 0; y < N; y++) {
        const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
        for (let x = 0; x < N; x++) {
          const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
          const a = g[(y0 % P) * P + x0 % P], b = g[(y0 % P) * P + (x0 + 1) % P], c = g[((y0 + 1) % P) * P + x0 % P], d = g[((y0 + 1) % P) * P + (x0 + 1) % P];
          acc[y * N + x] += w * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy);
        }
      }
    }
    let mn = 9, mx = -9; for (const v of acc) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    for (let i = 0; i < acc.length; i++) data[i] = Math.round((acc[i] - mn) / (mx - mn) * 255);
    const t = new THREE.DataTexture(data, N, N, THREE.RedFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  })();
  const camPosU = { value: V() };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uTime: U.uTime, uN: { value: noiseTex }, uCam: camPosU, uFog: { value: FOG }, uMoon: { value: MOON_DIR } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      uniform sampler2D uN; uniform float uTime; uniform vec3 uCam; uniform vec3 uFog; uniform vec3 uMoon; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float n1 = texture2D(uN, p*0.0021 + vec2(uTime*0.0012, uTime*0.0005)).r;
        float n2 = texture2D(uN, p*0.0074 + vec2(-uTime*0.0021, uTime*0.0013)).r;
        float n3 = texture2D(uN, p*0.023 + vec2(uTime*0.003, 0.0)).r;
        float n = n1*0.56 + n2*0.3 + n3*0.14;
        float dens = smoothstep(0.34, 0.74, n);
        vec3 col = mix(vec3(0.008,0.02,0.055), vec3(0.13,0.2,0.36), dens);
        col += vec3(0.08,0.12,0.2) * smoothstep(0.6, 0.9, n);
        vec3 v = normalize(uCam - vW); vec3 rf = reflect(-v, vec3(0.0,1.0,0.0));
        col += vec3(0.35,0.45,0.75) * pow(max(dot(rf, uMoon), 0.0), 18.0) * (0.25 + dens*0.75);
        float dc = length(vW.xz);
        col += vec3(0.04,0.2,0.42) * exp(-dc*dc/1800.0) * (0.5 + dens);
        float dist = length(uCam - vW);
        col = mix(col, uFog, 1.0 - exp(-pow(dist*0.0019, 1.5)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sea.position.y = -15;
  scene.add(sea);

  // soft cloud billboards (some on the intro flight path)
  const blobTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    let s = 3; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 18; i++) {
      const x = 34 + r() * 60, y = 44 + r() * 40, rad = 16 + r() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.34)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const clouds = [];
  {
    let s = 11; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const spots = [];
    for (let i = 0; i < Q.clouds; i++) {
      const a = r() * Math.PI * 2, rad = 30 + r() * 60;
      spots.push([Math.cos(a) * rad, -12 + r() * 12, Math.sin(a) * rad, 40 + r() * 50, .16 + r() * .14]);
    }
    spots.push([-18, 34, 120, 70, .3], [26, 46, 160, 80, .28], [-6, 22, 92, 50, .22], [14, 58, 200, 90, .26]);
    for (const [x, y, z, sc, op] of spots) {
      const m = new THREE.SpriteMaterial({ map: blobTex, color: 0x9db4e8, transparent: true, opacity: op, depthWrite: false, fog: true });
      const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.set(sc, sc * .5, 1); sp.renderOrder = 2;
      sp.userData.base = sp.position.clone(); sp.userData.sp = .2 + r() * .4;
      scene.add(sp); clouds.push(sp);
    }
  }

  // ---------------------------------------------------------------- lights + environment
  scene.add(new THREE.HemisphereLight(0x5b7fd6, 0x090b1c, 0.38));
  const moon = new THREE.DirectionalLight(0xc8d8ff, 1.15);
  moon.position.set(-42, 64, 38);
  moon.castShadow = true;
  moon.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(moon.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 10, far: 180 });
  moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
  scene.add(moon);
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vD; void main(){ vec3 d = normalize(vD);
        vec3 c = mix(vec3(0.16,0.3,0.62), vec3(0.015,0.04,0.12), smoothstep(0.0, 0.6, d.y));
        c = mix(c, vec3(0.03,0.04,0.09), smoothstep(0.0, -0.3, d.y));
        c += vec3(1.0,0.62,0.25) * 0.55 * exp(-pow(d.y*9.0, 2.0)) * (0.5 + 0.5*sin(atan(d.z,d.x)*3.0));
        c += vec3(0.9,0.95,1.0) * 3.0 * smoothstep(0.985, 0.995, dot(d, normalize(vec3(-0.42,0.34,-0.84))));
        gl_FragColor = vec4(c, 1.0); }`,
    })));
    const env = pm.fromScene(es, 0.03).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.42;
    pm.dispose();
  }

  // ---------------------------------------------------------------- load the city
  const gltf = await new Promise((res, rej) => new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath('/home/draco/')).load('/home/city-light.glb', res, e => e.total && setLoad(e.loaded / e.total * .85), rej));
  const city = gltf.scene;
  scene.add(city);

  const KEYS = ['tharwa', 'cards', 'ludo', 'arcade'];
  const LM = KEYS.map((k, i) => {
    const o = city.getObjectByName('LM_' + k);
    return { key: k, stop: i + 1, obj: o, base: o.position.clone(), glow: 0, hover: 0, mats: [] };
  });
  const isAnim = o => { for (let p = o; p; p = p.parent) if (/^(ANIM_|FLOAT_)/.test(p.name)) return true; return false; };
  // per-landmark material copies so hover glow stays local
  for (const L of LM) {
    const cache = new Map();
    L.obj.traverse(o => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!cache.has(m)) { const c = m.clone(); cache.set(m, c); L.mats.push(c); }
      o.material = cache.get(m);
    });
  }
  const allMats = new Set();
  city.traverse(o => {
    if (!o.isMesh) return;
    const a = isAnim(o);
    o.castShadow = !a; o.receiveShadow = !a;
    allMats.add(o.material);
    if (/^win_/.test(o.material.name) && o.geometry.attributes.uv) o.geometry.setAttribute('aWin', o.geometry.attributes.uv);
  });
  const EMUL = { cyan_glow: .5, gold_glow: .5, crystal: .45, cyan_soft: .7, xo_x: .55, xo_o: .55, suit_red: .2, suit_cyan: .2, c4_red: .7, c4_yellow: .7, win_warm: .62, win_cyan: .55, felt: 1.4 };
  for (const m of allMats) {
    const n = m.name;
    if (n === 'suit_red') { m.color.setRGB(0.25, 0.55, 1.0); m.emissive.setRGB(0.2, 0.5, 1.0); }
    if (n === 'suit_cyan') { m.color.setRGB(0.8, 0.9, 1.0); m.emissive.setRGB(0.55, 0.85, 1.0); m.metalness = 0.6; }
    if (EMUL[n]) m.emissiveIntensity *= EMUL[n];
    m.userData.ei = m.emissiveIntensity;
    m.userData.black = m.emissive && m.emissive.r + m.emissive.g + m.emissive.b < 0.001;
    if (/^glass/.test(n)) { m.envMapIntensity = 2.0; m.roughness = 0.06; }
    else if (n === 'gold') { m.envMapIntensity = 2.2; m.emissive.setRGB(1, .62, .2); m.emissiveIntensity = .08; m.roughness = .2; }
    else if (n === 'water') { m.color.setRGB(0.02, 0.05, 0.12); m.metalness = 1; m.roughness = 0.04; m.envMapIntensity = 2.2; }
    else if (n === 'dome') { m.envMapIntensity = 1.8; m.side = THREE.DoubleSide; }
    else if (/^win_/.test(n)) {
      m.customProgramCacheKey = () => 'win';
      m.onBeforeCompile = sh => {
        sh.uniforms.uTime = U.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aWin; varying vec2 vWin;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = aWin;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vWin;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float wb = vWin.x < 0.34 ? 0.03 : (vWin.x < 0.62 ? 0.42 : 1.0);
            float won = step(0.07, fract(vWin.y*7.31 + uTime*0.011 + floor(vWin.y*5.0)*0.37));
            totalEmissiveRadiance *= wb * mix(0.06, 1.0, won) * (0.93 + 0.07*sin(uTime*1.3 + vWin.y*40.0));`);
      };
    }
  }

  // animated parts
  const A = n => city.getObjectByName(n);
  const anim = {
    coin: A('ANIM_coin'), suits: A('ANIM_suits'), die: A('ANIM_die'), beacon: A('ANIM_beacon'), xo: A('ANIM_xo'), x: A('ANIM_x'), o: A('ANIM_o'),
    suit: ['spade', 'heart', 'club', 'diamond'].map(k => A('ANIM_suit_' + k)),
    floats: [1, 2, 3, 4, 5].map(i => A('FLOAT_' + i)).filter(Boolean),
  };
  if (anim.coin) { anim.coin.position.y -= 2.0; anim.coin.scale.setScalar(0.78); }
  for (const o of [anim.coin, anim.die, ...anim.suit, ...anim.floats]) o && (o.userData.y = o.position.y);
  anim.coin && anim.coin.traverse(o => { if (o.isMesh && o.material.name === 'gold') { o.material = o.material.clone(); o.material.emissiveIntensity = .2; o.material.userData.ei = .2; o.material.envMapIntensity = 3; } });
  // soft halos where bloom used to be (additive sprites; three → (x, z, -y) of the Blender coordinates)
  const halo = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glow = (pos, col, size, op = .8, parent = scene) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.position.copy(pos); sp.scale.setScalar(size); parent.add(sp); return sp; };
  glow(V(9.1, 19.7, -8.7), 0xffc86a, 2.4); glow(V(9.6, 17.76, 8.4), 0x4fe6ff, 3.6, .7); glow(V(9.6, 19.96, 8.4), 0x7ff0ff, 1.8);
  glow(V(-8.5, 12.0, -7.5), 0xffd27a, 2.0); glow(V(0, 3.9, 0), 0x4fe6ff, 2.8, .65); glow(V(-8.5, 2.2, -7.5), 0x39e0a8, 5.0, .45);
  glow(V(9.6, 12.4, 10.1), 0x4fe6ff, 4.2, .4); if (anim.coin) glow(V(), 0xffc24a, 5.5, .5, anim.coin);
  const matByName = n => [...allMats].find(m => m.name === n);

  // landmark helpers: pulsing ground ring + invisible pick volume + accent light
  const ringMat = col => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uOn: { value: 0 }, uTime: U.uTime, uCol: { value: new THREE.Color(col) } },
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uOn; uniform float uTime; uniform vec3 uCol; varying vec2 vU;
      void main(){ float r = vU.y; float a = smoothstep(0.0,0.35,r)*smoothstep(1.0,0.55,r);
        float dash = 0.35 + 0.65*smoothstep(0.3, 0.5, abs(fract(vU.x*36.0 - uTime*0.25)-0.5)*2.0);
        gl_FragColor = vec4(uCol * a * dash * uOn * 0.9, 1.0); }`,
  });
  const ringGeo = (r0, r1) => { const g = new THREE.RingGeometry(r0, r1, 128, 1); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, pos = g.attributes.position; for (let i = 0; i < uv.count; i++) { const x = pos.getX(i), z = pos.getZ(i); uv.setXY(i, (Math.atan2(z, x) / 6.2832) + .5, (Math.hypot(x, z) - r0) / (r1 - r0)); } return g; };
  const LMDEF = { tharwa: [7.6, 0x2fe2ff, [6.2, 26]], cards: [6.6, 0x2fe2ff, [6, 13.5]], ludo: [8.4, 0x2fe2ff, [7.4, 7]], arcade: [5.2, 0x2fe2ff, [3.8, 24]] };
  const proxies = [];
  for (const L of LM) {
    const [r, col, [pr, ph]] = LMDEF[L.key];
    const ring = new THREE.Mesh(ringGeo(r - .25, r + .25), ringMat(col)); ring.position.copy(L.base).y = 0.12; ring.renderOrder = 3;
    scene.add(ring); L.ring = ring;
    const px = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, ph, 12), new THREE.MeshBasicMaterial({ visible: false }));
    px.position.copy(L.base).y = ph / 2; px.userData.L = L; scene.add(px); proxies.push(px);
  }
  const accents = [
    [LM[0].base.clone().add(V(0, 3, 4)), 0xffb44a, 60, 24],
    [LM[1].base.clone().add(V(0, 3.4, 0)), 0x2fd08f, 26, 12],
    [LM[2].base.clone().add(V(0, 6, 0)), 0xffd2b0, 14, 16],
    [LM[3].base.clone().add(V(0, 6, 5)), 0x2fe2ff, 50, 20],
  ].map(([p, c, i, d]) => { const l = new THREE.PointLight(c, i, d, 2); l.position.copy(p); scene.add(l); return l; });
  const pavCol = new THREE.Color(0x2fd08f), pavTarget = new THREE.Color(0x2fd08f);
  ctx.onGame((stop, tint) => { if (stop === 2) pavTarget.set(tint); });

  // ---------------------------------------------------------------- floating coins + cards
  const coinGeo = new THREE.LatheGeometry([[0, .028], [.25, .028], [.27, .046], [.33, .046], [.35, 0], [.33, -.046], [.27, -.046], [.25, -.028], [0, -.028]].map(([x, y]) => new THREE.Vector2(x, y)), 36).rotateX(Math.PI / 2);
  const coins = new THREE.InstancedMesh(coinGeo, new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 1, roughness: .26, emissive: 0x7a4a08, emissiveIntensity: .45, envMapIntensity: 3.2 }), Q.coins);
  const coinData = [];
  { let s = 5; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < Q.coins; i++) coinData.push({ a: r() * 6.28, rad: 3.4 + r() * 3.2, y: 2.5 + r() * 10, vis: 1, sp: (.08 + r() * .12) * (r() < .5 ? -1 : 1), spin: 1 + r() * 2, ph: r() * 6.28 }); }
  coins.position.copy(LM[0].base); coins.frustumCulled = false;
  scene.add(coins);
  const cardGroup = new THREE.Group(); cardGroup.position.copy(LM[1].base); scene.add(cardGroup);
  {
    const back = matByName('card_back'), faces = ['card_AS', 'card_KH', 'card_QD', 'card_JC'].map(matByName).filter(Boolean);
    const mk = map => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: .55, roughness: .4 });
    const backM = mk(back.map), faceM = faces.map(f => mk(f.map));
    const pg = new THREE.PlaneGeometry(0.95, 1.33);
    let s = 9; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < Q.cards; i++) {
      const g = new THREE.Group();
      const f = new THREE.Mesh(pg, faceM[i % faceM.length]); const b = new THREE.Mesh(pg, backM); b.rotation.y = Math.PI;
      g.add(f, b);
      g.userData = { a: i / Q.cards * 6.28 + r() * .4, rad: 6.6 + r() * 2.2, y: 3 + r() * 7, sp: .07 + r() * .06, ph: r() * 6.28 };
      cardGroup.add(g);
    }
  }

  // ---------------------------------------------------------------- particles: drifting motes + light falls from the rim
  const pxScale = { value: 1 };
  const motes = (() => {
    const n = Q.motes, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 34; pos.set([Math.cos(a) * r, Math.random() * 34, Math.sin(a) * r], i * 3); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uS: pxScale },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform float uS; varying float vA; varying float vK;
        void main(){ vec3 p = position; float t = uTime*(0.25+aSeed*0.35) + aSeed*50.0;
          p.y = -6.0 + mod(position.y + t, 34.0); p.x += sin(t*0.7+aSeed*9.0)*0.9; p.z += cos(t*0.6+aSeed*7.0)*0.9;
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          gl_PointSize = max(1.5, (0.07+aSeed*0.12)*uS/(-mv.z));
          vA = smoothstep(-6.0,-1.0,p.y)*(1.0-smoothstep(22.0,28.0,p.y))*(0.5+0.5*sin(uTime*1.7+aSeed*30.0)); vK = aSeed; }`,
      fragmentShader: `varying float vA; varying float vK; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); a *= a;
          vec3 c = mix(vec3(1.0,0.72,0.32), vec3(0.4,0.85,1.0), step(0.45, fract(vK*7.0))); gl_FragColor = vec4(c*a*vA*1.8, 1.0); }`,
    });
    const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
  })();
  scene.add(motes);
  const falls = (() => {
    const spots = [2.25, -0.55, 0.95, 3.6], per = Q.falls, n = per * spots.length;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    const R = th => 25 * (1 + 0.05 * Math.sin(3 * th + 0.7) + 0.035 * Math.sin(5 * th + 2.1) + 0.018 * Math.sin(9 * th + 0.3));
    let k = 0;
    for (const s of spots) for (let i = 0; i < per; i++, k++) {
      const th = s + (Math.random() - .5) * .06, r = R(th) + .3 + Math.random() * .4;
      // Blender (x, y) -> three (x, -y)
      pos.set([r * Math.cos(th), 0, -r * Math.sin(th)], k * 3); seed[k] = Math.random();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uS: pxScale },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform float uS; varying float vA;
        void main(){ float L = 24.0; float f = mod(uTime*(2.2+aSeed*1.6) + aSeed*L, L);
          vec3 dir = normalize(vec3(position.x, 0.0, position.z));
          vec3 p = position + dir*(f*0.08 + f*f*0.004) + vec3(0.0, -0.4 - f, 0.0);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          gl_PointSize = max(1.2, (0.09+aSeed*0.08)*uS/(-mv.z));
          vA = (1.0 - f/L) * smoothstep(0.0, 1.0, f); }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vec3(0.35,0.85,1.0)*a*vA*1.6, 1.0); }`,
    });
    const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
  })();
  scene.add(falls);

  // ---------------------------------------------------------------- camera path (keys per aspect)
  let K = [], curP, curT, FOVV = 34;
  const BUMP = [5, 8, 5, 7, 4];
  function buildKeys() {
    const asp = W / Hh, portrait = asp < 0.85;
    FOVV = portrait ? 50 : asp < 1.3 ? 42 : 34;
    camera.fov = FOVV; camera.aspect = asp; camera.updateProjectionMatrix();
    const th = Math.tan(THREE.MathUtils.degToRad(FOVV / 2));
    const P = (f, az, el, dist, sx, sy) => {
      const dir = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      const pos = f.clone().addScaledVector(dir, dist);
      const right = V().crossVectors(dir.clone().negate(), UP).normalize();
      const tgt = f.clone().addScaledVector(right, sx * dist * th * asp); tgt.y -= sy * dist * th;
      return { pos, tgt };
    };
    const [T, C, L, Ar] = LM.map(l => l.base);
    if (!portrait) {
      const wide = asp > 1.3;
      K = [
        P(V(0, 1, 0), -0.3, 0.33, wide ? 96 : 104, wide ? 0.4 : 0.12, wide ? -0.03 : 0.12),
        P(T.clone().add(V(0, 11.2, 0)), 1.57, 0.1, 36, 0.28, -0.3),
        P(C.clone().add(V(0, 5.6, 0)), 0.12, 0.24, 30, 0.36, 0.0),
        P(L.clone().add(V(0, 1.2, 0)), -0.62, 0.72, 27, 0.36, 0.0),
        P(Ar.clone().add(V(0, 10.5, 0)), 0.42, 0.1, 41, 0.36, 0.0),
        P(V(0, -2, 0), 0.75, 0.6, 90, 0, -0.1),
      ];
    } else {
      K = [
        P(V(0, 0, 0), -0.3, 0.36, 132, 0, 0.36),
        P(T.clone().add(V(0, 10.5, 0)), 1.3, 0.16, 56, 0, 0.3),
        P(C.clone().add(V(0, 4.5, 0)), 0.12, 0.28, 34, 0, 0.36),
        P(L.clone().add(V(0, 1, 0)), -0.62, 0.86, 36, 0, 0.34),
        P(Ar.clone().add(V(0, 10, 0)), 0.42, 0.12, 48, 0, 0.3),
        P(V(0, -2, 0), 0.75, 0.62, 140, 0, 0.2),
      ];
    }
    curP = new THREE.CatmullRomCurve3(K.map(k => k.pos), false, 'centripetal');
    curT = new THREE.CatmullRomCurve3(K.map(k => k.tgt), false, 'centripetal');
  }
  const tmpP = V(), tmpT = V();
  function poseAt(k, outP, outT) {
    k = clamp(k, 0, 5);
    curP.getPoint(k / 5, outP); curT.getPoint(k / 5, outT);
    const s = Math.min(4, Math.floor(k)), f = k - Math.floor(k);
    if (k < 5) outP.y += Math.sin(Math.PI * f) * BUMP[s];
  }

  // ---------------------------------------------------------------- scroll -> key mapping
  let geo = ctx.measure();
  function mapScroll(y) {
    const { vh, tops, holds, how } = geo;
    const a = [[0, 0], [vh * 0.08, 0]];
    for (let i = 1; i <= 4; i++) a.push([tops[i], i], [holds[i], i]);
    a.push([how - vh * 0.15, 5]);
    if (y <= a[0][0]) return 0;
    for (let i = 0; i < a.length - 1; i++) {
      const [y0, k0] = a[i], [y1, k1] = a[i + 1];
      if (y <= y1) { if (k1 === k0 || y1 <= y0) return k0; const t = (y - y0) / (y1 - y0); return k0 + (k1 - k0) * ease3(t); }
    }
    return 5;
  }

  // ---------------------------------------------------------------- resize
  function resize(force) {
    const w = innerWidth, h = innerHeight;
    if (!force && w === W && Math.abs(h - Hh) < 120 && coarse) return; // ignore mobile URL-bar height jitter
    W = w; Hh = h;
    renderer.setSize(W, Hh, false);
    pxScale.value = Hh * dpr / (2 * Math.tan(THREE.MathUtils.degToRad(FOVV / 2)));
    buildKeys();
    pxScale.value = Hh * dpr / (2 * Math.tan(THREE.MathUtils.degToRad(FOVV / 2)));
    geo = ctx.measure();
    invalidate(2);
  }
  let rT; on(window, 'resize', () => { clearTimeout(rT); rT = setTimeout(() => resize(false), 120); });
  buildKeys(); resize(true);

  // ---------------------------------------------------------------- pointer: hover glow + click to fly
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
  let hovered = null, pointerDirty = false, parX = 0, parY = 0, pX = 0, pY = 0;
  const tag = document.getElementById('hxTag'), tagB = tag.querySelector('b');
  const NAMES = { tharwa: 'برج ثروة', cards: 'جناح ورق الشدة', ludo: 'ساحة اللودو', arcade: 'برج الألعاب السريعة' };
  const overUI = t => t && t.closest && t.closest('a,button,input,.h-pal,.h-hdr,.h-rail,.h-panel,.h-hero-c,.h-after,.h-foot,#modal-root');
  const pick = (cx, cy) => { ndc.set(cx / W * 2 - 1, -(cy / Hh) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(proxies, false)[0]; return hit ? hit.object.userData.L : null; };
  on(window, 'pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    pX = e.clientX / W * 2 - 1; pY = e.clientY / Hh * 2 - 1;
    if (overUI(e.target) || document.getElementById('hxPal').classList.contains('open')) { setHover(null); return; }
    ndc.set(pX, -pY); pointerDirty = true; invalidate(3);
    tag.style.transform = `translate3d(${Math.min(e.clientX + 18, W - 240)}px,${e.clientY + 18}px,0)`;
  }, { passive: true });
  on(document, 'pointerleave', () => { setHover(null); invalidate(3); });
  function setHover(L) {
    if (hovered === L) return; hovered = L;
    document.body.style.cursor = L ? 'pointer' : '';
    tag.classList.toggle('on', !!L); if (L) tagB.textContent = NAMES[L.key];
  }
  on(window, 'click', e => {
    if (overUI(e.target) || !introDone) return;
    const L = e.pointerType === 'mouse' || !e.pointerType ? hovered || pick(e.clientX, e.clientY) : pick(e.clientX, e.clientY);
    if (L) ctx.flyTo(L.stop);
  });

  // ---------------------------------------------------------------- precompile, first frame
  let k = mapScroll(scrollY), kT = k;
  poseAt(k, tmpP, tmpT); camera.position.copy(tmpP); camera.lookAt(tmpT);
  renderer.shadowMap.needsUpdate = true;
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* older drivers: compile lazily */ }
  scene.traverse(o => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const kk of ['map', 'emissiveMap']) if (m[kk]) renderer.initTexture(m[kk]); });
  renderer.initTexture(noiseTex); renderer.initTexture(blobTex);
  if (stopped) { dispose(); return { stop() {} }; }

  // a short arrival: from a pulled-back hero pose (text is already on screen)
  const intro = { t: scrollY > 40 ? 1 : 0, t0: 0 };
  introDone = intro.t >= 1;
  const iA = V(), iB = V();
  function introPose(t, outP, outT) {
    const K0 = K[0], e = 1 - Math.pow(1 - t, 3);
    iA.copy(K0.pos).add(V(-10, 9, 26)); iB.copy(K0.tgt).add(V(0, 3, 0));
    outP.lerpVectors(iA, K0.pos, e); outT.lerpVectors(iB, K0.tgt, e);
  }
  on(window, 'wheel', () => { if (!introDone) intro.t = Math.max(intro.t, 0.85); }, { passive: true });

  // ---------------------------------------------------------------- render on demand
  // Nothing animates on its own: frames are drawn only while the camera moves, the pointer hovers, the
  // arrival plays, or a hover glow is settling — then the loop stops completely (0 frames when idle).
  // Capped at 60 fps, paused when the tab is hidden or the city is covered by the page below.
  let tAcc = 0, lastDraw = 0;
  const ft = new Float32Array(600); let fi = 0, frames = 0;
  const iP = V(), iT = V(), par = V(), right = V(), dummy = new THREE.Object3D(), roll = new THREE.Quaternion();
  function invalidate(n = 2) { keep = Math.max(keep, n); if (looping && !raf && !stopped && !document.hidden) { tPrev = performance.now(); raf = requestAnimationFrame(loop); } }
  on(window, 'scroll', () => invalidate(2), { passive: true });
  on(document, 'visibilitychange', () => { if (!document.hidden) invalidate(2); });

  const sv = V(), hdrEl = document.getElementById('hxHdr');
  function blocked(local, origin) {
    if (k > 4.45) return true;
    sv.copy(local).add(origin).project(camera);
    const hdrN = 1 - 2 * ((hdrEl.offsetHeight + 8) / Hh);
    if (sv.y > hdrN) return true;
    return W / Hh < 0.85 ? sv.y < 0.05 : sv.x > 0.08;
  }
  function loop(now) {
    raf = 0;
    if (stopped || document.hidden) return;
    if (now - lastDraw < 15.5) { raf = requestAnimationFrame(loop); return; }   // 60 fps cap (120/144 Hz screens)
    const frameMs = now - lastDraw; lastDraw = now;
    ft[fi++ % ft.length] = frameMs; frames++;
    const dt = Math.min((now - tPrev) / 1000, 1 / 20); tPrev = now; tAcc += dt; const t = tAcc;
    U.uTime.value = t;
    let busy = false;

    // camera
    kT = mapScroll(scrollY);
    if (Math.abs(kT - k) < 1e-3) k = kT; else { k = damp(k, kT, 3.4, dt); busy = true; }
    poseAt(k, tmpP, tmpT);
    if (intro.t < 1) {
      intro.t = Math.min(1, intro.t + dt / 2.4); busy = true;
      introPose(intro.t, iP, iT);
      const w = sstep(0.9, 1, intro.t);
      tmpP.lerpVectors(iP, tmpP, w); tmpT.lerpVectors(iT, tmpT, w);
      if (intro.t >= 1) introDone = true;
    }
    const nx = damp(parX, pX, 2.6, dt), ny = damp(parY, pY, 2.6, dt);
    if (Math.abs(nx - pX) > 1e-3 || Math.abs(ny - pY) > 1e-3) busy = true;
    parX = nx; parY = ny;
    right.subVectors(tmpT, tmpP).normalize().cross(UP).normalize();
    const pd = tmpP.distanceTo(tmpT) * 0.012 * (introDone ? 1 : intro.t);
    tmpP.addScaledVector(right, parX * pd * 1.2).add(par.set(0, -parY * pd * 0.8, 0));
    camera.position.copy(tmpP); camera.lookAt(tmpT);
    if (intro.t < 1) { roll.setFromAxisAngle(V(0, 0, 1), Math.pow(1 - intro.t, 2) * 0.04); camera.quaternion.multiply(roll); }
    sky.position.copy(camera.position);
    camPosU.value.copy(camera.position);

    // hover pick
    if (k > 4.5 && hovered) setHover(null);
    if (pointerDirty && introDone && k <= 4.5) { pointerDirty = false; ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(proxies, false)[0]; setHover(hit ? hit.object.userData.L : null); }
    for (const L of LM) {
      const actW = clamp(1 - Math.abs(k - L.stop) * 2.4, 0, 1);
      const h = damp(L.hover, hovered === L ? 1 : 0, 6, dt);
      if (Math.abs(h - (hovered === L ? 1 : 0)) > 2e-3) busy = true;
      L.hover = h;
      const g = Math.max(L.hover, actW * 0.65);
      if (Math.abs(g - L.glow) > 1e-3) {
        L.glow = g;
        L.obj.position.y = L.base.y + L.hover * 0.55;
        for (const m of L.mats) {
          if (m.userData.black) m.emissive.setRGB(0.02 * g, 0.07 * g, 0.13 * g);
          else m.emissiveIntensity = m.userData.ei * (1 + 0.55 * g);
        }
      }
      L.ring.material.uniforms.uOn.value = g;
    }
    const pc = pavCol.clone(); pavCol.lerp(pavTarget, 1 - Math.exp(-3 * dt)); accents[1].color.copy(pavCol);
    if (Math.abs(pc.r - pavCol.r) + Math.abs(pc.g - pavCol.g) + Math.abs(pc.b - pavCol.b) > 1e-3) busy = true;

    // life (advances only while frames are drawn)
    if (anim.coin) { anim.coin.rotation.y = t * 0.9; anim.coin.position.y = anim.coin.userData.y + Math.sin(t * 1.1) * 0.35; }
    if (anim.suits) anim.suits.rotation.y = t * 0.22;
    anim.suit.forEach((s, i) => s && (s.position.y = s.userData.y + Math.sin(t * 1.25 + i * 1.7) * 0.3));
    if (anim.die) { anim.die.rotation.set(t * 0.55, t * 0.4, t * 0.2); anim.die.position.y = anim.die.userData.y + Math.sin(t * 1.4) * 0.3; }
    if (anim.beacon) { anim.beacon.rotation.y = t * 0.7; anim.beacon.rotation.x = Math.sin(t * 0.6) * 0.22; }
    if (anim.xo) anim.xo.rotation.y = -t * 0.35;
    if (anim.x) anim.x.rotation.y = t * 1.1;
    if (anim.o) anim.o.rotation.y = -t * 0.9;
    anim.floats.forEach((f, i) => { f.position.y = f.userData.y + Math.sin(t * 0.35 + i * 1.3) * 0.7; });
    for (let i = 0; i < coinData.length; i++) {
      const c = coinData[i], a = c.a + t * c.sp;
      dummy.position.set(Math.cos(a) * c.rad, c.y + Math.sin(t * .8 + c.ph) * .5, Math.sin(a) * c.rad);
      c.vis = damp(c.vis, blocked(dummy.position, coins.position) ? 0 : 1, 8, dt);
      dummy.scale.setScalar(Math.max(c.vis, 0.0001));
      dummy.rotation.set(0.3 * Math.sin(t + c.ph), t * c.spin + c.ph, 0); dummy.updateMatrix(); coins.setMatrixAt(i, dummy.matrix);
    }
    coins.instanceMatrix.needsUpdate = true;
    for (const g of cardGroup.children) {
      const u = g.userData, a = u.a + t * u.sp;
      g.position.set(Math.cos(a) * u.rad, u.y + Math.sin(t * .7 + u.ph) * .45, Math.sin(a) * u.rad);
      g.rotation.set(Math.sin(t * .5 + u.ph) * .25, -a + Math.PI / 2 + Math.sin(t * .3 + u.ph) * .6, Math.sin(t * .4 + u.ph) * .15);
      u.vis = damp(u.vis === undefined ? 1 : u.vis, blocked(g.position, cardGroup.position) ? 0 : 1, 8, dt); g.scale.setScalar(Math.max(u.vis, 0.0001));
    }

    const close = k > 0.5 && k < 4.5 ? clamp(1 - Math.abs(k - Math.round(k)) * 2.5, 0, 1) : 0;
    renderer.toneMappingExposure = 1.0 - 0.08 * close;
    if (k < 4.8) { renderer.info.reset(); renderer.render(scene, camera); }   // below that the page covers the city
    if (busy) keep = Math.max(keep, 2);
    if (--keep > 0) raf = requestAnimationFrame(loop);
  }
  H.classList.add('h-3d-on');
  looping = true;
  invalidate(2);

  function dispose() {
    cancelAnimationFrame(raf); raf = 0; ac.abort();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) { for (const kk of ['map', 'emissiveMap']) m[kk] && m[kk].dispose(); m.dispose(); } });
    renderer.dispose(); renderer.forceContextLoss();
    setHover(null);
  }

  // QA hooks (no UI)
  window.__H = {
    get k() { return k; }, get dpr() { return dpr; }, renderer, scene, camera, get frames() { return frames; },
    resetStats() { fi = 0; frames = 0; ft.fill(0); },
    bench(n = 40) { const gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now();
      for (let i = 0; i < n; i++) { renderer.render(scene, camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      return +((performance.now() - t0) / n).toFixed(2); },
    stats() { const n = Math.min(frames, ft.length), a = [...ft.slice(0, n)].filter(x => x > 0 && x < 1000).sort((x, y) => x - y); const avg = a.reduce((s, x) => s + x, 0) / (a.length || 1);
      return { frames, measured: a.length, avgFps: a.length ? +(1000 / avg).toFixed(1) : 0, p95ms: a.length ? +a[Math.floor(a.length * .95)].toFixed(2) : 0, over33ms: a.filter(x => x > 33.4).length, dpr, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  };
  return { stop() { stopped = true; H.classList.remove('h-3d-on'); dispose(); } };
}
