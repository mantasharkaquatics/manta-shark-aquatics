'use client'

/*
 * The learning map's 3D overview, families only (owner, 2026-10-26: the
 * learning map goes 3D; of five versions shown he picked "E", the minimal
 * staircase). Coaches and the admin curriculum page keep the 2D tree.
 *
 * Seven white steps climb left to right, one per level, each with its name
 * printed on the front and an "L1".."L7" button under it (owner, 2026-10-26:
 * the numbers under the stairs, the names on the faces, the stairs turned
 * more towards the viewer and wider, so they are easier to read and tap). Finished levels are amber; the swimmer's
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
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

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
  /** The hint when the stairs are wider than the box (a phone): swipe. */
  hintSwipe: string
}

const C = { navy: 0x12254a, blue: 0x2050a0, amber: 0xf09800 }
const N = 7
/* The steps' proportions. On a phone they are much wider and a little lower
   (owner, 2026-10-26: the names on the steps were too small for older
   parents), so only three or four show at once and the box scrolls sideways;
   a computer keeps all seven in view. Set when the scene is built. */
let SW = 1.5, SD = 1.2, RISE: [number, number] = [0.9, 0.3]
const stepH = (lv: number) => RISE[0] + RISE[1] * (lv - 1)
/* The page's own font stack (next/font gives the faces generated names, so it
   is read off the page rather than written here). */
let FONT = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif'
let ANISO = 4

/* The front of a step: the level's name, drawn at the face's own aspect so
   the letters are not stretched. Every step uses the SAME letter size (owner,
   2026-10-26: "Four Strokes" came out bigger than the rest because it is
   short) -- the largest size at which every name fits its own face. A name
   with spaces breaks between words; a Chinese name of four characters or
   more goes on two lines. */
const FW = 320, FPAD = 16
const faceH = (h: number) => Math.round(FW * h / (SW - 0.06))
function faceOptions(name: string): string[][] {
  const options: string[][] = [[name]]
  if (name.includes(' ')) {
    const w = name.split(' ')
    for (let k = 1; k < w.length; k++) options.push([w.slice(0, k).join(' '), w.slice(k).join(' ')])
  } else if (name.length >= 4) {
    const k = Math.ceil(name.length / 2)
    options.push([name.slice(0, k), name.slice(k)])
  }
  return options
}
function fits(g: CanvasRenderingContext2D, lines: string[], size: number, H: number) {
  g.font = `800 ${size}px ${FONT}`
  return lines.every(l => g.measureText(l).width <= FW - 2 * FPAD) && lines.length * size * 1.15 <= Math.min(H - 2 * FPAD, 230)
}
/** The one letter size for all seven faces. */
function faceSize(names: string[], heights: number[]) {
  const g = document.createElement('canvas').getContext('2d')!
  let size = 110
  names.forEach((n, i) => {
    const H = faceH(heights[i])
    let best = 24
    for (const o of faceOptions(n)) { let z = size; while (z > 24 && !fits(g, o, z, H)) z -= 2; best = Math.max(best, z) }
    size = Math.min(size, best)
  })
  return size
}
function faceTexture(name: string, h: number, bg: [string, string], ink: string, size: number) {
  /* Drawn at 2x and scaled down, so the letters stay sharp on a phone's
     dense screen (owner, 2026-10-26: blurry). */
  const K = 2, W = FW, H = faceH(h)
  const c = document.createElement('canvas'); c.width = W * K; c.height = H * K
  const g = c.getContext('2d')!
  g.scale(K, K)
  /* A soft light-to-shade wash down the face, like a lit panel, rather than
     one flat colour (owner, 2026-10-26: "more premium"). */
  const wash = g.createLinearGradient(0, 0, 0, H)
  wash.addColorStop(0, bg[0]); wash.addColorStop(1, bg[1])
  g.fillStyle = wash; g.fillRect(0, 0, W, H)
  // the fewest lines that fit at the shared size
  const lines = faceOptions(name).find(o => fits(g, o, size, H)) || faceOptions(name).slice(-1)[0]
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = `800 ${size}px ${FONT}`
  const lh = size * 1.15, top = FPAD + lh / 2
  lines.forEach((l, i) => g.fillText(l, W / 2, top + i * lh))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = ANISO
  return t
}

