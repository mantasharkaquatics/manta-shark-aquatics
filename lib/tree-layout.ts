/*
 * Where a skill sits on the learning map, and how a line gets from one skill to
 * another.
 *
 * The rows are the stages: 階段 1 on the top row, 階段 2 under it, 階段 3 under
 * that, in every level. That is the curriculum's own shape, and it is the shape
 * the coach and the parent already have in their heads -- the previous version
 * put a skill one row below the deepest thing it needed, which drew a truthful
 * graph of a structure nobody thinks in.
 *
 * Fixing the rows is what makes the lines hard. A prerequisite no longer always
 * comes from the row above: it can come from the same row, or skip a row
 * entirely. Each of those gets its own way through, and none of them is allowed
 * to cross a skill name.
 *
 * No React in here, so the map and the harness that measures it run the same
 * code rather than two copies that drift apart.
 */

export type TreeInput = {
  id: string
  /** 1, 2 or 3 -- the row. */
  stage: number
  sort: number
  /** Prerequisite ids. Only the ones on this level matter here. */
  needs: string[]
  /** Pin this skill to a column instead of letting the prerequisites decide.
      May be negative: the board grows a column on the left rather than
      refusing. This exists because the prerequisite graph cannot always say
      what the owner wants the picture to say -- two skills hanging off the
      same parent always pile up to its right, and sometimes the row should
      straddle it instead. Nothing sets this by default. */
  col?: number | null
}

export type Spot = {
  row: number
  /** Fractional: a short row is centred, so it sits at half-column offsets. */
  col: number
}

/** Board geometry, read from the CSS custom properties actually in use. */
export type Geom = {
  cw: number
  rh: number
  sz: number
  /** The side gutter a row-skipping line runs down, in px. */
  lane: number
  /** Empty strip above the first row, so row 1 has a channel like every other
      row -- a bracket over the top row needs somewhere to be. */
  pad: number
  cols: number
  /** What is actually in the way on each row: the tiles and the names as they
      really render, measured rather than assumed. A row-skipping line drops
      through the gaps between them; without this it had to go round the outside
      of the board, which drew a box around half the level. */
  blocked?: Record<number, Array<[number, number]>>
}

export type Edge = { from: string; to: string }

/**
 * Rows are the stages. Inside a row, a skill stands directly under the
 * prerequisite it comes from, so the line between them is straight down.
 *
 * Centring a short row was the older rule and it put every tile half a column
 * off its parent, which turned every line into a dog-leg for no reason. A skill
 * whose prerequisites are all on its own row (or on an earlier level) has
 * nothing to stand under, so it fills a gap the anchored ones left.
 */
