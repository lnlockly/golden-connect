from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from opentele.api import API
from opentele.tl import TelegramClient
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.messages import GetHistoryRequest


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
DEFAULT_EXPORTS_DIR = ROOT / "data" / "telegram-exports"


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def normalize_phone(value: str | None) -> str:
    digits = re.sub(r"\D+", "", value or "")
    if len(digits) == 11 and digits.startswith("8"):
        return "7" + digits[1:]
    return digits


def slugify(value: str) -> str:
    value = re.sub(r"[^\w\-\.]+", "-", value.strip().lower(), flags=re.UNICODE)
    value = re.sub(r"-{2,}", "-", value)
    value = value.strip("-")
    return value or "telegram-chat"


def parse_media_kinds(value: str | None) -> set[str]:
    if not value:
        return set()
    return {
        item.strip().lower()
        for item in str(value).split(",")
        if item and item.strip()
    }


def find_session_candidates(explicit_session: str | None) -> list[Path]:
    candidates: list[Path] = []
    seen: set[str] = set()

    if explicit_session:
        path = Path(explicit_session).expanduser()
        if not path.is_absolute():
            path = (WORKSPACE / path).resolve()
        if path.exists():
            key = str(path).lower()
            if key not in seen:
                candidates.append(path)
                seen.add(key)

    for pattern in ("trendex_probe_*.session", "*.session"):
        for path in sorted(WORKSPACE.glob(pattern)):
            key = str(path).lower()
            if key in seen:
                continue
            candidates.append(path)
            seen.add(key)

    return candidates


async def select_client(session_arg: str | None, phone_filter: str | None):
    phone_filter = normalize_phone(phone_filter)
    candidates = find_session_candidates(session_arg)
    if not candidates:
        raise RuntimeError("No Telegram session files were found.")

    last_errors: list[str] = []
    for session_path in candidates:
        client = TelegramClient(str(session_path), api=API.TelegramDesktop)
        try:
            await client.connect()
            if not await client.is_user_authorized():
                last_errors.append(f"{session_path.name}: unauthorized")
                await client.disconnect()
                continue
            me = await client.get_me()
            me_phone = normalize_phone(getattr(me, "phone", "") or "")
            if phone_filter and me_phone != phone_filter:
                last_errors.append(f"{session_path.name}: phone {me_phone or 'unknown'}")
                await client.disconnect()
                continue
            return client, session_path, me
        except Exception as exc:  # pragma: no cover - operational safety
            last_errors.append(f"{session_path.name}: {exc}")
            try:
                await client.disconnect()
            except Exception:
                pass

    message = "No authorized Telegram session matched the requested account."
    if last_errors:
        message += "\n" + "\n".join(last_errors[:20])
    raise RuntimeError(message)


def detect_media_kind(message) -> str | None:
    if not getattr(message, "media", None):
        return None
    if getattr(message, "photo", None):
        return "photo"
    if getattr(message, "video", None):
        return "video"
    if getattr(message, "voice", None):
        return "voice"
    if getattr(message, "audio", None):
        return "audio"
    if getattr(message, "gif", None):
        return "gif"
    if getattr(message, "sticker", None):
        return "sticker"
    if getattr(message, "document", None):
        return "document"
    if getattr(message, "web_preview", None):
        return "web_preview"
    return "media"


def serialize_reactions(message) -> list[dict[str, Any]]:
    info = getattr(message, "reactions", None)
    results = getattr(info, "results", None) or []
    items: list[dict[str, Any]] = []
    for result in results:
        reaction = getattr(result, "reaction", None)
        label = None
        if reaction is None:
            label = None
        elif hasattr(reaction, "emoticon"):
            label = reaction.emoticon
        elif hasattr(reaction, "document_id"):
            label = f"custom:{reaction.document_id}"
        else:
            label = str(reaction)
        items.append({
            "reaction": label,
            "count": getattr(result, "count", 0),
        })
    return items


def serialize_file(message) -> dict[str, Any] | None:
    file = getattr(message, "file", None)
    if not file:
        return None
    return {
        "name": file.name,
        "ext": file.ext,
        "mime_type": file.mime_type,
        "size": file.size,
        "duration": file.duration,
        "width": file.width,
        "height": file.height,
    }


