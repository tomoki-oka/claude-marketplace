export const DEFAULT = 0x01000000

/** A pixel canvas two pixels tall per terminal cell; `null` is the terminal's background. */
export class Canvas {
  readonly w: number
  readonly h: number
  private readonly px: (number | null)[]

  constructor(columns: number, rows: number) {
    this.w = columns
    this.h = rows * 2
    this.px = new Array(this.w * this.h).fill(null)
  }

  set(x: number, y: number, color: number) {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    this.px[y * this.w + x] = color
  }

  get(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    return this.px[y * this.w + x] ?? null
  }

  disc(cx: number, cy: number, r: number, color: number) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) this.set(cx + x, cy + y, color)
  }

  line(x0: number, y0: number, x1: number, y1: number, r: number, color: number) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t
      if (r <= 0.5) this.set(x, y, color)
      else this.disc(Math.round(x), Math.round(y), Math.round(r), color)
    }
  }

  /** Copies another canvas's painted pixels onto this one at an offset. */
  paste(src: Canvas, dx: number, dy: number) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const p = src.get(x, y); if (p !== null) this.set(x + dx, y + dy, p) }
  }

  /** Standard base64 of `columns * rows` u32 triplets, top/bottom pixels folded into half blocks. */
  cells(): string {
    const rows = this.h / 2
    const words = new Uint32Array(this.w * rows * 3)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < this.w; c++) {
        const top = this.get(c, r * 2)
        const bot = this.get(c, r * 2 + 1)
        const i = (r * this.w + c) * 3
        let ch = 0x20, fg = DEFAULT, bg = DEFAULT
        if (top !== null && bot !== null) {
          if (top === bot) { ch = 0x2588; fg = top } else { ch = 0x2580; fg = top; bg = bot }
        } else if (top !== null) { ch = 0x2580; fg = top }
        else if (bot !== null) { ch = 0x2584; fg = bot }
        words[i] = ch; words[i + 1] = fg; words[i + 2] = bg
      }
    }
    const bytes = new Uint8Array(words.buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x2000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x2000))
    return btoa(bin)
  }
}
