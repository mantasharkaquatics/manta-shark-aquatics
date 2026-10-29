/* The 3D swimmers on the app's home (owner, 2026-10-29).
 *
 * Every swimmer in the family stands on ONE turntable -- a little square pool
 * with lane ropes -- in a single canvas above the student card. Dragging on
 * the swimmer in front turns that swimmer; dragging anywhere else turns the
 * pool and brings the next swimmer to the front (owner, after one swimmer per
 * card). Both turn slowly on purpose (owner: the table "a bit fast", the
 * swimmer "not fast", then "a little faster").
 *
 * One model file (public/3d/swimmer-v1.glb, built in Blender by
 * scripts/swimmer/swimmer.py) holds the body and every swappable part -- hair
 * styles, suits, goggles, cap, fins -- skinned to one skeleton. A swimmer is a
 * copy of it with the parts it wears shown and its own colours.
 *
 * Nothing is drawn while the stage is off screen or the app is in the
 * background, and while nothing moves only the slow breathing is drawn, 30
 * times a second.
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

/* How things turn. Radians per pixel of finger, and the most a swimmer turns
   in a second however fast the finger goes. */
const TABLE_PER_PX = 0.0045
const SWIMMER_PER_PX = 0.0085
const SWIMMER_MAX_PER_S = 3.0
const SWIMMER_FLING_MAX = 1.1

export interface Engine {
  /** The swimmers on the table, in card order; reuses the ones it already has. */
  setSwimmers(list: { id: string; look: SwimmerLook }[]): void
  dress(id: string, look: SwimmerLook): void
  /** Bring this swimmer (by position in the list) to the front. */
  goTo(index: number): void
  /** Put the canvas in this element and listen to fingers on it (null takes it out). */
  attach(host: HTMLElement | null): void
  dispose(): void
}