def serialize_reply(message) -> dict[str, Any] | None:
    reply = getattr(message, "reply_to", None)
    if not reply:
        return None
    return {
        "reply_to_msg_id": getattr(reply, "reply_to_msg_id", None),
        "reply_to_top_id": getattr(reply, "reply_to_top_id", None),
        "forum_topic": getattr(reply, "forum_topic", None),
    }


def serialize_message(message, media_path: str | None = None) -> dict[str, Any]:
    return {
        "id": message.id,
        "date": message.date.isoformat() if getattr(message, "date", None) else None,
        "edit_date": message.edit_date.isoformat() if getattr(message, "edit_date", None) else None,
        "sender_id": getattr(message, "sender_id", None),
        "post_author": getattr(message, "post_author", None),
        "grouped_id": getattr(message, "grouped_id", None),
        "message": message.message or "",
        "views": getattr(message, "views", None),
        "forwards": getattr(message, "forwards", None),
        "reply": serialize_reply(message),
        "reactions": serialize_reactions(message),
        "media_kind": detect_media_kind(message),
        "file": serialize_file(message),
        "downloaded_media": media_path,
    }


def to_relative_string(path: Path, anchor: Path) -> str:
    try:
        return str(path.relative_to(anchor))
    except ValueError:
        return str(path)


def find_existing_artifact(directory: Path, stem: str) -> Path | None:
    if not directory.exists():
        return None
    candidates = [
        item for item in directory.glob(f"{stem}*")
        if item.is_file() and item.stat().st_size > 0
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda item: (-item.stat().st_size, len(item.name), item.name))
    return candidates[0]


def read_message_index(messages_path: Path) -> list[dict[str, Any]]:
    if not messages_path.exists():
        return []
    records: list[dict[str, Any]] = []
    with messages_path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line:
                continue
            records.append(json.loads(line))
    return records


def write_message_index(messages_path: Path, records: list[dict[str, Any]]) -> None:
    tmp_path = messages_path.with_suffix(".jsonl.tmp")
    with tmp_path.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    tmp_path.replace(messages_path)


async def download_message_media(client, message, base_dir: Path, timeout_sec: int = 120) -> str | None:
    media_kind = detect_media_kind(message)
    if not media_kind:
        return None
    media_dir = base_dir / media_kind
    media_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{message.id:08d}"
    existing = find_existing_artifact(media_dir, stem)
    if existing:
        return to_relative_string(existing, base_dir.parent)
    prefix = media_dir / stem
    try:
        downloaded = await asyncio.wait_for(
            client.download_media(message, file=str(prefix)),
            timeout=max(10, int(timeout_sec or 120)),
        )
    except asyncio.TimeoutError:
        for partial in media_dir.glob(f"{stem}*"):
            if partial.is_file() and partial.stat().st_size <= 0:
                try:
                    partial.unlink()
                except OSError:
                    pass
        print(f"timeout while downloading message {message.id}")
        return None
    if not downloaded:
        return None
    path = Path(downloaded)
    if path.exists() and path.stat().st_size <= 0:
        try:
            path.unlink()
        except OSError:
            pass
        return None
    return to_relative_string(path, base_dir.parent)


async def download_avatar(client, entity, avatar_dir: Path, chat_dir: Path) -> str | None:
    avatar_dir.mkdir(parents=True, exist_ok=True)
    existing = find_existing_artifact(avatar_dir, "avatar")
    if existing:
        return to_relative_string(existing, chat_dir)
    avatar = await client.download_profile_photo(entity, file=str(avatar_dir / "avatar"))
    if not avatar:
        return None
    return to_relative_string(Path(avatar), chat_dir)


