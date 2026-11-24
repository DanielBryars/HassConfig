// HOUSE//OS: a holographic 3D lighting console for Apple Brook House.
// Lovelace card:  type: custom:house-os-card   (use in a panel view)
// Geometry comes from the architect's GA plans (W175-26D / W175-27I, 1:100), see house.json.
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { RenderPass } from './vendor/RenderPass.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
import { OutputPass } from './vendor/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from './vendor/CSS2DRenderer.js';

const BASE = new URL('.', import.meta.url).href;
const VERSION = '1.0';
const COL = {
  cyan: new THREE.Color(0x43e8ff), cyanDim: new THREE.Color(0x0e5a78), warm: new THREE.Color(0xffa63d),
  hot: new THREE.Color(0xffe6b8), off: new THREE.Color(0x14506a), red: new THREE.Color(0xff3d6e),
};
const EXPLODE = 3.6;

// ---------- helpers ----------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,.55)');
  r.addColorStop(0.45, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function channelOf(entity) {
  const m = entity.match(/light_bank_(\d)_pin_(\d\d)/);
  if (m) return { short: `B${m[1]}·${m[2]}`, long: `BANK ${m[1]} · PIN ${m[2]} · MCP23017 @ 0x2${m[1]}` };
  const s = entity.match(/stair_light_0_pin_(\d\d)/);
  if (s) return { short: `ST·${s[1]}`, long: `STAIRLIGHTS · PIN ${s[1]} · MCP23017 @ 0x20` };
  return { short: entity.split('.')[0].toUpperCase().slice(0, 5), long: entity };
}
function ago(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.floor(s)}s`; if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; return `${Math.floor(s / 86400)}d`;
}
function loadFonts() {
  if (document.getElementById('house-os-fonts')) return;
  const l = document.createElement('link'); l.id = 'house-os-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;800&family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;600&display=swap';
  document.head.appendChild(l);
}

// ---------- shaders ----------
const FLOOR_VS = `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const FLOOR_FS = `
uniform float uLit, uHover, uFade, uTime, uGrid, uBand; uniform vec3 uFx[8]; uniform int uN; varying vec3 vW;
float gridl(vec2 p,float s,float w){ vec2 g=abs(fract(p/s-.5)-.5)/fwidth(p/s); return 1.-min(min(g.x,g.y)/w,1.); }
void main(){
  float g=gridl(vW.xz,uGrid,1.);
  float pool=0.;
  for(int i=0;i<8;i++){ if(i>=uN) break; vec2 d=vW.xz-uFx[i].xy; pool+=uFx[i].z*exp(-dot(d,d)/2.6); }
  pool=min(pool,1.4);
  vec3 off=vec3(.012,.045,.075)+g*vec3(.03,.16,.22);
  vec3 warm=mix(vec3(1.,.48,.12),vec3(1.,.86,.6),clamp(pool*.8,0.,1.));
  vec3 lit=warm*(.18*uLit+.95*pool)+g*vec3(.25,.16,.06)*uLit;
  vec3 col=(1.-uBand)*off+lit+uHover*vec3(.05,.32,.45)*(.6+.4*sin(uTime*6.));
  float a=mix(.82,.94,uLit)*(1.-uBand) + uBand*clamp(pool+uHover*.5,0.,1.);
  gl_FragColor=vec4(col,a*uFade);
}`;
const CONE_FS = `uniform float uLit,uFade; uniform vec3 uCol; varying vec2 vUv;
void main(){ float a=pow(vUv.y,1.6)*.32*uLit*uFade; gl_FragColor=vec4(uCol*a, a); }`;
const CONE_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const GROUND_FS = `uniform float uTime; varying vec3 vW;
float gridl(vec2 p,float s,float w){ vec2 g=abs(fract(p/s-.5)-.5)/fwidth(p/s); return 1.-min(min(g.x,g.y)/w,1.); }
void main(){
  float d=length(vW.xz); float fade=smoothstep(46.,8.,d);
  float g1=gridl(vW.xz,1.,1.)*.22, g5=gridl(vW.xz,5.,1.2)*.55;
  float r=mod(uTime*7.,60.); float ring=smoothstep(1.2,0.,abs(d-r))*smoothstep(60.,10.,r)*.7;
  vec3 c=vec3(.1,.55,.8)*(g1+g5)+vec3(.2,.85,1.)*ring*(.3+g1*2.);
  gl_FragColor=vec4(c*fade,(g1+g5+ring)*fade);
}`;
const SWEEP_FS = `uniform float uA; varying vec2 vUv; void main(){ float e=pow(1.-abs(vUv.x-.5)*2.,6.); float a=e*uA*(.4+.6*vUv.y); gl_FragColor=vec4(vec3(.3,.9,1.)*a,a); }`;

// ---------- the element ----------
class HouseOS extends HTMLElement {
  setConfig(c) { this._config = c || {}; }
  static getStubConfig() { return {}; }
  getCardSize() { return 14; }
  set panel(p) { if (p && p.config) this._config = p.config; }
  set narrow(n) {}
  set route(r) {}
  set hass(h) { this._hass = h; if (this._ready) this._sync(); }
  get hass() { return this._hass; }

  connectedCallback() {
    if (!this._built) { this._built = true; this._boot(); }
    else if (this._ready) { this._running = true; this._loop(); }
  }
  disconnectedCallback() { this._running = false; }

  async _boot() {
    loadFonts();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>${CSS}</style>${HTML}`;
    this.$ = (s) => this.shadowRoot.querySelector(s);
    this._bootLog('HOUSE//OS ' + VERSION + ' · cold start');
    const res = await fetch(BASE + 'house.json'); this.D = await res.json();
    this._bootLog(`geometry  W175-26D / W175-27I  @1:100 … ok`);
    this._initThree();
    this._buildWorld();
    this._buildHud();
    this._bootLog(`channels  ${this.lights.length} circuits · ${this.D.stairLights.length} stair LEDs · ${this.D.shed.length} shed`);
    this._bootLog('link      home assistant websocket … ' + (this._hass ? 'ONLINE' : 'waiting'));
    if (location.hash.includes('debug')) { window.__hos = this; for (const [k, f] of Object.entries(this.floors)) { const b = new THREE.Box3().setFromObject(f.grp); console.log('HOSDBG floor', k, JSON.stringify(b.min), JSON.stringify(b.max)); } console.log('HOSDBG label0', JSON.stringify(this.lights[0].label && this.lights.map(l=>[l.name, l.centre.x.toFixed(1), l.centre.z.toFixed(1)]))); console.log('HOSDBG CX', this.CX, this.CY); }
    this._ready = true; this._running = true;
    if (this._hass) this._sync();
    this._t0 = performance.now(); this._intro = 0;
    this._loop();
    setTimeout(() => this.$('.boot').classList.add('gone'), 2300);
    if (location.hash.includes('still')) { const H = new URLSearchParams(location.hash.slice(1)); this.$('.boot').remove(); this._intro = 1; if (H.get('floor')) this.view.floor = H.get('floor'); if (H.get('mode')) this.view.mode = H.get('mode'); if (H.has('explode')) this.view.explode = 1; this._applyView(); this._camTween.t = 1; this.controls.autoRotate = false; for (const fl of Object.values(this.floors)) { fl.y = fl.tY; fl.fade = fl.tFade; } if (H.get('sel')) this._select(this.lights.find((l) => l.name === H.get('sel'))); }
    new ResizeObserver(() => this._resize()).observe(this.$('.stage'));
    this._resize();
    this._clock = setInterval(() => this._tick1s(), 1000);
  }
  _bootLog(t) { const b = this.$('.boot pre'); if (b) b.textContent += '> ' + t + '\n'; }

  // ---------- three ----------
  _initThree() {
    const stage = this.$('.stage');
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
    r.setClearColor(0x02050b, 1);
    stage.appendChild(r.domElement);
    this.labels = new CSS2DRenderer(); this.labels.domElement.className = 'labels'; stage.appendChild(this.labels.domElement);
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(0x02050b, 0.012);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.camera.position.set(-55, 60, 70);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.06, maxPolarAngle: Math.PI * 0.495, minDistance: 6, maxDistance: 90, autoRotateSpeed: 0.35 });
    this.controls.target.set(0, 1.4, 0);
    this.controls.addEventListener('start', () => { this._userCam = true; this._camTween = null; this._idle = 0; this.controls.autoRotate = false; });
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.62, 0.5, 0.32);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.scene.add(new THREE.HemisphereLight(0x1b4a66, 0x020408, 0.45));
    this.ray = new THREE.Raycaster(); this.ptr = new THREE.Vector2(); this._down = null;
    const el = r.domElement;
    el.addEventListener('pointermove', (e) => this._onMove(e));
    el.addEventListener('pointerdown', (e) => { this._down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', (e) => { if (this._down && Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) < 6) this._onClick(e); this._down = null; });
    el.addEventListener('pointerleave', () => this._setHover(null));
    this.clock = new THREE.Clock();
  }

  _resize() {
    const s = this.$('.stage'); const w = s.clientWidth || 800, h = s.clientHeight || 600;
    this.renderer.setSize(w, h); this.labels.setSize(w, h); this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this._narrow = w < 820; this.$('.root').classList.toggle('narrow', this._narrow);
  }

  // ---------- world ----------
  _buildWorld() {
    const D = this.D;
    // centre the model
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const f of Object.values(D.floors)) for (const w of f.walls) for (const [x, y] of w.o) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
    this.CX = (mnx + mxx) / 2; this.CY = (mny + mxy) / 2; this.bounds = [mnx - this.CX, mxx - this.CX];
    this.glow = glowTexture();
    this.time = { value: 0 };
    // ground grid
    const gm = new THREE.ShaderMaterial({ vertexShader: FLOOR_VS, fragmentShader: GROUND_FS, uniforms: { uTime: this.time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), gm); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; this.scene.add(ground);
    // dust
    const N = 700, pp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pp[i * 3] = (Math.random() - .5) * 34; pp[i * 3 + 1] = Math.random() * 9; pp[i * 3 + 2] = (Math.random() - .5) * 26; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, color: 0x58d8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.dust);

    this.floors = {}; this.rooms = {}; this.targets = [];
    for (const [key, F] of Object.entries(D.floors)) this._buildFloor(key, F);
    this._buildRoof();
    this._buildLights();
    this._buildStair();
    this._buildShed();
    // sweep plane
    this.sweep = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), new THREE.ShaderMaterial({ vertexShader: CONE_VS, fragmentShader: SWEEP_FS, uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.sweep.rotation.y = Math.PI / 2; this.sweep.position.y = 4; this.sweep.visible = false; this.scene.add(this.sweep);
    this.ripples = [];
    this.view = { floor: 'all', mode: '3d', explode: 0 };
    this._applyView(true);
  }

  _p(x, y) { return [x - this.CX, y - this.CY]; }
  _shape(pts) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => { const [a, b] = this._p(x, y); i ? s.lineTo(a, -b) : s.moveTo(a, -b); }); return s; }

  _buildFloor(key, F) {
    const grp = new THREE.Group(); grp.name = key; this.scene.add(grp);
    const fl = this.floors[key] = { key, F, grp, mats: [], shaderMats: [], fade: 1, tFade: 1, y: F.elev, tY: F.elev, labels: [] };
    const reg = (m) => { m.userData.base = m.opacity; fl.mats.push(m); return m; };
    const cap = reg(new THREE.MeshBasicMaterial({ color: 0x3fc4e0, transparent: true, opacity: 0.85 }));
    const side = reg(new THREE.MeshStandardMaterial({ color: 0x1a2c3e, emissive: 0x020b14, roughness: 0.45, metalness: 0.15, transparent: true, opacity: 0.86 }));
    const edge = reg(new THREE.LineBasicMaterial({ color: 0x43e8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const w of F.walls) {
      const sh = this._shape(w.o);
      for (const h of w.h) sh.holes.push(new THREE.Path(h.map(([x, y]) => { const [a, b] = this._p(x, y); return new THREE.Vector2(a, -b); })));
      // w.ht: lower walls, e.g. the deck's 1.1 m block balustrades
      const g = new THREE.ExtrudeGeometry(sh, { depth: w.ht ?? F.height, bevelEnabled: false, curveSegments: 1 }); g.rotateX(-Math.PI / 2);
      grp.add(new THREE.Mesh(g, [cap, side]));
      grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), edge));
    }
    // glazing / thin lines -> glass ribbons
    const glass = reg(new THREE.MeshBasicMaterial({ color: 0x1f8fd8, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    const gline = reg(new THREE.LineBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    // full-height glazing, plus low glass balustrades (the deck's S-curve) with a brighter handrail
    const rail = reg(new THREE.LineBasicMaterial({ color: 0xb8f6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ribbons = (lines, H, lineMat) => {
      const pos = [], lpos = [];
      for (const pl of lines) for (let i = 0; i < pl.length - 1; i++) {
        const [a, b] = this._p(...pl[i]), [c, d] = this._p(...pl[i + 1]);
        if (Math.hypot(c - a, d - b) < 0.02) continue;
        pos.push(a, 0, b, c, 0, d, c, H, d, a, 0, b, c, H, d, a, H, b);
        lpos.push(a, H, b, c, H, d);
      }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); grp.add(new THREE.Mesh(gg, glass));
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3)); grp.add(new THREE.LineSegments(lg, lineMat));
    };
    ribbons(F.lines, F.height * 0.92, gline);
    if (F.lowLines) ribbons(F.lowLines, F.lowHeight ?? 1.1, rail);
    // room floors
    for (const rm of F.rooms) {
      const band = ['hall_east', 'hall_west', 'kitchen_island', 'bathroom_mirror', 'front_door', 'backdoor'].includes(rm.id);
      const u = { uLit: { value: 0 }, uHover: { value: 0 }, uFade: { value: 1 }, uTime: this.time, uGrid: { value: rm.id === 'deck' ? 0.6 : 0.5 }, uBand: { value: band ? 1 : 0 },
        uFx: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, uN: { value: 0 } };
      const m = new THREE.ShaderMaterial({ vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, uniforms: u, transparent: true, depthWrite: !band,
        blending: band ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: band ? -2 : -1 });
      fl.shaderMats.push(m);
      const g = new THREE.ShapeGeometry(this._shape(rm.poly)); g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, m); mesh.position.y = band ? 0.03 : 0.01; mesh.renderOrder = band ? 2 : 1;
      mesh.userData = { room: rm.id, floor: key, band }; grp.add(mesh);
      this.rooms[key + ':' + rm.id] = { mesh, u, lights: [], floor: key, id: rm.id };
    }
  }

  _buildRoof() {
    const R = this.D.roof, fl = this.floors.g;
    const [x0] = this._p(R.x0, 0), [x1] = this._p(R.x1, 0), [, z0] = this._p(0, R.y0), [, z1] = this._p(0, R.y1);
    const h = fl.F.height, rH = h + R.ridge, xm = (x0 + x1) / 2, P = [];
    const seg = (a, b) => P.push(...a, ...b);
    seg([x0, h, z0], [x0, h, z1]); seg([x1, h, z0], [x1, h, z1]); seg([xm, rH, z0], [xm, rH, z1]);
    for (const z of [z0, z1]) { seg([x0, h, z], [xm, rH, z]); seg([xm, rH, z], [x1, h, z]); seg([x0, h, z], [x1, h, z]); }
    for (let z = z0; z <= z1; z += 0.6) { seg([x0, h, z], [xm, rH, z]); seg([xm, rH, z], [x1, h, z]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const m = new THREE.LineBasicMaterial({ color: 0x2fb8e6, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    m.userData.base = 0.18; fl.mats.push(m); fl.grp.add(new THREE.LineSegments(g, m));
    // the two oak trusses seen in the video
    const T = [];
    for (const ty of R.trusses) { const [, z] = this._p(0, ty); const yb = h - 0.1;
      T.push(x0, yb, z, x1, yb, z, x0, h, z, xm, rH, z, xm, rH, z, x1, h, z, xm, rH, z, xm, yb, z, xm, yb + 0.6, z, (x0 + xm) / 2, (h + rH) / 2, z, xm, yb + 0.6, z, (x1 + xm) / 2, (h + rH) / 2, z); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(T, 3));
    const tm = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    tm.userData.base = 0.55; fl.mats.push(tm); fl.grp.add(new THREE.LineSegments(tg, tm));
  }

  _fixture(parent, x, y, z, kind) {
    const core = new THREE.Mesh(new THREE.SphereGeometry(kind === 'wall' ? 0.07 : 0.06, 12, 8), new THREE.MeshBasicMaterial({ color: COL.off.clone(), transparent: true, toneMapped: false }));
    core.position.set(x, y, z); parent.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: COL.cyan.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4 }));
    halo.position.copy(core.position); halo.scale.setScalar(0.35); parent.add(halo);
    let cone = null;
    if (kind !== 'wall') {
      const ch = y - 0.02, cg = new THREE.CylinderGeometry(0.05, 1.05, ch, 32, 1, true); cg.translate(0, -ch / 2, 0);
      // flip uv so vUv.y = 1 at the lamp
      cone = new THREE.Mesh(cg, new THREE.ShaderMaterial({ vertexShader: CONE_VS, fragmentShader: CONE_FS, uniforms: { uLit: { value: 0 }, uFade: { value: 1 }, uCol: { value: new THREE.Color(1, 0.72, 0.4) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      cone.position.set(x, y, z); parent.add(cone);
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial()); hit.visible = false; hit.position.set(x, y, z); parent.add(hit);
    return { core, halo, cone, hit };
  }

  _buildLights() {
    this.lights = [];
    for (const c of this.D.lights) {
      const fl = this.floors[c.floor], F = fl.F;
      const L = { cfg: c, entity: c.entity, name: c.name, group: c.group, floor: c.floor, lit: 0, target: 0, avail: true, pending: 0, fixtures: [], ch: channelOf(c.entity) };
      const yy = c.kind === 'wall' ? Math.min(2.0, F.height - 0.5) : c.kind === 'pendant' ? F.height - 0.7 : F.height - 0.06;
      let sx = 0, sz = 0;
      for (const [X, Y] of c.fixtures) {
        const [x, z] = this._p(X, Y); sx += x; sz += z;
        const f = this._fixture(fl.grp, x, yy, z, c.kind); f.hit.userData.light = L; this.targets.push(f.hit); L.fixtures.push(f);
      }
      sx /= c.fixtures.length; sz /= c.fixtures.length; L.centre = new THREE.Vector3(sx, 0, sz);
      L.point = new THREE.PointLight(0xffa24a, 0, 7.5, 1.5); L.point.position.set(sx, yy - 0.25, sz); fl.grp.add(L.point);
      const room = this.rooms[c.floor + ':' + c.room];
      if (room) { room.lights.push(L); L.room = room; room.mesh.userData.light = L; this.targets.push(room.mesh);
        const fx = room.u.uFx.value; c.fixtures.forEach(([X, Y], i) => { const [x, z] = this._p(X, Y); if (room.u.uN.value < 8) { fx[room.u.uN.value].set(x, z, 0); room.u.uN.value++; } }); }
      // floating label
      const el = document.createElement('div'); el.className = 'lbl';
      el.innerHTML = `<i></i><span>${c.name}</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); this._toggle(L); });
      el.addEventListener('pointerenter', () => this._setHover(L)); el.addEventListener('pointerleave', () => this._setHover(null));
      const lo = new CSS2DObject(el); lo.position.set(sx + (c.kind === 'wall' ? 0.35 : 0), yy + 0.45, sz + (c.kind === 'wall' ? 0.55 : 0)); fl.grp.add(lo); fl.labels.push(lo); L.label = el;
      this.lights.push(L);
    }
  }

  _buildStair() {
    const S = this.D.stair; this.steps = [];
    const n = Math.max(14, this.D.stairLights.length), grp = this.stairGrp = new THREE.Group(); this.scene.add(grp);
    const matTread = new THREE.MeshStandardMaterial({ color: 0x0f2236, emissive: 0x05243a, roughness: .5, transparent: true, opacity: .95 });
    const edgeM = new THREE.LineBasicMaterial({ color: 0x43e8ff, transparent: true, opacity: .6, blending: THREE.AdditiveBlending });
    const len = Math.abs(S.a_top - S.a_bot) * S.r / n;
    const stepLights = {}; for (const s of this.D.stairLights) stepLights[s.step] = s.entity;
    for (let i = 0; i < n; i++) { // i = 0 bottom
      const t = (i + 0.5) / n, a = S.a_bot + (S.a_top - S.a_bot) * t;
      const X = S.c[0] + S.r * Math.cos(a), Y = S.c[1] + S.r * Math.sin(a); const [x, z] = this._p(X, Y);
      const g = new THREE.BoxGeometry(S.width, 0.05, len * 1.05);
      const m = new THREE.Mesh(g, matTread); m.position.set(x, 0, z); m.rotation.y = -a; grp.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeM); m.add(e);
      const led = new THREE.Mesh(new THREE.BoxGeometry(S.width * 0.9, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: COL.off.clone(), toneMapped: false }));
      led.position.set(0, 0.03, -len * 0.5); m.add(led);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: COL.warm.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.set(1.4, 0.7, 1); halo.position.set(0, 0.05, 0); m.add(halo);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(S.width, 0.3, len), new THREE.MeshBasicMaterial()); hit.visible = false; m.add(hit);
      const step = { i, mesh: m, led, halo, entity: stepLights[i], lit: 0, target: 0, avail: true, name: `Step ${String(i).padStart(2, '0')}`, isStep: true, pending: 0 };
      step.ch = step.entity ? channelOf(step.entity) : { short: '—', long: 'not wired' };
      hit.userData.light = step; if (step.entity) this.targets.push(hit);
      this.steps.push(step);
    }
    // handrail
    const pts = []; for (let k = 0; k <= 40; k++) { const t = k / 40, a = S.a_bot + (S.a_top - S.a_bot) * t; const [x, z] = this._p(S.c[0] + (S.r + S.width / 2) * Math.cos(a), S.c[1] + (S.r + S.width / 2) * Math.sin(a)); pts.push(new THREE.Vector3(x, t, z)); }
    this.rail = { pts, line: new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending })) };
    grp.add(this.rail.line);
  }

  _buildShed() {
    const grp = this.shedGrp = new THREE.Group(); const [x, z] = this._p(this.CX + 19, this.CY - 1); grp.position.set(x, 0, z); this.scene.add(grp);
    const g = new THREE.BoxGeometry(5, 2.6, 3.2); g.translate(0, 1.3, 0);
    grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x43e8ff, transparent: true, opacity: .45, blending: THREE.AdditiveBlending })));
    grp.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0a2236, transparent: true, opacity: .25, depthWrite: false })));
    const el = document.createElement('div'); el.className = 'tag'; el.textContent = 'SHED';
    const lo = new CSS2DObject(el); lo.position.set(0, 3.2, 0); grp.add(lo);
    this.shed = this.D.shed.map((s, i) => {
      const f = this._fixture(grp, -1.9 + i * 0.95, 2.45, 0, 'down');
      const L = { cfg: s, entity: s.entity, name: s.name, group: 'Shed', lit: 0, target: 0, avail: true, pending: 0, fixtures: [f], ch: channelOf(s.entity), shed: true };
      L.point = new THREE.PointLight(0xffa24a, 0, 5, 1.6); L.point.position.set(f.core.position.x, 2.2, 0); grp.add(L.point);
      f.hit.userData.light = L; this.targets.push(f.hit); return L;
    });
  }

  // ---------- HUD ----------
  _buildHud() {
    const list = this.$('.list .groups');
    const groups = ['Great Hall', 'Ground Floor', 'Lower Ground', 'Exterior'];
    this.all = [...this.lights, ...this.shed];
    for (const gname of [...groups, 'Staircase', 'Shed']) {
      const sec = document.createElement('section'); sec.innerHTML = `<h3><span>${gname}</span><b></b></h3>`; list.appendChild(sec);
      if (gname === 'Staircase') {
        const row = document.createElement('div'); row.className = 'stairs';
        row.innerHTML = this.steps.map((s) => `<i data-i="${s.i}" title="${s.name} · ${s.ch.short}"></i>`).join('');
        row.addEventListener('click', (e) => { const i = e.target.dataset.i; if (i !== undefined) this._toggle(this.steps[+i]); });
        sec.appendChild(row); this.stairRow = row; continue;
      }
      const items = gname === 'Shed' ? this.shed : this.lights.filter((l) => l.group === gname);
      for (const L of items) {
        const r = document.createElement('div'); r.className = 'row';
        r.innerHTML = `<i class="led"></i><span class="nm">${L.name}</span><span class="ch">${L.ch.short}</span><span class="sw"><b></b></span>`;
        r.addEventListener('click', () => { this._select(L); this._toggle(L); });
        r.addEventListener('pointerenter', () => this._setHover(L)); r.addEventListener('pointerleave', () => this._setHover(null));
        sec.appendChild(r); L.row = r;
      }
      sec.querySelector('b').textContent = gname === 'Shed' ? '' : '';
    }
    this.$('.views').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset;
      if (v.floor) this.view.floor = v.floor;
      if (v.mode) this.view.mode = v.mode;
      if (v.explode !== undefined) this.view.explode = this.view.explode ? 0 : 1;
      if (v.alloff !== undefined) return this._allOff(b);
      this._userCam = false; this._applyView();
    });
    this.$('.list .fold').addEventListener('click', () => this.$('.list').classList.toggle('open'));
    this.$('.insp .tg').addEventListener('click', () => this.sel && this._toggle(this.sel));
    this.$('.insp .x').addEventListener('click', () => { this.sel = null; this._renderInsp(); });
    this._renderInsp();
  }

  _applyView(instant) {
    const v = this.view, g = this.floors.g, l = this.floors.l;
    const ex = v.explode ? EXPLODE : 0;
    g.tY = g.F.elev + ex; l.tY = 0;
    g.tFade = 1; l.tFade = 1;
    if (v.floor === 'g') { l.tFade = 0.16; }
    if (v.floor === 'l') { g.tY = g.F.elev + 7; g.tFade = 0.05; }
    this.shadowRoot.querySelectorAll('.views button').forEach((b) => {
      const d = b.dataset; b.classList.toggle('on', (d.floor && d.floor === v.floor) || (d.mode && d.mode === v.mode) || (d.explode !== undefined && !!v.explode));
    });
    if (this._userCam) return;
    let pos, tgt;
    const fy = v.floor === 'l' ? 0.5 : v.floor === 'g' ? g.tY + 0.5 : 1.8 + ex / 2;
    if (v.mode === 'plan') { pos = new THREE.Vector3(0.01, 34 + fy, 2.5); tgt = new THREE.Vector3(0, fy, 0.5); }
    else { pos = v.floor === 'all' ? new THREE.Vector3(-21, 24 + ex, 29) : new THREE.Vector3(-14, 15 + fy, 19); tgt = new THREE.Vector3(0.5, fy, 0.5); }
    if (this._narrow) pos.multiplyScalar(1.35);
    this.controls.autoRotate = v.mode === '3d' && !this._userCam;
    this._camTween = { from: this.camera.position.clone(), to: pos, tf: this.controls.target.clone(), tt: tgt, t: instant ? 1 : 0, dur: v.mode === 'plan' ? 1.2 : 1.6 };
    if (instant) { this._intro = 0; }
  }

  _select(L) { this.sel = L; this._renderInsp(); }
  _setHover(L) {
    if (this.hover === L) return; this.hover = L;
    this.renderer.domElement.style.cursor = L ? 'pointer' : '';
    this._renderInsp();
  }
  // Room photos live in HA's media folder (/media/house-os), not the public /config/www, so they
  // need a logged-in session: resolve_media returns a short-lived signed URL. The standalone demo
  // (no callWS) falls back to ./img/.
  _photoUrl(name) {
    const cache = (this._photos ||= {}), hit = cache[name];
    if (hit && hit.exp > Date.now()) return hit.p;
    const dir = this._config?.photo_dir ?? 'house-os';
    const p = this._hass?.callWS
      ? this._hass.callWS({ type: 'media_source/resolve_media', media_content_id: `media-source://media_source/local/${dir}/${name}.jpg`, expires: 3600 })
          .then((r) => r.url, () => { delete cache[name]; return null; })
      : Promise.resolve(BASE + 'img/' + name + '.jpg');
    cache[name] = { p, exp: Date.now() + 50 * 60 * 1000 };
    return p;
  }
  _renderInsp() {
    const L = this.hover || this.sel, box = this.$('.insp');
    box.classList.toggle('show', !!L);
    if (!L) return;
    const st = this._hass?.states?.[L.entity];
    const on = st?.state === 'on';
    box.classList.toggle('lit', on); box.classList.toggle('dead', !L.avail);
    const photo = L.cfg?.photo || (L.isStep ? 'stairs' : null);
    const img = this.$('.insp .ph');
    if (photo) {
      if (img.dataset.photo !== photo) {
        img.dataset.photo = photo; img.style.backgroundImage = '';
        this._photoUrl(photo).then((u) => {
          if (!u || img.dataset.photo !== photo) return;
          img.style.backgroundImage = `url("${u}")`; img.classList.remove('flash'); void img.offsetWidth; img.classList.add('flash');
        });
      }
      img.style.display = '';
    } else img.style.display = 'none';
    this.$('.insp h2').textContent = L.name;
    this.$('.insp .meta').innerHTML = `<div><span>STATE</span><b class="s">${!L.avail ? 'OFFLINE' : on ? 'ON' : 'OFF'}</b><em>${st ? 'for ' + ago(st.last_changed) : ''}</em></div>
      <div><span>CHANNEL</span><b>${L.ch.long}</b></div><div><span>ENTITY</span><b>${L.entity || '—'}</b></div>
      <div><span>ZONE</span><b>${L.isStep ? 'Staircase' : L.group} · ${L.floor === 'l' ? 'Lower ground' : L.floor === 'g' ? 'Ground' : 'Outbuilding'}</b></div>`;
    this.$('.insp .tg').textContent = !L.avail ? 'UNAVAILABLE' : on ? 'SWITCH OFF' : 'SWITCH ON';
  }

  // ---------- state ----------
  _sync() {
    const S = this._hass.states;
    const upd = (L) => {
      if (!L.entity) return; const s = S[L.entity];
      const avail = !!s && s.state !== 'unavailable' && s.state !== 'unknown';
      const t = s && s.state === 'on' ? 1 : 0;
      if (L._seen && t !== L.target && avail) this._ripple(L, t);
      if (L._seen && t !== L.target) L.pending = 0;
      L._seen = true; L.target = t; L.avail = avail;
      if (L.row) { L.row.classList.toggle('on', !!t); L.row.classList.toggle('dead', !avail); }
      if (L.label) { L.label.classList.toggle('on', !!t); L.label.classList.toggle('dead', !avail); }
    };
    this.all.forEach(upd); this.steps.forEach(upd);
    if (this.stairRow) this.steps.forEach((s) => { const el = this.stairRow.children[s.i]; el.classList.toggle('on', !!s.target); el.classList.toggle('nc', !s.entity); });
    const lit = this.lights.filter((l) => l.target).length;
    this.$('.count b').textContent = String(lit).padStart(2, '0');
    this.$('.count small').textContent = `/ ${String(this.lights.length).padStart(2, '0')} CIRCUITS LIVE`;
    const bar = this.$('.count .bar'); if (bar.children.length !== this.lights.length) bar.innerHTML = this.lights.map(() => '<i></i>').join('');
    [...bar.children].forEach((c, i) => c.classList.toggle('on', i < lit));
    this.shadowRoot.querySelectorAll('.list section').forEach((sec) => {
      const rows = sec.querySelectorAll('.row'); const n = [...rows].filter((r) => r.classList.contains('on')).length;
      sec.querySelector('h3 b').textContent = rows.length ? `${n}/${rows.length}` : `${this.steps.filter((s) => s.target).length}/${this.steps.filter((s) => s.entity).length}`;
    });
    const sens = this.D.sensors, fmt = (e) => { const s = S[e]; if (!s || isNaN(+s.state)) return '—'; const v = +s.state; return Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + ' kW' : Math.round(v) + ' W'; };
    this.$('.st .pw').textContent = fmt(sens.power); this.$('.st .pv').textContent = fmt(sens.solar);
    const w = S[sens.weather]; this.$('.st .wx').textContent = w ? `${Math.round(w.attributes.temperature)}° ${w.state.replace(/-/g, ' ')}` : '—';
    this.$('.link').classList.add('ok'); this.$('.link span').textContent = this._hass.demo ? 'DEMO MODE' : 'LINK · ONLINE';
    this._renderInsp();
  }

  _toggle(L) {
    if (!L.entity) return this._toast(`${L.name}: not wired to a channel`);
    if (!this._hass) return this._toast('No Home Assistant link');
    if (!L.avail) return this._toast(`${L.name} is unavailable`);
    const domain = L.entity.split('.')[0];
    L.pending = 1;
    this._toast(`${L.target ? '▼' : '▲'} ${L.name.toUpperCase()} · transmitting ${L.ch.short}`);
    Promise.resolve(this._hass.callService(domain, 'toggle', { entity_id: L.entity })).catch((e) => { L.pending = 0; this._toast('FAILED: ' + (e?.message || e)); });
  }

  _allOff(btn) {
    if (!btn.classList.contains('arm')) { btn.classList.add('arm'); btn.textContent = 'CONFIRM ALL OFF'; clearTimeout(this._armT); this._armT = setTimeout(() => { btn.classList.remove('arm'); btn.textContent = 'ALL OFF'; }, 3000); return; }
    btn.classList.remove('arm'); btn.textContent = 'ALL OFF';
    const on = this.lights.filter((l) => l.target && l.avail);
    if (!on.length) return this._toast('Everything is already off');
    const [a, b] = this.bounds; const dur = 1.8;
    this._sweep = { t: 0, a: a - 1, b: b + 1, dur };
    for (const L of on) {
      const t = clamp01((L.centre.x - (a - 1)) / (b - a + 2)) * dur * 1000;
      setTimeout(() => { L.pending = 1; this._hass.callService('switch', 'turn_off', { entity_id: L.entity }); }, t);
    }
    this._toast(`LIGHTS OUT · ${on.length} circuits`);
  }

  _ripple(L, on) {
    const parent = L.isStep ? L.mesh : (L.shed ? this.shedGrp : this.floors[L.floor].grp);
    const pts = L.isStep ? [new THREE.Vector3()] : L.fixtures.map((f) => new THREE.Vector3(f.core.position.x, 0.06, f.core.position.z));
    for (const p of pts) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: on ? 0xffb347 : 0x43e8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.copy(p); parent.add(m); this.ripples.push({ m, t: 0 });
    }
  }

  _toast(t) { const el = this.$('.toast'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

  _tick1s() {
    const d = new Date();
    this.$('.clock b').textContent = d.toLocaleTimeString('en-GB');
    this.$('.clock small').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
    if (this.hover || this.sel) this._renderInsp();
  }

  // ---------- interaction ----------
  _pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    const vis = this.targets.filter((o) => { const L = o.userData.light; if (!L) return false; if (L.isStep || L.shed) return true; return this.floors[L.floor].fade > 0.5; });
    const hits = this.ray.intersectObjects(vis, false);
    return hits.length ? hits[0].object.userData.light : null;
  }
  _onMove(e) { if (e.pointerType === 'mouse') this._setHover(this._pick(e)); }
  _onClick(e) { const L = this._pick(e); if (L) { this._select(L); this._toggle(L); } }

  // ---------- frame ----------
  _loop() {
    if (!this._running) return;
    requestAnimationFrame(() => this._loop());
    if (document.hidden) return;
    const dt = Math.min(this.clock.getDelta(), 0.05); const T = (this.time.value += dt);
    // intro + camera tweens
    if (this._camTween) {
      const c = this._camTween; c.t = Math.min(1, c.t + dt / c.dur); const k = ease(c.t);
      this.camera.position.lerpVectors(c.from, c.to, k); this.controls.target.lerpVectors(c.tf, c.tt, k);
      if (c.t >= 1) this._camTween = null;
    }
    if (this._intro < 1) { // fly-in from orbit
      this._intro = Math.min(1, (performance.now() - this._t0) / 3400); const k = ease(this._intro);
      const a = lerp(0.1, Math.atan2(29, -21), k), rad = lerp(95, Math.hypot(21, 29), k), h = lerp(72, 24, k);
      this.camera.position.set(Math.cos(a) * rad, h, Math.sin(a) * rad);
      if (this._intro >= 1) this._applyView();
    }
    if (this._userCam) { this._idle += dt; if (this._idle > 25 && this.view.mode === '3d') { this._userCam = false; this.controls.autoRotate = true; } }
    this.controls.update();
    // floors
    for (const fl of Object.values(this.floors)) {
      fl.y = lerp(fl.y, fl.tY, 1 - Math.exp(-dt * 4)); fl.fade = lerp(fl.fade, fl.tFade, 1 - Math.exp(-dt * 5));
      fl.grp.position.y = fl.y;
      for (const m of fl.mats) { m.opacity = m.userData.base * fl.fade; m.visible = fl.fade > 0.015; }
      for (const m of fl.shaderMats) m.uniforms.uFade.value = fl.fade;
      for (const lo of fl.labels) lo.visible = fl.fade > 0.5;
    }
    // lights
    const fade = (L) => (L.shed ? 1 : this.floors[L.floor].fade);
    for (const L of this.all) {
      L.lit = lerp(L.lit, L.target, 1 - Math.exp(-dt * (L.target ? 5 : 3)));
      const f = fade(L), blink = L.pending ? 0.5 + 0.5 * Math.sin(T * 18) : 0, hov = this.hover === L ? 1 : 0;
      for (const x of L.fixtures) {
        x.core.material.color.copy(COL.off).lerp(COL.hot, L.lit).multiplyScalar(1 + L.lit * 5 + blink * 2 + hov * 1.5);
        x.core.material.opacity = Math.max(0.15, f);
        x.halo.material.color.copy(COL.cyan).lerp(COL.warm, L.lit);
        x.halo.material.opacity = (0.25 + L.lit * 0.9 + blink * 0.5 + hov * 0.4) * f;
        x.halo.scale.setScalar(0.35 + L.lit * 1.6 + hov * 0.4);
        if (x.cone) { x.cone.material.uniforms.uLit.value = L.lit; x.cone.material.uniforms.uFade.value = f; }
      }
      L.point.intensity = L.lit * (L.shed ? 6 : 5.5) * f;
      if (L.room) {
        L.room.u.uLit.value = Math.max(...L.room.lights.map((q) => q.lit));
        L.room.u.uHover.value = lerp(L.room.u.uHover.value, hov, 0.2);
        let i = 0; for (const q of L.room.lights) for (let k = 0; k < q.fixtures.length && i < 8; k++, i++) L.room.u.uFx.value[i].z = q.lit;
      }
    }
    // stair: stretch between floors
    const yb = this.floors.l.y + this.D.stair.y_bot, yt = this.floors.g.y + (this.D.stair.y_top - this.D.floors.g.elev);
    const sf = Math.min(this.floors.l.fade, this.floors.g.fade) > 0.3 ? 1 : 0.35;
    const n = this.steps.length;
    this.steps.forEach((s, i) => {
      s.mesh.position.y = lerp(yb, yt, (i + 1) / n);
      s.lit = lerp(s.lit, s.target, 1 - Math.exp(-dt * 6));
      const hov = this.hover === s ? 1 : 0;
      s.led.material.color.copy(s.entity ? COL.off : new THREE.Color(0x0a1a24)).lerp(COL.hot, s.lit).multiplyScalar(1 + s.lit * 4 + hov * 2 + (s.pending ? Math.sin(T * 18) + 1 : 0));
      s.halo.material.opacity = (s.lit * 0.8 + hov * 0.3) * sf;
    });
    const rp = this.rail.pts.map((p, k) => new THREE.Vector3(p.x, lerp(yb, yt, p.y) + 0.95, p.z));
    this.rail.line.geometry.setFromPoints(rp);
    // ripples
    this.ripples = this.ripples.filter((r) => { r.t += dt / 1.3; const s = 0.2 + ease(r.t) * 3.2; r.m.scale.setScalar(s); r.m.material.opacity = (1 - r.t) * 0.9; if (r.t >= 1) { r.m.parent.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); return false; } return true; });
    // sweep
    if (this._sweep) { const s = this._sweep; s.t += dt / s.dur; this.sweep.visible = true; this.sweep.position.x = lerp(s.a, s.b, s.t); this.sweep.material.uniforms.uA.value = Math.sin(Math.PI * Math.min(1, s.t)); if (s.t >= 1) { this._sweep = null; this.sweep.visible = false; } }
    this.dust.rotation.y = T * 0.01; this.dust.position.y = Math.sin(T * 0.2) * 0.2;
    this.composer.render();
    this.labels.render(this.scene, this.camera);
  }
}