export function placeLevel(nodes: TreeInput[]): {
  rows: number
  cols: number
  spots: Record<string, Spot>
} {
  const rows = Math.max(1, ...nodes.map(n => n.stage))
  const byRow: TreeInput[][] = []
  for (let r = 1; r <= rows; r++) {
    byRow[r] = nodes.filter(n => n.stage === r).sort((a, b) => a.sort - b.sort)
  }
  let cols = Math.max(1, ...byRow.slice(1).map(r => r.length))

  const spots: Record<string, Spot> = {}
  /* The first row has nothing to align to, so it is centred. */
  /* Whole columns, not half ones: a row of three in a board of four sits at
     1,2,3 rather than 0.5,1.5,2.5, so the rows below can stand directly under
     it instead of half a tile off. */
  const first = byRow[1] || []
  const firstPinned = first.filter(n => n.col != null)
  for (const n of firstPinned) spots[n.id] = { row: 1, col: n.col as number }
  let slot = Math.floor((cols - first.length) / 2)   // 半格往左靠，跟下面幾排一致
  for (const n of first) {
    if (n.col != null) continue
    while (firstPinned.some(f => f.col === slot)) slot += 1
    spots[n.id] = { row: 1, col: slot }
    slot += 1
  }

  for (let r = 2; r <= rows; r++) {
    const row = byRow[r]
    if (!row.length) continue

    /* Two prerequisites in different columns average to a half column, which
       would stand the child between two tiles instead of under one. Round to a
       whole column: under one of its parents beats between both of them. */
    const want = (n: TreeInput) => {
      const above = n.needs.map(q => spots[q]).filter(Boolean)
      if (!above.length) return null
      /* Half a column between two parents rounds DOWN, towards the left: the
         row fills from the left, so leaning left leaves room on the right and
         keeps the run from being pushed off the board. */
      return Math.round(above.reduce((s, p) => s + p.col, 0) / above.length - 0.001)
    }
    /* A skill with no line at all -- nothing above it, nothing below it on this
       level -- has no column it belongs in, so it simply stands where its own
       order puts it, and the ones with lines arrange themselves around it. */
    const linked = (n: TreeInput) =>
      n.needs.some(q => spots[q] || row.some(m => m.id === q)) ||
      nodes.some(m => m.needs.includes(n.id) && m.stage !== undefined)
    const marks = row.map((n, i) => ({ n, i, w: want(n), free: !linked(n), pin: n.col != null }))
    for (const x of marks) {
      if (x.pin) spots[x.n.id] = { row: r, col: x.n.col as number }
      else if (x.free) spots[x.n.id] = { row: r, col: x.i }
    }

    const anchored = marks.filter(x => !x.pin && !x.free && x.w !== null) as
      { n: TreeInput; i: number; w: number; free: boolean; pin: boolean }[]
    const floating = marks.filter(x => !x.pin && !x.free && x.w === null)

    if (!anchored.length && !floating.length) continue
    if (!anchored.length) {
      const off = Math.floor((cols - row.length) / 2)
      let c = off
      for (const n of row) {
        if (n.col != null) continue
        while (marks.some(m => m.pin && m.n.col === c)) c += 1
        spots[n.id] = { row: r, col: c }
        c += 1
      }
      continue
    }

    /* Anchored tiles keep their parent's column, in order, never closer than one
       column apart; if that pushes the last one off the right edge the whole run
       slides back left by however much it overflowed. */
    anchored.sort((a, b) => a.w - b.w || a.i - b.i)
    const fixed = [...marks.filter(x => x.free).map(x => x.i),
                   ...marks.filter(x => x.pin).map(x => x.n.col as number)]
    const clear = (c: number) => { while (fixed.some(f => Math.abs(f - c) < 0.999)) c += 1; return c }
    const at: number[] = []
    anchored.forEach((x, k) => { at.push(clear(k ? Math.max(x.w, at[k - 1] + 1) : x.w)) })
    const over = at[at.length - 1] - (cols - 1)
    if (over > 0) {
      const back = Math.min(over, at[0])
      for (let k = 0; k < at.length; k++) at[k] -= back
      /* Whatever is still hanging off the right widens the board, rather than
         leaving a tile (and its line) outside it. */
      cols = Math.max(cols, at[at.length - 1] + 1)
    }
    anchored.forEach((x, k) => { spots[x.n.id] = { row: r, col: at[k] } })

    /* A line that has to pass THROUGH this row needs a column to drop down, and
       the tidiest column is the one its parent is already standing in. So that
       column is held open first, and the skills with nothing above them fill
       what is left, in their own order. Holding it open is only allowed while
       there are still enough columns for everyone. */
    const taken = () => row.map(n => spots[n.id]).filter(Boolean).map(sp => sp!.col)
    const wants: number[] = []
    for (const n of nodes) {
      if (n.stage <= r) continue
      for (const q of n.needs) {
        const sp = spots[q]
        if (sp && sp.row < r) wants.push(sp.col)
      }
    }
    const isFree = (c: number, extra: number[] = []) =>
      [...taken(), ...extra].every(t => Math.abs(t - c) >= 0.999)

    let slots: number[] = []
    for (let c = 0; c <= cols - 1; c += 1) if (isFree(c)) slots.push(c)
    const held = [...new Set(wants)].filter(c => slots.includes(c))
    const keep = slots.filter(c => !held.includes(c))
    if (keep.length >= floating.length) slots = keep

    /* Each one takes the free column nearest to where its own order puts it, so
       the row still reads left to right. */
    for (const x of floating) {
      let best: number | null = null
      for (const c of slots) {
        if (!isFree(c)) continue
        if (best === null || Math.abs(c - x.i) < Math.abs(best - x.i)) best = c
      }
      if (best === null) { best = Math.max(...taken(), -1) + 1; cols = Math.max(cols, best + 1) }
      spots[x.n.id] = { row: r, col: best }
    }
  }
  /* A pinned column may be negative -- that is how a row is asked to hang one
     column further left than anything above it. The board cannot have a column
     -1, so the whole picture slides right instead and grows by that much. */
  const placed = Object.values(spots)
  if (placed.length) {
    const lo = Math.min(...placed.map(p => p.col))
    if (lo < 0) for (const p of placed) p.col -= lo
    cols = Math.max(cols, Math.max(...placed.map(p => p.col)) + 1)
  }
  return { rows, cols, spots }
}

