/**
 * Rendering and playback for the soundboard grid.
 */

(function () {
  const Soundboard = {
    state: { tabs: [], buttons: [], maxButtonsPerTab: 30 },
    activeTabId: null,
    selectMode: false,
    selectedIds: new Set(),

    audioUrl(filePath) {
      const enc = encodeURIComponent(filePath);
      return `/audio/${enc}`;
    },

    playClip(filePath) {
      const url = this.audioUrl(filePath);
      const a = new Audio(url);
      a.play().catch(() => {});
    },

    buttonsForTab(tabId) {
      return this.state.buttons.filter((b) => b.tabId === tabId);
    },

    disposeTooltips(container) {
      if (!window.bootstrap || !container) return;
      container.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
        const t = bootstrap.Tooltip.getInstance(el);
        if (t) t.dispose();
      });
    },

    syncTabChrome() {
      const headers = document.getElementById("tabHeaders");
      const panels = document.getElementById("tabPanels");
      if (!headers || !panels) return;

      const activeBtn = headers.querySelector("button.nav-link.active");
      const activeTabId = activeBtn?.id?.startsWith("tab-")
        ? activeBtn.id.slice(4)
        : this.activeTabId;
      const activeTab = this.state.tabs.find((t) => t.id === activeTabId);
      const panelBg = activeTab?.backgroundColor || "#f8f9fa";

      panels.style.backgroundColor = panelBg;

      headers.querySelectorAll("button.nav-link").forEach((link) => {
        const wrap = link.parentElement;
        const id = link.id.startsWith("tab-") ? link.id.slice(4) : null;
        const t = id ? this.state.tabs.find((x) => x.id === id) : null;
        const bg = t?.backgroundColor || "#f8f9fa";
        const isTabWrap = wrap?.classList?.contains("sound-tab-header-wrap");

        if (link.classList.contains("active")) {
          if (isTabWrap) {
            wrap.style.backgroundColor = bg;
            wrap.classList.add("sound-tab-active");
          }
          link.style.backgroundColor = "transparent";
          link.style.borderBottomColor = bg;
          link.style.color = this.contrastText(bg);
        } else {
          if (isTabWrap) {
            wrap.style.backgroundColor = "";
            wrap.classList.remove("sound-tab-active");
          }
          link.style.backgroundColor = "";
          link.style.borderBottomColor = "";
          link.style.color = "";
        }
      });
    },

    renderTabs() {
      const headers = document.getElementById("tabHeaders");
      const panels = document.getElementById("tabPanels");
      if (!headers || !panels) return;

      headers.replaceChildren();
      panels.replaceChildren();

      this.disposeTooltips(headers);
      this.disposeTooltips(panels);

      const addNewTabControl = () => {
        const li = document.createElement("li");
        li.className = "nav-item";
        li.role = "presentation";

        const wrap = document.createElement("div");
        wrap.className = "d-inline-flex align-items-center";

        const addTabBtn = document.createElement("button");
        addTabBtn.type = "button";
        addTabBtn.className = "btn btn-link btn-sm py-0 px-1 ms-1 text-secondary";
        addTabBtn.setAttribute("aria-label", "Create new tab");
        addTabBtn.textContent = "+";
        addTabBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!window.bootstrap) return;
          const modalEl = document.getElementById("modalNewTab");
          if (!modalEl) return;
          bootstrap.Modal.getOrCreateInstance(modalEl).show();
        });

        wrap.appendChild(addTabBtn);
        li.appendChild(wrap);
        headers.appendChild(li);
      };

      const tabs = [...this.state.tabs].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );

      if (!tabs.length) {
        panels.style.backgroundColor = "";
        addNewTabControl();
        return;
      }

      if (!this.activeTabId || !tabs.some((t) => t.id === this.activeTabId)) {
        const defaultTab =
          tabs.find((t) => t.name === "Soundboard") || tabs[0];
        this.activeTabId = defaultTab.id;
      }

      tabs.forEach((tab) => {
        const isActive = tab.id === this.activeTabId;
        const li = document.createElement("li");
        li.className = "nav-item";
        li.role = "presentation";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `nav-link position-relative ${isActive ? "active" : ""}`;
        btn.id = `tab-${tab.id}`;
        btn.dataset.bsToggle = "tab";
        btn.dataset.bsTarget = `#panel-${tab.id}`;
        btn.role = "tab";
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
        btn.textContent = tab.name;
        btn.style.borderTopWidth = "3px";
        btn.style.borderTopStyle = "solid";
        btn.style.borderTopColor = tab.backgroundColor || "#212529";

        if (tab.description && tab.description.trim()) {
          btn.dataset.bsToggle = "tooltip";
          btn.dataset.bsPlacement = "bottom";
          btn.title = tab.description.trim();
        }

        btn.addEventListener("shown.bs.tab", () => this.syncTabChrome());

        btn.addEventListener("click", (e) => {
          if (e.shiftKey || e.ctrlKey || e.metaKey) return;
          this.activeTabId = tab.id;
        });

        const gear = document.createElement("button");
        gear.type = "button";
        gear.className =
          "sound-tab-edit-btn btn btn-sm border-0 bg-transparent py-0 px-2 lh-1 align-self-stretch d-inline-flex align-items-center";
        gear.setAttribute("aria-label", "Edit tab");
        gear.innerHTML =
          '<i class="bi bi-gear-fill" aria-hidden="true"></i>';
        gear.addEventListener("click", (ev) => {
          ev.stopPropagation();
          if (window.Admin && typeof Admin.openEditTab === "function") {
            Admin.openEditTab(tab.id);
          }
        });

        const wrap = document.createElement("div");
        wrap.className =
          "sound-tab-header-wrap d-inline-flex align-items-stretch";
        wrap.appendChild(btn);
        wrap.appendChild(gear);
        li.appendChild(wrap);
        headers.appendChild(li);

        const panel = document.createElement("div");
        panel.className = `tab-pane fade p-3 ${isActive ? "show active" : ""}`;
        panel.id = `panel-${tab.id}`;
        panel.role = "tabpanel";
        panel.style.minHeight = "280px";
        const tabBg = tab.backgroundColor || "#f8f9fa";
        panel.style.backgroundColor = tabBg;
        panel.style.color = this.contrastText(tabBg);

        const grid = document.createElement("div");
        grid.className =
          "sound-grid d-flex flex-wrap gap-2 align-content-start p-2";
        grid.dataset.tabId = tab.id;

        const tabButtons = this.buttonsForTab(tab.id);
        tabButtons.forEach((b) => grid.appendChild(this.renderButton(b)));
        grid.appendChild(this.renderAddButton(tab.id));

        panel.appendChild(grid);
        panels.appendChild(panel);
      });

      addNewTabControl();

      if (window.bootstrap) {
        const tt = [
          ...headers.querySelectorAll('[data-bs-toggle="tooltip"]'),
          ...panels.querySelectorAll('[data-bs-toggle="tooltip"]'),
        ];
        tt.forEach((el) => new bootstrap.Tooltip(el));
      }

      this.syncTabChrome();
    },

    contrastText(bgHex) {
      const hex = (bgHex || "#0d6efd").replace("#", "");
      const full =
        hex.length === 3
          ? hex
              .split("")
              .map((c) => c + c)
              .join("")
          : hex.padEnd(6, "0").slice(0, 6);
      const r = parseInt(full.slice(0, 2), 16) / 255;
      const g = parseInt(full.slice(2, 4), 16) / 255;
      const bl = parseInt(full.slice(4, 6), 16) / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
      return lum > 0.55 ? "#111" : "#fff";
    },

    renderButton(btn) {
      const wrap = document.createElement("div");
      wrap.className = "sound-cell position-relative";
      const textColor = this.contrastText(btn.color);

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "sound-select form-check-input position-absolute";
      cb.style.top = "6px";
      cb.style.left = "6px";
      cb.style.zIndex = "2";
      cb.dataset.id = btn.id;
      cb.checked = this.selectedIds.has(btn.id);
      cb.classList.toggle("d-none", !this.selectMode);
      cb.addEventListener("change", () => {
        if (cb.checked) this.selectedIds.add(btn.id);
        else this.selectedIds.delete(btn.id);
        if (window.Admin && typeof Admin.updateBulkBar === "function") {
          Admin.updateBulkBar();
        }
      });

      const b = document.createElement("button");
      b.type = "button";
      b.className =
        "sound-btn btn border-0 shadow-sm text-center align-middle";
      b.textContent = btn.name;
      b.style.backgroundColor = btn.color || "#0d6efd";
      b.style.color = textColor;
      b.style.width = "140px";
      b.style.height = "72px";
      b.style.overflow = "hidden";
      b.style.textOverflow = "ellipsis";

      if (btn.description && btn.description.trim()) {
        b.dataset.bsToggle = "tooltip";
        b.dataset.bsPlacement = "top";
        b.title = btn.description.trim();
      }

      b.addEventListener("click", (ev) => {
        if (this.selectMode) {
          ev.preventDefault();
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event("change"));
          return;
        }
        this.playClip(btn.filePath);
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className =
        "sound-btn-edit-trigger btn btn-sm border-0 shadow-sm d-inline-flex align-items-center justify-content-center";
      editBtn.setAttribute("aria-label", `Edit ${btn.name}`);
      editBtn.innerHTML = '<i class="bi bi-gear-fill" aria-hidden="true"></i>';
      editBtn.style.color = "#111";
      editBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (window.Admin && typeof Admin.openEditButton === "function") {
          Admin.openEditButton(btn.id);
        }
      });

      wrap.appendChild(cb);
      wrap.appendChild(b);
      wrap.appendChild(editBtn);
      return wrap;
    },

    renderAddButton(tabId) {
      const wrap = document.createElement("div");
      wrap.className = "sound-cell position-relative";

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "sound-btn sound-add-btn btn text-center align-middle";
      addButton.setAttribute("aria-label", "Upload new clip");
      addButton.textContent = "+";
      addButton.addEventListener("click", () => {
        this.activeTabId = tabId;
        if (!window.bootstrap) return;
        const modalEl = document.getElementById("modalUpload");
        if (!modalEl) return;
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      });

      wrap.appendChild(addButton);
      return wrap;
    },

    setState(next) {
      this.state = {
        tabs: next.tabs || [],
        buttons: next.buttons || [],
        maxButtonsPerTab: next.maxButtonsPerTab ?? 30,
      };
      this.renderTabs();
    },

    setSelectMode(on) {
      this.selectMode = on;
      document.querySelectorAll(".sound-select").forEach((el) => {
        el.classList.toggle("d-none", !on);
      });
      const btn = document.getElementById("btnSelectMode");
      if (btn) {
        btn.textContent = on ? "Done" : "Select";
        btn.classList.toggle("btn-warning", on);
        btn.classList.toggle("btn-outline-light", !on);
      }
      if (!on) {
        this.selectedIds.clear();
        document.querySelectorAll(".sound-select").forEach((el) => {
          el.checked = false;
        });
        if (window.Admin && typeof Admin.updateBulkBar === "function") {
          Admin.updateBulkBar();
        }
      }
    },
  };

  window.Soundboard = Soundboard;
})();
