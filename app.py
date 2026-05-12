"""
Local soundboard web app: Flask API + single-page Bootstrap UI.
Persists metadata in audio/manifest.json; stores files under audio/.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, abort, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
MANIFEST_PATH = AUDIO_DIR / "manifest.json"

ALLOWED_EXTENSIONS = {".mp3", ".wav"}
MAX_BUTTONS_PER_TAB = 30

MAX_BUTTON_NAME_LEN = 50
MAX_BUTTON_DESCRIPTION_LEN = 100
MAX_TAB_NAME_LEN = 75
MAX_TAB_DESCRIPTION_LEN = 100

DEFAULT_TAB_BG = "#F8F9FA"
DEFAULT_BUTTON_COLOR = "#4059AD"


def reject_if_over_max(label: str, value: str, max_len: int) -> str | None:
    """Return error message if stripped value exceeds max_len; otherwise None."""
    if len(value) > max_len:
        return f"{label} must be at most {max_len} characters"
    return None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_audio_dir() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def default_manifest() -> dict[str, Any]:
    tid = str(uuid.uuid4())
    return {
        "version": 1,
        "tabs": [
            {
                "id": tid,
                "name": "Soundboard",
                "description": "",
                "backgroundColor": DEFAULT_TAB_BG,
                "createdAt": utc_now_iso(),
                "updatedAt": utc_now_iso(),
            }
        ],
        "buttons": [],
    }


def load_manifest() -> dict[str, Any]:
    ensure_audio_dir()
    if not MANIFEST_PATH.is_file():
        data = default_manifest()
        save_manifest_atomic(data)
        return data
    try:
        with MANIFEST_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        data = default_manifest()
        save_manifest_atomic(data)
        return data

    if not isinstance(data, dict):
        data = default_manifest()
        save_manifest_atomic(data)
        return data

    data.setdefault("version", 1)
    data.setdefault("tabs", [])
    data.setdefault("buttons", [])

    # Ensure at least one tab exists
    if not data["tabs"]:
        data["tabs"] = default_manifest()["tabs"]
    reconcile_manifest(data)
    return data


def save_manifest_atomic(data: dict[str, Any]) -> None:
    ensure_audio_dir()
    data["version"] = data.get("version", 1)
    serialized = json.dumps(data, indent=2, ensure_ascii=False)
    fd, tmp_path = tempfile.mkstemp(
        dir=str(AUDIO_DIR), prefix=".manifest_", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp:
            tmp.write(serialized)
        os.replace(tmp_path, MANIFEST_PATH)
    except Exception:
        try:
            Path(tmp_path).unlink(missing_ok=True)
        except OSError:
            pass
        raise


def reconcile_manifest(data: dict[str, Any]) -> None:
    """Remove button rows whose audio files are missing; trim unknown tab refs."""
    tab_ids = {t["id"] for t in data["tabs"] if isinstance(t, dict) and "id" in t}
    buttons_out = []
    changed = False
    for b in data.get("buttons", []):
        if not isinstance(b, dict) or "id" not in b:
            changed = True
            continue
        fp = b.get("filePath")
        nb = normalize_audio_basename(str(fp)) if fp else None
        if not nb or not (AUDIO_DIR / nb).is_file():
            changed = True
            continue
        if b.get("tabId") not in tab_ids:
            changed = True
            continue
        buttons_out.append(b)
    if len(buttons_out) != len(data.get("buttons", [])):
        data["buttons"] = buttons_out
        changed = True
    if changed:
        save_manifest_atomic(data)


def normalize_audio_basename(name: str) -> str | None:
    if not name or not isinstance(name, str):
        return None
    base = os.path.basename(name.strip())
    if not base or base != name.strip() or ".." in base:
        return None
    return base


def safe_audio_basename(name: str) -> str:
    base = normalize_audio_basename(name)
    if not base:
        abort(400, description="Invalid file path")
    return base


def extension_allowed(filename: str) -> bool:
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS


def unique_stored_filename(original_name: str) -> str:
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".bin"
    stem = secure_filename(Path(original_name).stem) or "audio"
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", stem)[:80]
    return f"{uuid.uuid4()}_{stem}{ext}"


def count_buttons_on_tab(data: dict[str, Any], tab_id: str) -> int:
    return sum(1 for b in data["buttons"] if b.get("tabId") == tab_id)


def tab_by_id(data: dict[str, Any], tab_id: str) -> dict[str, Any] | None:
    for t in data["tabs"]:
        if t.get("id") == tab_id:
            return t
    return None


def button_by_id(data: dict[str, Any], bid: str) -> dict[str, Any] | None:
    for b in data["buttons"]:
        if b.get("id") == bid:
            return b
    return None


def delete_audio_file(file_path: str) -> None:
    base = normalize_audio_basename(file_path)
    if not base:
        return
    p = AUDIO_DIR / base
    if p.is_file() and p.resolve().parent == AUDIO_DIR.resolve():
        p.unlink()


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )
    app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/audio/<path:name>")
    def serve_audio(name):
        base = safe_audio_basename(name)
        return send_from_directory(AUDIO_DIR, base, mimetype=None)

    @app.route("/api/state", methods=["GET"])
    def api_state():
        data = load_manifest()
        return jsonify(
            {
                "tabs": data["tabs"],
                "buttons": data["buttons"],
                "maxButtonsPerTab": MAX_BUTTONS_PER_TAB,
            }
        )

    @app.route("/api/tabs", methods=["POST"])
    def api_create_tab():
        data = load_manifest()
        body = request.get_json(silent=True) or {}
        name = (body.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Tab name is required"}), 400
        err = reject_if_over_max("Tab name", name, MAX_TAB_NAME_LEN)
        if err:
            return jsonify({"error": err}), 400
        description = (body.get("description") or "").strip()
        err = reject_if_over_max("Tab description", description, MAX_TAB_DESCRIPTION_LEN)
        if err:
            return jsonify({"error": err}), 400
        bg = (body.get("backgroundColor") or DEFAULT_TAB_BG).strip()
        tid = str(uuid.uuid4())
        now = utc_now_iso()
        data["tabs"].append(
            {
                "id": tid,
                "name": name,
                "description": description,
                "backgroundColor": bg,
                "createdAt": now,
                "updatedAt": now,
            }
        )
        save_manifest_atomic(data)
        return jsonify(tab_by_id(data, tid)), 201

    @app.route("/api/tabs/<tab_id>", methods=["PUT"])
    def api_update_tab(tab_id):
        data = load_manifest()
        tab = tab_by_id(data, tab_id)
        if not tab:
            return jsonify({"error": "Tab not found"}), 404
        body = request.get_json(silent=True) or {}
        if "name" in body:
            n = (body.get("name") or "").strip()
            if not n:
                return jsonify({"error": "Tab name cannot be empty"}), 400
            err = reject_if_over_max("Tab name", n, MAX_TAB_NAME_LEN)
            if err:
                return jsonify({"error": err}), 400
            tab["name"] = n
        if "description" in body:
            d = (body.get("description") or "").strip()
            err = reject_if_over_max("Tab description", d, MAX_TAB_DESCRIPTION_LEN)
            if err:
                return jsonify({"error": err}), 400
            tab["description"] = d
        if "backgroundColor" in body:
            tab["backgroundColor"] = (body.get("backgroundColor") or DEFAULT_TAB_BG).strip()
        tab["updatedAt"] = utc_now_iso()
        save_manifest_atomic(data)
        return jsonify(tab)

    @app.route("/api/tabs/<tab_id>", methods=["DELETE"])
    def api_delete_tab(tab_id):
        data = load_manifest()
        if len(data["tabs"]) <= 1:
            return jsonify({"error": "Cannot delete the last tab"}), 400
        tab = tab_by_id(data, tab_id)
        if not tab:
            return jsonify({"error": "Tab not found"}), 404
        to_remove = [b for b in data["buttons"] if b.get("tabId") == tab_id]
        for b in to_remove:
            delete_audio_file(b.get("filePath", ""))
        data["buttons"] = [b for b in data["buttons"] if b.get("tabId") != tab_id]
        data["tabs"] = [t for t in data["tabs"] if t.get("id") != tab_id]
        save_manifest_atomic(data)
        return jsonify({"ok": True})

    @app.route("/api/buttons", methods=["POST"])
    def api_create_button():
        data = load_manifest()
        tab_id = (request.form.get("tabId") or request.form.get("tab_id") or "").strip()
        name = (request.form.get("name") or "").strip()
        description = (request.form.get("description") or "").strip()
        color = (request.form.get("color") or DEFAULT_BUTTON_COLOR).strip()
        if not tab_id or not tab_by_id(data, tab_id):
            return jsonify({"error": "Valid tab is required"}), 400
        if not name:
            return jsonify({"error": "Name is required"}), 400
        err = reject_if_over_max("Name", name, MAX_BUTTON_NAME_LEN)
        if err:
            return jsonify({"error": err}), 400
        err = reject_if_over_max("Description", description, MAX_BUTTON_DESCRIPTION_LEN)
        if err:
            return jsonify({"error": err}), 400
        if count_buttons_on_tab(data, tab_id) >= MAX_BUTTONS_PER_TAB:
            return jsonify({"error": f"Tab already has {MAX_BUTTONS_PER_TAB} buttons"}), 400
        f = request.files.get("file")
        if not f or not f.filename:
            return jsonify({"error": "Audio file is required"}), 400
        if not extension_allowed(f.filename):
            return jsonify({"error": "Only .mp3 and .wav files are allowed"}), 400
        stored = unique_stored_filename(f.filename)
        ensure_audio_dir()
        f.save(AUDIO_DIR / stored)
        now = utc_now_iso()
        bid = str(uuid.uuid4())
        row = {
            "id": bid,
            "tabId": tab_id,
            "name": name,
            "description": description,
            "color": color,
            "filePath": stored,
            "createdAt": now,
            "updatedAt": now,
        }
        data["buttons"].append(row)
        save_manifest_atomic(data)
        return jsonify(row), 201

    @app.route("/api/buttons/<button_id>", methods=["PUT"])
    def api_update_button(button_id):
        data = load_manifest()
        btn = button_by_id(data, button_id)
        if not btn:
            return jsonify({"error": "Button not found"}), 404

        new_tab = request.form.get("tabId") or request.form.get("tab_id")
        new_name = request.form.get("name")
        new_desc = request.form.get("description")
        new_color = request.form.get("color")
        f = request.files.get("file")

        target_tab = btn["tabId"]
        if new_tab is not None:
            new_tab = new_tab.strip()
            if not tab_by_id(data, new_tab):
                return jsonify({"error": "Invalid tab"}), 400
            target_tab = new_tab

        # If moving tab, check capacity on destination (button counts until reassigned)
        if target_tab != btn["tabId"]:
            dest_count = count_buttons_on_tab(data, target_tab)
            if dest_count >= MAX_BUTTONS_PER_TAB:
                return jsonify({"error": f"Target tab already has {MAX_BUTTONS_PER_TAB} buttons"}), 400

        if new_name is not None:
            n = new_name.strip()
            if not n:
                return jsonify({"error": "Name cannot be empty"}), 400
            err = reject_if_over_max("Name", n, MAX_BUTTON_NAME_LEN)
            if err:
                return jsonify({"error": err}), 400
            btn["name"] = n
        if new_desc is not None:
            d = new_desc.strip()
            err = reject_if_over_max("Description", d, MAX_BUTTON_DESCRIPTION_LEN)
            if err:
                return jsonify({"error": err}), 400
            btn["description"] = d
        if new_color is not None:
            btn["color"] = new_color.strip() or DEFAULT_BUTTON_COLOR

        if f and f.filename:
            if not extension_allowed(f.filename):
                return jsonify({"error": "Only .mp3 and .wav files are allowed"}), 400
            old_file = btn.get("filePath")
            stored = unique_stored_filename(f.filename)
            ensure_audio_dir()
            f.save(AUDIO_DIR / stored)
            if old_file:
                delete_audio_file(old_file)
            btn["filePath"] = stored

        btn["tabId"] = target_tab
        btn["updatedAt"] = utc_now_iso()
        save_manifest_atomic(data)
        return jsonify(btn)

    @app.route("/api/buttons/<button_id>", methods=["DELETE"])
    def api_delete_button(button_id):
        data = load_manifest()
        btn = button_by_id(data, button_id)
        if not btn:
            return jsonify({"error": "Button not found"}), 404
        delete_audio_file(btn.get("filePath", ""))
        data["buttons"] = [b for b in data["buttons"] if b.get("id") != button_id]
        save_manifest_atomic(data)
        return jsonify({"ok": True})

    @app.route("/api/bulk/move", methods=["POST"])
    def api_bulk_move():
        data = load_manifest()
        body = request.get_json(silent=True) or {}
        ids = body.get("buttonIds") or body.get("ids") or []
        tab_id = (body.get("tabId") or "").strip()
        if not isinstance(ids, list) or not ids:
            return jsonify({"error": "buttonIds must be a non-empty list"}), 400
        if not tab_by_id(data, tab_id):
            return jsonify({"error": "Invalid tab"}), 400
        unique_ids = list(dict.fromkeys(str(i) for i in ids))
        moving = [button_by_id(data, i) for i in unique_ids]
        if any(b is None for b in moving):
            return jsonify({"error": "One or more buttons not found"}), 404
        # Count after move: destination current count minus already-on-tab
        dest_current = count_buttons_on_tab(data, tab_id)
        from_elsewhere = sum(1 for b in moving if b.get("tabId") != tab_id)
        if dest_current + from_elsewhere > MAX_BUTTONS_PER_TAB:
            return jsonify(
                {"error": f"Cannot move: target would exceed {MAX_BUTTONS_PER_TAB} buttons"}
            ), 400
        for b in moving:
            b["tabId"] = tab_id
            b["updatedAt"] = utc_now_iso()
        save_manifest_atomic(data)
        return jsonify({"ok": True, "moved": len(moving)})

    @app.route("/api/bulk/delete", methods=["POST"])
    def api_bulk_delete():
        data = load_manifest()
        body = request.get_json(silent=True) or {}
        ids = body.get("buttonIds") or body.get("ids") or []
        if not isinstance(ids, list) or not ids:
            return jsonify({"error": "buttonIds must be a non-empty list"}), 400
        unique_ids = list(dict.fromkeys(str(i) for i in ids))
        for bid in unique_ids:
            btn = button_by_id(data, bid)
            if btn:
                delete_audio_file(btn.get("filePath", ""))
        id_set = set(unique_ids)
        data["buttons"] = [b for b in data["buttons"] if b.get("id") not in id_set]
        save_manifest_atomic(data)
        return jsonify({"ok": True})

    return app


app = create_app()


if __name__ == "__main__":
    ensure_audio_dir()
    app.run(host="127.0.0.1", port=5000, debug=True)