/**
 * One path per edge, keyed `from>to`.
 *
 * Three cases, three ways through:
 *   next row    -- straight down, turning in the channel above the target.
 *   same row    -- a bracket over the top of the row.
 *   skips a row -- out to a gutter at the side of the board, down past the row
 *                  in between, back in. Straight down would cross the middle
 *                  row's tiles or its names; the gutter is the only space on
 *                  the board that is guaranteed empty.
 */
export function routeWires(
  edges: Edge[], spots: Record<string, Spot>, g: Geom,
): Record<string, string> {
  const x = (c: number) => g.lane + c * g.cw + g.cw / 2
  const top = (r: number) => g.pad + (r - 1) * g.rh
  const bottom = (r: number) => top(r) + g.sz
  const width = g.lane * 2 + g.cols * g.cw
  /* The channel between one row's names and the next row's tiles is 30px.
     Three lanes in it, so one horizontal run never sits on another. */
  const lane = (r: number, k: 0 | 1 | 2) => top(r) - [8, 17, 26][k]

  /* Two brackets that meet end to end at the same height read as ONE long
     horizontal bar, and a bar says the skill at one end leads to the skill at
     the other. That is a lie the picture tells all by itself: on Level 4,
     自由式 25 碼 and 仰式 15 碼 both bracketed into the row below, touched at
     the middle column, and the result looked like 自由式 25 碼 connected to
     仰式 25 碼. So a horizontal run books the span it occupies, and the next
     one that would overlap it drops to the lane underneath. */
  const booked: Record<number, Array<Array<[number, number]>>> = {}
  const pickLane = (r: number, xa: number, xb: number, order: Array<0 | 1 | 2>): 0 | 1 | 2 => {
    const lo = Math.min(xa, xb) - 3, hi = Math.max(xa, xb) + 3
    const rows = (booked[r] ||= [[], [], []])
    for (const k of order) {
      if (rows[k].every(([a, b]) => b <= lo || a >= hi)) { rows[k].push([lo, hi]); return k }
    }
    rows[order[order.length - 1]].push([lo, hi])
    return order[order.length - 1]
  }

  /* A vertical corridor a line can drop through: free on every row it has to
     get past. The outer margin is always free, so there is always a fallback. */
  const corridor = (from: number, to: number, desired: number): number => {
    let free: Array<[number, number]> = [[4, width - 4]]
    for (let r = from; r < to; r++) {
      const busy = (g.blocked?.[r] || []).slice().sort((p, q) => p[0] - q[0])
      const next: Array<[number, number]> = []
      for (const [lo, hi] of free) {
        let cur = lo
        for (const [bl, bh] of busy) {
          if (bh <= cur || bl >= hi) continue
          if (bl - cur >= 12) next.push([cur, bl])
          cur = Math.max(cur, bh)
        }
        if (hi - cur >= 12) next.push([cur, hi])
      }
      free = next
      if (!free.length) return desired < width / 2 ? 8 : width - 8
    }
    let best = free[0], bestD = Infinity
    for (const f of free) {
      const d = desired < f[0] ? f[0] - desired : desired > f[1] ? desired - f[1] : 0
      if (d < bestD) { bestD = d; best = f }
    }
    return Math.min(Math.max(desired, best[0] + 6), best[1] - 6)
  }

  const out: Record<string, string> = {}
  const list = edges
    .map(e => ({ ...e, a: spots[e.from], b: spots[e.to] }))
    .filter(e => e.a && e.b && e.b.row >= e.a.row)
  /* Shortest hops first, so they take the gutter closest to the tiles and the
     long ones end up outside them: the lines nest instead of braiding. */
  list.sort((p, q) => Math.abs(p.a.col - p.b.col) - Math.abs(q.a.col - q.b.col))

  /* Skills that skip a row are grouped by the skill they come from: two
     dependants of the same prerequisite ride the same gutter and split at the
     bottom, instead of drawing two near-identical lines side by side. Lines
     from DIFFERENT prerequisites are never merged -- a shared line would say
     they share a cause, and they do not. */
  const group = new Map<string, { x1: number; mid: number; rows: number[] }>()
  for (const e of list) {
    if (e.b.row - e.a.row < 2) continue
    const g0 = group.get(e.from) || { x1: x(e.a.col), mid: 0, rows: [] }
    g0.mid += (x(e.a.col) + x(e.b.col)) / 2
    g0.rows.push(e.b.row)
    group.set(e.from, g0)
  }
  const gutter = new Map<string, { gx: number; yOut: number }>()

  let leftUsed = 0, rightUsed = 0
  for (const e of list) {
    const x1 = x(e.a.col), x2 = x(e.b.col)
    const key = e.from + '>' + e.to
    const drop = e.b.row - e.a.row

    if (drop === 1) {
      const y1 = bottom(e.a.row) + 2, y2 = top(e.b.row) - 4
      if (Math.abs(x1 - x2) < 2) { out[key] = `M${x1} ${y1} L${x2} ${y2}`; continue }
      const ly = lane(e.b.row, pickLane(e.b.row, x1, x2, [0, 1, 2]))
      out[key] = `M${x1} ${y1} L${x1} ${ly} L${x2} ${ly} L${x2} ${y2}`
    } else if (drop === 0) {
      const y = top(e.a.row) - 4, ly = lane(e.a.row, pickLane(e.a.row, x1, x2, [1, 2, 0]))
      out[key] = `M${x1} ${y} L${x1} ${ly} L${x2} ${ly} L${x2} ${y}`
    } else {
      let lane0 = gutter.get(e.from)
      if (!lane0) {
        const g0 = group.get(e.from)!
        const deepest = Math.max(...g0.rows)
        const mid = g0.mid / g0.rows.length
        let gx = corridor(e.a.row + 1, deepest, mid)
        /* Two corridors on the same spot would read as one line. */
        for (const other of gutter.values()) {
          if (Math.abs(other.gx - gx) < 7) gx = other.gx + 7
        }
        if (gx < width / 2) leftUsed++; else rightUsed++
        lane0 = { gx, yOut: lane(e.a.row + 1, 2) }
        gutter.set(e.from, lane0)
      }
      const yIn = lane(e.b.row, 2)
      const y1 = bottom(e.a.row) + 2, y2 = top(e.b.row) - 4
      out[key] =
        `M${x1} ${y1} L${x1} ${lane0.yOut} L${lane0.gx} ${lane0.yOut} ` +
        `L${lane0.gx} ${yIn} L${x2} ${yIn} L${x2} ${y2}`
    }
  }
  return out
}