const glOk = () => {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

export async function createEngine(opts: {
  /** Called when a different swimmer comes to the front (by the table being turned or tapped). */
  onIndex: (i: number) => void
  /** Called the first time a finger turns anything (to fade the hint). */
  onTouched?: () => void
}): Promise<Engine | null> {
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
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfe0ec', 2.3))
  const key = new THREE.DirectionalLight('#fff4e6', 2.1); key.position.set(2.5, 5, 4); scene.add(key)
  const fill = new THREE.DirectionalLight('#fff8f0', 1.1); fill.position.set(-0.6, 1.5, 6); scene.add(fill)
  const back = new THREE.DirectionalLight('#bfe6ff', 1.6); back.position.set(-3, 2.5, -3); scene.add(back)

  /* ---------- the pool (owner: square is fine, with lane ropes) ----------
     It all turns together, so a rope never runs through a swimmer. Faces that
     share a plane flicker as it turns (owner saw the blue edge flicker): every
     piece sits a little above or outside the one under it. */
  const table = new THREE.Group(); scene.add(table)
  const DECK = 2.35, WATER = 2.0, FLOOR = -0.42, SURFACE = -0.03
  const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, rough = 0.6) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color, rough)); m.position.set(x, y, z); table.add(m); return m
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
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WATER * 2, WATER * 2),
    new THREE.MeshStandardMaterial({ color: '#33aee4', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.62, depthWrite: false }))
  water.rotation.x = -Math.PI / 2; water.position.y = SURFACE; table.add(water)
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(WATER * 2, WATER * 2), new THREE.MeshBasicMaterial({ map: ripple, transparent: true, opacity: 0.55, depthWrite: false }))
  sheen.rotation.x = -Math.PI / 2; sheen.position.y = SURFACE + 0.002; table.add(sheen)
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
      table.add(im)
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
      tube.position.set(1.35 + dx, 0, -WATER + 0.12); tube.rotation.y = Math.PI; table.add(tube)
    }
  }
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62)
    g.addColorStop(0, 'rgba(18,37,74,0.35)'); g.addColorStop(1, 'rgba(18,37,74,0)')
    x.fillStyle = g; x.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  })()

  /* ---------- swimmers ---------- */
  interface Swimmer { id: string; key: string; holder: T.Group; spot: T.Group; mats: Record<string, T.MeshStandardMaterial[]>; parts: Record<string, T.Object3D>; mixer: T.AnimationMixer; spin: number; vel: number }
  let swimmers: Swimmer[] = []
  const cache = new Map<string, Swimmer>()

  function make(id: string, look: SwimmerLook): Swimmer {
    const obj = cloneSkinned(base.scene)
    const mats: Swimmer['mats'] = {}
    const parts: Swimmer['parts'] = {}
    obj.traverse(o => {
      const mesh = o as T.Mesh
      if (mesh.isMesh) {
        mesh.frustumCulled = false
        // Each swimmer has its own materials, so colours never leak between them.
        const m = (mesh.material as T.MeshStandardMaterial).clone()
        if (m.transparent) m.depthWrite = false
        mesh.material = m
        ;(mats[m.name] = mats[m.name] || []).push(m)
      }
      if (OPTIONAL.includes(o.name)) parts[o.name] = o
    })
    const holder = new THREE.Group(); holder.add(obj)
    const mixer = new THREE.AnimationMixer(obj)
    if (idleClip) { const a = mixer.clipAction(idleClip); a.play(); a.time = (id.charCodeAt(0) % 10) / 10 * idleClip.duration }
    const spot = new THREE.Group()
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }))
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.104
    spot.add(sh, holder)
    const s: Swimmer = { id, key: '', holder, spot, mats, parts, mixer, spin: 0, vel: 0 }
    paint(s, look)
    return s
  }
  function paint(s: Swimmer, look: SwimmerLook) {
    const on = new Set<string>()
    if (look.cap) on.add('Cap'); else HAIR_PARTS[look.hair].forEach(p => on.add(p))
    on.add(SUIT_PARTS[look.suit])
    if (look.goggles === 'eyes') { on.add('GogglesEyes'); on.add('GogglesEyesLens') }
    if (look.goggles === 'forehead') { on.add('GogglesUp'); on.add('GogglesUpLens') }
    if (look.fins) on.add('Fins')
    if (look.gender === 'girl') on.add('Lashes')
    for (const [n, o] of Object.entries(s.parts)) o.visible = on.has(n)
    const c = (name: string, hex: string) => (s.mats[name] || []).forEach(m => m.color.set(hex))
    c('Skin', look.skin); c('Hair', look.hairColor); c('Suit', look.suitColor); c('HairTie', look.suitColor)
    c('Goggle', look.goggleColor); c('Cap', look.capColor); c('Fin', look.finColor)
    c('EarInner', '#' + new THREE.Color(look.skin).multiplyScalar(0.9).getHexString())
    s.key = JSON.stringify(look)
    wake()
  }

  /* ---------- layout and camera ---------- */
  const camera = new THREE.PerspectiveCamera(30, 1, 2, 40)   // a tight depth range keeps close faces from flickering
  let R = 0, step = 0
  let angle = 0, target = 0, idx = 0

  function layout() {
    const n = swimmers.length
    // One swimmer: in the middle. Two or more: round the pool, an even share each.
    R = n <= 1 ? 0 : 1.7
    step = n <= 1 ? 0 : (n === 2 ? Math.PI * 0.7 : Math.PI * 2 / n)
    swimmers.forEach((s, i) => {
      const a = -i * step
      s.spot.position.set(Math.sin(a) * R, SURFACE - 0.1, Math.cos(a) * R)   // ankle-deep
      if (s.spot.parent !== table) table.add(s.spot)
    })
    if (n <= 1) { camera.position.set(0, 3.2, 11.4); camera.lookAt(0, 0.7, 0) }
    else { camera.position.set(0, 3.5, 12.8); camera.lookAt(0, 0.8, -0.3) }
    idx = Math.min(idx, Math.max(0, n - 1))
    angle = target = idx * step
    wake()
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5))
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y'
  let host: HTMLElement | null = null
  let onScreen = true
  const io = new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); wake() })
  const ro = new ResizeObserver(() => size())
  function size() {
    if (!host) return
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h; camera.updateProjectionMatrix()
    wake()
  }

  /* ---------- fingers ---------- */
  const norm = (i: number) => { const n = swimmers.length || 1; return ((i % n) + n) % n }
  let drag: null | { mode: 'spin' | 'table'; x: number; y: number; last: number; t: number; v: number; start: number; moved: boolean; id: number; prevX: number; prevT: number } = null
  let touched = false

  /** Is this screen point on the swimmer in front (its outline, a finger's width round it)? */
  function onFront(x: number, y: number) {
    const s = swimmers[idx]; if (!s || !host) return false
    const r = host.getBoundingClientRect()
    const bb = new THREE.Box3().setFromObject(s.holder)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
      const v = new THREE.Vector3(cx, cy, cz).project(camera)
      const sx = (v.x + 1) / 2 * r.width + r.left, sy = (1 - v.y) / 2 * r.height + r.top
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy)
    }
    // A turned figure's box is wide; keep the middle part, the body itself.
    const mid = (x0 + x1) / 2, half = Math.min((x1 - x0) / 2, r.width * 0.2)
    return x > mid - half - 10 && x < mid + half + 10 && y > y0 - 10 && y < y1 - (y1 - y0) * 0.05
  }
  function pick(x: number, y: number) {
    if (!host) return -1
    const r = host.getBoundingClientRect()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera)
    const hit = ray.intersectObjects(swimmers.map(s => s.holder), true)[0]
    if (!hit) return -1
    return swimmers.findIndex(s => { let o: T.Object3D | null = hit.object; while (o) { if (o === s.holder) return true; o = o.parent } return false })
  }
  function setIdx(i: number) {
    if (i === idx) return
    idx = i
    opts.onIndex(i)
  }
  function turnTo(k: number) { target = k * step; setIdx(norm(k)); wake() }
  function goTo(i: number) {
    if (swimmers.length < 2) return
    // The shorter way round.
    const cur = Math.round(target / step)
    let best = cur, bestD = Infinity
    for (let k = cur - swimmers.length; k <= cur + swimmers.length; k++) if (norm(k) === i && Math.abs(k - cur) < bestD) { best = k; bestD = Math.abs(k - cur) }
    turnTo(best)
  }

  const onDown = (e: PointerEvent) => {
    const mode = onFront(e.clientX, e.clientY) ? 'spin' : 'table'
    drag = { mode, x: e.clientX, y: e.clientY, last: e.clientX, t: performance.now(), v: 0, start: angle, moved: false, id: e.pointerId, prevX: e.clientX, prevT: performance.now() }
    if (mode === 'spin' && swimmers[idx]) swimmers[idx].vel = 0
  }
  const onMove = (e: PointerEvent) => {
    const d = drag
    if (!d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return }   // the page is being scrolled
      d.moved = true
      host?.setPointerCapture?.(e.pointerId)
      if (!touched) { touched = true; opts.onTouched?.() }
    }
    const now = performance.now()
    d.v = (e.clientX - d.last) / Math.max(1, now - d.t); d.last = e.clientX; d.t = now
    if (d.mode === 'spin') {
      const s = swimmers[idx]
      if (s) {
        const most = SWIMMER_MAX_PER_S * Math.max(1, now - d.prevT) / 1000
        s.spin += Math.max(-most, Math.min(most, (e.clientX - d.prevX) * SWIMMER_PER_PX))
        s.vel = Math.max(-SWIMMER_FLING_MAX, Math.min(SWIMMER_FLING_MAX, d.v * 5))
      }
      d.prevX = e.clientX; d.prevT = now
    } else if (swimmers.length > 1) {
      angle = d.start - dx * TABLE_PER_PX; target = angle
    }
    wake()
  }
  const onUp = (e: PointerEvent) => {
    const d = drag
    if (!d || e.pointerId !== d.id) return
    drag = null
    if (d.mode === 'spin' && d.moved) return              // the swimmer turns on a little, then slows
    if (swimmers.length < 2) return
    if (d.moved) {
      // One swimmer per swipe: a fifth of the way round, or a flick, is enough.
      const from = Math.round(d.start / step)
      const frac = (angle - from * step) / step
      let to = from
      if (frac > 0.2 || d.v < -0.3) to = from + 1
      else if (frac < -0.2 || d.v > 0.3) to = from - 1
      turnTo(to)
    } else {
      // A tap on a swimmer at the back brings them to the front.
      const i = pick(e.clientX, e.clientY)
      if (i >= 0 && i !== idx) goTo(i)
    }
  }
  const listen = (el: HTMLElement, on: boolean) => {
    const f = on ? el.addEventListener.bind(el) : el.removeEventListener.bind(el)
    f('pointerdown', onDown as EventListener); f('pointermove', onMove as EventListener)
    f('pointerup', onUp as EventListener); f('pointercancel', onUp as EventListener)
  }

  /* ---------- drawing ---------- */
  let raf = 0, last = performance.now(), frame = 0, awake = 0
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  function wake() { awake = performance.now() + 400 }
  function faceCamera() {
    const p = new THREE.Vector3()
    swimmers.forEach((s, i) => {
      s.spot.getWorldPosition(p)
      const want = Math.atan2(camera.position.x - p.x, camera.position.z - p.z) - table.rotation.y
      s.holder.rotation.y = want * 0.85 + s.spin
      // The one in front a touch bigger, so it reads as the one the card is about.
      s.holder.scale.setScalar(R ? 0.92 + 0.12 * Math.max(0, p.z) / R : 1)
      if (i !== idx || !(drag && drag.mode === 'spin')) {
        if (i === idx) { s.spin += s.vel * dtNow; s.vel *= Math.pow(0.01, dtNow) }
        else { s.spin = Math.atan2(Math.sin(s.spin), Math.cos(s.spin)) * Math.pow(0.02, dtNow); s.vel = 0 }
      }
    })
  }
  let dtNow = 0
  function loop() {
    raf = requestAnimationFrame(loop)
    const now = performance.now()
    dtNow = Math.min((now - last) / 1000, 0.05); last = now
    if (!host || !onScreen || document.hidden || !swimmers.length) return
    const moving = !!drag || Math.abs(target - angle) > 0.0005 || swimmers.some(s => Math.abs(s.vel) > 0.01 || (Math.abs(s.spin) > 0.002 && s !== swimmers[idx])) || now < awake
    frame++
    if (!moving && frame % 2) return                        // breathing only: 30 a second
    const dt = moving ? dtNow : dtNow * 2
    if (!drag) angle += (target - angle) * Math.min(1, dt * 3.5)
    table.rotation.y = angle
    ripple.offset.set((now / 9000) % 1, (now / 13000) % 1)
    dtNow = dt
    faceCamera()
    if (!still) swimmers.forEach(s => s.mixer.update(dt))
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(loop)

  return {
    setSwimmers(list) {
      const keep = new Set(list.map(l => l.id))
      for (const s of swimmers) if (!keep.has(s.id)) table.remove(s.spot)
      swimmers = list.map(({ id, look }) => {
        let s = cache.get(id)
        if (!s) { s = make(id, look); cache.set(id, s) }
        else if (s.key !== JSON.stringify(look)) paint(s, look)
        return s
      })
      layout()
    },
    dress(id, look) { const s = cache.get(id); if (s) paint(s, look) },
    goTo,
    attach(el) {
      if (el === host) return
      if (host) { listen(host, false); ro.unobserve(host); io.unobserve(host) }
      host = el
      if (!el) { renderer.domElement.remove(); return }
      el.prepend(renderer.domElement)
      listen(el, true); ro.observe(el); io.observe(el)
      size()
    },
    dispose() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect()
      if (host) listen(host, false)
      renderer.domElement.remove(); renderer.dispose(); renderer.forceContextLoss()
    },
  }
}
