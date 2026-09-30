"""index.html(img/ 폴더 참조) → VALKYRIE_intro.html(이미지 내장 단일 파일).

발표 PC나 메일로 옮길 때는 단일 파일을 씁니다. 인터넷이 없으면 글꼴만 맑은 고딕으로 바뀝니다.
    .\\.venv\\Scripts\\python.exe intro\\build_intro.py
"""
import base64
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "index.html"
OUT = HERE / "VALKYRIE_intro.html"


def inline(m: re.Match) -> str:
    path = HERE / m.group(1)
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f'src="data:image/jpeg;base64,{data}"'


html = SRC.read_text(encoding="utf-8")
html, n = re.subn(r'src="(img/[^"]+\.jpg)"', inline, html)
OUT.write_text(html, encoding="utf-8")
print(f"{n} images inlined -> {OUT.name} ({OUT.stat().st_size / 1024 / 1024:.1f} MB)")
