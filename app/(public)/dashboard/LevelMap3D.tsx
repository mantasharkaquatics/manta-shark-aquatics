'use client'

/*
 * The learning map's 3D overview, families only (owner, 2026-10-26: the
 * learning map goes 3D; of five versions shown he picked "E", the minimal
 * staircase). Coaches and the admin curriculum page keep the 2D tree.
 *
 * Seven white steps climb left to right, one per level, each with its number
 * and name printed on the front. Finished levels are amber; the swimmer's
 * level is blue, with three tiles on its top for the stages (earned = amber,
 * the one under way = light blue) and the school's little mascot hovering
 * over it. A fixed camera, no turning: it reads like a chart.
 *
 * Tapping a step picks that level and the existing skill list below shows it.
 * Each step also has a real button laid over its front face, so a keyboard or
 * a screen reader reaches the levels too.
 *
 * Loaded only when the map is opened (next/dynamic in SkillTree), so three.js
 * never weighs on the dashboard itself. No WebGL -> onReady(false) and the map
 * keeps its level tabs. Reduced motion -> a still picture.
 */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type Props = {
  currentLevel: number
  /** stagesDone[level - 1][stage - 1]: that stage is earned. */
  stagesDone: boolean[][]
  selected: number
  onPick: (level: number) => void
  onReady: (ok: boolean) => void
  /** The level's name, in the reader's language. */
  levelName: (level: number) => string
  /** "L3", for the buttons' accessible names. */
  levelTag: (level: number) => string
  meLabel: string
  ariaLabel: string
  hint: string
}

const C = { navy: 0x12254a, blue: 0x2050a0, amber: 0xf09800 }
const N = 7
const SW = 1.25, SD = 1.6
const stepH = (lv: number) => 0.8 + 0.28 * (lv - 1)
/* The page's own font stack (next/font gives the faces generated names, so it
   is read off the page rather than written here). */
let FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif'
let ANISO = 4

/* The front of a step: its number and name, drawn at the face's own aspect so
   the letters are not stretched, shrunk or wrapped to fit the width. */
function faceTexture(tag: string, name: string, h: number, bg: string, ink: string) {
  /* Drawn at 1.6x and scaled down, so the letters stay sharp on a phone's
     dense screen (owner, 2026-10-26: blurry). */
  const K = 1.6, W = 320, H = Math.round(W * h / (SW - 0.06))
  const c = document.createElement('canvas'); c.width = W * K; c.height = H * K
  const g = c.getContext('2d')!
  g.scale(K, K)
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `800 84px ${FONT}`
  g.fillText(tag, W / 2, 64)
  let size = 58
  const fit = (s: string) => { g.font = `700 ${size}px ${FONT}`; return g.measureText(s).width <= W - 34 }
  let lines = [name]
  if (!fit(name) && name.includes(' ')) {
    const words = name.split(' '), half = Math.ceil(words.length / 2)
    lines = [words.slice(0, half).join(' '), words.slice(half).join(' ')]
  }
  // Narrow enough for the face, and short enough for the shortest step.
  const tall = () => 140 + (lines.length - 1) * (size + 8) + size / 2 <= H - 6
  while (size > 26 && (!lines.every(fit) || !tall())) size -= 2
  g.font = `700 ${size}px ${FONT}`
  lines.forEach((l, i) => g.fillText(l, W / 2, 140 + i * (size + 8)))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = ANISO
  return t
}

/* The mascot, after the logo: a blue manta body with a shark's head, an amber
   dorsal fin and a white belly with amber spots. Drawn from code. */
