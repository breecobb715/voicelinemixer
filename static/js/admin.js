/**
 * API calls, forms, bulk selection, and modals.
 */

(function () {
  const Admin = {
    async refreshState() {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("Failed to load state");
      const data = await res.json();
      Soundboard.setState({
        tabs: data.tabs || [],
        buttons: data.buttons || [],
        maxButtonsPerTab: data.maxButtonsPerTab ?? 30,
      });
      this.fillTabSelects();
    },

    fillTabSelects() {
      const sels = [
        document.getElementById("uploadTabId"),
        document.getElementById("editButtonTabId"),
        document.getElementById("bulkMoveTab"),
      ].filter(Boolean);
      const tabs = Soundboard.state.tabs || [];
      for (const sel of sels) {
        const cur = sel.value;
        sel.innerHTML = "";
        tabs.forEach((t) => {
          const o = document.createElement("option");
          o.value = t.id;
          o.textContent = t.name;
          sel.appendChild(o);
        });
        if (cur && [...sel.options].some((o) => o.value === cur)) {
          sel.value = cur;
        }
      }
    },

    showError(elId, msg) {
      const el = document.getElementById(elId);
      if (!el) return;
      el.textContent = msg || "";
      el.classList.toggle("d-none", !msg);
    },

    normalizeHexColor(value) {
      if (typeof value !== "string") return "";
      let hex = value.trim();
      if (!hex) return "";
      if (hex.startsWith("#")) {
        hex = hex.slice(1);
      }
      if (/^[0-9a-fA-F]{3}$/.test(hex)) {
        hex = hex
          .split("")
          .map((ch) => ch + ch)
          .join("");
      }
      if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "";
      return `#${hex.toUpperCase()}`;
    },

    syncSwatchGroup(inputId) {
      const input = document.getElementById(inputId);
      const group = document.querySelector(
        `.color-swatch-grid[data-input-id="${inputId}"]`
      );
      if (!input || !group) return;
      const swatches = [...group.querySelectorAll(".color-swatch[data-color]")];
      const normalizedValue = this.normalizeHexColor(input.value);
      if (normalizedValue) {
        input.value = normalizedValue;
      }

      let selected = false;
      swatches.forEach((swatch, idx) => {
        const swatchColor = this.normalizeHexColor(swatch.dataset.color);
        swatch.dataset.color = swatchColor;
        swatch.style.backgroundColor = swatchColor || "#FFFFFF";
        const isSelected = Boolean(swatchColor) && swatchColor === normalizedValue;
        swatch.classList.toggle("is-selected", isSelected);
        swatch.setAttribute("aria-pressed", isSelected ? "true" : "false");
        if (isSelected) selected = true;
        if (!swatchColor) swatch.disabled = true;
        swatch.dataset.index = String(idx);
      });

      if (!selected && !normalizedValue && swatches[0]?.dataset.color) {
        input.value = swatches[0].dataset.color;
        swatches[0].classList.add("is-selected");
        swatches[0].setAttribute("aria-pressed", "true");
      }
    },

    setColorInputValue(inputId, color) {
      const input = document.getElementById(inputId);
      if (!input) return;
      const normalizedColor = this.normalizeHexColor(color);
      if (normalizedColor) {
        input.value = normalizedColor;
      }
      this.syncSwatchGroup(inputId);
    },

    syncSwatchesInForm(form) {
      if (!form) return;
      form.querySelectorAll(".color-swatch-grid[data-input-id]").forEach((group) => {
        const inputId = group.dataset.inputId;
        if (inputId) this.syncSwatchGroup(inputId);
      });
    },

    initColorSwatches() {
      document.querySelectorAll(".color-swatch-grid[data-input-id]").forEach((group) => {
        const inputId = group.dataset.inputId;
        if (!inputId) return;
        group.querySelectorAll(".color-swatch[data-color]").forEach((swatch) => {
          const swatchColor = this.normalizeHexColor(swatch.dataset.color);
          swatch.dataset.color = swatchColor;
          swatch.style.backgroundColor = swatchColor || "#FFFFFF";
          swatch.addEventListener("click", () => {
            this.setColorInputValue(inputId, swatch.dataset.color);
          });
        });
        this.syncSwatchGroup(inputId);
      });
    },

    modalUpload() {
      return document.getElementById("modalUpload");
    },

    updateBulkBar() {
      const bar = document.getElementById("bulkBar");
      const countEl = document.getElementById("bulkCount");
      if (!bar || !countEl) return;
      const n = Soundboard.selectedIds.size;
      countEl.textContent = String(n);
      bar.classList.toggle("d-none", !Soundboard.selectMode);
    },

    openEditTab(tabId) {
      const tab = Soundboard.state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      document.getElementById("editTabId").value = tab.id;
      document.getElementById("editTabName").value = tab.name;
      document.getElementById("editTabDescription").value = tab.description || "";
      this.setColorInputValue("editTabBg", tab.backgroundColor || "#F8F9FA");
      this.showError("editTabError", "");
      const m = bootstrap.Modal.getOrCreateInstance(
        document.getElementById("modalEditTab")
      );
      m.show();
    },

    openEditButton(buttonId) {
      const btn = Soundboard.state.buttons.find((b) => b.id === buttonId);
      if (!btn) return;
      this.fillTabSelects();
      document.getElementById("editButtonId").value = btn.id;
      document.getElementById("editButtonName").value = btn.name;
      document.getElementById("editButtonDescription").value =
        btn.description || "";
      document.getElementById("editButtonTabId").value = btn.tabId;
      this.setColorInputValue("editButtonColor", btn.color || "#4059AD");
      const fileInput = document.querySelector("#formEditButton input[name=file]");
      if (fileInput) fileInput.value = "";
      this.showError("editButtonError", "");
      const m = bootstrap.Modal.getOrCreateInstance(
        document.getElementById("modalEditButton")
      );
      m.show();
    },

    init() {
      this.initColorSwatches();

      document.addEventListener("shown.bs.tab", (ev) => {
        const t = ev.target;
        if (!t || !t.id || !t.id.startsWith("tab-")) return;
        Soundboard.activeTabId = t.id.slice(4);
      });

      document.getElementById("btnSelectMode").addEventListener("click", () => {
        Soundboard.setSelectMode(!Soundboard.selectMode);
        this.updateBulkBar();
      });

      document.getElementById("modalUpload").addEventListener("show.bs.modal", () => {
        this.fillTabSelects();
        const sel = document.getElementById("uploadTabId");
        if (sel && Soundboard.activeTabId) {
          sel.value = Soundboard.activeTabId;
        }
      });

      document.getElementById("formUpload").addEventListener("submit", async (e) => {
        e.preventDefault();
        this.showError("uploadError", "");
        const form = e.target;
        const fd = new FormData(form);
        const tabId = fd.get("tabId");
        const tab = Soundboard.state.tabs.find((x) => x.id === tabId);
        const count = Soundboard.state.buttons.filter((b) => b.tabId === tabId).length;
        if (tab && count >= Soundboard.state.maxButtonsPerTab) {
          this.showError(
            "uploadError",
            `This tab already has ${Soundboard.state.maxButtonsPerTab} clips.`
          );
          return;
        }
        try {
          const res = await fetch("/api/buttons", { method: "POST", body: fd });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            this.showError("uploadError", body.error || res.statusText);
            return;
          }
          bootstrap.Modal.getInstance(this.modalUpload())?.hide();
          form.reset();
          this.syncSwatchesInForm(form);
          await this.refreshState();
        } catch (err) {
          this.showError("uploadError", err.message || "Upload failed");
        }
      });

      document.getElementById("formNewTab").addEventListener("submit", async (e) => {
        e.preventDefault();
        this.showError("newTabError", "");
        const fd = new FormData(e.target);
        const payload = {
          name: fd.get("name"),
          description: fd.get("description") || "",
          backgroundColor: fd.get("backgroundColor") || "#212529",
        };
        try {
          const res = await fetch("/api/tabs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            this.showError("newTabError", body.error || res.statusText);
            return;
          }
          bootstrap.Modal.getInstance(document.getElementById("modalNewTab"))?.hide();
          e.target.reset();
          this.syncSwatchesInForm(e.target);
          await this.refreshState();
        } catch (err) {
          this.showError("newTabError", err.message || "Failed");
        }
      });

      document.getElementById("formEditTab").addEventListener("submit", async (e) => {
        e.preventDefault();
        this.showError("editTabError", "");
        const fd = new FormData(e.target);
        const id = fd.get("id");
        const payload = {
          name: fd.get("name"),
          description: fd.get("description") || "",
          backgroundColor: fd.get("backgroundColor"),
        };
        try {
          const res = await fetch(`/api/tabs/${encodeURIComponent(id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            this.showError("editTabError", body.error || res.statusText);
            return;
          }
          bootstrap.Modal.getInstance(document.getElementById("modalEditTab"))?.hide();
          await this.refreshState();
        } catch (err) {
          this.showError("editTabError", err.message || "Failed");
        }
      });

      document.getElementById("btnDeleteTab").addEventListener("click", async () => {
        const id = document.getElementById("editTabId").value;
        const tab = Soundboard.state.tabs.find((t) => t.id === id);
        const n = Soundboard.state.buttons.filter((b) => b.tabId === id).length;
        const msg = tab
          ? `Delete tab "${tab.name}" and ${n} clip(s)? This cannot be undone.`
          : "Delete this tab?";
        if (!confirm(msg)) return;
        try {
          const res = await fetch(`/api/tabs/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(body.error || res.statusText);
            return;
          }
          bootstrap.Modal.getInstance(document.getElementById("modalEditTab"))?.hide();
          await this.refreshState();
        } catch (err) {
          alert(err.message || "Failed");
        }
      });

      document.getElementById("formEditButton").addEventListener("submit", async (e) => {
        e.preventDefault();
        this.showError("editButtonError", "");
        const form = e.target;
        const fd = new FormData(form);
        const id = fd.get("id");
        const file = fd.get("file");
        if (!file || !file.name || file.size === 0) {
          fd.delete("file");
        }
        try {
          const res = await fetch(`/api/buttons/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: fd,
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            this.showError("editButtonError", body.error || res.statusText);
            return;
          }
          bootstrap.Modal.getInstance(
            document.getElementById("modalEditButton")
          )?.hide();
          await this.refreshState();
        } catch (err) {
          this.showError("editButtonError", err.message || "Failed");
        }
      });

      document.getElementById("btnDeleteButton").addEventListener("click", async () => {
        const id = document.getElementById("editButtonId").value;
        if (!confirm("Delete this clip and its audio file?")) return;
        try {
          const res = await fetch(`/api/buttons/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(body.error || res.statusText);
            return;
          }
          bootstrap.Modal.getInstance(
            document.getElementById("modalEditButton")
          )?.hide();
          await this.refreshState();
        } catch (err) {
          alert(err.message || "Failed");
        }
      });

      document.getElementById("btnBulkMove").addEventListener("click", async () => {
        const tabId = document.getElementById("bulkMoveTab").value;
        const ids = [...Soundboard.selectedIds];
        if (!ids.length) {
          alert("Select one or more clips.");
          return;
        }
        try {
          const res = await fetch("/api/bulk/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ buttonIds: ids, tabId }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(body.error || res.statusText);
            return;
          }
          Soundboard.setSelectMode(false);
          await this.refreshState();
        } catch (err) {
          alert(err.message || "Failed");
        }
      });

      document.getElementById("btnBulkDelete").addEventListener("click", async () => {
        const ids = [...Soundboard.selectedIds];
        if (!ids.length) {
          alert("Select one or more clips.");
          return;
        }
        if (!confirm(`Delete ${ids.length} clip(s) and their audio files?`)) return;
        try {
          const res = await fetch("/api/bulk/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ buttonIds: ids }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(body.error || res.statusText);
            return;
          }
          Soundboard.setSelectMode(false);
          await this.refreshState();
        } catch (err) {
          alert(err.message || "Failed");
        }
      });

      document.getElementById("btnClearSelection").addEventListener("click", () => {
        Soundboard.selectedIds.clear();
        document.querySelectorAll(".sound-select").forEach((el) => {
          el.checked = false;
        });
        this.updateBulkBar();
      });

      this.refreshState().catch((err) => {
        console.error(err);
        alert("Could not load soundboard state.");
      });
    },
  };

  window.Admin = Admin;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Admin.init());
  } else {
    Admin.init();
  }
})();