const CSS = `
:host{display:block;height:100%;--c:#43e8ff;--c2:#0e5a78;--w:#ffb347;--txt:#bfefff;--bg:rgba(3,14,26,.62);--line:rgba(67,232,255,.28);--red:#ff3d6e}
*{box-sizing:border-box}
.root{position:relative;width:100%;height:var(--hos-height,calc(100vh - var(--header-height,56px)));min-height:520px;overflow:hidden;background:radial-gradient(ellipse at 50% 35%,#071a2c 0%,#02050b 70%);color:var(--txt);font-family:Rajdhani,'Segoe UI',sans-serif;user-select:none;-webkit-user-select:none}
.stage{position:absolute;inset:0}.stage canvas{display:block;outline:none;touch-action:none}
.labels{position:absolute;inset:0;pointer-events:none}
.scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);mix-blend-mode:overlay}
.vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.65) 100%)}
.panel{background:var(--bg);border:1px solid var(--line);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);clip-path:polygon(0 12px,12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%)}
.top{position:absolute;left:16px;right:16px;top:14px;display:flex;gap:14px;align-items:stretch;pointer-events:none}
.logo{padding:10px 16px}.logo h1{margin:0;font:800 22px/1 Orbitron,sans-serif;letter-spacing:.12em;color:#e9fbff;text-shadow:0 0 12px rgba(67,232,255,.8)}
.logo h1 em{font-style:normal;color:var(--c)}.logo p{margin:5px 0 0;font:600 10.5px/1 'JetBrains Mono',monospace;letter-spacing:.22em;color:#6fb9d0}
.count{padding:10px 16px;min-width:230px}.count b{font:800 30px/1 Orbitron,sans-serif;color:var(--w);text-shadow:0 0 14px rgba(255,179,71,.7)}
.count small{font:600 11px 'JetBrains Mono',monospace;letter-spacing:.14em;color:#8fd3e6;margin-left:6px}
.count .bar{display:flex;gap:2px;margin-top:7px}.count .bar i{flex:1;height:5px;background:rgba(67,232,255,.15)}.count .bar i.on{background:var(--w);box-shadow:0 0 6px var(--w)}
.sp{flex:1}
.st{padding:9px 14px;display:grid;grid-template-columns:auto auto;gap:2px 12px;font:600 11px 'JetBrains Mono',monospace;letter-spacing:.1em;align-content:center}
.st span{color:#5fa6bd}.st b{color:#e9fbff;font-weight:600;text-transform:uppercase}
.clock{padding:9px 16px;text-align:right}.clock b{display:block;font:500 22px/1 Orbitron,sans-serif;color:#e9fbff;letter-spacing:.06em}.clock small{font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:.2em;color:#6fb9d0}
.link{display:flex;align-items:center;gap:7px;margin-top:6px;justify-content:flex-end;font:600 10px 'JetBrains Mono',monospace;letter-spacing:.16em;color:var(--red)}
.link i{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 8px var(--red)}.link.ok{color:#3dffb0}.link.ok i{background:#3dffb0;box-shadow:0 0 8px #3dffb0;animation:pulse 2s infinite}
@keyframes pulse{50%{opacity:.35}}
.list{position:absolute;left:16px;top:104px;bottom:76px;width:268px;display:flex;flex-direction:column}
.list .fold{display:none}
.groups{overflow:auto;padding:6px 10px 10px;scrollbar-width:thin;scrollbar-color:var(--c2) transparent}
section h3{display:flex;justify-content:space-between;margin:12px 2px 5px;font:600 10.5px 'JetBrains Mono',monospace;letter-spacing:.2em;color:#5fa6bd;text-transform:uppercase;border-bottom:1px solid rgba(67,232,255,.14);padding-bottom:4px}
section h3 b{color:var(--w);font-weight:600}
.row{display:flex;align-items:center;gap:9px;padding:5px 6px;cursor:pointer;border-left:2px solid transparent;transition:background .2s,border-color .2s}
.row:hover{background:rgba(67,232,255,.08);border-left-color:var(--c)}
.row .led{width:7px;height:7px;border-radius:50%;background:#123b4d;flex:none;transition:.3s}
.row.on .led{background:var(--w);box-shadow:0 0 8px 2px rgba(255,179,71,.8)}
.row .nm{flex:1;font-weight:600;font-size:15px;letter-spacing:.04em;color:#d8f6ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row.on .nm{color:#fff3df;text-shadow:0 0 10px rgba(255,179,71,.5)}
.row .ch{font:400 9.5px 'JetBrains Mono',monospace;color:#4f8ea3;letter-spacing:.08em}
.row .sw{width:30px;height:14px;border:1px solid rgba(67,232,255,.45);position:relative;flex:none;transition:.3s}
.row .sw b{position:absolute;left:2px;top:2px;width:10px;height:8px;background:#2a6d86;transition:.3s}
.row.on .sw{border-color:var(--w);box-shadow:0 0 8px rgba(255,179,71,.45)}.row.on .sw b{left:16px;background:var(--w)}
.row.dead{opacity:.45}.row.dead .led{background:var(--red);box-shadow:0 0 6px var(--red)}
.stairs{display:grid;grid-template-columns:repeat(14,1fr);gap:3px;padding:4px 4px 2px}
.stairs i{height:16px;background:#0f3242;cursor:pointer;transition:.3s;clip-path:polygon(0 30%,100% 0,100% 100%,0 100%)}
.stairs i:hover{background:#1d6f8c}.stairs i.on{background:var(--w);box-shadow:0 0 6px var(--w)}.stairs i.nc{opacity:.25;cursor:default}
.insp{position:absolute;right:16px;top:104px;width:330px;opacity:0;transform:translateX(30px);transition:.35s cubic-bezier(.2,.9,.2,1);pointer-events:none}
.insp.show{opacity:1;transform:none;pointer-events:auto}
.insp .ph{height:186px;background:#000 center/cover;position:relative;filter:saturate(1.1) contrast(1.05);border-bottom:1px solid var(--line)}
.insp .ph::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,8,16,0) 40%,rgba(2,8,16,.85)),repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px)}
.insp .ph.flash{animation:glitch .5s steps(5)}
@keyframes glitch{0%{filter:hue-rotate(90deg) saturate(3);transform:translateX(-4px)}40%{filter:hue-rotate(-60deg);transform:translateX(3px)}100%{filter:none;transform:none}}
.insp:not(.lit) .ph{filter:grayscale(.85) brightness(.55) sepia(.2) hue-rotate(160deg)}
.brk{position:absolute;inset:8px;pointer-events:none;z-index:2;background:linear-gradient(var(--c),var(--c)) top left/14px 2px,linear-gradient(var(--c),var(--c)) top left/2px 14px,linear-gradient(var(--c),var(--c)) top right/14px 2px,linear-gradient(var(--c),var(--c)) top right/2px 14px,linear-gradient(var(--c),var(--c)) bottom left/14px 2px,linear-gradient(var(--c),var(--c)) bottom left/2px 14px,linear-gradient(var(--c),var(--c)) bottom right/14px 2px,linear-gradient(var(--c),var(--c)) bottom right/2px 14px;background-repeat:no-repeat}
.insp .body{padding:10px 16px 16px}
.insp h2{margin:0 0 8px;font:800 19px/1.1 Orbitron,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#e9fbff}
.insp.lit h2{color:#fff1d6;text-shadow:0 0 16px rgba(255,179,71,.8)}
.insp .meta div{display:flex;gap:8px;align-items:baseline;font:400 11px 'JetBrains Mono',monospace;padding:3px 0;border-bottom:1px dashed rgba(67,232,255,.12)}
.insp .meta span{width:68px;flex:none;color:#4f8ea3;letter-spacing:.12em}.insp .meta b{font-weight:600;color:#cdeefb;word-break:break-all}
.insp .meta em{margin-left:auto;font-style:normal;color:#6fb9d0}.insp.lit .meta .s{color:var(--w)}.insp.dead .meta .s{color:var(--red)}
.insp .tg{margin-top:12px;width:100%;padding:11px;font:800 13px Orbitron,sans-serif;letter-spacing:.18em;color:#02121c;background:var(--c);border:0;cursor:pointer;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));transition:.2s}
.insp.lit .tg{background:var(--w)}.insp .tg:hover{filter:brightness(1.25)}
.insp .x{position:absolute;right:8px;top:8px;z-index:3;width:26px;height:26px;border:1px solid var(--line);background:rgba(0,0,0,.5);color:var(--c);cursor:pointer;font:600 14px monospace}
.views{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:4px;padding:6px}
.views button{font:600 11.5px 'JetBrains Mono',monospace;letter-spacing:.16em;padding:9px 13px;color:#9fdcf0;background:transparent;border:1px solid rgba(67,232,255,.2);cursor:pointer;transition:.2s;white-space:nowrap}
.views button:hover{border-color:var(--c);color:#fff}.views button.on{background:rgba(67,232,255,.16);border-color:var(--c);color:#fff;box-shadow:inset 0 0 12px rgba(67,232,255,.35)}
.views .sep{width:1px;background:var(--line);margin:4px 4px}
.views .off{color:#ffb0c4;border-color:rgba(255,61,110,.4)}.views .off:hover{background:rgba(255,61,110,.15)}.views .off.arm{background:var(--red);color:#fff;animation:pulse .5s infinite}
.lbl{display:flex;align-items:center;gap:5px;padding:2px 7px 2px 5px;font:700 10.5px Rajdhani,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a9e9fb;background:rgba(2,12,22,.55);border:1px solid rgba(67,232,255,.25);pointer-events:auto;cursor:pointer;white-space:nowrap;transition:color .25s,border-color .25s,background .25s,box-shadow .25s}
.lbl i{width:6px;height:6px;border-radius:50%;background:#1c5d75}
.lbl:hover{border-color:var(--c);color:#fff;background:rgba(10,40,60,.8)}
.lbl.on{color:#fff0d2;border-color:rgba(255,179,71,.6);box-shadow:0 0 12px rgba(255,179,71,.35)}.lbl.on i{background:var(--w);box-shadow:0 0 6px var(--w)}
.lbl.dead{opacity:.5}.lbl.dead i{background:var(--red)}
.tag{font:600 10px 'JetBrains Mono',monospace;letter-spacing:.18em;color:#6fb9d0;text-transform:uppercase}
.toast{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);font:600 12px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#e9fbff;padding:7px 14px;background:rgba(3,14,26,.8);border:1px solid var(--line);opacity:0;pointer-events:none;white-space:nowrap}
.toast.show{animation:toast 2.6s}@keyframes toast{0%{opacity:0;transform:translate(-50%,8px)}10%,75%{opacity:1;transform:translate(-50%,0)}100%{opacity:0}}
.boot{position:absolute;inset:0;background:#010307;display:flex;align-items:center;justify-content:center;transition:opacity 1s,visibility 1s;z-index:10}
.boot.gone{opacity:0;visibility:hidden}
.boot pre{font:400 13px/1.7 'JetBrains Mono',monospace;color:#43e8ff;text-shadow:0 0 8px rgba(67,232,255,.6);min-width:min(560px,90vw);white-space:pre-wrap}
.boot pre::after{content:'█';animation:pulse .7s steps(1) infinite}
.foot{position:absolute;right:16px;bottom:18px;font:400 9.5px 'JetBrains Mono',monospace;letter-spacing:.16em;color:#3e7488;text-align:right;pointer-events:none}
.narrow .st,.narrow .foot{display:none}
.narrow .top{left:8px;right:8px;top:8px;gap:6px}.narrow .logo h1{font-size:15px}.narrow .logo p{display:none}.narrow .count{min-width:0;padding:8px 10px}.narrow .count b{font-size:20px}.narrow .count small{display:none}
.narrow .clock{display:none}
.narrow .list{left:8px;right:8px;width:auto;top:auto;bottom:62px;max-height:52px;transition:max-height .35s}.narrow .list.open{max-height:60%}
.narrow .list .fold{display:block;padding:10px 14px;font:600 11px 'JetBrains Mono',monospace;letter-spacing:.2em;color:var(--c);cursor:pointer;flex:none}
.narrow .insp{left:8px;right:8px;width:auto;top:70px}.narrow .insp .ph{height:130px}
.narrow .views{bottom:8px;left:8px;right:8px;transform:none;overflow-x:auto;justify-content:flex-start}
.narrow .views button{padding:8px 9px;font-size:10px}.narrow .toast{bottom:120px}
`;
const HTML = `
<div class="root">
  <div class="stage"></div><div class="vig"></div><div class="scan"></div>
  <div class="top">
    <div class="panel logo"><h1>APPLEBROOK<em>//</em>OS</h1><p>LIGHTING CONTROL · 3× MCP23017</p></div>
    <div class="panel count"><b>--</b><small></small><div class="bar"></div></div>
    <div class="sp"></div>
    <div class="panel st"><span>GRID</span><b class="pw">—</b><span>SOLAR</span><b class="pv">—</b><span>OUTSIDE</span><b class="wx">—</b></div>
    <div class="panel clock"><b>--:--:--</b><small></small><div class="link"><i></i><span>LINK · WAITING</span></div></div>
  </div>
  <div class="panel list"><div class="fold">▲ CIRCUITS</div><div class="groups"></div></div>
  <div class="panel insp"><div class="ph"><div class="brk"></div></div><button class="x">×</button>
    <div class="body"><h2></h2><div class="meta"></div><button class="tg"></button></div></div>
  <div class="panel views">
    <button data-mode="3d">3D</button><button data-mode="plan">PLAN</button><span class="sep"></span>
    <button data-floor="all">ALL</button><button data-floor="g">GROUND</button><button data-floor="l">LOWER</button><span class="sep"></span>
    <button data-explode>EXPLODE</button><span class="sep"></span><button class="off" data-alloff>ALL OFF</button>
  </div>
  <div class="toast"></div>
  <div class="foot">GEOMETRY · OXFORD DESIGN STUDIO W175-26D / 27I · 1:100<br>DRAG TO ORBIT · SCROLL TO ZOOM · CLICK A LIGHT TO SWITCH</div>
  <div class="boot"><pre></pre></div>
</div>`;

if (!customElements.get('house-os-card')) {
  customElements.define('house-os-card', HouseOS);
  customElements.define('house-os-panel', class extends HouseOS {});
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'house-os-card', name: 'HOUSE//OS', description: 'Holographic 3D lighting console', preview: false });
}