/* A soft contact shadow under the whole staircase: a blurred dark band laid
   on the floor, the way a product photo grounds an object. */
function contactTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256
  const g = c.getContext('2d')!
  g.shadowColor = 'rgba(18,37,74,0.55)'; g.shadowBlur = 60; g.shadowOffsetX = 2000
  g.fillStyle = '#000'
  g.beginPath(); g.roundRect(-2000 + 90, 70, 1024 - 180, 116, 58); g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
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

export default function LevelMap3D({ currentLevel, stagesDone, selected, onPick, onReady, levelName, levelTag, meLabel, ariaLabel, hint, hintSwipe }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [swipe, setSwipe] = useState(false)
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
    const scroller = scrollRef.current, layer = layerRef.current, box = boxRef.current
    if (!canvas || !scroller || !layer || !box) return
    const phone = window.matchMedia('(max-width: 640px)').matches
    if (phone) { SW = 1.7; SD = 0.9; RISE = [1.0, 0.13] } else { SW = 1.5; SD = 1.2; RISE = [0.9, 0.3] }
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
    /* The phone's full pixel density (an iPhone is 3x; it was capped at 2,
       which drew the picture soft and stretched it up). */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.NeutralToneMapping
    const scene = new THREE.Scene()
    // A studio's soft reflections, for a little sheen on the steps.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    const envTex = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    scene.environment = envTex
    scene.environmentIntensity = 0.55
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    /* Turned only a little (owner, 2026-10-26: it was turned too far): about
       14 degrees round and 17 down, so the fronts face the reader. */
    camera.position.set(-2.6, 5.2, 12)
    camera.lookAt(0.3, 1.3, 0)
    /* A phone looks almost straight at the fronts (about 7 degrees round and
       12 down): the names read squarely, and a long staircase does not tilt
       across the narrow box. */
    if (phone) { camera.position.set(-1.2, 3.6, 12); camera.lookAt(0.3, 1.0, 0) }

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9d6e6, 1.5))
    const sun = new THREE.DirectionalLight(0xffffff, 2.3)
    // Straight over the viewer's shoulder: the shadows fall behind the stairs.
    sun.position.set(-0.5, 12, 9)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.radius = 4
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11 })
    sun.shadow.bias = -0.0005
    scene.add(sun)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.1 }))
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true
    scene.add(ground)
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(N * SW + 1.6, SD + 1.4),
      new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }))
    contact.rotation.x = -Math.PI / 2; contact.position.set(0, 0.002, 0.05)
    scene.add(contact)

    const NAME_SIZE = faceSize(Array.from({ length: N }, (_, i) => nameRef.current(i + 1)), Array.from({ length: N }, (_, i) => stepH(i + 1)))
    type Step = { mesh: THREE.Mesh; x: number; h: number; tiles: THREE.Mesh[]; edge: THREE.Mesh }
    const steps: Step[] = []
    for (let lv = 1; lv <= N; lv++) {
      const done = lv < currentLevel, cur = lv === currentLevel, h = stepH(lv), x = (lv - 4) * SW
      const ink = done ? '#5a3800' : cur ? '#ffffff' : '#4a5a76'
      /* Satin, slightly rounded steps that catch the light along their edges
         (owner, 2026-10-26: "more premium"). Finished = warm amber, the
         swimmer's level = deep blue with a clear-coat, ahead = porcelain. */
      const face: [string, string] = done ? ['#ffc95c', '#f2a91f'] : cur ? ['#2d63bd', '#1b4690'] : ['#ffffff', '#eef2f8']
      /* Standard, not physical, materials: the clear-coat shader took long
         enough to build on a phone that the stairs appeared late (owner,
         2026-10-26). The studio reflections give the sheen instead. */
      const finish = { roughness: cur ? 0.3 : done ? 0.38 : 0.5, metalness: 0 }
      const front = new THREE.MeshStandardMaterial({ map: faceTexture(nameRef.current(lv), h, face, ink, NAME_SIZE), ...finish })
      const side = new THREE.MeshStandardMaterial({ color: done ? 0xe39a17 : cur ? 0x173d80 : 0xdfe6f0, ...finish })
      const topM = new THREE.MeshStandardMaterial({ color: done ? 0xffb733 : cur ? 0xf7faff : 0xfdfdfe, ...finish })
      const geo = new RoundedBoxGeometry(SW - 0.06, h, SD, 4, 0.06)
      const mesh = new THREE.Mesh(geo, [side, side, topM, side, front, side])
      mesh.position.set(x, h / 2, 0)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.userData.level = lv
      scene.add(mesh)
      /* The picked step's outline: a navy shell just larger than the step,
         seen from inside, so it shows as an even rim round the rounded box. */
      const rim = 0.026
      const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: C.navy, side: THREE.BackSide, toneMapped: false }))
      edge.scale.set((SW - 0.06 + 2 * rim) / (SW - 0.06), (h + 2 * rim) / h, (SD + 2 * rim) / SD)
      edge.visible = false
      mesh.add(edge)
      const tiles: THREE.Mesh[] = []
      if (cur) for (let st = 1; st <= 3; st++) {
        const got = !!stagesDone[lv - 1]?.[st - 1]
        const now = !got && (st === 1 || !!stagesDone[lv - 1]?.[st - 2])
        const tile = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.06, SD * 0.6, 2, 0.025),
          new THREE.MeshStandardMaterial({ color: got ? 0xffb733 : now ? 0x8fbcff : 0xd5deea, roughness: 0.32 }))
        tile.castShadow = true
        scene.add(tile); tiles.push(tile)
      }
      steps.push({ mesh, x, h, tiles, edge })
    }

    const mascot = makeMascot()
    mascot.group.scale.setScalar(phone ? 0.3 : 0.36)
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
    /* The scroller lies over the canvas, so it takes the pointer: a tap on a
       step's top or side still picks it. */
    const onMove = (e: PointerEvent) => { hover = at(e); scroller.style.cursor = hover > 0 ? 'pointer' : 'default'; if (reduce) draw(0) }
    const onLeave = () => { hover = -1; if (reduce) draw(0) }
    const onClick = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      const lv = at(e); if (lv > 0) pickRef.current(lv)
    }
    scroller.addEventListener('pointermove', onMove)
    scroller.addEventListener('pointerleave', onLeave)
    scroller.addEventListener('click', onClick as EventListener)

    const v = new THREE.Vector3()
    const toScreen = (p: THREE.Vector3) => {
      v.copy(p).project(camera)
      return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight }
    }

    /* The frame: worked out in resize(), and slid sideways by the scroller.
       Everything laid over the picture (step buttons, L1..L7, the label) sits
       in the scroller's content, so it moves with the stairs natively; the
       canvas stays put and the camera follows the scroll. */
    const F = { x0: 0, cx: 0, cy: 0, hw: 1, hh: 1, wpp: 0.01, T: 30, B: 44, contentW: 0, scrollable: false }
    function setCamera() {
      const left = F.scrollable ? F.x0 + scroller!.scrollLeft * F.wpp : F.cx - F.hw
      camera.left = left; camera.right = left + 2 * F.hw
      camera.top = F.cy + F.hh + F.T * F.wpp; camera.bottom = F.cy - F.hh - F.B * F.wpp
      camera.updateProjectionMatrix()
    }
    function edges() {
      const max = scroller!.scrollWidth - scroller!.clientWidth
      box!.classList.toggle('more-l', F.scrollable && scroller!.scrollLeft > 4)
      box!.classList.toggle('more-r', F.scrollable && scroller!.scrollLeft < max - 4)
      // Once the reader has swiped, the hint has done its job and steps aside.
      if (placed && Math.abs(scroller!.scrollLeft - startAt) > 12) box!.classList.add('used')
    }

    function draw(t: number) {
      setCamera()
      const sx = scroller!.scrollLeft
      steps.forEach((s, i) => {
        const lv = i + 1
        const lift = lv === selRef.current ? 0.14 : lv === hover ? 0.08 : 0
        const want = s.h / 2 + lift
        s.mesh.position.y += reduce ? want - s.mesh.position.y : (want - s.mesh.position.y) * 0.2
        s.edge.visible = lv === selRef.current
        s.tiles.forEach((tile, k) => tile.position.set(s.x + (k - 1) * 0.42, s.mesh.position.y + s.h / 2 + 0.03, 0))
        // the button over the step's front face
        const b = btnRefs.current[i]
        if (b) {
          const y0 = s.mesh.position.y - s.h / 2, y1 = s.mesh.position.y + s.h / 2, z = SD / 2
          const a = toScreen(new THREE.Vector3(s.x - SW / 2 + 0.03, y1, z)), c = toScreen(new THREE.Vector3(s.x + SW / 2 - 0.03, y0, z))
          b.style.transform = `translate(${Math.min(a.x, c.x) + sx}px, ${Math.min(a.y, c.y)}px)`
          b.style.width = Math.abs(c.x - a.x) + 'px'
          b.style.height = Math.abs(c.y - a.y) + 'px'
        }
        /* "L1".."L7" under each step, as wide as the step: the easy thing to
           tap (owner, 2026-10-26). It stays on the ground when a step lifts. */
        const chip = chipRefs.current[i]
        if (chip) {
          const l = toScreen(new THREE.Vector3(s.x - SW / 2 + 0.03, 0, SD / 2))
          const r = toScreen(new THREE.Vector3(s.x + SW / 2 - 0.03, 0, SD / 2))
          const w = Math.max(30, r.x - l.x - 4)
          chip.style.width = w + 'px'
          chip.style.transform = `translate(${(l.x + r.x) / 2 - w / 2 + sx}px, ${Math.max(l.y, r.y) + 6}px)`
        }
      })
      const topY = cs.mesh.position.y + cs.h / 2
      mascot.group.position.set(cs.x + 0.05, topY + (phone ? 0.3 : 0.38) + Math.sin(t * 2) * 0.05, 0.1)
      mascot.group.rotation.y = -Math.PI / 2 + Math.sin(t * 0.8) * 0.4
      mascot.flap(t * 1.2, 0.28)
      if (meRef.current) {
        if (phone) {
          /* Beside the mascot, not above it: on a phone the room above the
             top step would shrink the whole picture for a swimmer on Level 7.
             Over the lower step to its left -- or, on Level 1, the right. */
          const m = toScreen(new THREE.Vector3(cs.x, topY + 0.38, 0))
          const gap = 0.32 / F.wpp, right = cs === steps[0]
          meRef.current.classList.toggle('side-r', right)
          meRef.current.classList.toggle('side-l', !right)
          meRef.current.style.transform = right
            ? `translate(${m.x + sx + gap}px, ${m.y}px) translate(0, -50%)`
            : `translate(${m.x + sx - gap}px, ${m.y}px) translate(-100%, -50%)`
        } else {
          const m = toScreen(new THREE.Vector3(cs.x, topY + 0.9, 0))
          // Kept inside the picture: over the first step it ran off the left.
          const half = meRef.current.offsetWidth / 2 + 6
          const mx = Math.min(Math.max(m.x + sx, half), Math.max(F.contentW, canvas!.clientWidth) - half)
          meRef.current.style.transform = `translate(${mx}px, ${m.y}px) translate(-50%, -100%)`
        }
      }
      renderer.render(scene, camera)
    }

    let clockT = 0, placed = false, startAt = 0
    function resize() {
      const w = canvas!.clientWidth, h = canvas!.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
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
      take(cs.x, cs.h + (phone ? 0.72 : 1.4), 0)
      const mx = (x1 - x0) * 0.02, my = (y1 - y0) * 0.03
      x0 -= mx; x1 += mx; y0 -= my; y1 += my
      /* A band kept clear at the top for the hint and at the bottom for the
         L1..L7 buttons, in pixels; the stairs fill what is between. */
      /* On a phone the hint sits over the empty sky instead of a band of its
         own, so the stairs get that height too. */
      const T = phone ? 6 : 30, B = w < 640 ? 44 : 50
      const inner = Math.max(40, h - T - B), ia = w / inner
      let hw = (x1 - x0) / 2, hh = (y1 - y0) / 2
      /* A computer fits all seven steps. A phone fits the height only, and
         whatever is wider than the box scrolls. */
      if (phone) hw = hh * ia
      else if (hw / hh > ia) hh = hw / ia
      else hw = hh * ia
      hh = hw / ia
      const wpp = (2 * hh) / inner
      const fullW = (x1 - x0) / wpp
      const was = F.scrollable
      Object.assign(F, { x0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw, hh, wpp, T, B,
        contentW: Math.max(w, Math.ceil(fullW)), scrollable: fullW > w + 1 })
      layer!.style.width = F.contentW + 'px'
      if (F.scrollable !== was) setSwipe(F.scrollable)
      /* Open on the swimmer's own step, a third of the way in, so the next
         levels are in view too. */
      if (F.scrollable && !placed) {
        placed = true
        const q = new THREE.Vector3(cs.x, 0, 0).applyMatrix4(inv)
        scroller!.scrollLeft = Math.max(0, (q.x - x0) / wpp - w * 0.3)
        startAt = scroller!.scrollLeft
      }
      edges()
      draw(clockT)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const onScroll = () => { edges(); if (reduce) draw(clockT) }
    scroller.addEventListener('scroll', onScroll, { passive: true })
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
      scroller.removeEventListener('pointermove', onMove)
      scroller.removeEventListener('pointerleave', onLeave)
      scroller.removeEventListener('click', onClick as EventListener)
      scroller.removeEventListener('scroll', onScroll)
      redrawRef.current = null
      scene.traverse(o => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        const list = Array.isArray(mat) ? mat : mat ? [mat] : []
        list.forEach(x => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose() })
      })
      envTex.dispose(); pmrem.dispose()
      renderer.dispose()
    }
    // Built once per swimmer and level state; the picked level is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel, JSON.stringify(stagesDone)])

  useEffect(() => { redrawRef.current?.() }, [selected])

  if (!ok) return null
  return (
    <div className="mst3d" ref={boxRef}>
      <style dangerouslySetInnerHTML={{ __html: MAP3D_CSS }} />
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
      <div className="mst3d-scroll" ref={scrollRef}>
      <div className="mst3d-layer" ref={layerRef}>
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
      </div>
      {/* Arrows at the edges when there is more to either side: a nudge to
          swipe, and a tap scrolls too. The step buttons already scroll into
          view on focus, so these stay out of the keyboard order. */}
      <button type="button" className="tap-auto mst3d-more l" tabIndex={-1} aria-hidden="true"
        onClick={() => scrollRef.current?.scrollBy({ left: -(scrollRef.current.clientWidth * 0.6), behavior: 'smooth' })}>‹</button>
      <button type="button" className="tap-auto mst3d-more r" tabIndex={-1} aria-hidden="true"
        onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth * 0.6, behavior: 'smooth' })}>›</button>
      <p className="mst3d-hint">{swipe ? hintSwipe : hint}</p>
    </div>
  )
}

