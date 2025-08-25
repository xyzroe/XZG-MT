"use strict";

// Mobile tweaks: show TCP settings, clear default bridge values on small screens
(function () {
  var mq = window.matchMedia("(max-width: 576px)");
  if (!mq.matches) return;
  var host = document.getElementById("bridgeHostInput");
  var port = document.getElementById("bridgePortInput");
  if (host && host.value === "127.0.0.1") host.value = "";
  if (port && port.value === "8765") port.value = "";
})();

// Log I/O visibility toggle
(function () {
  function applyLogVisibility() {
    var wrap = document.getElementById("consoleWrap");
    var chk = document.getElementById("showIo");
    if (!wrap || !chk) return;
    var hideAll = !chk.checked;
    wrap.classList.toggle("hide-rx", hideAll);
    wrap.classList.toggle("hide-tx", hideAll);
  }
  function init() {
    var chk = document.getElementById("showIo");
    if (chk) chk.addEventListener("change", applyLogVisibility);
    applyLogVisibility();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

// Wire up theme toggle and persistence using cookies
(function () {
  var cb = document.getElementById("themeSwitch");
  if (!cb) return;

  function setCookie(name, value, days) {
    var maxAge = days ? days * 24 * 60 * 60 : 0;
    var cookie = name + "=" + value + "; Path=/; SameSite=Lax";
    if (maxAge) cookie += "; Max-Age=" + maxAge;
    document.cookie = cookie;
  }

  function getCurrentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  function apply(theme) {
    var dark = theme === "dark";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = theme;
    cb.checked = dark;
  }

  // Initialize switch position to current theme
  cb.checked = getCurrentTheme() === "dark";

  cb.addEventListener("change", function () {
    var next = cb.checked ? "dark" : "light";
    apply(next);
    // persist for 1 year
    setCookie("theme", next, 365);
  });
})();

// Initialize Bootstrap tooltips for any element with data-bs-toggle="tooltip"
(function () {
  function initTooltips() {
    try {
      var w = window;
      if (w.bootstrap && w.bootstrap.Tooltip) {
        var list = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        list.forEach(function (el) {
          new w.bootstrap.Tooltip(el, { container: "body" });
        });
      }
    } catch (e) {
      /* ignore */
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTooltips, { once: true });
  } else {
    initTooltips();
  }
})();

// Bridge Info modal UI wiring
(function () {
  function $(id) {
    return document.getElementById(id);
  }
  function openBridgeInfo() {
    var modal = $("bridgeInfoModal");
    if (!modal) return;
    var hostEl = $("bridgeHostInput");
    var portEl = $("bridgePortInput");
    var host = hostEl && hostEl.value ? hostEl.value.trim() : localStorage.getItem("bridgeHost") || "127.0.0.1";
    var portStr = portEl && portEl.value ? portEl.value : localStorage.getItem("bridgePort") || "8765";
    var port = parseInt(portStr, 10);
    if (!port || port <= 0) port = 8765;
    var url = "http://" + host + ":" + port;
    var link = $("bridgeLink");
    if (link) {
      link.href = url;
      link.textContent = url;
    }
    modal.classList.remove("d-none");
    modal.setAttribute("aria-hidden", "false");
  }
  function closeBridgeInfo() {
    var modal = $("bridgeInfoModal");
    if (!modal) return;
    modal.classList.add("d-none");
    modal.setAttribute("aria-hidden", "true");
  }
  function init() {
    var infoBtn = $("tcpInfoBtn");
    var closeBtn = $("bridgeInfoClose");
    var closeX = $("bridgeInfoCloseX");
    var modal = $("bridgeInfoModal");
    if (infoBtn) infoBtn.addEventListener("click", openBridgeInfo);
    if (closeBtn) closeBtn.addEventListener("click", closeBridgeInfo);
    if (closeX) closeX.addEventListener("click", closeBridgeInfo);
    if (modal)
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeBridgeInfo();
      });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
