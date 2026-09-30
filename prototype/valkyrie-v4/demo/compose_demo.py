"""Compose the recorded VALKYRIE demo into an MP4: cursor, click ripples, Korean subtitles, spotlights,
fast-forward segments, intro/outro cards. Also writes an .srt and clean PPT stills.

  python demo/compose_demo.py                      _work/run → out/VALKYRIE_demo.mp4 (+ .srt, stills/)
  python demo/compose_demo.py --no-subs            clean version for live narration (VALKYRIE_demo_clean.mp4)
  python demo/compose_demo.py --preview 12,40,75   write PNG previews at those output seconds instead of a video
"""
import argparse, bisect, json, sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "_vendor"))
FPS = 30
FONT_VF = r"C:\Windows\Fonts\NotoSansKR-VF.ttf"       # variable weight; falls back to Malgun Gothic
FONT_B = r"C:\Windows\Fonts\malgunbd.ttf"
FONT_R = r"C:\Windows\Fonts\malgun.ttf"
CY, AM, GR = (63, 217, 230), (239, 168, 58), (48, 164, 108)
COLORS = {"cy": CY, "am": AM, "gr": GR}
INTRO, OUTRO, XFADE = 2.6, 4.2, 0.5
_FONTS = {}


def font(size, bold=True, weight=None):
    w = weight or (700 if bold else 400)
    key = (size, w)
    if key not in _FONTS:
        try:
            f = ImageFont.truetype(FONT_VF, size)
            f.set_variation_by_axes([w])
        except Exception:
            f = ImageFont.truetype(FONT_B if w >= 600 else FONT_R, size)
        _FONTS[key] = f
    return _FONTS[key]


