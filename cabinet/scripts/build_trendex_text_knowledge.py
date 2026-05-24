from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EXPORT_DIR = ROOT / "data" / "telegram-exports" / "trendex_and_beauty"
MESSAGES_PATH = EXPORT_DIR / "messages.jsonl"
CHAT_META_PATH = EXPORT_DIR / "chat.json"
OUTPUT_DIR = EXPORT_DIR / "text-knowledge"
RAW_DIR = OUTPUT_DIR / "raw"


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def normalize_text(text: str) -> str:
    cleaned = str(text or "").replace("\xa0", " ").replace("\r", "\n")
    cleaned = cleaned.replace("ё", "е").replace("Ё", "Е")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def normalize_for_dedupe(text: str) -> str:
    text = normalize_text(text).lower()
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"@\w+", " ", text)
    text = re.sub(r"[^0-9a-zа-я\s]+", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def looks_useful(text: str) -> bool:
    cleaned = normalize_text(text)
    if len(cleaned) < 35:
        return False
    if re.fullmatch(r"https?://\S+", cleaned):
        return False
    if re.fullmatch(r"[\W_]+", cleaned):
        return False
    return True


PRODUCT_ALIASES: dict[str, list[str]] = {
    "Сыворотка H538": ["h538", "h 538", "сыворотк h538", "сыворотка н538", "сыворотки h538", "н 538", "н538"],
    "Дигидрокверцетин": ["дигидрокверцетин", "дгк", "мицеллированный дигидрокверцетин", "мицеллированный дгк"],
    "Живая вода": ["живая вода"],
    "Олигохит": ["олигохит", "олигохит остео", "олигохит-остео"],
    "Бальзам Премиум": ["бальзам премиум", "бальзам n7", "бальзам n 7", "ведова"],
    "Борофлавин": ["борофлавин"],
    "Наносеребро": ["наносеребро", "нано серебро", "silverfleece", "серебро"],
    "Темпулис": ["темпулис"],
    "Гиксанидин": ["гиксанидин"],
    "Йод 53": ["йод 53"],
}


CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "company": [
        "компания",
        "trendex",
        "x health",
        "миссия",
        "совладел",
        "доли",
        "офис",
        "пространство",
        "производств",
        "каталог",
        "направление",
        "совладель",
        "рынок",
        "маркетплейс",
    ],
    "products": [
        "продукт",
        "продукц",
        "препарат",
        "состав",
        "линейк",
        "сыворот",
        "бальзам",
        "дигидрокверцетин",
        "живая вода",
        "олигохит",
        "h538",
        "борофлавин",
        "серебро",
        "наносеребро",
        "темпулис",
    ],
    "reviews": [
        "отзыв",
        "результат",
        "помог",
        "помогло",
        "эффект",
        "опыт",
        "в полном восторге",
        "рекомендую",
        "после процедуры",
        "после применения",
        "фанат",
        "чудо",
        "лучше",
    ],
    "instructions_usage": [
        "инструкция",
        "способ применения",
        "как пользоваться",
        "как принимать",
        "как наносить",
        "как применять",
        "сколько",
        "дозиров",
        "курс",
        "смывать",
        "наносить",
        "показания",
        "можно ли",
        "при низком давлении",
    ],
    "events_broadcasts": [
        "эфир",
        "встреча",
        "вебинар",
        "конференц",
        "онлайн",
        "врач косметолог",
        "чат с сывороткой",
        "завтра",
        "сегодня",
        "обновляться",
    ],
    "business_context": [
        "доли компании",
        "совладель",
        "маркетплейс",
        "продаваться",
        "приобрести",
        "продажа",
        "администраторам",
        "стоить",
        "1000 рублей",
        "крупных мировых маркетплейсах",
        "всему миру",
    ],
}


@dataclass
class Record:
    id: int
    date: str
    text: str
    categories: list[str]
    products: list[str]
    score: int
    url: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "date": self.date,
            "text": self.text,
            "categories": self.categories,
            "products": self.products,
            "score": self.score,
            "url": self.url,
        }


def detect_products(lowered: str) -> list[str]:
    matches: list[str] = []
    for product, aliases in PRODUCT_ALIASES.items():
        if any(alias in lowered for alias in aliases):
            matches.append(product)
    return matches


def score_categories(lowered: str, products: list[str]) -> dict[str, int]:
    scores: dict[str, int] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for keyword in keywords:
            if keyword in lowered:
                score += 1
        if category == "products" and products:
            score += len(products)
        if category == "reviews" and re.search(r"\b(я|мне|у меня|мы)\b", lowered) and ("результ" in lowered or "эффект" in lowered or "рекоменд" in lowered):
            score += 1
        if score > 0:
            scores[category] = score
    return scores


def load_chat_meta() -> dict[str, Any]:
    if CHAT_META_PATH.exists():
        return json.loads(CHAT_META_PATH.read_text(encoding="utf-8"))
    return {}


def build_message_url(username: str, message_id: int) -> str:
    username = (username or "X_Health_and_Beauty").strip("@")
    return f"https://t.me/{username}/{message_id}"