const MAP3D_CSS = `
.mst3d { position: relative; height: 340px; margin: 12px 20px 0; border-radius: 14px; overflow: hidden;
  border: 1px solid #e3ebf6;
  background: radial-gradient(120% 90% at 55% 30%, #ffffff 0%, #f5f8fc 55%, #e8eef6 100%) }
.mst3d canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: pan-y }
.mst3d-scroll { position: absolute; inset: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch; scrollbar-width: none; touch-action: pan-x pan-y }
.mst3d-scroll::-webkit-scrollbar { display: none }
.mst3d-layer { position: relative; height: 100%; min-width: 100%; pointer-events: none }
.mst3d-more { position: absolute; top: 38%; z-index: 4; width: 30px; height: 30px; min-height: 0; padding: 0; margin: -15px 0 0;
  border-radius: 50%; border: 1px solid #d3deec; background: rgba(255,255,255,.8); color: #12254a; font: inherit;
  font-size: 22px; font-weight: 700; line-height: 26px; box-shadow: 0 3px 10px rgba(18,37,74,.16); cursor: pointer;
  opacity: 0; pointer-events: none; transition: opacity .2s }
.mst3d-more.l { left: 6px } .mst3d-more.r { right: 6px }
.mst3d.more-l .mst3d-more.l, .mst3d.more-r .mst3d-more.r { opacity: 1; pointer-events: auto }
.mst3d-step { position: absolute; left: 0; top: 0; min-height: 0; min-width: 0; padding: 0; margin: 0; border: 0;
  background: transparent; cursor: pointer; pointer-events: auto; border-radius: 4px; will-change: transform }
.mst3d-step:focus-visible { outline: 3px solid #f7b733; outline-offset: 2px }
.mst3d-me { position: absolute; left: 0; top: 0; white-space: nowrap; font-size: 12.5px; font-weight: 800; padding: 5px 11px;
  border-radius: 999px; line-height: 1.2; background: linear-gradient(180deg, #1d3766, #12254a); color: #fff; letter-spacing: .2px;
  box-shadow: 0 6px 16px rgba(18,37,74,.28), inset 0 1px 0 rgba(255,255,255,.14); will-change: transform }
.mst3d-me::after { content: ''; position: absolute; left: 50%; bottom: -4px; width: 8px; height: 8px; margin-left: -4px;
  background: #12254a; transform: rotate(45deg); border-radius: 1px }
.mst3d-me.side-l::after { left: auto; right: -4px; bottom: auto; top: 50%; margin: -4px 0 0 }
.mst3d-me.side-r::after { left: -4px; bottom: auto; top: 50%; margin: -4px 0 0 }
.mst3d.used .mst3d-hint { opacity: 0 }
.mst3d-hint { transition: opacity .3s }
.mst3d-hint { position: absolute; z-index: 3; right: 10px; top: 10px; margin: 0; font-size: 11.5px; color: #56647d;
  background: rgba(255,255,255,.75); border: 1px solid #e3ebf6; border-radius: 999px; padding: 4px 10px; pointer-events: none;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px) }
.mst3d-chip { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: auto; cursor: pointer;
  height: 38px; min-height: 0; min-width: 0; padding: 0; margin: 0; border-radius: 10px; border: 1px solid #d3deec;
  background: linear-gradient(180deg, #ffffff, #f1f5fa); color: #12254a; font: inherit; font-size: 16px; font-weight: 800;
  line-height: 1; letter-spacing: .3px; font-variant-numeric: tabular-nums;
  box-shadow: inset 0 1px 0 #fff, 0 3px 8px rgba(18,37,74,.10); will-change: transform; transition: box-shadow .15s }
.mst3d-chip.done { background: linear-gradient(180deg, #ffc24d, #f09800); border-color: #e39200; color: #3a2600;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 3px 8px rgba(160,100,0,.2) }
.mst3d-chip.cur { background: linear-gradient(180deg, #2f66c2, #1b4690); border-color: #1b4690; color: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 4px 10px rgba(27,70,144,.3) }
.mst3d-chip.sel { border-color: #12254a; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #12254a }
.mst3d-chip.cur.sel { border-color: #f7b733; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #12254a }
@media (hover: hover) { .mst3d-chip:hover { border-color: #2050a0 } }
@media (max-width: 640px) {
  .mst3d { height: clamp(170px, 27vh, 220px); flex: none; margin: 6px 14px 0 }
  .mst3d-hint { font-size: 11.5px; top: 6px; right: 6px; padding: 3px 9px }
  .mst3d-me { font-size: 11px; padding: 4px 9px; z-index: 3 }
  .mst3d-chip { height: 32px; border-radius: 9px; font-size: 14px }
}
`