def ease(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


# ---------------------------------------------------------------- timeline
class Timeline:
    def __init__(self, ev):
        self.ev = ev
        self.t0 = next(e["t"] for e in ev if e["type"] == "start")
        self.t1 = next((e["t"] for e in ev if e["type"] == "end"), ev[-1]["t"])
        sp = [(self.t0, 1.0)] + [(e["t"], e["v"]) for e in ev if e["type"] == "speed"]
        # "fit:<sec>" = squeeze the segment (until the next speed change) into <sec> seconds of video
        for i, (t, v) in enumerate(sp):
            if isinstance(v, str) and v.startswith("fit:"):
                L = (sp[i + 1][0] if i + 1 < len(sp) else self.t1) - t
                sp[i] = (t, max(1.0, L / float(v[4:])))
            else:
                sp[i] = (t, float(v))
        self.seg = []            # (real_start, out_start, speed)
        out = 0.0
        for i, (t, v) in enumerate(sp):
            if self.seg:
                pt, po, pv = self.seg[-1]
                out = po + (t - pt) / pv
            self.seg.append((t, out, v))
        self.duration = self.out(self.t1)

    def out(self, t):
        s = self.seg[0]
        for x in self.seg:
            if x[0] <= t:
                s = x
        return s[1] + (t - s[0]) / s[2]

    def real(self, o):
        s = self.seg[0]
        for x in self.seg:
            if x[1] <= o:
                s = x
        return s[0] + (o - s[1]) * s[2]

    def speed_at(self, t):
        v = 1.0
        for x in self.seg:
            if x[0] <= t:
                v = x[2]
        return v

    def spans(self, kind):
        """[(start_real, end_real, event)] for state-like events (sub/spot): each lasts until the next of its kind"""
        L = [e for e in self.ev if e["type"] == kind]
        out = []
        for i, e in enumerate(L):
            end = L[i + 1]["t"] if i + 1 < len(L) else self.t1
            out.append((e["t"], end, e))
        return out


# ---------------------------------------------------------------- drawing
def cursor_img():
    s = 4
    pts = [(0, 0), (0, 25), (6, 19.5), (10.2, 29), (14, 27.4), (9.9, 18.2), (17.6, 18.2)]
    im = Image.new("RGBA", (26 * s, 34 * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    P = [((x + 2) * s, (y + 2) * s) for x, y in pts]
    d.polygon(P, fill=(12, 14, 18, 255))
    inner = [((x + 2) * s, (y + 2) * s) for x, y in [(1.6, 3.6), (1.6, 21.4), (6.3, 17), (10.9, 26.8), (12.2, 26.2), (7.6, 16.6), (13.7, 16.6)]]
    d.polygon(inner, fill=(250, 251, 252, 255))
    im = im.resize((26 * 115 // 100, 34 * 115 // 100), Image.LANCZOS)
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(im.getchannel("A").point(lambda a: int(a * 0.45)))
    sh = sh.filter(ImageFilter.GaussianBlur(2))
    out = Image.new("RGBA", (im.width + 6, im.height + 6), (0, 0, 0, 0))
    out.alpha_composite(sh, (3, 4))
    out.alpha_composite(im, (0, 0))
    return out


class Painter:
    def __init__(self, size, subs=True):
        self.W, self.H = size
        self.subs = subs
        self.cur = cursor_img()
        self.cache = {}

    # subtitle block: [step chip] first line / second line — compact so it only covers the command bar + footer
    def subtitle(self, text, step):
        key = ("sub", text, step)
        if key in self.cache:
            return self.cache[key]
        lines = text.split("\n")
        d0 = ImageDraw.Draw(Image.new("RGB", (1, 1)))
        padx, pady = 30, 11
        for s1 in range(31, 21, -1):           # shrink long captions until they fit the frame
            s2 = round(s1 * 25 / 31)
            f1, f2, ft = font(s1, weight=700), font(s2, weight=500), font(17, weight=700)
            w1 = d0.textlength(lines[0], font=f1)
            tw = d0.textlength(step, font=ft) + 22 if step else 0
            gap = 14 if step else 0
            widths = [tw + gap + w1] + [d0.textlength(l, font=f2) for l in lines[1:]]
            if max(widths) + padx * 2 <= self.W - 60:
                break
        w = int(max(widths) + padx * 2)
        h = int(pady * 2 + 44 + 36 * (len(lines) - 1))
        im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, w - 1, h - 1], radius=10, fill=(7, 10, 15, 232), outline=(63, 217, 230, 80), width=1)
        x, y = (w - widths[0]) / 2, pady
        if step:
            d.rounded_rectangle([x, y + 8, x + tw, y + 36], radius=4, fill=(10, 42, 48, 255), outline=CY + (170,), width=1)
            d.text((x + 11, y + 10), step, font=ft, fill=CY + (255,))
            x += tw + gap
        d.text((x, y - 1), lines[0], font=f1, fill=(246, 248, 251, 255))
        y += 44
        for l, lw in zip(lines[1:], widths[1:]):
            d.text(((w - lw) / 2, y - 2), l, font=f2, fill=(200, 208, 220, 255))
            y += 36
        self.cache[key] = im
        return im

    def badge(self, v):
        key = ("ff", v)
        if key not in self.cache:
            f = font(21)
            t = f"▶▶  {max(2, round(v)):d}× 빨리감기"
            d0 = ImageDraw.Draw(Image.new("RGB", (1, 1)))
            w = int(d0.textlength(t, font=f) + 36)
            im = Image.new("RGBA", (w, 42), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.rounded_rectangle([0, 0, w - 1, 41], radius=21, fill=(28, 20, 6, 225), outline=AM + (200,), width=2)
            d.text((18, 6), t, font=f, fill=AM + (255,))
            self.cache[key] = im
        return self.cache[key]

    def spot_layer(self, rect, color, a):
        q = round(a * 12) / 12
        key = ("spot", tuple(round(v) for v in rect), color, q)
        if key in self.cache:
            return self.cache[key]
        x, y, w, h = rect
        x0, y0, x1, y1 = max(0, x), max(0, y), min(self.W - 1, x + w), min(self.H - 1, y + h)
        dim = Image.new("RGBA", (self.W, self.H), (3, 5, 9, int(118 * q)))
        hole = Image.new("L", (self.W, self.H), 255)
        ImageDraw.Draw(hole).rounded_rectangle([x0, y0, x1, y1], radius=8, fill=0)
        dim.putalpha(Image.eval(hole, lambda v: int(v / 255 * 118 * q)))
        d = ImageDraw.Draw(dim)
        c = COLORS.get(color, CY)
        d.rounded_rectangle([x0, y0, x1, y1], radius=8, outline=c + (int(255 * q),), width=3)
        if len(self.cache) > 400:
            self.cache = {k: v for k, v in self.cache.items() if k[0] != "spot"}
        self.cache[key] = dim
        return dim

    def ripple(self, im, x, y, k):
        r = 7 + 30 * ease(k)
        a = int(235 * (1 - k))
        lay = Image.new("RGBA", (90, 90), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        d.ellipse([45 - r, 45 - r, 45 + r, 45 + r], outline=CY + (a,), width=3)
        if k < 0.5:
            d.ellipse([45 - 6, 45 - 6, 45 + 6, 45 + 6], fill=CY + (int(200 * (1 - 2 * k)),))
        im.alpha_composite(lay, (int(x - 45), int(y - 45)))


def faded(img, a):
    if a >= 0.999:
        return img
    im = img.copy()
    im.putalpha(im.getchannel("A").point(lambda v: int(v * a)))
    return im


def card(size, kind, P):
    W, H = size
    im = Image.new("RGBA", (W, H), (9, 12, 18, 255))
    d = ImageDraw.Draw(im)
    for x in range(0, W, 48):
        d.line([(x, 0), (x, H)], fill=(15, 20, 28, 255))
    for y in range(0, H, 48):
        d.line([(0, y), (W, y)], fill=(15, 20, 28, 255))
    def center(t, y, f, fill):
        tw = d.textlength(t, font=f)
        d.text(((W - tw) / 2, y), t, font=f, fill=fill)
    if kind == "intro":
        center("R A V E N S", 318, font(22), (138, 148, 166, 255))
        f = font(118)
        a, b = "VAL", "KYRIE"
        wa, wb = d.textlength(a, font=f), d.textlength(b, font=f)
        x = (W - wa - wb) / 2
        d.text((x, 360), a, font=f, fill=(236, 239, 244, 255))
        d.text((x + wa, 360), b, font=f, fill=CY + (255,))
        center("매크로 · 채권 · 코스닥 주식 투자판단 인텔리전스 체인", 540, font(36), (226, 230, 238, 255))
        center("금리 충격 하나가 채권과 코스닥 주식에 주는 영향을, 한 화면에서 판단까지", 604, font(26, False), (150, 160, 176, 255))
        center("한화자산운용 AI PLUSthon 2026  ·  7팀 RAVENS  ·  시연 영상", 760, font(21, False), (110, 120, 136, 255))
    else:
        center("하나의 금리 충격이", 380, font(52), (236, 239, 244, 255))
        center("채권과 코스닥 주식에서 같은 듀레이션 논리로 갈라진다", 462, font(52), CY + (255,))
        center("VALKYRIE  ·  7팀 RAVENS", 640, font(26), (150, 160, 176, 255))
    return im


# ---------------------------------------------------------------- compose
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default=str(HERE / "_work" / "run"))
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--no-subs", action="store_true")
    ap.add_argument("--no-voice", action="store_true", help="leave the narration out")
    ap.add_argument("--preview", default="")
    ap.add_argument("--name", default=None)
    ap.add_argument("--workers", type=int, default=4, help="parallel render processes (each encodes one slice)")
    ap.add_argument("--chunk", default="", help=argparse.SUPPRESS)
    a = ap.parse_args()

    global INTRO, OUTRO
    work, out = Path(a.work), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    R = json.loads((work / "events.json").read_text(encoding="utf-8"))
    vj = work / "voices.json"
    VOICES = json.loads(vj.read_text(encoding="utf-8")) if vj.exists() and not a.no_voice else {}
    INTRO = R.get("intro", INTRO)
    if "outro" in VOICES:
        OUTRO = max(OUTRO, VOICES["outro"]["dur"] + 1.6)
    size = tuple(R["size"])
    W, H = size
    TL = Timeline(R["events"])
    frames = sorted(R["frames"])
    fts = [f[0] for f in frames]
    P = Painter(size, subs=not a.no_subs)
    subs, spots = TL.spans("sub"), TL.spans("spot")
    moves = [e for e in R["events"] if e["type"] == "move"]
    clicks = [e for e in R["events"] if e["type"] == "click"]
    cur_on = [(e["t"], e["on"]) for e in R["events"] if e["type"] == "cursor"]
    total = INTRO + TL.duration + OUTRO
    print(f"real {TL.t1 - TL.t0:.1f}s → video {total:.1f}s (intro {INTRO}s + demo {TL.duration:.1f}s + outro {OUTRO}s), {len(frames)} frames")

    cache = {"i": -1, "im": None}

    def frame_at(t):
        i = max(0, bisect.bisect_right(fts, t) - 1)
        if cache["i"] != i:
            cache["i"], cache["im"] = i, Image.open(work / "frames" / frames[i][1]).convert("RGBA")
        return cache["im"]

    def cursor_at(t):
        pos = None
        for m in moves:
            if m["t"] > t:
                break
            k = (t - m["t"]) / m["dur"] if m["dur"] else 1
            e = ease(k)
            pos = (m["frm"][0] + (m["to"][0] - m["frm"][0]) * e, m["frm"][1] + (m["to"][1] - m["frm"][1]) * e)
        on = False
        for tt, v in cur_on:
            if tt <= t:
                on = v
        return pos if on else None

    def demo_frame(o):
        t = TL.real(o)
        im = frame_at(t).copy()
        # spotlight
        for s0, s1, e in spots:
            if s0 <= t < s1 and e.get("rect"):
                a = min(ease((TL.out(t) - TL.out(s0)) / 0.3), ease((TL.out(s1) - TL.out(t)) / 0.22))
                if a > 0.01:
                    im.alpha_composite(P.spot_layer(e["rect"], e.get("color", "cy"), a))
        # ripple + cursor
        for c in clicks:
            k = (o - TL.out(c["t"])) / 0.55
            if 0 <= k < 1:
                P.ripple(im, c["at"][0], c["at"][1], k)
        pos = cursor_at(t)
        if pos:
            im.alpha_composite(P.cur, (int(pos[0]) - 2, int(pos[1]) - 2))
        # fast-forward badge
        v = TL.speed_at(t)
        if v > 1.5:
            b = P.badge(v)
            im.alpha_composite(b, ((W - b.width) // 2, 212))
        # subtitle
        if P.subs:
            for s0, s1, e in subs:
                if s0 <= t < s1 and e.get("text"):
                    a = min(ease((TL.out(t) - TL.out(s0)) / 0.22), ease((TL.out(s1) - TL.out(t)) / 0.18))
                    img = P.subtitle(e["text"], e.get("step"))
                    pos = e.get("pos", "bottom")
                    x = 70 if pos == "bottom-left" else (W - img.width) // 2
                    y = 132 if pos == "top" else H - img.height - 12
                    im.alpha_composite(faded(img, a), (x, y))
        return im

    intro, outro = card(size, "intro", P), card(size, "outro", P)

    def at(T):
        if T < INTRO:
            if T > INTRO - XFADE:
                return Image.blend(intro, demo_frame(0), ease((T - (INTRO - XFADE)) / XFADE))
            return intro
        o = T - INTRO
        if o < TL.duration:
            return demo_frame(o)
        k = (o - TL.duration) / XFADE
        last = demo_frame(TL.duration - 1 / FPS)
        return Image.blend(last, outro, ease(k)) if k < 1 else outro

    if a.preview:
        for s in a.preview.split(","):
            T = float(s)
            at(T).convert("RGB").save(out / f"preview_{T:06.1f}.png")
            print("preview", T)
        return

    import imageio_ffmpeg, subprocess
    N = int(total * FPS)
    name = a.name or ("VALKYRIE_demo_clean" if a.no_subs else "VALKYRIE_demo")

    def render(ks, dst):
        wr = imageio_ffmpeg.write_frames(str(dst), size, fps=FPS, codec="libx264", quality=None, macro_block_size=8,
                                         pix_fmt_in="rgb24", pix_fmt_out="yuv420p", output_params=["-crf", "18", "-preset", "fast"])
        wr.send(None)
        for j, k in enumerate(ks):
            wr.send(at(k / FPS).convert("RGB").tobytes())
            if j % 300 == 0:
                print(f"  [{dst.stem}] {j}/{len(ks)} frames", flush=True)
        wr.close()

    parts_dir = out / "_parts"
    if a.chunk:                                # worker: one slice of the timeline → one H.264 segment
        i, n = map(int, a.chunk.split("/"))
        render(range(N * i // n, N * (i + 1) // n), parts_dir / f"{name}_{i}.mp4")
        return

    # stills for the PPT (clean frames)
    sd = out / "stills"
    sd.mkdir(exist_ok=True)
    for e in R["events"]:
        if e["type"] == "still":
            frame_at(e["t"] + 0.35).convert("RGB").save(sd / f"{e['name']}.png")

    # srt (output time)
    def ts(x):
        ms = int(round(x * 1000))
        return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    srt, n = [], 0
    for s0, s1, e in subs:
        if e.get("text"):
            n += 1
            srt.append(f"{n}\n{ts(INTRO + TL.out(s0))} --> {ts(INTRO + TL.out(s1))}\n{e['text']}\n")
    if not a.no_subs:
        (out / f"{name}.srt").write_text("\n".join(srt), encoding="utf-8")

    final = out / f"{name}.mp4"
    path = out / f"{name}_video.mp4" if VOICES else final
    w = max(1, a.workers)
    if w == 1:
        render(range(N), path)
    else:                                      # slices render in parallel processes, then join without re-encoding
        parts_dir.mkdir(exist_ok=True)
        args = [sys.executable, str(Path(__file__).resolve()), "--work", str(work), "--out", str(out), "--name", name]
        args += (["--no-subs"] if a.no_subs else []) + (["--no-voice"] if a.no_voice else [])
        procs = [subprocess.Popen(args + ["--chunk", f"{i}/{w}"]) for i in range(w)]
        if any(p.wait() for p in procs):
            raise SystemExit("a render worker failed")
        lst = parts_dir / f"{name}.txt"
        lst.write_text("".join(f"file '{(parts_dir / f'{name}_{i}.mp4').as_posix()}'\n" for i in range(w)), encoding="utf-8")
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-c", "copy", "-movflags", "+faststart", str(path)], check=True)
        for i in range(w):
            (parts_dir / f"{name}_{i}.mp4").unlink()
        lst.unlink()
    if VOICES:
        mux(VOICES, subs, TL, total, path, final, out / "_narration.wav")
        if not a.no_subs:                      # subtitled, no voice: for presenters who narrate live
            path.replace(out / "VALKYRIE_demo_silent.mp4")
        else:
            path.unlink()
    print("wrote", final, f"{final.stat().st_size / 1e6:.1f} MB")


def mux(VOICES, subs, TL, total, video, final, wav_path, sr=48000):
    """narration track: each line at its caption's start; intro over the title card, outro over the closing card"""
    import wave, subprocess, numpy as np, imageio_ffmpeg
    track = np.zeros(int((total + 1) * sr), dtype=np.float32)

    def put(key, at):
        v = VOICES.get(key)
        if not v:
            return
        with wave.open(v["wav"]) as w:
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        i = int(at * sr)
        n = min(len(pcm), len(track) - i)
        if n > 0:
            track[i:i + n] += pcm[:n]

    put("intro", 0.35)
    for s0, s1, e in subs:
        if e.get("voice"):
            put(e["voice"], INTRO + TL.out(s0) + 0.05)
    put("outro", INTRO + TL.duration + 0.55)
    peak = float(np.abs(track).max()) or 1.0
    track = np.clip(track / max(1.0, peak / 0.95), -1, 1)
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((track * 32767).astype(np.int16).tobytes())
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(video), "-i", str(wav_path),
                    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k",
                    "-ar", str(sr), "-ac", "2", "-shortest", "-movflags", "+faststart", str(final)], check=True)
    wav_path.unlink()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
