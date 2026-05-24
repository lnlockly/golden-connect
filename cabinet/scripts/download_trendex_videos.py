from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LINKS_FILE = ROOT / "TRENDEX_VIDEO_LINKS_YT_YANDEX.md"
OUT_DIR = Path(r"D:\trendex\видео")
URL_RE = re.compile(r"^https?://", re.IGNORECASE)
YOUTUBE_RE = re.compile(r"^https://www\.youtube\.com/(watch\?v=|shorts/)", re.IGNORECASE)
YANDEX_RE = re.compile(r"^https://yandex\.ru/video/preview/", re.IGNORECASE)

SOURCE_PATTERNS = [
    re.compile(r"https://vk\.com/video_ext\.php[^\"'\s<]+", re.IGNORECASE),
    re.compile(r"https://vk\.com/video-?\d+_\d+", re.IGNORECASE),
    re.compile(r"https://www\.youtube\.com/watch\?v=[^\"'\s<]+", re.IGNORECASE),
    re.compile(r"https://rutube\.ru/video/[^\"'\s<]+", re.IGNORECASE),
    re.compile(r"https://dzen\.ru/video/watch/[^\"'\s<]+", re.IGNORECASE),
    re.compile(r"https://ok\.ru/video/[^\"'\s<]+", re.IGNORECASE),
    re.compile(r"https://video-preview\.s3\.yandex\.net/[^\"'\s<]+\.mp4", re.IGNORECASE),
]


def parse_urls() -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for raw in LINKS_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not URL_RE.match(line):
            continue
        if not (YOUTUBE_RE.match(line) or YANDEX_RE.match(line)):
            continue
        if line in seen:
            continue
        seen.add(line)
        urls.append(line)
    return urls


def resolve_yandex_preview(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode("utf-8", "ignore")
    except urllib.error.URLError:
        return None

    for pattern in SOURCE_PATTERNS:
        match = pattern.search(html)
        if match:
            source = match.group(0).replace("&amp;", "&")
            return source
    return None


def run_ytdlp(url: str, archive_file: Path) -> subprocess.CompletedProcess[str]:
    cmd = [
        "yt-dlp",
        "--no-warnings",
        "--ignore-errors",
        "--continue",
        "--no-overwrites",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--windows-filenames",
        "--newline",
        "--download-archive",
        str(archive_file),
        "--merge-output-format",
        "mp4",
        "-P",
        str(OUT_DIR),
        "-o",
        "%(title).180B [%(id)s].%(ext)s",
        url,
    ]
    return subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60 * 20,
    )


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    archive_file = OUT_DIR / "download-archive.txt"
    report_file = OUT_DIR / "download-report.jsonl"
    failed_file = OUT_DIR / "failed-urls.txt"

    urls = parse_urls()
    print(f"Found {len(urls)} video URLs")
    print(f"Output: {OUT_DIR}")

    failures: list[dict[str, str]] = []
    success_count = 0

    for index, original_url in enumerate(urls, start=1):
        resolved_url = original_url
        resolved_from = "direct"

        if YANDEX_RE.match(original_url):
            source_url = resolve_yandex_preview(original_url)
            if source_url:
                resolved_url = source_url
                resolved_from = "yandex_resolved"
            else:
                resolved_from = "yandex_unresolved"

        print(f"[{index}/{len(urls)}] {resolved_from}: {resolved_url}")
        started = time.time()
        ok = False
        message = ""

        try:
            result = run_ytdlp(resolved_url, archive_file)
            ok = result.returncode == 0
            message = (result.stdout or "").strip()[-2000:]
        except subprocess.TimeoutExpired:
            result = None
            message = "timeout"
        except Exception as exc:  # pragma: no cover - operational safety
            result = None
            message = str(exc)

        duration_sec = round(time.time() - started, 1)
        record = {
            "index": index,
            "original_url": original_url,
            "resolved_url": resolved_url,
            "resolved_from": resolved_from,
            "ok": ok,
            "duration_sec": duration_sec,
            "message": message,
        }
        with report_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")

        if ok:
            success_count += 1
            print(f"  OK in {duration_sec}s")
        else:
            print(f"  FAIL in {duration_sec}s")
            failures.append(record)

    failed_lines = []
    for item in failures:
        failed_lines.append(item["original_url"])
        if item["resolved_url"] != item["original_url"]:
            failed_lines.append(f"resolved: {item['resolved_url']}")
        failed_lines.append(f"reason: {item['message']}")
        failed_lines.append("")
    failed_file.write_text("\n".join(failed_lines), encoding="utf-8")

    summary = {
        "total": len(urls),
        "success": success_count,
        "failed": len(failures),
        "output_dir": str(OUT_DIR),
        "failed_file": str(failed_file),
        "report_file": str(report_file),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
