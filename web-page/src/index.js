// Protocol-specific UI switching for Serial/TCP columns
document.addEventListener("DOMContentLoaded", function () {
  var isHttps = window.location.protocol === "https:";
  var isLocalhost = window.location.hostname === "localhost";
  var serialControlsWrap = document.getElementById("serialControlsWrap");
  var serialControls = serialControlsWrap && serialControlsWrap.querySelector(".serial-controls");
  var serialHttpMsg = document.getElementById("serialHttpMsg");
  //var goToHttps = document.getElementById("goToHttps");
  var tcpControlsWrap = document.getElementById("tcpControlsWrap");
  var tcpHttpsMsg = document.getElementById("tcpHttpsMsg");
  var tcpSettingsBtn = document.getElementById("tcpSettingsBtn");
  var bridgeStatusIcon = document.getElementById("bridgeStatusIcon");
  var tcpControls =
    tcpControlsWrap &&
    tcpControlsWrap.querySelectorAll(
      ".d-flex, #tcpSettingsPanel, .row.g-2.align-items-center.mb-4, .row.g-2.align-items-center.mb-4, .col-12.mb-4, #ctrlUrlRow, .row.mt-auto"
    );
  //var goToHttp = document.getElementById("goToHttp");

  console.log("Protocol check: isHttps=" + isHttps + ", isLocalhost=" + isLocalhost);
  if (isLocalhost) {
    console.log("Localhost detected - showing all controls");
    // On localhost, show both Serial and TCP controls, hide all warning messages
    //if (serialControls) serialControls.classList.remove("d-none");
    if (serialHttpMsg) serialHttpMsg.classList.add("d-none");
    // if (tcpControls) {
    //   tcpControls.forEach(function (el) {
    //     el.classList.remove("d-none");
    //   });
    // }
    if (tcpHttpsMsg) tcpHttpsMsg.classList.add("d-none");
  } else if (isHttps) {
    //} else if (1 < 2) {
    console.log("HTTPS but not localhost - assuming HTTPS");
    // Hide TCP controls, show HTTPS message/button
    if (tcpControls) {
      tcpControls.forEach(function (el) {
        el.classList.add("d-none");
      });
    }
    if (tcpSettingsBtn) tcpSettingsBtn.classList.add("d-none");
    if (bridgeStatusIcon) bridgeStatusIcon.classList.add("d-none");
    if (tcpHttpsMsg) tcpHttpsMsg.classList.remove("d-none");
    // Show Serial controls, hide HTTP message
    if (serialControls) serialControls.classList.remove("d-none");
    if (serialHttpMsg) serialHttpMsg.classList.add("d-none");
  } else {
    console.log("Non-HTTPS and non-localhost - assuming HTTP");
    // Hide Serial controls, show HTTP message/button. hide mobile msg
    if (serialControls) serialControls.classList.add("d-none");
    if (serialHttpMsg) serialHttpMsg.classList.remove("d-none");
    // Show TCP controls, hide HTTPS message
    if (tcpControls) {
      tcpControls.forEach(function (el) {
        el.classList.remove("d-none");
      });
    }
    if (tcpHttpsMsg) tcpHttpsMsg.classList.add("d-none");
  }

  // // Button handlers for switching protocol
  // if (goToHttps) {
  //   goToHttps.addEventListener("click", function () {
  //     window.location.href = "https://mt.xyzroe.cc";
  //   });
  // }
  // if (goToHttp) {
  //   goToHttp.addEventListener("click", function () {
  //     window.location.href = "http://mt.xyzroe.cc";
  //   });
  // }
});
("use strict");

// Mobile tweaks: show TCP settings, clear default bridge values on small screens
// (function () {
//   var mq = window.matchMedia("(max-width: 576px)");
//   if (!mq.matches) return;
//   var host = document.getElementById("bridgeHostInput");
//   var port = document.getElementById("bridgePortInput");
//   if (host && host.value === "127.0.0.1") host.value = "";
//   if (port && port.value === "8765") port.value = "";
// })();

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

// NOTE: tcpLocalhostLink updater moved to flasher.ts so it runs alongside other bridge handlers

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

// Reusable clipboard helper used by badge elements in the UI
function copyToClipboard(el, txt) {
  (async function () {
    try {
      await navigator.clipboard.writeText(txt);
      var prev = el.innerText;
      el.innerText = "Copied!";
      el.classList.remove("bg-primary");
      el.classList.add("bg-success");
      setTimeout(function () {
        el.innerText = prev;
        el.classList.remove("bg-success");
        el.classList.add("bg-primary");
      }, 1000);
    } catch (e) {
      alert("Copy failed");
    }
  })();
}
// Expose for inline handlers in the HTML (index.html uses inline onclick)
window.copyToClipboard = copyToClipboard;

