/* The 3D swimmer on the app's home cards (owner, 2026-10-29).
 *
 * One card per swimmer, on a curve; each swimmer stands in its own little
 * square pool with lane ropes. (The owner tried all swimmers on one turning
 * pool and went back to one per card, keeping the pool.)
 *
 * One model file (public/3d/swimmer-v1.glb, built in Blender by
 * scripts/swimmer/swimmer.py) holds the body and every swappable part -- hair
 * styles, suits, goggles, cap, fins -- skinned to one skeleton. A swimmer is a
 * copy of it with the parts it wears shown and its own colours.
 *
 * Every card has its own live view (its own small WebGL canvas, never
 * moved); a family has at most three swimmers. Only the middle card's view
 * moves -- breathing at 30 frames a second, turning under a finger -- the
 * others keep their last frame. So arriving on a card swaps nothing: the
 * swimmer there simply starts breathing again from exactly where it was
 * (owner, 2026-10-30: no pause, no flash when a card arrives). Nothing is
 * drawn while the cards slide, are off screen, or the app is in the
 * background.
 *
 * three.js is imported here only, and this file only from SwimmerDeck, which
 * the home page loads on demand inside the app: no other page carries it. */
import type * as T from 'three'
import type { SwimmerLook } from '@/lib/swimmer-look'

export const MODEL_URL = '/3d/swimmer-v1.glb'

const HAIR_PARTS: Record<SwimmerLook['hair'], string[]> = {
  short: ['HairShort'], spiky: ['HairSpiky'], bob: ['HairBob'], ponytail: ['HairPony', 'HairPonyTie'], buns: ['HairBuns'],
}
const SUIT_PARTS: Record<SwimmerLook['suit'], string> = { brief: 'SuitBrief', jammer: 'SuitJammer', onepiece: 'SuitOnepiece' }
const OPTIONAL = ['HairShort', 'HairSpiky', 'HairBob', 'HairPony', 'HairPonyTie', 'HairBuns', 'Cap', 'GogglesEyes', 'GogglesEyesLens',
  'GogglesUp', 'GogglesUpLens', 'SuitJammer', 'SuitBrief', 'SuitOnepiece', 'Fins', 'Lashes']

/* How the swimmer turns under a finger (owner, 2026-10-29: "not fast", then
   "a little faster"). Radians per pixel, the most it turns in a second while
   dragged, and the fastest it keeps turning after the finger lets go. */
const SWIMMER_PER_PX = 0.0085
const SWIMMER_MAX_PER_S = 3.0
const SWIMMER_FLING_MAX = 1.1

export interface Character {
  holder: T.Group
  mats: Record<string, T.MeshStandardMaterial[]>
  parts: Record<string, T.Object3D>
  mixer: T.AnimationMixer
  /** Its turn, and how fast it is still turning after a flick. */
  yaw: number
  vel: number
  /** Its own canvas, once placed on a card. */
  view?: View
  /** Needs one frame drawn (it was dressed) even though it is not the moving one. */
  dirty?: boolean
  /** Its outline as bands (holder space): radius round the turning axis per height band. */
  bands?: { y0: number; y1: number; r: number }[]
}

export interface View { renderer: T.WebGLRenderer; scene: T.Scene; cam: T.PerspectiveCamera; host: HTMLElement }

export interface Engine {
  make(look: SwimmerLook): Character
  dress(ch: Character, look: SwimmerLook): void
  /** Give this swimmer its own canvas inside this card element (once; later calls do nothing). */
  mount(ch: Character, host: HTMLElement): void
  /** Take its canvas away (the swimmer left the family list). */
  unmount(ch: Character): void
  /** The swimmer that breathes and turns (the middle card). */
  setActive(ch: Character | null): void
  /** Where the active swimmer is on its card, as up to three boxes (head, body, legs) in the card's CSS pixels. */
  swimmerBoxes(): { x: number; y: number; w: number; h: number }[]
  /** While the cards slide, stop drawing (the canvas keeps its last frame), so the slide has the phone to itself. */
  setMoving(on: boolean): void
  spin(dx: number): void
  fling(velocity: number): void
  setDragging(on: boolean): void
  dispose(): void
}

const glOk = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

