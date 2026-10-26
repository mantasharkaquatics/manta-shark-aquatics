'use client'

/*
 * The learning map's 3D overview (owner, 2026-10-26: "學習地圖改成3D就好").
 * Families only -- coaches and the admin curriculum page keep the 2D tree.
 *
 * Seven platforms climb in a spiral, one per level, strung together with a
 * lane rope. Finished levels are amber, the swimmer's level is blue with the
 * school's little mascot hovering over it, levels ahead are pale. Each
 * platform carries three dots, one per stage, filled once the stage is
 * earned. Tapping a platform (or its label, which is a real button so the
 * keyboard and screen readers reach it) picks that level; the skill list
 * under the picture is the existing one from SkillTree.
 *
 * Loaded only when the map is opened (next/dynamic in SkillTree), so three.js
 * never weighs on the dashboard itself. No WebGL -> onReady(false) and the
 * map keeps its level tabs. Reduced motion -> a still picture that only
 * redraws when the reader turns it or picks a level.
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
  /** Label text for a level's button, and for the swimmer's own marker. */
  levelLabel: (level: number, short: boolean) => string
  meLabel: string
  ariaLabel: string
  hint: string
}

const C = { navy: 0x12254a, blue: 0x2050a0, amber: 0xf09800, yellow: 0xf7b733 }
const N = 7

/* The mascot, after the logo: a blue manta body with a shark's head, an amber
   dorsal fin and a white belly with amber spots. Drawn from code, no model file. */
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
        const u = -1 + 2 * i / NU
        const x = u * SPAN
        const z = lead(u) + (trail(u) - lead(u)) * v
        const y = top ? 0.24 * bulge(x, v) + 0.02 : -0.1 * bulge(x, v) - 0.01
        pos.push(x, y, z)
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

  group.add(new THREE.Mesh(top.g, new THREE.MeshStandardMaterial({ color: C.blue, roughness: 0.42 })))
  group.add(new THREE.Mesh(bot.g, new THREE.MeshStandardMaterial({ map: belly, roughness: 0.6 })))

  const fs = new THREE.Shape()
  fs.moveTo(-0.32, 0); fs.quadraticCurveTo(-0.05, 0.12, 0.12, 0.62); fs.quadraticCurveTo(0.14, 0.25, 0.38, 0); fs.lineTo(-0.32, 0)
  const fin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(fs, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }),
    new THREE.MeshStandardMaterial({ color: C.amber, roughness: 0.45 }))
  fin.rotation.y = -Math.PI / 2
  fin.position.set(0.025, 0.2, 0.05)
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
  flap(0, 0.3)
  return { group, flap }
}

