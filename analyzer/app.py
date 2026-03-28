import hashlib
import json
import math
import os
import re
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse


DIMENSION = int(os.getenv("ANALYZER_FALLBACK_DIMENSION", "128"))
MODEL_NAME = os.getenv("ANALYZER_MODEL_NAME", "fallback-hash-zh-v1")
ANALYSIS_VERSION = os.getenv("ANALYSIS_VERSION", "v1")
INTERNAL_TOKEN = os.getenv("ANALYZER_INTERNAL_TOKEN")

POSITIVE_WORDS = {
    "开心",
    "轻盈",
    "希望",
    "温柔",
    "平静",
    "愉悦",
    "松弛",
    "庆幸",
    "振奋",
    "被理解",
    "治愈",
}
NEGATIVE_WORDS = {
    "难过",
    "低落",
    "疲惫",
    "迷茫",
    "失眠",
    "委屈",
    "心酸",
    "愧疚",
    "慌张",
    "无奈",
    "苦涩",
    "不安",
}
MOOD_ANCHORS = [
    ("hope", ("希望", "庆幸", "振奋", "被点亮")),
    ("calm", ("平静", "安心", "松弛", "安定")),
    ("sadness", ("低落", "难过", "委屈", "心酸")),
    ("fatigue", ("疲惫", "想休息", "失眠", "窒闷")),
    ("connection", ("被理解", "想靠近", "想拥抱", "想被看见")),
    ("confusion", ("迷茫", "迟疑", "发懵", "失重")),
]


def normalize_text(parts: list[str]) -> str:
    text = " ".join(part.strip() for part in parts if part and part.strip())
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def tokenize(text: str) -> list[str]:
    if not text:
      return []
    latin = re.findall(r"[a-z0-9]+", text.lower())
    han = re.findall(r"[\u4e00-\u9fff]{1,4}", text)
    return latin + han