async def export_media_from_index(
    client,
    entity,
    chat_dir: Path,
    args: argparse.Namespace,
) -> tuple[int, int, dict[str, int]]:
    messages_path = chat_dir / "messages.jsonl"
    records = read_message_index(messages_path)
    if not records:
        raise RuntimeError(f"Message index is missing or empty: {messages_path}")

    allowed_media_kinds = parse_media_kinds(args.media_kinds)
    selected = []
    media_counts: dict[str, int] = {}
    for record in records:
        media_kind = record.get("media_kind")
        if not media_kind:
            continue
        if allowed_media_kinds and media_kind not in allowed_media_kinds:
            continue
        msg_id = int(record.get("id") or 0)
        if args.min_id and msg_id <= args.min_id:
            continue
        if args.max_id and msg_id > args.max_id:
            continue
        media_counts[media_kind] = media_counts.get(media_kind, 0) + 1
        selected.append(record)

    if args.newest_first:
        selected.sort(key=lambda item: int(item.get("id") or 0), reverse=True)
    else:
        selected.sort(key=lambda item: int(item.get("id") or 0))

    if args.limit and args.limit > 0:
        selected = selected[:args.limit]

    record_by_id = {int(item["id"]): item for item in selected}
    ids = list(record_by_id.keys())

    exported_messages = 0
    exported_media = 0
    dirty_writes = 0

    for start in range(0, len(ids), 100):
        chunk_ids = ids[start:start + 100]
        fetched = await client.get_messages(entity, ids=chunk_ids)
        if not isinstance(fetched, list):
            fetched = [fetched]
        fetched_by_id = {int(item.id): item for item in fetched if item}

        for msg_id in chunk_ids:
            record = record_by_id[msg_id]
            message = fetched_by_id.get(msg_id)
            if not message or not getattr(message, "media", None):
                continue
            media_path = await download_message_media(client, message, chat_dir / "media", args.media_timeout_sec)
            if media_path:
                if record.get("downloaded_media") != media_path:
                    record["downloaded_media"] = media_path
                    dirty_writes += 1
                exported_media += 1
            exported_messages += 1

            if args.progress_every and exported_messages % args.progress_every == 0:
                print(f"processed {exported_messages} media messages...")
            if dirty_writes and args.save_every and dirty_writes >= args.save_every:
                write_message_index(messages_path, records)
                dirty_writes = 0

    if dirty_writes:
        write_message_index(messages_path, records)

    return exported_messages, exported_media, media_counts