// Bridge Info modal UI wiring
// Escape key handler to close firmware notes and bridge info modals
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    var fwNotesModal = document.getElementById("fwNotesModal");
    var bridgeInfoModal = document.getElementById("bridgeInfoModal");
    if (fwNotesModal && !fwNotesModal.classList.contains("d-none")) {
      closeModalById("fwNotesModal");
    }
    if (bridgeInfoModal && !bridgeInfoModal.classList.contains("d-none")) {
      closeModalById("bridgeInfoModal");
    }
  }
});
// // --- Firmware notes modal logic ---
// const netFwNotesBtn = document.getElementById("netFwNotesBtn");
// const fwNotesModal = document.getElementById("fwNotesModal");
// const fwNotesContent = document.getElementById("fwNotesContent");
// const fwNotesClose = document.getElementById("fwNotesClose");
// const fwNotesCloseX = document.getElementById("fwNotesCloseX");

function getSelectedFwNotes() {
  if (!window.netFwSelect || !window.netFwItems) return;
  const opt = window.netFwSelect.selectedOptions[0];
  if (!opt || !opt.value) return;
  const item = window.netFwItems.find(function (it) {
    return it.key === opt.value;
  });
  return item && item.notes;
}

// if (window.netFwSelect) {
//   window.netFwSelect.addEventListener("change", function () {
//     if (!window.netFwSelect || !netFwNotesBtn) return;
//     var notes = getSelectedFwNotes();
//     netFwNotesBtn.disabled = !notes;
//     // Activate Write and Verify checkboxes when a firmware is selected
//     var optWrite = document.getElementById("optWrite");
//     var optVerify = document.getElementById("optVerify");
//     if (window.netFwSelect.value) {
//       if (optWrite) {
//         optWrite.disabled = false;
//         optWrite.checked = true;
//       }
//       if (optVerify) {
//         optVerify.disabled = false;
//         optVerify.checked = true;
//       }
//     } else {
//       if (optWrite) {
//         optWrite.checked = false;
//         optWrite.disabled = true;
//       }
//       if (optVerify) {
//         optVerify.checked = false;
//         optVerify.disabled = true;
//       }
//     }
//   });
// }

if (netFwNotesBtn) {
  netFwNotesBtn.addEventListener("click", function () {
    if (!fwNotesModal || !fwNotesContent) return;
    var notes = getSelectedFwNotes();
    if (!notes) return;
    var marked = window.marked;
    if (/^https?:\/\/.*\.md$/i.test(notes.trim())) {
      fwNotesContent.innerHTML =
        '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...';
      fetch(notes.trim())
        .then(function (r) {
          return r.ok ? r.text() : Promise.reject("Failed to load markdown");
        })
        .then(function (md) {
          if (marked) {
            fwNotesContent.innerHTML = marked.parse(md);
          } else {
            fwNotesContent.textContent = md;
          }
        })
        .catch(function (err) {
          fwNotesContent.innerHTML = '<div class="text-danger">Error loading markdown: ' + err + "</div>";
        });
    } else {
      if (marked) {
        fwNotesContent.innerHTML = marked.parse(notes);
      } else {
        fwNotesContent.textContent = notes;
      }
    }
    fwNotesModal.classList.remove("d-none");
    fwNotesModal.setAttribute("aria-hidden", "false");
  });
}

function closeModalById(id) {
  var modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("d-none");
    modal.setAttribute("aria-hidden", "true");
  }
}
if (fwNotesClose)
  fwNotesClose.addEventListener("click", function () {
    closeModalById("fwNotesModal");
  });
if (fwNotesCloseX)
  fwNotesCloseX.addEventListener("click", function () {
    closeModalById("fwNotesModal");
  });

if (!window.marked) {
  var script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
  script.async = true;
  document.head.appendChild(script);
}
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
  function closeModalById(id) {
    var modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("d-none");
      modal.setAttribute("aria-hidden", "true");
    }
  }
  function init() {
    var infoBtn = $("tcpInfoBtn");
    var closeBtn = $("bridgeInfoClose");
    var closeX = $("bridgeInfoCloseX");
    var modal = $("bridgeInfoModal");
    if (infoBtn) infoBtn.addEventListener("click", openBridgeInfo);
    if (closeBtn)
      closeBtn.addEventListener("click", function () {
        closeModalById("bridgeInfoModal");
      });
    if (closeX)
      closeX.addEventListener("click", function () {
        closeModalById("bridgeInfoModal");
      });
    if (modal)
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModalById("bridgeInfoModal");
      });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