def hashed_embedding(text: str, dimension: int = DIMENSION) -> list[float]:
    vector = [0.0] * dimension
    if not text:
        return vector
    tokens = tokenize(text)
    if not tokens:
        tokens = [text]
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        for index in range(0, len(digest), 4):
            slot = int.from_bytes(digest[index : index + 4], "big") % dimension
            sign = 1.0 if digest[index] % 2 == 0 else -1.0
            vector[slot] += sign
    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 0:
        return vector
    return [round(value / norm, 6) for value in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return sum(a * b for a, b in zip(left, right))


def detect_sentiment(text: str, moods: list[str]) -> str:
    merged = set(tokenize(text)) | set(moods)
    positive_hits = len(merged & POSITIVE_WORDS)
    negative_hits = len(merged & NEGATIVE_WORDS)
    if positive_hits > negative_hits:
        return "positive"
    if negative_hits > positive_hits:
        return "negative"
    return "neutral"


def infer_moods(text: str, extra_moods: list[str], custom_mood: str | None) -> list[str]:
    labels: list[str] = []
    for mood in extra_moods:
        cleaned = mood.strip()
        if cleaned and cleaned not in labels:
            labels.append(cleaned)

    if custom_mood:
        cleaned = custom_mood.strip()
        if cleaned and cleaned not in labels:
            labels.append(cleaned)

    if labels:
        return labels[:3]

    tokens = set(tokenize(text))
    for _, anchor_words in MOOD_ANCHORS:
        hits = [word for word in anchor_words if word in tokens]
        if hits:
            return list(hits[:2])

    return []


def infer_topic_label(tokens: list[str], moods: list[str]) -> str | None:
    for mood in moods:
        if mood:
            return mood
    for token in tokens:
        if len(token) >= 2:
            return token[:12]
    return None


def stable_topic_id(scope: str, topic_label: str | None, moods: list[str]) -> str | None:
    base = topic_label or (moods[0] if moods else None)
    if not base:
        return None
    seed = f"{scope}:{base}".encode("utf-8")
    return hashlib.sha1(seed).hexdigest()[:12]


def project_coords(vector: list[float], topic_seed: str | None) -> tuple[float, float]:
    if not vector:
        return (0.0, 0.0)
    even = sum(vector[index] for index in range(0, len(vector), 2))
    odd = sum(vector[index] for index in range(1, len(vector), 2))
    base_x = even * 220.0
    base_y = odd * 220.0
    if topic_seed:
        digest = hashlib.md5(topic_seed.encode("utf-8")).digest()
        base_x += (digest[0] - 128) * 0.35
        base_y += (digest[1] - 128) * 0.35
    return (round(base_x, 4), round(base_y, 4))


def hours_between(left: str | None, right: str | None) -> float | None:
    if not left or not right:
        return None
    try:
        left_dt = datetime.fromisoformat(left.replace("Z", "+00:00"))
        right_dt = datetime.fromisoformat(right.replace("Z", "+00:00"))
    except ValueError:
        return None
    return abs((left_dt - right_dt).total_seconds()) / 3600.0


def embed_record(scope: str, payload: dict[str, Any]) -> dict[str, Any]:
    text = normalize_text(
        [
            payload.get("moodPhrase", ""),
            payload.get("quote", ""),
            payload.get("description", ""),
            " ".join(payload.get("tags", [])),
            " ".join(payload.get("extraEmotions", [])),
            payload.get("customMoodPhrase", "") or "",
        ]
    )
    tokens = tokenize(text)
    moods = infer_moods(text, payload.get("extraEmotions", []), payload.get("customMoodPhrase"))
    sentiment = detect_sentiment(text, moods)
    topic_label = infer_topic_label(tokens, moods)
    topic_id = stable_topic_id(scope, topic_label, moods)
    vector = hashed_embedding(text)
    coord_x, coord_y = project_coords(vector, topic_id)
    return {
        "recordId": payload["recordId"],
        "modelName": MODEL_NAME,
        "vector": vector,
        "topicId": topic_id,
        "topicLabel": topic_label,
        "moodLabels": moods,
        "sentimentPolarity": sentiment,
        "coordX": coord_x,
        "coordY": coord_y,
        "analysisVersion": ANALYSIS_VERSION,
    }


def build_link_batch(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload["source"]
    candidates = payload.get("candidates", [])
    max_links = int(payload.get("maxLinks", 8))
    results: list[dict[str, Any]] = []

    for candidate in candidates:
        similarity = cosine_similarity(source.get("vector", []), candidate.get("vector", []))
        shared_mood = bool(set(source.get("moodLabels", [])) & set(candidate.get("moodLabels", [])))
        same_topic = bool(source.get("topicId") and source.get("topicId") == candidate.get("topicId"))
        hour_delta = hours_between(source.get("createdAt"), candidate.get("createdAt"))

        link_type = None
        reason = None
        if similarity >= 0.78:
            link_type = "semantic"
            reason = "cosine>=0.78"
        elif same_topic and similarity >= 0.68:
            link_type = "resonance"
            reason = "same_topic_and_cosine>=0.68"
        elif shared_mood and similarity >= 0.66:
            link_type = "resonance"
            reason = "shared_mood_and_cosine>=0.66"
        elif hour_delta is not None and hour_delta <= 72 and similarity >= 0.62:
            link_type = "time"
            reason = "within_72h_and_cosine>=0.62"

        if not link_type:
            continue

        results.append(
            {
                "targetRecordId": candidate["recordId"],
                "linkType": link_type,
                "strength": round(min(0.99, max(similarity, 0.2)), 4),
                "linkReason": reason,
            }
        )

    results.sort(key=lambda item: (-item["strength"], item["targetRecordId"]))
    return {"links": results[:max_links]}


def recluster_scope(payload: dict[str, Any]) -> dict[str, Any]:
    scope = payload["scope"]
    records = payload.get("records", [])
    analyses = [embed_record(scope, record) for record in records]
    return {
        "scope": scope,
        "clusterVersion": int(payload.get("clusterVersion", 1)) + 1,
        "records": analyses,
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def _check_auth(self) -> bool:
        if not INTERNAL_TOKEN:
            return True
        provided = self.headers.get("X-Analyzer-Token")
        return provided == INTERNAL_TOKEN

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/healthz":
            self._send(200, {"ok": True, "modelName": MODEL_NAME, "analysisVersion": ANALYSIS_VERSION})
            return
        self._send(404, {"message": "Not found"})

    def do_POST(self) -> None:
        if not self._check_auth():
            self._send(403, {"message": "Forbidden"})
            return

        path = urlparse(self.path).path
        payload = self._read_json()
        if path == "/internal/analyzer/embed-batch":
            scope = payload["scope"]
            records = [embed_record(scope, record) for record in payload.get("records", [])]
            self._send(200, {"scope": scope, "records": records})
            return
        if path == "/internal/analyzer/link-batch":
            self._send(200, build_link_batch(payload))
            return
        if path == "/internal/analyzer/recluster-scope":
            self._send(200, recluster_scope(payload))
            return
        self._send(404, {"message": "Not found"})


def main() -> None:
    host = os.getenv("ANALYZER_HOST", "0.0.0.0")
    port = int(os.getenv("ANALYZER_PORT", "8088"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Analyzer listening on {host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