def load_records() -> list[Record]:
    meta = load_chat_meta()
    username = meta.get("username") or "X_Health_and_Beauty"
    seen: set[str] = set()
    records: list[Record] = []

    with MESSAGES_PATH.open("r", encoding="utf-8") as fh:
        for raw in fh:
            item = json.loads(raw)
            text = normalize_text(item.get("message") or "")
            if not looks_useful(text):
                continue

            lowered = text.lower().replace("ё", "е")
            products = detect_products(lowered)
            category_scores = score_categories(lowered, products)
            if not category_scores:
                continue

            dedupe_key = normalize_for_dedupe(text)
            if not dedupe_key or dedupe_key in seen:
                continue
            seen.add(dedupe_key)

            categories = [name for name, _ in sorted(category_scores.items(), key=lambda pair: (-pair[1], pair[0]))]
            total_score = sum(category_scores.values())
            records.append(Record(
                id=int(item.get("id") or 0),
                date=str(item.get("date") or ""),
                text=text,
                categories=categories,
                products=products,
                score=total_score,
                url=build_message_url(username, int(item.get("id") or 0)),
            ))

    records.sort(key=lambda rec: (rec.date, rec.id))
    return records


def write_jsonl(path: Path, items: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for item in items:
            fh.write(json.dumps(item, ensure_ascii=False) + "\n")


def write_markdown_category(path: Path, title: str, records: list[Record]) -> None:
    lines = [f"# {title}", "", f"Всего записей: {len(records)}", ""]
    for rec in records:
        lines.append(f"## {rec.date} | #{rec.id}")
        if rec.products:
            lines.append(f"Продукты: {', '.join(rec.products)}")
        lines.append(rec.text)
        lines.append(f"Источник: {rec.url}")
        lines.append("")
    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def build_overview(records: list[Record]) -> str:
    by_category: dict[str, list[Record]] = defaultdict(list)
    product_counter: Counter[str] = Counter()
    for rec in records:
        for category in rec.categories:
            by_category[category].append(rec)
        for product in rec.products:
            product_counter[product] += 1

    lines = [
        "# Trendex Chat Text Knowledge",
        "",
        f"Всего полезных текстовых записей: {len(records)}",
        "",
        "## Категории",
        "",
    ]
    for category in sorted(by_category):
        lines.append(f"- {category}: {len(by_category[category])}")

    lines.extend([
        "",
        "## Топ продуктовых упоминаний",
        "",
    ])
    for product, count in product_counter.most_common(20):
        lines.append(f"- {product}: {count}")

    lines.extend([
        "",
        "## Что лежит в папке",
        "",
        "- `raw/*.jsonl` — полный набор записей по категориям",
        "- `company.md` — сообщения о компании, миссии, офисах, долях, развитии",
        "- `products.md` — продуктовые описания и сведения о линейках",
        "- `reviews.md` — отзывы, результаты, личный опыт и эффекты",
        "- `instructions_usage.md` — вопросы и тексты по применению, составам, курсам",
        "- `events_broadcasts.md` — эфиры, встречи, анонсы, обновления чатов",
        "- `business_context.md` — контекст продаж, партнёрства, маркетплейсов, долей",
        "",
        "## PDF каталог",
        "",
        "- Закреплённый PDF найден и скачан: `media/document/00020736.pdf`",
        "- У PDF, похоже, нет нормального текстового слоя: стандартное извлечение текста из страниц почти пустое",
        "- Для полного текста каталога понадобится OCR-этап отдельно",
        "",
    ])
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    configure_stdout()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    records = load_records()
    by_category: dict[str, list[Record]] = defaultdict(list)
    all_items = [rec.as_dict() for rec in records]
    for rec in records:
        for category in rec.categories:
            by_category[category].append(rec)

    write_jsonl(RAW_DIR / "all_useful.jsonl", all_items)
    for category, items in by_category.items():
        write_jsonl(RAW_DIR / f"{category}.jsonl", [item.as_dict() for item in items])

    write_markdown_category(OUTPUT_DIR / "company.md", "Компания", by_category.get("company", []))
    write_markdown_category(OUTPUT_DIR / "products.md", "Продукция", by_category.get("products", []))
    write_markdown_category(OUTPUT_DIR / "reviews.md", "Отзывы и результаты", by_category.get("reviews", []))
    write_markdown_category(OUTPUT_DIR / "instructions_usage.md", "Инструкции и применение", by_category.get("instructions_usage", []))
    write_markdown_category(OUTPUT_DIR / "events_broadcasts.md", "Эфиры и события", by_category.get("events_broadcasts", []))
    write_markdown_category(OUTPUT_DIR / "business_context.md", "Бизнес-контекст", by_category.get("business_context", []))

    overview = build_overview(records)
    (OUTPUT_DIR / "README.md").write_text(overview, encoding="utf-8")

    summary = {
        "records_total": len(records),
        "categories": {category: len(items) for category, items in sorted(by_category.items())},
        "output_dir": str(OUTPUT_DIR),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
