import os, pty, sys, time, select, pyte, signal, fcntl, termios, struct, json
from PIL import Image, ImageDraw, ImageFont
cols, rows = 200, 50
out = sys.argv[1]; steps = json.loads(sys.argv[2]); cmd = sys.argv[3:]
pid, fd = pty.fork()
if pid == 0:
    os.environ["TERM"] = "xterm-256color"; os.execvp(cmd[0], cmd)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
screen = pyte.Screen(cols, rows); stream = pyte.ByteStream(screen)
def pump(sec):
    end = time.time() + sec
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try: stream.feed(os.read(fd, 65536))
            except OSError: return
def rgb(c, default):
    if c == "default": return default
    if len(c) == 6:
        try: return tuple(int(c[i:i+2],16) for i in (0,2,4))
        except ValueError: pass
    return default
def snap(name):
    cw, ch = 9, 18
    img = Image.new("RGB", (cols*cw, rows*ch), (20,20,20)); d = ImageDraw.Draw(img)
    try: font = ImageFont.truetype("/System/Library/Fonts/Hiragino Sans GB.ttc", 15)
    except OSError: font = ImageFont.load_default()
    for y in range(rows):
        line = screen.buffer[y]
        for x in range(cols):
            ch_ = line[x]
            fg = rgb(ch_.fg, (220,220,220)); bg = rgb(ch_.bg, (20,20,20))
            if ch_.reverse: fg, bg = bg, fg
            if bg != (20,20,20): d.rectangle([x*cw, y*ch, (x+1)*cw, (y+1)*ch], fill=bg)
            if ch_.data == "\u2580":
                d.rectangle([x*cw, y*ch, (x+1)*cw-1, y*ch+ch//2-1], fill=fg)
            elif ch_.data == "\u2584":
                d.rectangle([x*cw, y*ch+ch//2, (x+1)*cw-1, (y+1)*ch-1], fill=fg)
            elif ch_.data == "\u2588":
                d.rectangle([x*cw, y*ch, (x+1)*cw-1, (y+1)*ch-1], fill=fg)
            elif ch_.data.strip(): d.text((x*cw, y*ch), ch_.data, fill=fg, font=font)
    img.save(f"{out}/{name}.png")
    txt = [l.rstrip() for l in screen.display if l.strip()]
    open(f"{out}/{name}.txt","w").write("\n".join(txt))
    print("saved", name)
for step in steps:
    if "type" in step:
        text = step["type"]
        body, enter = (text[:-1], True) if text.endswith("\r") else (text, False)
        for ch in body:
            os.write(fd, ch.encode()); pump(0.02)
        if enter:
            pump(0.3); os.write(fd, b"\r")
    pump(step.get("wait", 3))
    if "snap" in step: snap(step["snap"])
os.kill(pid, signal.SIGTERM)