export async function createEngine(): Promise<Engine | null> {
  if (typeof window === 'undefined' || !glOk()) return null
  const [THREE, { GLTFLoader }, { MeshoptDecoder }, { clone: cloneSkinned }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    import('three/examples/jsm/utils/SkeletonUtils.js'),
  ])
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const base = await loader.loadAsync(MODEL_URL)
  const idleClip = base.animations.find(a => a.name === 'Idle') || null

  const M = (color: string, rough: number) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 })
  function shadowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62)
    g.addColorStop(0, 'rgba(18,37,74,0.35)'); g.addColorStop(1, 'rgba(18,37,74,0)')
    x.fillStyle = g; x.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  /* The pool the swimmer stands in (owner: square is fine, with lane ropes).
     Faces that share a plane flicker (z-fighting; the owner saw the blue edge
     flicker once): every piece sits a little above or outside the one under it.
     Built at full size and scaled down to fit a card. */
  const POOL_SCALE = 0.72
  const DECK = 2.35, WATER = 2.0, FLOOR = -0.42, SURFACE = -0.03
  const ripple = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256
    const x = c.getContext('2d')!
    x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 2.2
    // A fixed pattern (not random) so every phone sees the same water.
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let k = 0; k < 46; k++) {
      const cx = rnd() * 256, cy = rnd() * 256, r = 10 + rnd() * 26
      x.beginPath(); x.ellipse(cx, cy, r, r * (0.45 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * (0.7 + rnd() * 0.8)); x.stroke()
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2.4, 2.4); tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })()
  function makePool() {
    const g = new THREE.Group()
    const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, rough = 0.6) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color, rough)); m.position.set(x, y, z); g.add(m); return m
    }
    const ledge = DECK - WATER
    box(DECK * 2, 0.5, ledge, '#efe9dd', 0, -0.23, WATER + ledge / 2); box(DECK * 2, 0.5, ledge, '#efe9dd', 0, -0.23, -WATER - ledge / 2)
    box(ledge, 0.5, WATER * 2, '#efe9dd', WATER + ledge / 2, -0.23, 0); box(ledge, 0.5, WATER * 2, '#efe9dd', -WATER - ledge / 2, -0.23, 0)
    for (const s of [1, -1]) {
      box(WATER * 2 + 0.16, 0.06, 0.08, '#ffffff', 0, 0.045, s * (WATER + 0.04), 0.4)
      box(0.08, 0.06, WATER * 2 + 0.16, '#ffffff', s * (WATER + 0.04), 0.045, 0, 0.4)
    }
    for (const s of [1, -1]) {
      box(DECK * 2 + 0.02, 0.045, 0.07, '#2050a0', 0, 0.006, s * (DECK - 0.025), 0.4)
      box(0.07, 0.044, DECK * 2 + 0.018, '#2050a0', s * (DECK - 0.025), 0.006, 0, 0.4)
    }
    for (const s of [1, -1]) {
      box(WATER * 2, Math.abs(FLOOR), 0.02, '#8fd6f2', 0, FLOOR / 2, s * (WATER - 0.01))
      box(0.02, Math.abs(FLOOR), WATER * 2, '#8fd6f2', s * (WATER - 0.01), FLOOR / 2, 0)
    }
    box(WATER * 2, 0.02, WATER * 2, '#7ccdf0', 0, FLOOR, 0)
    for (const x of [-1.45, 0, 1.45]) {
      box(0.12, 0.012, WATER * 2 - 0.7, '#1d3f7c', x, FLOOR + 0.02, 0, 0.5)
      for (const s of [1, -1]) box(0.5, 0.0125, 0.12, '#1d3f7c', x, FLOOR + 0.021, s * (WATER - 0.35), 0.5)
    }
    const water = new THREE.Mesh(new THREE.PlaneGeometry(WATER * 2, WATER * 2),
      new THREE.MeshStandardMaterial({ color: '#33aee4', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.62, depthWrite: false }))
    water.rotation.x = -Math.PI / 2; water.position.y = SURFACE; g.add(water)
    const sheen = new THREE.Mesh(new THREE.PlaneGeometry(WATER * 2, WATER * 2), new THREE.MeshBasicMaterial({ map: ripple, transparent: true, opacity: 0.55, depthWrite: false }))
    sheen.rotation.x = -Math.PI / 2; sheen.position.y = SURFACE + 0.002; g.add(sheen)
    {
      // Lane ropes: floats, red near the walls, blue and white between.
      const n = 44, len = WATER * 2 - 0.1
      const geo = new THREE.CylinderGeometry(0.05, 0.05, len / n * 0.82, 14); geo.rotateX(Math.PI / 2)
      const cols: Record<string, [number, number][]> = { red: [], white: [], blue: [] }
      for (const x of [-0.75, 0.75]) for (let k = 0; k < n; k++) {
        const z = -len / 2 + (k + 0.5) * len / n
        cols[Math.abs(z) > len / 2 - 0.55 ? 'red' : (k % 2 ? 'white' : 'blue')].push([x, z])
      }
      for (const [name, color] of [['red', '#e5484d'], ['white', '#ffffff'], ['blue', '#2050a0']] as const) {
        const im = new THREE.InstancedMesh(geo, M(color, 0.35), cols[name].length)
        const m4 = new THREE.Matrix4()
        cols[name].forEach(([x, z], k) => { m4.makeTranslation(x, SURFACE + 0.01, z); im.setMatrixAt(k, m4) })
        g.add(im)
      }
      for (const x of [-0.75, 0.75]) for (const s of [1, -1]) box(0.06, 0.1, 0.06, '#c9d3e3', x, 0.03, s * (WATER + 0.02), 0.3)
    }
    {
      // A ladder at the back corner.
      const rail = M('#d6dde8', 0.2)
      for (const dx of [-0.16, 0.16]) {
        const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.35, -0.12), new THREE.Vector3(0, 0.25, -0.12), new THREE.Vector3(0, 0.42, 0.05),
          new THREE.Vector3(0, 0.3, 0.22), new THREE.Vector3(0, 0.02, 0.24)])
        const tube = new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.022, 8), rail)
        tube.position.set(1.35 + dx, 0, -WATER + 0.12); tube.rotation.y = Math.PI; g.add(tube)
      }
    }
    g.scale.setScalar(POOL_SCALE)
    return g
  }
  /** Where the swimmer's feet are: a little under the water. */
  const STAND_Y = (SURFACE - 0.1) * POOL_SCALE

  /** The pool the swimmer stands in, its lights and camera. */
  function makeScene() {
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfe0ec', 2.3))
    const key = new THREE.DirectionalLight('#fff4e6', 2.1); key.position.set(2.5, 5, 4); scene.add(key)
    const fill = new THREE.DirectionalLight('#fff8f0', 1.1); fill.position.set(-0.6, 1.5, 6); scene.add(fill)
    const back = new THREE.DirectionalLight('#bfe6ff', 1.6); back.position.set(-3, 2.5, -3); scene.add(back)
    const pool = makePool(); scene.add(pool)
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }))
    sh.rotation.x = -Math.PI / 2; sh.position.y = SURFACE * POOL_SCALE + 0.004; scene.add(sh)
    // A tight depth range (near 2) keeps close faces from flickering.
    const cam = new THREE.PerspectiveCamera(28, 1, 2, 40); cam.position.set(0, 2.6, 8.6); cam.lookAt(0, 0.86, 0)
    return { scene, cam, scenery: [pool, sh] as T.Object3D[] }
  }

  const REST_YAW = -0.3
  const PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2)
  const chars = new Set<Character>()
  let active: Character | null = null
  let dragging = false, spunAt = 0, moving = false
  let frame = 0
  let raf = 0
  let last = performance.now()
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Drawn only while some card is on screen.
  const visible = new Set<Element>()
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target) }))
  const ro = new ResizeObserver(es => es.forEach(e => {
    for (const ch of chars) if (ch.view?.host === e.target) { size(ch.view); ch.dirty = true }
  }))
  function size(v: View) {
    const w = v.host.clientWidth, h = v.host.clientHeight
    if (!w || !h) return
    // Resizing clears the canvas (a blank frame), so only when the size really changed.
    const c = v.renderer.domElement
    if (c.width === Math.floor(w * PIXEL_RATIO) && c.height === Math.floor(h * PIXEL_RATIO)) return
    v.renderer.setSize(w, h, false)
    v.cam.aspect = w / h; v.cam.updateProjectionMatrix()
  }
  function draw(ch: Character) {
    const v = ch.view
    if (!v) return
    ch.holder.rotation.y = ch.yaw
    v.renderer.render(v.scene, v.cam)
    ch.dirty = false
  }
  function mount(ch: Character, host: HTMLElement) {
    if (ch.view?.host === host) return
    if (ch.view) unmount(ch)
    let renderer: T.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) } catch (err) { console.warn('[swimmer] no canvas for this card', err); return }
    renderer.setPixelRatio(PIXEL_RATIO)
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    const { scene, cam } = makeScene()
    scene.add(ch.holder)
    ch.view = { renderer, scene, cam, host }
    host.appendChild(renderer.domElement)
    ro.observe(host); io.observe(host)
    size(ch.view)
    draw(ch)
    later(ch)
  }
  /* The swimmer's outline for the grab boxes costs a little CPU work; do it
     while the phone is idle after loading or dressing, never at the moment a
     card arrives (owner, 2026-10-30: the card jerked on arrival). */
  const idle: (f: () => void) => void = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback
    ? f => (window as unknown as { requestIdleCallback: (f: () => void, o?: object) => void }).requestIdleCallback(f, { timeout: 1500 })
    : f => { window.setTimeout(f, 300) }
  function later(ch: Character) { idle(() => { if (!ch.bands && chars.has(ch)) measure(ch) }) }
  function unmount(ch: Character) {
    const v = ch.view
    if (!v) return
    ro.unobserve(v.host); io.unobserve(v.host); visible.delete(v.host)
    v.scene.remove(ch.holder)
    v.renderer.domElement.remove(); v.renderer.dispose(); v.renderer.forceContextLoss()
    ch.view = undefined
  }

  function make(look: SwimmerLook): Character {
    const obj = cloneSkinned(base.scene)
    const mats: Character['mats'] = {}
    const parts: Character['parts'] = {}
    obj.traverse(o => {
      const mesh = o as T.Mesh
      if (mesh.isMesh) {
        mesh.frustumCulled = false
        // Each swimmer has its own materials, so colours never leak between cards.
        const m = (mesh.material as T.MeshStandardMaterial).clone()
        if (m.transparent) m.depthWrite = false
        mesh.material = m
        ;(mats[m.name] = mats[m.name] || []).push(m)
      }
      if (OPTIONAL.includes(o.name)) parts[o.name] = o
    })
    const holder = new THREE.Group(); holder.add(obj); holder.position.y = STAND_Y
    const mixer = new THREE.AnimationMixer(obj)
    if (idleClip) { mixer.clipAction(idleClip).play(); mixer.update(0.35) }
    const ch: Character = { holder, mats, parts, mixer, yaw: REST_YAW, vel: 0 }
    dress(ch, look)
    chars.add(ch)
    return ch
  }

  function dress(ch: Character, look: SwimmerLook) {
    ch.bands = undefined   // a new hairstyle or fins change the outline
    ch.dirty = true
    if (ch.view) later(ch)
    const on = new Set<string>()
    if (look.cap) on.add('Cap'); else HAIR_PARTS[look.hair].forEach(p => on.add(p))
    on.add(SUIT_PARTS[look.suit])
    if (look.goggles === 'eyes') { on.add('GogglesEyes'); on.add('GogglesEyesLens') }
    if (look.goggles === 'forehead') { on.add('GogglesUp'); on.add('GogglesUpLens') }
    if (look.fins) on.add('Fins')
    if (look.gender === 'girl') on.add('Lashes')
    for (const [n, o] of Object.entries(ch.parts)) o.visible = on.has(n)
    const paint = (name: string, hex: string) => (ch.mats[name] || []).forEach(m => m.color.set(hex))
    paint('Skin', look.skin); paint('Hair', look.hairColor); paint('Suit', look.suitColor); paint('HairTie', look.suitColor)
    paint('Goggle', look.goggleColor); paint('Cap', look.capColor); paint('Fin', look.finColor)
    paint('EarInner', '#' + new THREE.Color(look.skin).multiplyScalar(0.9).getHexString())
  }

  /* Where the swimmer is on screen, for the invisible grab boxes that let a
     finger turn it (anywhere else on the card scrolls). Worked out once per
     look from the posed body -- every 6th vertex, skinned on the CPU, at
     rest, never during a gesture -- as three height bands (head, body, legs),
     each a cylinder round the turning axis so the box fits whatever way the
     swimmer faces. */
  const v3 = new THREE.Vector3()
  function measure(ch: Character) {
    ch.holder.updateMatrixWorld(true)
    const hx = ch.holder.position.x, hz = ch.holder.position.z, hy = ch.holder.position.y
    const pts: [number, number][] = []
    ch.holder.traverseVisible(o => {
      const m = o as T.SkinnedMesh
      if (!m.isMesh || !m.geometry?.attributes?.position) return
      const n = m.geometry.attributes.position.count
      for (let i = 0; i < n; i += 6) {
        if (m.isSkinnedMesh) m.getVertexPosition(i, v3); else v3.fromBufferAttribute(m.geometry.attributes.position, i)
        v3.applyMatrix4(m.matrixWorld)
        pts.push([v3.y - hy, Math.hypot(v3.x - hx, v3.z - hz)])
      }
    })
    if (!pts.length) { ch.bands = []; return }
    let lo = Infinity, hi = -Infinity
    for (const [y] of pts) { lo = Math.min(lo, y); hi = Math.max(hi, y) }
    const cuts = [lo, lo + (hi - lo) * 0.38, lo + (hi - lo) * 0.62, hi]   // legs | body | head
    ch.bands = [0, 1, 2].map(k => {
      let r = 0
      for (const [y, d] of pts) if (y >= cuts[k] && y <= cuts[k + 1]) r = Math.max(r, d)
      return { y0: cuts[k], y1: cuts[k + 1], r }
    })
  }
  function swimmerBoxes() {
    const v = active?.view
    if (!active || !v) return []
    if (!active.bands) measure(active)
    const w = v.host.clientWidth, h = v.host.clientHeight
    if (!w || !h) return []
    const hp = active.holder.position
    const PAD = 8
    return (active.bands || []).filter(b => b.r > 0).map(b => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const yy of [b.y0, b.y1]) {
        v3.set(hp.x + sx * b.r, hp.y + yy, hp.z + sz * b.r).project(v.cam)
        const px = (v3.x + 1) / 2 * w, py = (1 - v3.y) / 2 * h
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
      }
      return { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 }
    })
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    const nowMs = performance.now()
    const dt = Math.min((nowMs - last) / 1000, 0.05)
    last = nowMs
    if (!visible.size || document.hidden) return
    // A swimmer that was dressed gets its one new frame, wherever it is.
    for (const ch of chars) if (ch.dirty && ch !== active) draw(ch)
    const a = active
    if (!a?.view) return
    if (moving && !dragging) { if (a.dirty) draw(a); return }
    if (!dragging) { a.yaw += a.vel * dt; a.vel *= Math.pow(0.01, dt) }
    const busy = dragging || Math.abs(a.vel) > 0.01
    frame++
    if (!busy && !a.dirty && frame % 2) return            // breathing only: 30 a second
    ripple.offset.set((nowMs / 9000) % 1, (nowMs / 13000) % 1)
    if (!still) a.mixer.update(busy ? dt : dt * 2)
    draw(a)
  }
  raf = requestAnimationFrame(loop)

  return {
    make, dress, mount, unmount, swimmerBoxes,
    setActive(ch) { if (active && active !== ch) active.vel = 0; active = ch },
    setMoving(on) { moving = on },
    spin(dx) {
      if (!active) return
      const now = performance.now()
      const most = SWIMMER_MAX_PER_S * Math.max(1, Math.min(100, now - spunAt)) / 1000
      active.yaw += Math.max(-most, Math.min(most, dx * SWIMMER_PER_PX)); spunAt = now
    },
    fling(v) { if (active) active.vel = Math.max(-SWIMMER_FLING_MAX, Math.min(SWIMMER_FLING_MAX, v * 5)) },
    setDragging(on) { dragging = on; if (on) { if (active) active.vel = 0; spunAt = performance.now() } },
    dispose() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect()
      for (const ch of chars) unmount(ch)
      chars.clear()
    },
  }
}