export default function LevelMap3D({ currentLevel, stagesDone, selected, onPick, onReady, levelLabel, meLabel, ariaLabel, hint }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([])
  const meRef = useRef<HTMLDivElement | null>(null)
  const selRef = useRef(selected)
  const pickRef = useRef(onPick)
  const [narrow, setNarrow] = useState(false)
  const [ok, setOk] = useState(true)
  /* The scene is built once per swimmer; picking a level only turns the
     camera and moves the highlight, through these refs. */
  const api = useRef<{ face: (level: number) => void; redraw: () => void } | null>(null)

  useEffect(() => { pickRef.current = onPick }, [onPick])
  useEffect(() => {
    selRef.current = selected
    api.current?.face(selected)
  }, [selected])

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current
    if (!canvas || !wrap) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    } catch {
      const id = setTimeout(() => { setOk(false); onReady(false) }, 0)
      return () => clearTimeout(id)
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x7fb3e0, 2.2))
    const sun = new THREE.DirectionalLight(0xffffff, 2.4)
    sun.position.set(4, 10, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 })
    scene.add(sun)

    const sea = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x4aa3dc, roughness: 0.25 }))
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.02; sea.receiveShadow = true
    scene.add(sea)
    const ringGeo = new THREE.RingGeometry(0.98, 1.0, 64)
    const ripples = Array.from({ length: 4 }, () => {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }))
      r.rotation.x = -Math.PI / 2; scene.add(r); return r
    })

    const pos: THREE.Vector3[] = []
    const hit: THREE.Object3D[] = []
    for (let i = 0; i < N; i++) {
      const lv = i + 1
      const a = i * 0.95 - 0.6, r = 3.4 - i * 0.18
      const p = new THREE.Vector3(Math.cos(a) * r, 0.25 + i * 0.42, Math.sin(a) * r)
      pos.push(p)
      const done = lv < currentLevel, cur = lv === currentLevel
      const h = p.y + 0.25
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, h, 40),
        new THREE.MeshStandardMaterial({ color: done ? C.amber : cur ? C.blue : 0xc9d8ea, roughness: 0.5 }))
      col.position.set(p.x, h / 2 - 0.25, p.z)
      col.castShadow = col.receiveShadow = true
      col.userData.level = lv
      scene.add(col); hit.push(col)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.08, 40),
        new THREE.MeshStandardMaterial({ color: done ? C.yellow : cur ? 0xffffff : 0xeef4fb, roughness: 0.35 }))
      cap.position.set(p.x, p.y + 0.04, p.z)
      cap.receiveShadow = true
      cap.userData.level = lv
      scene.add(cap); hit.push(cap)
      for (let s = 0; s < 3; s++) {
        const got = done || !!stagesDone[i]?.[s]
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12),
          new THREE.MeshStandardMaterial({ color: got ? (cur ? C.amber : C.navy) : 0xb8c7db, roughness: 0.4 }))
        const sa = -Math.PI / 2 + (s - 1) * 0.9
        d.position.set(p.x + Math.cos(sa) * 0.36, p.y + 0.13, p.z + Math.sin(sa) * 0.36)
        scene.add(d)
      }
    }
    const beadGeo = new THREE.SphereGeometry(0.07, 12, 10)
    const beadMats = [C.blue, 0xffffff, C.amber].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }))
    const rope = new THREE.CatmullRomCurve3(pos.map(p => p.clone().add(new THREE.Vector3(0, 0.12, 0))))
    for (let i = 0; i <= 120; i++) {
      const b = new THREE.Mesh(beadGeo, beadMats[Math.floor(i / 3) % 3])
      b.position.copy(rope.getPoint(i / 120)); scene.add(b)
    }

    // the picked level: a navy ring floating round its platform
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 12, 64), new THREE.MeshStandardMaterial({ color: C.navy, roughness: 0.3 }))
    ring.rotation.x = Math.PI / 2
    scene.add(ring)

    const mascot = makeMascot()
    mascot.group.scale.setScalar(0.5)
    const curIdx = Math.min(Math.max(currentLevel, 1), N) - 1
    scene.add(mascot.group)

    // camera: turns round the spiral; picking a level brings it to the front
    let yaw = 0, wantYaw = 0
    const pitch = 0.45
    const yawFor = (lv: number) => { const p = pos[lv - 1]; return Math.atan2(p.x, p.z) }
    wantYaw = yaw = yawFor(selRef.current)
    let dragging: { x: number; y: number; yaw: number; moved: boolean } | null = null

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
    const onDown = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY, yaw, moved: false }
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - dragging.x
      if (Math.abs(dx) > 5) dragging.moved = true
      yaw = wantYaw = dragging.yaw - dx * 0.008
      if (reduce) draw(0)
    }
    const onUp = (e: PointerEvent) => {
      const d = dragging; dragging = null
      if (!d || d.moved) return
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const h = ray.intersectObjects(hit, false)[0]
      if (h) pickRef.current(h.object.userData.level)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', () => { dragging = null })

    const v = new THREE.Vector3()
    const camDist = () => camera.position.length()
    function place(el: HTMLElement | null, p: THREE.Vector3, depth = false) {
      if (!el) return
      if (depth) {
        /* Labels on the far side of the spiral sit under the near ones and
           fade back a little, so the front of the picture reads first. */
        const d = camera.position.distanceTo(p)
        el.style.zIndex = String(Math.round(1000 - d * 20))
        el.style.opacity = d > camDist() ? '0.55' : '1'
      }
      v.copy(p).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * canvas!.clientWidth}px, ${((1 - v.y) / 2) * canvas!.clientHeight}px) translate(-50%, -100%)`
    }

    function draw(t: number) {
      const aspect = camera.aspect
      const R = 11.5 * Math.pow(Math.max(1, 1.5 / aspect), 0.8)
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * R, 1.8 + Math.sin(pitch) * R, Math.cos(yaw) * Math.cos(pitch) * R)
      camera.lookAt(0, 1.4, 0)
      ripples.forEach((r, i) => {
        const k = (t * 0.25 + i / 4) % 1
        r.scale.setScalar(1 + k * 7); (r.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - k)
      })
      const cp = pos[curIdx]
      mascot.group.position.set(cp.x, cp.y + 1.0 + Math.sin(t * 2) * 0.08, cp.z)
      mascot.group.rotation.y = t * 0.6 + 0.6
      mascot.flap(t * 1.2, 0.3)
      const sp = pos[selRef.current - 1]
      ring.position.set(sp.x, sp.y + 0.05 + Math.sin(t * 2.4) * 0.03, sp.z)
      pos.forEach((p, i) => place(labelRefs.current[i], new THREE.Vector3(p.x, p.y + 0.4, p.z), true))
      place(meRef.current, new THREE.Vector3(cp.x, cp.y + 1.85, cp.z))
      renderer.render(scene, camera)
    }

    function resize() {
      const w = canvas!.clientWidth, h = canvas!.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      setNarrow(w < 560)
      draw(clockT)
    }
    let clockT = 0
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
      if (!dragging) {
        let dy = wantYaw - yaw
        dy = Math.atan2(Math.sin(dy), Math.cos(dy))
        yaw += dy * Math.min(1, dt * 4)
      }
      clockT += dt
      draw(clockT)
    }
    api.current = {
      face: (lv: number) => { wantYaw = yawFor(lv); if (reduce) { yaw = wantYaw; draw(0) } },
      redraw: () => draw(clockT),
    }
    // The ResizeObserver's first call sizes the canvas and draws the first frame.
    if (!reduce) loop()
    onReady(true)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect(); io.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      api.current = null
      scene.traverse(o => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose()
      })
      renderer.dispose()
    }
    // Built once per swimmer and level state; selection is handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, JSON.stringify(stagesDone)])

  if (!ok) return null
  return (
    <div ref={wrapRef} className="mst3d">
      <style dangerouslySetInnerHTML={{ __html: MAP3D_CSS }} />
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
      <div className="mst3d-labels">
        {Array.from({ length: N }, (_, i) => {
          const lv = i + 1
          const cls = 'tap-auto mst3d-lbl' + (lv < currentLevel ? ' done' : '') + (lv === currentLevel ? ' cur' : '') + (lv === selected ? ' sel' : '')
          return (
            <button key={lv} type="button" ref={el => { labelRefs.current[i] = el }} className={cls}
              aria-pressed={lv === selected} onClick={() => onPick(lv)}>
              {levelLabel(lv, narrow)}
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
  border: 1px solid #e3ebf6; background: linear-gradient(180deg, #e3f2ff 0%, #b9dcf7 55%, #8cc2ec 100%) }
.mst3d canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; touch-action: pan-y }
.mst3d canvas:active { cursor: grabbing }
.mst3d-labels { position: absolute; inset: 0; pointer-events: none }
.mst3d-lbl, .mst3d-me { position: absolute; left: 0; top: 0; white-space: nowrap; font: inherit; font-size: 12px; font-weight: 800;
  padding: 5px 10px; border-radius: 999px; line-height: 1.2; will-change: transform; min-height: 0; min-width: 0; width: auto; height: auto }
.mst3d-lbl { pointer-events: auto; cursor: pointer; border: 2px solid transparent; background: rgba(255,255,255,.95); color: #12254a;
  box-shadow: 0 3px 10px rgba(18,37,74,.16) }
.mst3d-lbl.done { background: #f09800; color: #12254a }
.mst3d-lbl.cur { background: #2050a0; color: #fff }
.mst3d-lbl.sel { border-color: #12254a }
.mst3d-lbl.cur.sel { border-color: #f7b733 }
.mst3d-lbl:focus-visible { outline: 3px solid #f7b733; outline-offset: 2px }
.mst3d-hint { position: absolute; left: 10px; bottom: 10px; margin: 0; font-size: 11.5px; color: #3b4a66;
  background: rgba(255,255,255,.88); border-radius: 999px; padding: 4px 10px; pointer-events: none }
.mst3d-me { z-index: 2000; background: #12254a; color: #fff; font-size: 12.5px; box-shadow: 0 4px 14px rgba(18,37,74,.25) }
@media (max-width: 640px) { .mst3d { height: 300px; margin: 10px 14px 0 } .mst3d-lbl { padding: 5px 9px } }
`
