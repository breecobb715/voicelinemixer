# voicelinemixer

A simple local web soundboard: upload `.mp3` / `.wav` clips, organize them into tabs, and trigger playback from colored buttons.

## Implementation

This project follows **Plan B** (JSON API + Bootstrap UI). See [plans/BASELINE.md](plans/BASELINE.md) and [plans/plan-b-balanced.md](plans/plan-b-balanced.md).

## Requirements

- Python 3.9+

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Uploaded audio and `manifest.json` live under `audio/`, which is **gitignored**.

## Run

```bash
python3 app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000).

## Tests

```bash
pytest tests/ -v
```

## Usage notes

- **Play**: click a clip button. Multiple clips can overlap (each click starts a new playback).
- **Description**: hover a clip button to see its description (if set).
- **Edit clip**: right-click a button, or use **Select** for bulk move/delete.
- **Edit tab**: click the gear icon next to a tab name.
- **Tabs**: at most **30** clips per tab. You cannot delete the last remaining tab.