async def export_chat(args: argparse.Namespace) -> dict[str, Any]:
    client, session_path, me = await select_client(args.session, args.phone)
    export_dir = Path(args.out_dir).expanduser()
    if not export_dir.is_absolute():
        export_dir = (WORKSPACE / export_dir).resolve()
    export_dir.mkdir(parents=True, exist_ok=True)

    try:
        entity = await client.get_entity(args.chat)
        title = getattr(entity, "title", None) or getattr(entity, "username", None) or str(getattr(entity, "id", "chat"))
        chat_slug = slugify(getattr(entity, "username", None) or title)
        chat_dir = export_dir / chat_slug
        chat_dir.mkdir(parents=True, exist_ok=True)

        history = await client(GetHistoryRequest(
            peer=entity,
            limit=1,
            offset_date=None,
            offset_id=0,
            max_id=0,
            min_id=0,
            add_offset=0,
            hash=0,
        ))
        total_count = getattr(history, "count", None)

        full_info = None
        try:
            full_info = await client(GetFullChannelRequest(entity))
        except Exception:
            full_info = None

        pinned_message = None
        pinned_media_path = None
        pinned_message_id = None
        about = None
        linked_chat_id = None
        participants_count = None

        if full_info is not None:
            full_chat = getattr(full_info, "full_chat", None)
            pinned_message_id = getattr(full_chat, "pinned_msg_id", None)
            about = getattr(full_chat, "about", None)
            linked_chat_id = getattr(full_chat, "linked_chat_id", None)
            participants_count = getattr(full_chat, "participants_count", None)
            if pinned_message_id:
                pinned_message = await client.get_messages(entity, ids=pinned_message_id)
                if pinned_message and args.download_pinned and getattr(pinned_message, "media", None):
                    pinned_media_path = await download_message_media(client, pinned_message, chat_dir / "media", args.media_timeout_sec)

        avatar_path = None
        if args.download_avatar:
            avatar_dir = chat_dir / "meta"
            avatar_path = await download_avatar(client, entity, avatar_dir, chat_dir)

        meta = {
            "exported_at": asyncio.get_running_loop().time(),
            "chat": args.chat,
            "chat_id": getattr(entity, "id", None),
            "title": title,
            "username": getattr(entity, "username", None),
            "megagroup": getattr(entity, "megagroup", None),
            "broadcast": getattr(entity, "broadcast", None),
            "forum": getattr(entity, "forum", None),
            "participants_count": participants_count,
            "about": about,
            "linked_chat_id": linked_chat_id,
            "history_count": total_count,
            "session_file": str(session_path),
            "authorized_as": {
                "id": getattr(me, "id", None),
                "username": getattr(me, "username", None),
                "phone": getattr(me, "phone", None),
                "first_name": getattr(me, "first_name", None),
            },
            "avatar_path": avatar_path,
            "pinned_message_id": pinned_message_id,
            "pinned_message": serialize_message(pinned_message, pinned_media_path) if pinned_message else None,
        }

        meta_path = chat_dir / "chat.json"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        exported_messages = 0
        exported_media = 0
        media_counts: dict[str, int] = {}

        if args.media_only:
            exported_messages, exported_media, media_counts = await export_media_from_index(client, entity, chat_dir, args)
        elif not args.stats_only:
            allowed_media_kinds = parse_media_kinds(args.media_kinds)
            messages_path = chat_dir / "messages.jsonl"
            with messages_path.open("w", encoding="utf-8") as fh:
                async for message in client.iter_messages(
                    entity,
                    limit=args.limit if args.limit and args.limit > 0 else None,
                    reverse=not args.newest_first,
                    min_id=args.min_id or 0,
                    max_id=args.max_id or 0,
                ):
                    media_path = None
                    media_kind = detect_media_kind(message)
                    if media_kind:
                        media_counts[media_kind] = media_counts.get(media_kind, 0) + 1
                    if args.download_media and media_kind and (not allowed_media_kinds or media_kind in allowed_media_kinds):
                        media_path = await download_message_media(client, message, chat_dir / "media", args.media_timeout_sec)
                        if media_path:
                            exported_media += 1
                    record = serialize_message(message, media_path)
                    fh.write(json.dumps(record, ensure_ascii=False) + "\n")
                    exported_messages += 1
                    if args.progress_every and exported_messages % args.progress_every == 0:
                        print(f"exported {exported_messages} messages...")

        summary = {
            "chat_dir": str(chat_dir),
            "meta_path": str(meta_path),
            "history_count": total_count,
            "exported_messages": exported_messages,
            "exported_media": exported_media,
            "media_counts": media_counts,
            "session_file": str(session_path),
        }
        return summary
    finally:
        await client.disconnect()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export Telegram chat history and media via a user session.")
    parser.add_argument("--chat", required=True, help="Chat username, invite link or numeric id.")
    parser.add_argument("--session", help="Path to an existing Telethon session file.")
    parser.add_argument("--phone", help="Optional phone filter to select the correct authorized session.")
    parser.add_argument("--out-dir", default=str(DEFAULT_EXPORTS_DIR), help="Directory where exports will be stored.")
    parser.add_argument("--limit", type=int, default=0, help="Limit messages to export. 0 means no limit.")
    parser.add_argument("--min-id", type=int, default=0, help="Export only messages with id greater than this value.")
    parser.add_argument("--max-id", type=int, default=0, help="Export only messages with id less than or equal to this value.")
    parser.add_argument("--newest-first", action="store_true", help="Export newest messages first.")
    parser.add_argument("--stats-only", action="store_true", help="Save only chat metadata without exporting messages.")
    parser.add_argument("--media-only", action="store_true", help="Use existing messages.jsonl and download media only.")
    parser.add_argument("--media-kinds", default="", help="Comma-separated media kinds to process, for example: photo,video,document,audio,voice,gif")
    parser.add_argument("--download-avatar", action="store_true", help="Download the chat avatar into the export folder.")
    parser.add_argument("--download-pinned", action="store_true", help="Download media from the pinned message if present.")
    parser.add_argument("--download-media", action="store_true", help="Download media for exported messages.")
    parser.add_argument("--media-timeout-sec", type=int, default=120, help="Per-file timeout for Telegram media downloads in seconds.")
    parser.add_argument("--progress-every", type=int, default=250, help="Print progress every N exported messages.")
    parser.add_argument("--save-every", type=int, default=25, help="Rewrite messages.jsonl every N media updates in media-only mode.")
    return parser


def main() -> int:
    configure_stdout()
    parser = build_parser()
    args = parser.parse_args()
    summary = asyncio.run(export_chat(args))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