function makeMascot() {
  const group = new THREE.Group()
  const NU = 40, NV = 16, SPAN = 1.9
  const lead = (u: number) => -0.62 + 0.62 * Math.pow(Math.abs(u), 0.85) - 0.62 * Math.exp(-Math.pow(u / 0.16, 2))
  const trail = (u: number) => 0.78 - 0.7 * Math.pow(Math.abs(u), 0.55)
  const bulge = (x: number, v: number) => Math.exp(-Math.pow(x / 0.42, 2)) * Math.pow(Math.sin(Math.PI * v), 0.7)
  function surface(top: boolean) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    for (let j = 0; j <= NV; j++) {
      const v = j / NV
      for (let i = 0; i <= NU; i++) {
        const u = -1 + 2 * i / NU, x = u * SPAN, z = lead(u) + (trail(u) - lead(u)) * v
        pos.push(x, top ? 0.24 * bulge(x, v) + 0.02 : -0.1 * bulge(x, v) - 0.01, z)
        uv.push((x / SPAN + 1) / 2, 1 - (z + 1.3) / 2.2)
      }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1
      if (top) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx); g.computeVertexNormals()
    return { g, base: Float32Array.from(pos) }
  }
  const top = surface(true), bot = surface(false)
  const spots = document.createElement('canvas'); spots.width = spots.height = 128
  const sg = spots.getContext('2d')!
  sg.fillStyle = '#f4f8ff'; sg.fillRect(0, 0, 128, 128)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  sg.fillStyle = '#f09800'
  for (let i = 0; i < 22; i++) { sg.beginPath(); sg.arc(35 + rnd() * 60, 30 + rnd() * 70, 1.5 + rnd() * 3, 0, Math.PI * 2); sg.fill() }
  const belly = new THREE.CanvasTexture(spots); belly.colorSpace = THREE.SRGBColorSpace
  const back = new THREE.Mesh(top.g, new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.42 }))
  back.castShadow = true
  group.add(back, new THREE.Mesh(bot.g, new THREE.MeshStandardMaterial({ map: belly, roughness: 0.6 })))
  const fs = new THREE.Shape()
  fs.moveTo(-0.32, 0); fs.quadraticCurveTo(-0.05, 0.12, 0.12, 0.62); fs.quadraticCurveTo(0.14, 0.25, 0.38, 0); fs.lineTo(-0.32, 0)
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(fs, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }),
    new THREE.MeshStandardMaterial({ color: C.amber, roughness: 0.45 }))
  fin.rotation.y = -Math.PI / 2; fin.position.set(0.025, 0.2, 0.05); fin.castShadow = true
  group.add(fin)
  const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
  const eyeP = new THREE.MeshStandardMaterial({ color: 0x0b1530, roughness: 0.2 })
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), eyeW); e.position.set(s * 0.17, 0.14, -0.82); group.add(e)
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), eyeP); p.position.set(s * 0.2, 0.16, -0.86); group.add(p)
  }
  const TN = 16
  const tailPts = Array.from({ length: TN + 1 }, (_, i) => new THREE.Vector3(0, 0, 0.7 + i * 0.07))
  const tailCurve = new THREE.CatmullRomCurve3(tailPts)
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 20, 0.028, 6), new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.5 }))
  group.add(tail)
  function flap(t: number, amp: number) {
    for (const s of [top, bot]) {
      const p = s.g.attributes.position.array as Float32Array
      for (let k = 0; k < p.length; k += 3) {
        const ax = Math.abs(s.base[k]) / SPAN
        p[k + 1] = s.base[k + 1] + amp * Math.pow(ax, 1.5) * Math.sin(t * 2.6 - ax * 2.2 - s.base[k + 2] * 0.9)
      }
      s.g.attributes.position.needsUpdate = true
      s.g.computeVertexNormals()
    }
    for (let i = 0; i <= TN; i++) {
      const k = i / TN
      tailPts[i].x = Math.sin(t * 2.6 - k * 4) * 0.12 * k
      tailPts[i].y = Math.cos(t * 2.6 - k * 4) * 0.05 * k
    }
    tail.geometry.dispose()
    tail.geometry = new THREE.TubeGeometry(tailCurve, 20, 0.028, 6)
  }
  flap(0, 0.28)
  return { group, flap }
}

