/* The 3D swimmer on the app's home cards (owner, 2026-10-29).
 *
 * One model file (public/3d/swimmer-v1.glb, built in Blender by
 * scripts/swimmer/swimmer.py) holds the body and every swappable part -- hair
 * styles, suits, goggles, cap, fins -- skinned to one skeleton. A swimmer is a
 * copy of it with the parts it wears shown and its own colours.
 *
 * Only the centre card draws live (one WebGL canvas, moved between cards);
 * the cards beside it show a still picture from a second, hidden renderer.
 * Nothing is drawn while the cards are off screen or the app is in the
 * background, and the slow breathing is drawn 30 times a second, not 60.
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

export interface Character {
  holder: T.Group
  mats: Record<string, T.MeshStandardMaterial[]>
  parts: Record<string, T.Object3D>
  mixer: T.AnimationMixer
}

export interface Engine {
  make(look: SwimmerLook): Character
  dress(ch: Character, look: SwimmerLook): void
  snapshot(ch: Character): string
  /** Put the live canvas in this element (or take it out with null). */
  attach(host: HTMLElement | null): void
  /** The character drawn live, or none. */
  show(ch: Character | null): void
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
  /** The pool-deck platform the swimmer stands on, its lights and camera. */
  function makeScene() {
    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfe0ec', 2.3))
    const key = new THREE.DirectionalLight('#fff4e6', 2.1); key.position.set(2.5, 4, 3.5); scene.add(key)
    const fill = new THREE.DirectionalLight('#fff8f0', 1.1); fill.position.set(-0.6, 1.2, 5); scene.add(fill)
    const rim = new THREE.DirectionalLight('#bfe6ff', 1.6); rim.position.set(-3, 2.5, -3); scene.add(rim)
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.12, 64), M('#f4fbff', 0.5)); plat.position.y = -0.07; scene.add(plat)
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.975, 0.03, 10, 80), M('#2050a0', 0.4)); edge.rotation.x = Math.PI / 2; edge.position.y = -0.01; scene.add(edge)
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.05), M(i % 2 ? '#f09800' : '#ffffff', 0.5))
      tile.position.set(Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86); tile.rotation.y = -a; scene.add(tile)
    }
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }))
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.002; scene.add(sh)
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50); cam.position.set(0, 1.5, 7.1); cam.lookAt(0, 1.08, 0)
    return { scene, cam }
  }

  const live = { renderer: new THREE.WebGLRenderer({ antialias: true, alpha: true }), ...makeScene() }
  live.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5))
  live.renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  const SNAP_W = 340, SNAP_H = 300
  const snap = { renderer: new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }), ...makeScene() }
  snap.renderer.setPixelRatio(2); snap.renderer.setSize(SNAP_W, SNAP_H, false)
  snap.cam.aspect = SNAP_W / SNAP_H; snap.cam.updateProjectionMatrix()

  let current: Character | null = null
  let yaw = -0.3, vel = 0, dragging = false
  let host: HTMLElement | null = null
  let onScreen = true
  let frame = 0
  let raf = 0
  let last = performance.now()
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const io = new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting) })
  const ro = new ResizeObserver(() => size())
  function size() {
    if (!host) return
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return
    live.renderer.setSize(w, h, false)
    live.cam.aspect = w / h; live.cam.updateProjectionMatrix()
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
    const holder = new THREE.Group(); holder.add(obj)
    const mixer = new THREE.AnimationMixer(obj)
    if (idleClip) { mixer.clipAction(idleClip).play(); mixer.update(0.35) }
    const ch = { holder, mats, parts, mixer }
    dress(ch, look)
    return ch
  }

  function dress(ch: Character, look: SwimmerLook) {
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

  function snapshot(ch: Character) {
    const wasLive = current === ch
    if (wasLive) live.scene.remove(ch.holder)
    const keep = ch.holder.rotation.y
    ch.holder.rotation.y = -0.3
    snap.scene.add(ch.holder)
    snap.renderer.render(snap.scene, snap.cam)
    const url = snap.renderer.domElement.toDataURL('image/png')
    snap.scene.remove(ch.holder)
    ch.holder.rotation.y = keep
    if (wasLive) live.scene.add(ch.holder)
    return url
  }

  function attach(el: HTMLElement | null) {
    if (el === host && (!el || live.renderer.domElement.parentElement === el)) return
    if (host) { ro.unobserve(host); io.unobserve(host) }
    host = el
    if (!el) { live.renderer.domElement.remove(); return }
    el.appendChild(live.renderer.domElement)
    ro.observe(el); io.observe(el)
    size()
  }

  function show(ch: Character | null) {
    if (ch === current) return
    if (current) live.scene.remove(current.holder)
    current = ch
    if (ch) { ch.holder.rotation.y = yaw; live.scene.add(ch.holder) }
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    const nowMs = performance.now()
    const dt = Math.min((nowMs - last) / 1000, 0.05)
    last = nowMs
    if (!current || !host || !onScreen || document.hidden) return
    if (!dragging) { yaw += vel * 0.016; vel *= 0.93 }
    current.holder.rotation.y = yaw
    const busy = dragging || Math.abs(vel) > 0.002
    frame++
    if (!busy && frame % 2) return
    if (!still) current.mixer.update(busy ? dt : dt * 2)
    live.renderer.render(live.scene, live.cam)
  }
  raf = requestAnimationFrame(loop)

  return {
    make, dress, snapshot, attach, show,
    spin(dx) { yaw += dx * 0.012 },
    fling(v) { vel = v * 12 },
    setDragging(on) { dragging = on; if (on) vel = 0 },
    dispose() {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect()
      live.renderer.domElement.remove()
      live.renderer.dispose(); snap.renderer.dispose()
      live.renderer.forceContextLoss(); snap.renderer.forceContextLoss()
    },
  }
}
