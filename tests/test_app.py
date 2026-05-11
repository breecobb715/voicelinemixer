import io

import pytest

import app as app_module


@pytest.fixture
def client(tmp_path, monkeypatch):
    audio = tmp_path / "audio"
    audio.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(app_module, "AUDIO_DIR", audio)
    monkeypatch.setattr(app_module, "MANIFEST_PATH", audio / "manifest.json")
    flask_app = app_module.create_app()
    flask_app.config["TESTING"] = True
    return flask_app.test_client()


def test_api_state_bootstraps_default_tab(client):
    r = client.get("/api/state")
    assert r.status_code == 200
    data = r.get_json()
    assert len(data["tabs"]) == 1
    assert data["tabs"][0]["name"] == "Soundboard"
    assert data["buttons"] == []


def test_create_and_delete_button(client):
    st = client.get("/api/state").get_json()
    tab_id = st["tabs"][0]["id"]
    r = client.post(
        "/api/buttons",
        data={
            "file": (io.BytesIO(b"fake-wav"), "test.wav"),
            "name": "Door",
            "description": "creak",
            "tabId": tab_id,
            "color": "#336699",
        },
        content_type="multipart/form-data",
    )
    assert r.status_code == 201
    bid = r.get_json()["id"]
    st2 = client.get("/api/state").get_json()
    assert len(st2["buttons"]) == 1

    r_del = client.delete(f"/api/buttons/{bid}")
    assert r_del.status_code == 200
    st3 = client.get("/api/state").get_json()
    assert st3["buttons"] == []


def test_cannot_delete_last_tab(client):
    st = client.get("/api/state").get_json()
    tab_id = st["tabs"][0]["id"]
    r = client.delete(f"/api/tabs/{tab_id}")
    assert r.status_code == 400


def test_second_tab_can_be_deleted_and_removes_buttons(client):
    st = client.get("/api/state").get_json()
    first_id = st["tabs"][0]["id"]
    r_tab = client.post(
        "/api/tabs",
        json={"name": "Combat", "description": "", "backgroundColor": "#222222"},
    )
    assert r_tab.status_code == 201
    second_id = r_tab.get_json()["id"]

    client.post(
        "/api/buttons",
        data={
            "file": (io.BytesIO(b"x"), "a.wav"),
            "name": "Swing",
            "tabId": second_id,
            "color": "#111111",
        },
        content_type="multipart/form-data",
    )

    r_del = client.delete(f"/api/tabs/{second_id}")
    assert r_del.status_code == 200
    st2 = client.get("/api/state").get_json()
    assert len(st2["tabs"]) == 1
    assert st2["tabs"][0]["id"] == first_id
    assert st2["buttons"] == []


def test_max_buttons_per_tab(client):
    st = client.get("/api/state").get_json()
    tab_id = st["tabs"][0]["id"]
    for i in range(30):
        r = client.post(
            "/api/buttons",
            data={
                "file": (io.BytesIO(b"x"), f"{i}.wav"),
                "name": f"B{i}",
                "tabId": tab_id,
                "color": "#000000",
            },
            content_type="multipart/form-data",
        )
        assert r.status_code == 201
    r_fail = client.post(
        "/api/buttons",
        data={
            "file": (io.BytesIO(b"x"), "extra.wav"),
            "name": "TooMany",
            "tabId": tab_id,
            "color": "#000000",
        },
        content_type="multipart/form-data",
    )
    assert r_fail.status_code == 400


def test_bulk_move(client):
    st = client.get("/api/state").get_json()
    t1 = st["tabs"][0]["id"]
    r2 = client.post(
        "/api/tabs",
        json={"name": "Other", "description": "", "backgroundColor": "#333333"},
    )
    t2 = r2.get_json()["id"]

    r_a = client.post(
        "/api/buttons",
        data={
            "file": (io.BytesIO(b"a"), "a.wav"),
            "name": "A",
            "tabId": t1,
            "color": "#111111",
        },
        content_type="multipart/form-data",
    )
    r_b = client.post(
        "/api/buttons",
        data={
            "file": (io.BytesIO(b"b"), "b.wav"),
            "name": "B",
            "tabId": t1,
            "color": "#222222",
        },
        content_type="multipart/form-data",
    )
    id_a = r_a.get_json()["id"]
    id_b = r_b.get_json()["id"]

    r_move = client.post(
        "/api/bulk/move",
        json={"buttonIds": [id_a, id_b], "tabId": t2},
    )
    assert r_move.status_code == 200
    st2 = client.get("/api/state").get_json()
    on_t2 = [b for b in st2["buttons"] if b["tabId"] == t2]
    assert len(on_t2) == 2


def test_bulk_delete(client):
    st = client.get("/api/state").get_json()
    tab_id = st["tabs"][0]["id"]
    r_a = client.post(
        "/api/buttons",
        data={
            "file": (io.BytesIO(b"a"), "a.wav"),
            "name": "A",
            "tabId": tab_id,
            "color": "#111111",
        },
        content_type="multipart/form-data",
    )
    id_a = r_a.get_json()["id"]
    r_del = client.post("/api/bulk/delete", json={"buttonIds": [id_a]})
    assert r_del.status_code == 200
    st2 = client.get("/api/state").get_json()
    assert st2["buttons"] == []