export default function LevelMap3D({ currentLevel, stagesDone, selected, onPick, onReady, levelName, levelTag, meLabel, ariaLabel, hint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
  const meRef = useRef<HTMLDivElement | null>(null)
  const selRef = useRef(selected)
  const pickRef = useRef(onPick)
  const nameRef = useRef(levelName)
  const [ok, setOk] = useState(true)
  // A still picture (reduced motion) is redrawn when the pick changes.
  const redrawRef = useRef<(() => void) | null>(null)

  useEffect(() => { pickRef.current = onPick }, [onPick])
  useEffect(() => { nameRef.current = levelName }, [levelName])
  useEffect(() => { selRef.current = selected }, [selected])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      const id = setTimeout(() => { setOk(false); onReady(false) }, 0)
      return () => clearTimeout(id)
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pageFont = getComputedStyle(canvas).fontFamily
    if (pageFont) FONT = pageFont
    ANISO = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 4)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.set(-6.5, 7.2, 10)
    camera.lookAt(0.3, 1.45, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d6e6, 2.4))
    const sun = new THREE.DirectionalLight(0xffffff, 2.6)
    sun.position.set(-4, 10, 8)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 })
    sun.shadow.bias = -0.0005
    scene.add(sun)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.12 }))
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true
    scene.add(ground)

    type Step = { mesh: THREE.Mesh; x: number; h: number; tiles: THREE.Mesh[]; edge: THREE.LineSegments }
    const steps: Step[] = []
    for (let lv = 1; lv <= N; lv++) {
      const done = lv < currentLevel, cur = lv === currentLevel, h = stepH(lv), x = (lv - 4) * SW
      const ink = done ? '#6b4300' : cur ? '#ffffff' : '#56647d'
      const front = new THREE.MeshStandardMaterial({
        map: faceTexture(`L${lv}`, nameRef.current(lv), h, done ? '#f6c25a' : cur ? '#2050a0' : '#f3f6fb', ink), roughness: 0.7 })
      const side = new THREE.MeshStandardMaterial({ color: done ? 0xe7aa3c : cur ? 0x1a4386 : 0xdde4ee, roughness: 0.7 })
      const topM = new THREE.MeshStandardMaterial({ color: done ? C.amber : cur ? 0xffffff : 0xfafbfd, roughness: 0.55 })
      const geo = new THREE.BoxGeometry(SW - 0.06, h, SD)
      const mesh = new THREE.Mesh(geo, [side, side, topM, side, front, side])
      mesh.position.set(x, h / 2, 0)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.userData.level = lv
      scene.add(mesh)
      // the picked step's outline
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: C.navy }))
      edge.visible = false
      mesh.add(edge)
      const tiles: THREE.Mesh[] = []
      if (cur) for (let st = 1; st <= 3; st++) {
        const got = !!stagesDone[lv - 1]?.[st - 1]
        const now = !got && (st === 1 || !!stagesDone[lv - 1]?.[st - 2])
        const tile = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, SD * 0.6),
          new THREE.MeshStandardMaterial({ color: got ? C.amber : now ? 0x9fc6ff : 0xdbe4ef, roughness: 0.4 }))
        tile.castShadow = true
        scene.add(tile); tiles.push(tile)
      }
      steps.push({ mesh, x, h, tiles, edge })
    }

    const mascot = makeMascot()
    mascot.group.scale.setScalar(0.36)
    scene.add(mascot.group)
    const cs = steps[Math.min(Math.max(currentLevel, 1), N) - 1]

    let hover = -1
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const meshes = steps.map(s => s.mesh)
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const h = ray.intersectObjects(meshes, false)[0]
      return h ? (h.object.userData.level as number) : -1
    }
    const onMove = (e: PointerEvent) => { hover = at(e); canvas.style.cursor = hover > 0 ? 'pointer' : 'default'; if (reduce) draw(0) }
    const onLeave = () => { hover = -1; if (reduce) draw(0) }
    const onClick = (e: PointerEvent) => { const lv = at(e); if (lv > 0) pickRef.current(lv) }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('click', onClick as EventListener)

    const v = new THREE.Vector3()
    const toScreen = (p: THREE.Vector3) => {
      v.copy(p).project(camera)
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight }
    }

    function draw(t: number) {
      steps.forEach((s, i) => {
        const lv = i + 1
        const lift = lv === selRef.current ? 0.14 : lv === hover ? 0.08 : 0
        const want = s.h / 2 + lift
        s.mesh.position.y += reduce ? want - s.mesh.position.y : (want - s.mesh.position.y) * 0.2
        s.edge.visible = lv === selRef.current
        s.tiles.forEach((tile, k) => tile.position.set(s.x + (k - 1) * 0.37, s.mesh.position.y + s.h / 2 + 0.03, 0))
        // the button over the step's front face
        const b = btnRefs.current[i]
        if (b) {
          const y0 = s.mesh.position.y - s.h / 2, y1 = s.mesh.position.y + s.h / 2, z = SD / 2
          const a = toScreen(new THREE.Vector3(s.x - SW / 2 + 0.03, y1, z)), c = toScreen(new THREE.Vector3(s.x + SW / 2 - 0.03, y0, z))
          b.style.transform = `translate(${Math.min(a.x, c.x)}px, ${Math.min(a.y, c.y)}px)`
          b.style.width = Math.abs(c.x - a.x) + 'px'
          b.style.height = Math.abs(c.y - a.y) + 'px'
        }
        /* On a phone the printed face is too small to read or to hit: a clear
           "L1" button sits on each step's front instead (owner, 2026-10-26). */
        const chip = chipRefs.current[i]
        if (chip) {
          const m = toScreen(new THREE.Vector3(s.x, s.mesh.position.y + s.h / 2 - 0.32, SD / 2))
          chip.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -50%)`
        }
      })
      const topY = cs.mesh.position.y + cs.h / 2
      mascot.group.position.set(cs.x + 0.05, topY + 0.45 + Math.sin(t * 2) * 0.06, 0.1)
      mascot.group.rotation.y = -Math.PI / 2 + Math.sin(t * 0.8) * 0.4
      mascot.flap(t * 1.2, 0.28)
      if (meRef.current) {
        const m = toScreen(new THREE.Vector3(cs.x, topY + 1.05, 0))
        // Kept inside the box: over the first step on a phone it ran off the left.
        const half = meRef.current.offsetWidth / 2 + 6
        const mx = Math.min(Math.max(m.x, half), canvas!.clientWidth - half)
        meRef.current.style.transform = `translate(${mx}px, ${m.y}px) translate(-50%, -100%)`
      }
      renderer.render(scene, camera)
    }

    let clockT = 0
    function resize() {
      const w = canvas!.clientWidth, h = canvas!.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      const aspect = w / h
      /* Fit the whole staircase -- and the room above the swimmer's step for
         the mascot and its label -- whatever the box's shape: every corner is
         taken into the camera's view, and the frame is set round them with a
         margin, centred. A fixed zoom cut the first step off on a box a
         little narrower than the one it was tuned on. */
      camera.updateMatrixWorld()
      const inv = camera.matrixWorldInverse
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      const take = (x: number, y: number, z: number) => {
        const q = new THREE.Vector3(x, y, z).applyMatrix4(inv)
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
      }
      steps.forEach(st => {
        for (const dx of [-SW / 2, SW / 2]) for (const dz of [-SD / 2, SD / 2]) { take(st.x + dx, 0, dz); take(st.x + dx, st.h + 0.15, dz) }
      })
      take(cs.x, cs.h + 1.6, 0)
      const mx = (x1 - x0) * 0.06, my = (y1 - y0) * 0.08
      x0 -= mx; x1 += mx; y0 -= my; y1 += my
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
      let hw = (x1 - x0) / 2, hh = (y1 - y0) / 2
      if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect
      camera.left = cx - hw; camera.right = cx + hw; camera.top = cy + hh; camera.bottom = cy - hh
      camera.updateProjectionMatrix()
      draw(clockT)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    let visible = true
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting })
    io.observe(canvas)
    const clock = new THREE.Clock()
    let raf = 0
    function loop() {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(clock.getDelta(), 0.05)
      if (!visible) return
      clockT += dt
      draw(clockT)
    }
    if (!reduce) loop()
    redrawRef.current = () => draw(clockT)
    onReady(true)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick as EventListener)
      redrawRef.current = null
      scene.traverse(o => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        const list = Array.isArray(mat) ? mat : mat ? [mat] : []
        list.forEach(x => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose() })
      })
      renderer.dispose()
    }
    // Built once per swimmer and level state; the picked level is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, JSON.stringify(stagesDone)])

  useEffect(() => { redrawRef.current?.() }, [selected])

  if (!ok) return null
  return (
    <div className="mst3d">
      <style dangerouslySetInnerHTML={{ __html: MAP3D_CSS }} />
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
      <div className="mst3d-layer">
        {Array.from({ length: N }, (_, i) => (
          <button key={i} type="button" ref={el => { btnRefs.current[i] = el }}
            className="tap-auto mst3d-step" aria-pressed={i + 1 === selected}
            aria-label={`${levelTag(i + 1)} ${levelName(i + 1)}`} onClick={() => onPick(i + 1)} />
        ))}
        {Array.from({ length: N }, (_, i) => {
          const lv = i + 1
          return (
            <button key={'c' + i} type="button" ref={el => { chipRefs.current[i] = el }} tabIndex={-1} aria-hidden="true"
              className={'tap-auto mst3d-chip' + (lv < currentLevel ? ' done' : lv === currentLevel ? ' cur' : '') + (lv === selected ? ' sel' : '')}
              onClick={() => onPick(lv)}>
              {levelTag(lv)}
            </button>
          )
        })}
        <div ref={meRef} className="mst3d-me" aria-hidden="true">{meLabel}</div>
      </div>
      <p className="mst3d-hint">{hint}</p>
    </div>
  )
}

const MAP3D_CSS = `
.mst3d { position: relative; height: 340px; margin: 12px 20px 0; border-radius: 14px; overflow: hidden;
  border: 1px solid #e3ebf6; background: linear-gradient(180deg, #ffffff 0%, #f1f5fa 100%) }
.mst3d canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: pan-y }
.mst3d-layer { position: absolute; inset: 0; pointer-events: none }
.mst3d-step { position: absolute; left: 0; top: 0; min-height: 0; min-width: 0; padding: 0; margin: 0; border: 0;
  background: transparent; cursor: pointer; pointer-events: auto; border-radius: 4px; will-change: transform }
.mst3d-step:focus-visible { outline: 3px solid #f7b733; outline-offset: 2px }
.mst3d-me { position: absolute; left: 0; top: 0; white-space: nowrap; font-size: 12.5px; font-weight: 800; padding: 5px 11px;
  border-radius: 999px; line-height: 1.2; background: #12254a; color: #fff; box-shadow: 0 4px 14px rgba(18,37,74,.25); will-change: transform }
.mst3d-hint { position: absolute; right: 10px; top: 10px; margin: 0; font-size: 11.5px; color: #56647d;
  background: rgba(255,255,255,.9); border: 1px solid #e3ebf6; border-radius: 999px; padding: 4px 10px; pointer-events: none }
.mst3d-chip { display: none }
@media (max-width: 640px) {
  .mst3d { height: clamp(150px, 25vh, 200px); flex: none; margin: 6px 14px 0 }
  .mst3d-hint { font-size: 10.5px; top: 6px; right: 6px; padding: 3px 8px }
  .mst3d-me { font-size: 11px; padding: 4px 9px; z-index: 3 }
  .mst3d-chip { display: block; position: absolute; left: 0; top: 0; z-index: 2; pointer-events: auto; cursor: pointer;
    min-width: 36px; min-height: 30px; padding: 0 6px; margin: 0; border-radius: 9px; border: 2px solid #c9d8ee;
    background: #fff; color: #12254a; font: inherit; font-size: 14px; font-weight: 800; line-height: 26px;
    box-shadow: 0 2px 6px rgba(18,37,74,.15); will-change: transform }
  .mst3d-chip.done { background: #f09800; border-color: #f09800; color: #12254a }
  .mst3d-chip.cur { background: #2050a0; border-color: #2050a0; color: #fff }
  .mst3d-chip.sel { border-color: #12254a; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #12254a }
  .mst3d-chip.cur.sel { border-color: #f7b733; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #12254a }
}
`
