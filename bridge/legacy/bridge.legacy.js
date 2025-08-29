#!/usr/bin/env node
"use strict";

function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function _regeneratorValues(e) { if (null != e) { var t = e["function" == typeof Symbol && Symbol.iterator || "@@iterator"], r = 0; if (t) return t.call(e); if ("function" == typeof e.next) return e; if (!isNaN(e.length)) return { next: function next() { return e && r >= e.length && (e = void 0), { value: e && e[r++], done: !e }; } }; } throw new TypeError(_typeof(e) + " is not iterable"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _callSuper(t, o, e) { return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e)); }
function _possibleConstructorReturn(t, e) { if (e && ("object" == _typeof(e) || "function" == typeof e)) return e; if (void 0 !== e) throw new TypeError("Derived constructors may only return object or undefined"); return _assertThisInitialized(t); }
function _assertThisInitialized(e) { if (void 0 === e) throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); return e; }
function _isNativeReflectConstruct() { try { var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); } catch (t) {} return (_isNativeReflectConstruct = function _isNativeReflectConstruct() { return !!t; })(); }
function _getPrototypeOf(t) { return _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function (t) { return t.__proto__ || Object.getPrototypeOf(t); }, _getPrototypeOf(t); }
function _inherits(t, e) { if ("function" != typeof e && null !== e) throw new TypeError("Super expression must either be null or a function"); t.prototype = Object.create(e && e.prototype, { constructor: { value: t, writable: !0, configurable: !0 } }), Object.defineProperty(t, "prototype", { writable: !1 }), e && _setPrototypeOf(t, e); }
function _setPrototypeOf(t, e) { return _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function (t, e) { return t.__proto__ = e, t; }, _setPrototypeOf(t, e); }
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, "default": e }; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (var _t19 in e) "default" !== _t19 && {}.hasOwnProperty.call(e, _t19) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t19)) && (i.get || i.set) ? o(f, _t19, i) : f[_t19] = e[_t19]); return f; })(e, t); }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
var net = require("net");
var http = require("http");
var WebSocket = require("ws");
var os = require("os");
var _require = require("url"),
  pathToFileURL = _require.pathToFileURL;
var path = require("path");
var fs = require("fs");
var _require2 = require("module"),
  Module = _require2.Module;

// Global cache for extracted prebuild info to avoid duplicate writes/races
global.__XZG_SERIAL_PREBUILD = global.__XZG_SERIAL_PREBUILD || null;
global.__XZG_SERIAL_PREBUILD_CLEANUP = global.__XZG_SERIAL_PREBUILD_CLEANUP || false;

// Allow configuring the port via env (PORT) or argv[2]; default 8765
var WS_PORT = Number(process.env.PORT || process.argv[2] || 8765);

// Allow configuring the serial scan interval via env (SERIAL_SCAN_INTERVAL) or argv[3]; default 10000
// Use nullish coalescing so that '0' is preserved (disable monitor when 0)
var SERIAL_SCAN_INTERVAL = Number(process.env.SERIAL_SCAN_INTERVAL || process.argv[3] || 10000);

// Allow configuring the advertise host via env (ADVERTISE_HOST) or argv[4]; default null
var ADVERTISE_HOST = process.env.ADVERTISE_HOST || process.argv[4] || null;

// Debugging flag port via env (PORT) or argv[5]; default false
var DEBUG = /^(1|true|yes|on)$/i.test(String(process.env.DEBUG_SERIAL || ""));
function registerTempCleanup(dir) {
  try {
    if (!dir || global.__XZG_SERIAL_PREBUILD_CLEANUP) return;
    var clean = function clean() {
      try {
        fs.rmSync(dir, {
          recursive: true,
          force: true
        });
      } catch (_unused) {}
    };
    process.on("exit", clean);
    process.on("SIGINT", function () {
      try {
        clean();
      } catch (_unused2) {}
      process.exit(0);
    });
    process.on("SIGTERM", function () {
      try {
        clean();
      } catch (_unused3) {}
      process.exit(0);
    });
    process.on("SIGHUP", function () {
      try {
        clean();
      } catch (_unused4) {}
      process.exit(0);
    });
    process.on("uncaughtException", function (e) {
      try {
        clean();
      } catch (_unused5) {}
      // rethrow after cleanup
      throw e;
    });
    global.__XZG_SERIAL_PREBUILD_CLEANUP = true;
  } catch (_unused6) {}
}
var BonjourCtor;
var SerialPortLib;
var serialPortResolvePromise = null;
try {
  var mod = require("bonjour-service");
  // Support both CJS and ESM default/named exports
  BonjourCtor = (mod === null || mod === void 0 ? void 0 : mod.Bonjour) || (mod === null || mod === void 0 ? void 0 : mod["default"]) || mod || null;
} catch (_) {
  BonjourCtor = null;
}
// Lazy resolver for serialport that supports both CJS and ESM builds
function getSerialPort() {
  return _getSerialPort.apply(this, arguments);
} // Synchronous extractor used by the global require hook
function _getSerialPort() {
  _getSerialPort = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          if (!SerialPortLib) {
            _context3.n = 1;
            break;
          }
          return _context3.a(2, SerialPortLib);
        case 1:
          if (!serialPortResolvePromise) {
            serialPortResolvePromise = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
              var extracted, loader, toPatch, lb, id2, sp, id3, _iterator2, _step2, ngbId, m, _sp, _mod, _extracted, bindingsCpp, Stream, _ref3, autoDetect, Binding, SerialPortCompat, _t6, _t7, _t8, _t9, _t0;
              return _regenerator().w(function (_context2) {
                while (1) switch (_context2.p = _context2.n) {
                  case 0:
                    if (!process.pkg) {
                      _context2.n = 4;
                      break;
                    }
                    _context2.p = 1;
                    _context2.n = 2;
                    return ensureSerialportPrebuildExtracted();
                  case 2:
                    extracted = _context2.v;
                    if (extracted && extracted.dir) process.env.NODE_GYP_BUILD_PREBUILD = extracted.dir;
                    // Override node-gyp-build to return our extracted native binding directly
                    if (extracted && extracted.file) {
                      try {
                        loader = function loader() {
                          try {
                            return require(extracted.file);
                          } catch (e) {
                            console.warn("[serial][pkg] direct load failed:", String(e));
                            throw e;
                          }
                        };
                        toPatch = [];
                        try {
                          toPatch.push(require.resolve("node-gyp-build"));
                        } catch (_unused38) {}
                        try {
                          lb = require.resolve("@serialport/bindings-cpp/dist/load-bindings.js");
                          id2 = require.resolve("node-gyp-build", {
                            paths: [path.dirname(lb)]
                          });
                          toPatch.push(id2);
                        } catch (_unused39) {}
                        try {
                          sp = require.resolve("serialport");
                          id3 = require.resolve("node-gyp-build", {
                            paths: [path.dirname(sp)]
                          });
                          toPatch.push(id3);
                        } catch (_unused40) {}
                        _iterator2 = _createForOfIteratorHelper(Array.from(new Set(toPatch)).filter(Boolean));
                        try {
                          for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
                            ngbId = _step2.value;
                            try {
                              m = new Module(ngbId);
                              m.filename = ngbId;
                              m.loaded = true;
                              m.exports = function () {
                                return loader();
                              };
                              Module._cache[ngbId] = m;
                            } catch (e) {
                              console.warn("[serial][pkg] patch node-gyp-build failed:", ngbId, String(e));
                            }
                          }
                        } catch (err) {
                          _iterator2.e(err);
                        } finally {
                          _iterator2.f();
                        }
                      } catch (e3) {
                        process.env.DEBUG_SERIAL && console.warn("[serial][pkg] override node-gyp-build failed:", String(e3));
                      }
                    }
                    // Note: do NOT prime require.cache for '@serialport/bindings-cpp'.
                    // Serialport expects the JS wrapper (which exports autoDetect()),
                    // and priming it with the native exports breaks that contract.
                    _context2.n = 4;
                    break;
                  case 3:
                    _context2.p = 3;
                    _t6 = _context2.v;
                    process.env.DEBUG_SERIAL && console.warn("[serial][pkg] prebuild extraction failed:", String(_t6));
                  case 4:
                    _context2.p = 4;
                    // Prefer CJS require
                    _sp = require("serialport"); // Some broken states may return an unexpected value; validate shape
                    if (!(!_sp || typeof _sp !== "function" && typeof _sp.SerialPort !== "function" && typeof _sp.list !== "function")) {
                      _context2.n = 5;
                      break;
                    }
                    throw new Error("serialport invalid export");
                  case 5:
                    return _context2.a(2, _sp);
                  case 6:
                    _context2.p = 6;
                    _t7 = _context2.v;
                    if (!(_t7 && (_t7.code === "ERR_REQUIRE_ESM" || /Cannot use import statement/.test(String(_t7))))) {
                      _context2.n = 10;
                      break;
                    }
                    _context2.p = 7;
                    _context2.n = 8;
                    return Promise.resolve().then(function () {
                      return _interopRequireWildcard(require("serialport"));
                    });
                  case 8:
                    _mod = _context2.v;
                    return _context2.a(2, (_mod === null || _mod === void 0 ? void 0 : _mod["default"]) || _mod);
                  case 9:
                    _context2.p = 9;
                    _t8 = _context2.v;
                    process.env.DEBUG_SERIAL && console.warn("[serial] dynamic import failed:", String(_t8));
                    return _context2.a(2, null);
                  case 10:
                    console.warn("[serial] require('serialport') failed:", String(_t7));
                    // Last resort: try build a thin adapter around bindings-cpp using extracted native binding
                    _context2.p = 11;
                    if (!process.pkg) {
                      _context2.n = 13;
                      break;
                    }
                    _context2.n = 12;
                    return ensureSerialportPrebuildExtracted();
                  case 12:
                    _t9 = _context2.v;
                    _context2.n = 14;
                    break;
                  case 13:
                    _t9 = null;
                  case 14:
                    _extracted = _t9;
                    if (!(_extracted && _extracted.file)) {
                      _context2.n = 15;
                      break;
                    }
                    // Load bindings-cpp JS which will call our patched node-gyp-build and return binding classes
                    bindingsCpp = require("@serialport/bindings-cpp");
                    Stream = function () {
                      try {
                        return require("@serialport/stream");
                      } catch (_unused41) {
                        return null;
                      }
                    }();
                    _ref3 = bindingsCpp || {}, autoDetect = _ref3.autoDetect;
                    Binding = typeof autoDetect === "function" ? autoDetect() : bindingsCpp && bindingsCpp.Binding || null;
                    if (!(Binding && Stream && Stream.SerialPortStream)) {
                      _context2.n = 15;
                      break;
                    }
                    // Construct SerialPort-compatible facade
                    SerialPortCompat = /*#__PURE__*/function (_Stream$SerialPortStr) {
                      function SerialPortCompat() {
                        _classCallCheck(this, SerialPortCompat);
                        return _callSuper(this, SerialPortCompat, arguments);
                      }
                      _inherits(SerialPortCompat, _Stream$SerialPortStr);
                      return _createClass(SerialPortCompat);
                    }(Stream.SerialPortStream);
                    SerialPortCompat.Binding = Binding;
                    return _context2.a(2, _objectSpread({
                      SerialPort: SerialPortCompat
                    }, Stream));
                  case 15:
                    _context2.n = 17;
                    break;
                  case 16:
                    _context2.p = 16;
                    _t0 = _context2.v;
                    console.warn("[serial] fallback via bindings-cpp failed:", String(_t0));
                  case 17:
                    return _context2.a(2, null);
                }
              }, _callee2, null, [[11, 16], [7, 9], [4, 6], [1, 3]]);
            }))().then(function (mod) {
              SerialPortLib = mod;
              return mod;
            });
          }
          return _context3.a(2, serialPortResolvePromise);
      }
    }, _callee3);
  }));
  return _getSerialPort.apply(this, arguments);
}
function ensureSerialportPrebuildExtractedSync() {
  try {
    if (global.__XZG_SERIAL_PREBUILD && fs.existsSync(global.__XZG_SERIAL_PREBUILD.file)) {
      return global.__XZG_SERIAL_PREBUILD;
    }
    var plat = process.platform;
    var arch = process.arch;
    var subdir = null;
    var filename = "node.napi.node";
    if (plat === "win32") {
      if (arch === "x64" || arch === "arm64" || arch === "ia32") {
        subdir = "win32-".concat(arch);
      }
    } else if (plat === "darwin") {
      subdir = "darwin-x64+arm64";
    } else if (plat === "linux") {
      if (arch === "x64") {
        var isMusl = detectMusl();
        subdir = "linux-x64";
        filename = isMusl ? "node.napi.musl.node" : "node.napi.glibc.node";
      } else if (arch === "arm64") {
        subdir = "linux-arm64";
        filename = "node.napi.armv8.node";
      } else if (arch === "arm") {
        subdir = "linux-arm";
        filename = "node.napi.armv7.node";
      }
    }
    if (!subdir) return null;
    // External prebuilds next to exe/cwd
    var tryDirs = [];
    try {
      tryDirs.push(path.join(path.dirname(process.execPath), "prebuilds", subdir));
    } catch (_unused7) {}
    try {
      tryDirs.push(path.join(process.cwd(), "prebuilds", subdir));
    } catch (_unused8) {}
    for (var _i = 0, _tryDirs = tryDirs; _i < _tryDirs.length; _i++) {
      var d = _tryDirs[_i];
      try {
        var entries = fs.readdirSync(d).filter(function (f) {
          return f.toLowerCase().endsWith(".node");
        });
        if (entries && entries.length) {
          var file = path.join(d, entries[0]);
          return {
            dir: d,
            file: file
          };
        }
      } catch (_unused9) {}
    }
    // Snapshot prebuilds
    var bindingsPkgDir = null;
    try {
      bindingsPkgDir = path.dirname(require.resolve("@serialport/bindings-cpp/package.json"));
    } catch (_unused0) {}
    if (!bindingsPkgDir) {
      try {
        var entry = require.resolve("@serialport/bindings-cpp");
        bindingsPkgDir = path.join(path.dirname(entry), "..");
      } catch (_unused1) {}
    }
    if (!bindingsPkgDir) return null;
    var prebuildDir = path.join(bindingsPkgDir, "prebuilds", subdir);
    var chosen = path.join(prebuildDir, filename);
    if (!fs.existsSync(chosen)) {
      try {
        var list = fs.readdirSync(prebuildDir).filter(function (f) {
          return f.toLowerCase().endsWith(".node");
        });
        if (list && list.length) chosen = path.join(prebuildDir, list[0]);
      } catch (_unused10) {}
    }
    if (!fs.existsSync(chosen)) return null;
    var data = fs.readFileSync(chosen);
    // Use a per-process folder to avoid cross-run locking conflicts
    var outDir = path.join(os.tmpdir(), "bridge-prebuilds", "".concat(plat, "-").concat(arch, "-").concat(process.pid));
    try {
      fs.mkdirSync(outDir, {
        recursive: true
      });
    } catch (_unused11) {}
    var outFile = path.join(outDir, "node.napi.node");
    try {
      if (!fs.existsSync(outFile)) {
        fs.writeFileSync(outFile, data);
      }
    } catch (_unused12) {
      // If we cannot write but the file exists, try to use it
      if (!fs.existsSync(outFile)) return null;
    }
    var result = {
      dir: outDir,
      file: outFile
    };
    global.__XZG_SERIAL_PREBUILD = result;
    return result;
  } catch (_unused13) {
    return null;
  }
}

// Global hook to ensure any 'node-gyp-build' import gets a callable that returns our extracted binding
if (process.pkg && !global.__XZG_NGB_HOOKED) {
  global.__XZG_NGB_HOOKED = true;
  try {
    var origReq = Module.prototype.require;
    Module.prototype.require = function patchedRequire(id) {
      var _this = this;
      if (id === "node-gyp-build" || id === "node-gyp-build/index.js") {
        // node-gyp-build modules typically export a function that accepts an optional directory
        // but our loader doesn't need the dir, it always returns the extracted binding.
        var extracted = ensureSerialportPrebuildExtractedSync();
        var loader = function loader() {
          if (!extracted || !extracted.file) throw new Error("prebuild not prepared");
          return origReq.call(_this, extracted.file);
        };
        var fn = function fn(_dir) {
          return loader();
        };
        return fn;
      }
      return origReq.apply(this, arguments);
    };
    if (DEBUG) console.log("[serial][pkg] node-gyp-build hook installed");
  } catch (e) {
    if (DEBUG) console.warn("[serial][pkg] failed to install node-gyp-build hook:", String(e));
  }
}

// Extract the correct @serialport/bindings[-cpp] prebuild from packaged assets to a temp dir
function ensureSerialportPrebuildExtracted() {
  return _ensureSerialportPrebuildExtracted.apply(this, arguments);
}
function _ensureSerialportPrebuildExtracted() {
  _ensureSerialportPrebuildExtracted = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4() {
    var plat, arch, subdir, filename, isMusl, externalDirs, _i6, _externalDirs, d, entries, file, bindingsPkgDir, bindingsPkgName, pkgJsonPath, pkgJsonPath2, entry, _entry, prebuildDir, chosenFile, _entries, _isMusl, musl, glibc, altPrebuildDir, alt, _entries2, data, baseTmp, outDir, outFile, result, _t1, _t10;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.p = _context4.n) {
        case 0:
          if (!(global.__XZG_SERIAL_PREBUILD && fs.existsSync(global.__XZG_SERIAL_PREBUILD.file))) {
            _context4.n = 1;
            break;
          }
          if (DEBUG) console.log("[serial][pkg] using cached prebuild:", global.__XZG_SERIAL_PREBUILD.file);
          return _context4.a(2, global.__XZG_SERIAL_PREBUILD);
        case 1:
          // Decide subdir and filename inside bindings-cpp/prebuilds
          plat = process.platform; // 'win32' | 'linux' | 'darwin'
          arch = process.arch; // 'x64' | 'arm64' | ...
          subdir = null;
          filename = "node.napi.node";
          if (plat === "win32") {
            if (arch === "x64" || arch === "arm64" || arch === "ia32") {
              subdir = "win32-".concat(arch);
            }
          } else if (plat === "darwin") {
            // universal binary in darwin-x64+arm64
            subdir = "darwin-x64+arm64";
          } else if (plat === "linux") {
            if (arch === "x64") {
              isMusl = detectMusl();
              subdir = "linux-x64";
              filename = isMusl ? "node.napi.musl.node" : "node.napi.glibc.node";
            } else if (arch === "arm64") {
              subdir = "linux-arm64";
              filename = "node.napi.armv8.node";
            } else if (arch === "arm") {
              subdir = "linux-arm";
              // pick armv7 as a safer default; @serialport has both v6 and v7
              filename = "node.napi.armv7.node";
            }
          }
          if (subdir) {
            _context4.n = 2;
            break;
          }
          console.log("[serial][pkg] unsupported platform/arch for prebuilds:", {
            plat: plat,
            arch: arch
          });
          return _context4.a(2, null);
        case 2:
          // First, try to use an existing external prebuild placed next to the exe or in cwd
          externalDirs = [];
          try {
            externalDirs.push(path.join(path.dirname(process.execPath), "prebuilds", subdir));
          } catch (_unused42) {}
          try {
            externalDirs.push(path.join(process.cwd(), "prebuilds", subdir));
          } catch (_unused43) {}
          _i6 = 0, _externalDirs = externalDirs;
        case 3:
          if (!(_i6 < _externalDirs.length)) {
            _context4.n = 8;
            break;
          }
          d = _externalDirs[_i6];
          _context4.p = 4;
          entries = fs.readdirSync(d).filter(function (f) {
            return f.toLowerCase().endsWith(".node");
          });
          if (!(entries && entries.length)) {
            _context4.n = 5;
            break;
          }
          file = path.join(d, entries[0]);
          console.log("[serial][pkg] using external prebuild:", file);
          return _context4.a(2, {
            dir: d,
            file: file
          });
        case 5:
          _context4.n = 7;
          break;
        case 6:
          _context4.p = 6;
          _t1 = _context4.v;
        case 7:
          _i6++;
          _context4.n = 3;
          break;
        case 8:
          // Resolve path to packaged asset inside snapshot
          bindingsPkgDir = null;
          bindingsPkgName = null; // '@serialport/bindings-cpp' or '@serialport/bindings'
          try {
            pkgJsonPath = require.resolve("@serialport/bindings-cpp/package.json");
            bindingsPkgDir = path.dirname(pkgJsonPath);
            bindingsPkgName = "@serialport/bindings-cpp";
          } catch (_unused45) {}
          if (!bindingsPkgDir) {
            try {
              pkgJsonPath2 = require.resolve("@serialport/bindings/package.json");
              bindingsPkgDir = path.dirname(pkgJsonPath2);
              bindingsPkgName = "@serialport/bindings";
            } catch (_unused46) {}
          }
          // Fallback: resolve by JS entrypoint and go up one level
          if (!bindingsPkgDir) {
            try {
              entry = require.resolve("@serialport/bindings-cpp");
              bindingsPkgDir = path.join(path.dirname(entry), "..");
              bindingsPkgName = "@serialport/bindings-cpp";
            } catch (_unused47) {}
          }
          if (!bindingsPkgDir) {
            try {
              _entry = require.resolve("@serialport/bindings");
              bindingsPkgDir = path.join(path.dirname(_entry), "..");
              bindingsPkgName = "@serialport/bindings";
            } catch (_unused48) {}
          }
          if (bindingsPkgDir) {
            _context4.n = 9;
            break;
          }
          console.log("[serial][pkg] bindings package dir not found in snapshot");
          return _context4.a(2, null);
        case 9:
          prebuildDir = path.join(bindingsPkgDir, "prebuilds", subdir);
          if (DEBUG) console.log("[serial][pkg] looking for prebuild in:", prebuildDir);
          chosenFile = path.join(prebuildDir, filename); // If default filename not found, scan directory for any suitable .node
          if (!fs.existsSync(chosenFile)) {
            try {
              _entries = fs.readdirSync(prebuildDir).filter(function (f) {
                return f.toLowerCase().endsWith(".node");
              });
              if (_entries && _entries.length) {
                // Prefer musl/glibc match on linux
                if (process.platform === "linux") {
                  _isMusl = detectMusl();
                  musl = _entries.find(function (f) {
                    return f.includes("musl");
                  });
                  glibc = _entries.find(function (f) {
                    return f.includes("glibc");
                  });
                  if (_isMusl && musl) chosenFile = path.join(prebuildDir, musl);else if (!_isMusl && glibc) chosenFile = path.join(prebuildDir, glibc);else chosenFile = path.join(prebuildDir, _entries[0]);
                } else {
                  chosenFile = path.join(prebuildDir, _entries[0]);
                }
              }
            } catch (_unused49) {}
          }
          // Fallback: try bundled static folder under __dirname/serialprebuilds
          if (!fs.existsSync(chosenFile)) {
            altPrebuildDir = path.join(__dirname, "serialprebuilds", subdir);
            if (DEBUG) console.log("[serial][pkg] fallback prebuild lookup in:", altPrebuildDir);
            alt = path.join(altPrebuildDir, filename);
            if (!fs.existsSync(alt)) {
              try {
                _entries2 = fs.readdirSync(altPrebuildDir).filter(function (f) {
                  return f.toLowerCase().endsWith(".node");
                });
                if (_entries2 && _entries2.length) {
                  alt = path.join(altPrebuildDir, _entries2[0]);
                }
              } catch (_unused50) {}
            }
            if (fs.existsSync(alt)) chosenFile = alt;
          }
          if (fs.existsSync(chosenFile)) {
            _context4.n = 10;
            break;
          }
          console.warn("[serial][pkg] no prebuild found in:", prebuildDir, "and no fallback in serialprebuilds");
          return _context4.a(2, null);
        case 10:
          if (DEBUG) console.log("[serial][pkg] selected prebuild file:", chosenFile);
          data = fs.readFileSync(chosenFile); // Write to a stable temp dir
          baseTmp = path.join(os.tmpdir(), "bridge-prebuilds");
          try {
            fs.mkdirSync(baseTmp, {
              recursive: true
            });
          } catch (_unused51) {}
          // Use a per-process folder to avoid cross-run locking conflicts
          outDir = path.join(baseTmp, "".concat(plat, "-").concat(arch, "-").concat(process.pid));
          try {
            fs.mkdirSync(outDir, {
              recursive: true
            });
          } catch (_unused52) {}
          outFile = path.join(outDir, "node.napi.node");
          _context4.p = 11;
          if (!fs.existsSync(outFile)) {
            fs.writeFileSync(outFile, data);
          }
          _context4.n = 13;
          break;
        case 12:
          _context4.p = 12;
          _t10 = _context4.v;
          if (fs.existsSync(outFile)) {
            _context4.n = 13;
            break;
          }
          if (DEBUG) console.warn("[serial][pkg] write prebuild failed:", String(_t10));
          return _context4.a(2, null);
        case 13:
          result = {
            dir: outDir,
            file: outFile,
            pkg: bindingsPkgName
          };
          global.__XZG_SERIAL_PREBUILD = result;
          registerTempCleanup(outDir);
          // No mirroring next to the exe or cwd; we keep everything in temp and load via the hook
          if (DEBUG) console.log("[serial][pkg] prepared prebuilds:", {
            temp: outFile,
            pkg: bindingsPkgName
          });
          return _context4.a(2, result);
      }
    }, _callee4, null, [[11, 12], [4, 6]]);
  }));
  return _ensureSerialportPrebuildExtracted.apply(this, arguments);
}
function detectMusl() {
  try {
    if (process.report && typeof process.report.getReport === "function") {
      var rep = process.report.getReport();
      var glibc = rep && rep.header && rep.header.glibcVersionRuntime;
      return !glibc;
    }
  } catch (_unused14) {}
  // Fallback heuristic
  return false;
}

// --- Global store of opened SerialPort instances ---
var openSerialPorts = new Map(); // path -> SerialPort instance
// Reverse mapping of local TCP server port to the serial path
var tcpPortToSerialPath = new Map(); // tcpPort -> path

var serialPortStates = new Map(); // path -> { dtr: boolean, rts: boolean }

var server = http.createServer(/*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(req, res) {
    var originHeader, _corsHeaders, _i2, _Object$keys, k, _origWriteHead, u, dbg, typesParam, timeout, types, normalized, wantsLocalSerial, results, _results, locals, payload, body, originHeaderResp, _SerialPortLib, _path, tcpPortStr, tcpPort, dtr, rts, serial, SP, currentState, setObj, distPath, filePath, _t, _t2, _t3, _t4, _t5;
    return _regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.p = 0;
          // CORS: provide permissive defaults (no credentials) and answer preflight requests.
          // This ensures browsers receive the expected headers even when individual
          // response paths call `res.writeHead(...)` with their own headers.
          // dynamic CORS: echo Origin (so credentials work), allow private-network for modern browsers
          originHeader = req.headers.origin || "*";
          _corsHeaders = {
            "Access-Control-Allow-Origin": originHeader,
            "Access-Control-Allow-Credentials": "true",
            // required if frontend sends credentials
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Accept,Origin,X-Requested-With,Authorization",
            "Access-Control-Allow-Private-Network": "true",
            // for Private Network Access preflight (Chrome/Edge)
            "Access-Control-Max-Age": "86400"
          }; // Apply headers immediately for all responses
          try {
            for (_i2 = 0, _Object$keys = Object.keys(_corsHeaders); _i2 < _Object$keys.length; _i2++) {
              k = _Object$keys[_i2];
              res.setHeader(k, _corsHeaders[k]);
            }
          } catch (_unused15) {}

          // Monkey-patch writeHead so later handlers that call writeHead with custom
          // headers do not accidentally drop our CORS headers.
          try {
            _origWriteHead = res.writeHead && res.writeHead.bind(res);
            if (_origWriteHead) {
              res.writeHead = function () {
                for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
                  args[_key] = arguments[_key];
                }
                try {
                  if (args.length >= 2 && _typeof(args[args.length - 1]) === "object") {
                    var hdrs = Object.assign({}, _corsHeaders, args[args.length - 1]);
                    var newArgs = args.slice(0, args.length - 1).concat(hdrs);
                    return _origWriteHead.apply(void 0, _toConsumableArray(newArgs));
                  }
                } catch (_unused16) {}
                var result = _origWriteHead.apply(void 0, args);
                try {
                  for (var _i3 = 0, _Object$keys2 = Object.keys(_corsHeaders); _i3 < _Object$keys2.length; _i3++) {
                    var _k = _Object$keys2[_i3];
                    res.setHeader(_k, _corsHeaders[_k]);
                  }
                } catch (_unused17) {}
                return result;
              };
            }
          } catch (_unused18) {}

          // Handle preflight requests quickly
          if (!(String(req.method || "").toUpperCase() === "OPTIONS")) {
            _context.n = 1;
            break;
          }
          try {
            // Some callers pass headers via writeHead; ensure status only here.
            res.writeHead(204);
          } catch (_unused19) {}
          return _context.a(2, res.end());
        case 1:
          u = new URL(req.url, "http://".concat(req.headers.host));
          if (!(u.pathname === "/mdns")) {
            _context.n = 11;
            break;
          }
          // Lightweight request logging to help diagnose why some browsers see an
          // empty response while manual requests return JSON. We log method, key
          // CORS/PNA related headers and the origin so we can compare browser vs curl.
          try {
            dbg = {
              method: req.method,
              url: req.url,
              origin: req.headers.origin,
              "sec-fetch-site": req.headers["sec-fetch-site"],
              "sec-fetch-mode": req.headers["sec-fetch-mode"],
              "sec-fetch-dest": req.headers["sec-fetch-dest"],
              "access-control-request-private-network": req.headers["access-control-request-private-network"]
            };
            console.log("[mdns] incoming request:", JSON.stringify(dbg));
          } catch (_unused20) {}
          if (BonjourCtor) {
            _context.n = 2;
            break;
          }
          console.warn("[mdns] bonjour-service not installed; cannot scan");
          res.writeHead(500, {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          });
          return _context.a(2, res.end(JSON.stringify({
            error: "bonjour-service not installed"
          })));
        case 2:
          // Only support GET query parameters for /mdns to preserve request
          // structure expected by clients. Do not read or interpret POST bodies.
          typesParam = u.searchParams.get("types");
          timeout = Math.max(500, Math.min(10000, Number(u.searchParams.get("timeout")) || 2000));
          if (String(req.method || "").toUpperCase() !== "GET") {
            // Log non-GET attempts to help debug clients that accidentally POST.
            try {
              console.log("[mdns] non-GET request method=", String(req.method));
            } catch (_unused21) {}
          }
          types = (typesParam || "").split(",").map(function (s) {
            return s.trim();
          }).filter(Boolean);
          normalized = types.map(function (t) {
            return parseServiceType(t);
          }).filter(Boolean);
          wantsLocalSerial = types.some(function (t) {
            return isLocalSerialToken(t);
          });
          results = [];
          _context.p = 3;
          _context.n = 4;
          return scanMdns(normalized, timeout);
        case 4:
          results = _context.v;
          if (!wantsLocalSerial) {
            _context.n = 6;
            break;
          }
          _context.n = 5;
          return listLocalSerialAsServices();
        case 5:
          locals = _context.v;
          (_results = results).push.apply(_results, _toConsumableArray(locals));
        case 6:
          console.log("[mdns] scan done, found", results.length);
          _context.n = 8;
          break;
        case 7:
          _context.p = 7;
          _t = _context.v;
          console.warn("[mdns] scan error:", String(_t));
          // Fall through to return an error payload below
        case 8:
          payload = {
            devices: results || [],
            error: results ? undefined : "scan_error"
          };
          body = JSON.stringify(payload); // Explicitly set Content-Type and Content-Length and repeat PNA/CORS headers
          try {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Length", Buffer.byteLength(body));
            // repeat important CORS/PNA headers for some browsers which check them on actual response
            originHeaderResp = req.headers.origin || "*";
            res.setHeader("Access-Control-Allow-Origin", originHeaderResp);
            res.setHeader("Access-Control-Allow-Credentials", "true");
            res.setHeader("Access-Control-Allow-Private-Network", "true");
          } catch (e) {
            console.warn("[mdns] failed to set response headers:", String(e));
          }
          try {
            res.writeHead(200);
          } catch (e) {}
          _context.p = 9;
          console.log("[mdns] sending response length", body.length);
          return _context.a(2, res.end(body));
        case 10:
          _context.p = 10;
          _t2 = _context.v;
          try {
            // Best-effort: ensure connection closes with an error payload
            res.end(JSON.stringify({
              devices: [],
              error: String(_t2)
            }));
          } catch (_unused22) {}
          return _context.a(2);
        case 11:
          if (!(u.pathname === "/sc")) {
            _context.n = 19;
            break;
          }
          _context.n = 12;
          return getSerialPort();
        case 12:
          _SerialPortLib = _context.v;
          if (_SerialPortLib) {
            _context.n = 13;
            break;
          }
          res.writeHead(500, {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          });
          return _context.a(2, res.end(JSON.stringify({
            error: "serialport not installed"
          })));
        case 13:
          // Accept either a serial path or the TCP port of a local TCP server bound to a serial
          _path = u.searchParams.get("path");
          tcpPortStr = u.searchParams.get("port");
          tcpPort = tcpPortStr ? Number(tcpPortStr) : null;
          if (!_path && tcpPort) {
            _path = tcpPortToSerialPath.get(tcpPort) || null;
          }
          dtr = u.searchParams.get("dtr");
          rts = u.searchParams.get("rts");
          if (!(!_path || dtr === null && rts === null)) {
            _context.n = 14;
            break;
          }
          res.writeHead(400, {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          });
          return _context.a(2, res.end(JSON.stringify({
            error: "Missing path/tcpPort or dtr/rts param"
          })));
        case 14:
          serial = openSerialPorts.get(_path);
          if (serial) {
            _context.n = 17;
            break;
          }
          _context.p = 15;
          SP = _SerialPortLib.SerialPort || _SerialPortLib;
          serial = new SP({
            path: _path,
            baudRate: 115200,
            autoOpen: true
          });
          openSerialPorts.set(_path, serial);
          _context.n = 17;
          break;
        case 16:
          _context.p = 16;
          _t3 = _context.v;
          res.writeHead(500, {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          });
          return _context.a(2, res.end(JSON.stringify({
            error: "Failed to open serial port",
            details: String(_t3)
          })));
        case 17:
          // Get current saved state or initialize defaults
          currentState = serialPortStates.get(_path) || {
            dtr: false,
            rts: false
          }; // Build the complete state object (current + new values)
          setObj = _objectSpread({}, currentState); // Update only the parameters that were provided
          if (dtr !== null) {
            setObj.dtr = dtr === "1" || dtr === "true";
          }
          if (rts !== null) {
            setObj.rts = rts === "1" || rts === "true";
          }

          // Save the new state
          serialPortStates.set(_path, setObj);
          if (!(Object.keys(setObj).length === 0)) {
            _context.n = 18;
            break;
          }
          res.writeHead(400, {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          });
          return _context.a(2, res.end(JSON.stringify({
            error: "No DTR/RTS parameters to set"
          })));
        case 18:
          serial.set(setObj, function (err) {
            if (err) {
              res.writeHead(500, {
                "content-type": "application/json",
                "access-control-allow-origin": "*"
              });
              return res.end(JSON.stringify({
                error: "Failed to set DTR/RTS",
                details: String(err)
              }));
            }
            res.writeHead(200, {
              "content-type": "application/json",
              "access-control-allow-origin": "*"
            });
            return res.end(JSON.stringify({
              ok: true,
              path: _path,
              tcpPort: tcpPort || tcpPortFromPath(_path),
              set: setObj,
              changed: {
                dtr: dtr !== null ? setObj.dtr : undefined,
                rts: rts !== null ? setObj.rts : undefined
              }
            }));
          });
          return _context.a(2);
        case 19:
          // New: Serve static files from ./web directory
          distPath = path.join(__dirname, "web");
          filePath = path.join(distPath, u.pathname === "/" ? "index.html" : u.pathname); // Security: Prevent directory traversal
          if (filePath.startsWith(distPath)) {
            _context.n = 20;
            break;
          }
          res.writeHead(403, {
            "Content-Type": "text/plain"
          });
          return _context.a(2, res.end("Forbidden"));
        case 20:
          fs.stat(filePath, function (err, stats) {
            if (err || !stats.isFile()) {
              res.writeHead(404, {
                "Content-Type": "text/plain"
              });
              return res.end("File not found.");
            }
            var ext = path.extname(filePath).toLowerCase();
            var mimeTypes = {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".json": "application/json",
              ".png": "image/png",
              ".jpg": "image/jpg",
              ".gif": "image/gif",
              ".svg": "image/svg+xml",
              ".wav": "audio/wav",
              ".mp4": "video/mp4",
              ".woff": "application/font-woff",
              ".ttf": "application/font-ttf",
              ".eot": "application/vnd.ms-fontobject",
              ".otf": "application/font-otf",
              ".wasm": "application/wasm"
            };
            var contentType = mimeTypes[ext] || "application/octet-stream";
            res.writeHead(200, {
              "Content-Type": contentType
            });
            var stream = fs.createReadStream(filePath);
            stream.pipe(res);
            stream.on("error", function () {
              res.writeHead(500, {
                "Content-Type": "text/plain"
              });
              res.end("Server error");
            });
          });
          _context.n = 24;
          break;
        case 21:
          _context.p = 21;
          _t4 = _context.v;
          console.error("[mdns] handler error:", _t4);
          _context.p = 22;
          res.writeHead(500, {
            "content-type": "application/json",
            "access-control-allow-origin": "*"
          });
          return _context.a(2, res.end(JSON.stringify({
            error: String(_t4)
          })));
        case 23:
          _context.p = 23;
          _t5 = _context.v;
        case 24:
          return _context.a(2);
      }
    }, _callee, null, [[22, 23], [15, 16], [9, 10], [3, 7], [0, 21]]);
  }));
  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
}());
var wss = new WebSocket.Server({
  server: server,
  perMessageDeflate: false
});
function getPrimaryIPv4() {
  try {
    var ifaces = os.networkInterfaces();
    var prefer = ["en0", "en1", "eth0", "wlan0"]; // macOS often en0
    // Prefer common primary interfaces first
    for (var _i4 = 0, _prefer = prefer; _i4 < _prefer.length; _i4++) {
      var name = _prefer[_i4];
      var arr = ifaces[name];
      if (!arr) continue;
      var hit = arr.find(function (x) {
        return x && x.family === "IPv4" && !x.internal;
      });
      if (hit !== null && hit !== void 0 && hit.address) return hit.address;
    }
    // Otherwise, return the first external IPv4
    for (var _i5 = 0, _Object$values = Object.values(ifaces); _i5 < _Object$values.length; _i5++) {
      var _arr = _Object$values[_i5];
      var _hit = (_arr || []).find(function (x) {
        return x && x.family === "IPv4" && !x.internal;
      });
      if (_hit !== null && _hit !== void 0 && _hit.address) return _hit.address;
    }
  } catch (_unused24) {}
  return "127.0.0.1";
}
function getAdvertiseHost() {
  return ADVERTISE_HOST || getPrimaryIPv4();
}
wss.on("connection", function (ws, req) {
  try {
    var _ws$_socket, _ws$_socket$setNoDela, _ws$_socket2, _ws$_socket2$setKeepA;
    // Reduce latency on the WebSocket TCP socket (disable Nagle)
    ws === null || ws === void 0 || (_ws$_socket = ws._socket) === null || _ws$_socket === void 0 || (_ws$_socket$setNoDela = _ws$_socket.setNoDelay) === null || _ws$_socket$setNoDela === void 0 || _ws$_socket$setNoDela.call(_ws$_socket, true);
    ws === null || ws === void 0 || (_ws$_socket2 = ws._socket) === null || _ws$_socket2 === void 0 || (_ws$_socket2$setKeepA = _ws$_socket2.setKeepAlive) === null || _ws$_socket2$setKeepA === void 0 || _ws$_socket2$setKeepA.call(_ws$_socket2, true, 5000);
  } catch (_unused25) {}
  var url = new URL(req.url, "http://".concat(req.headers.host));
  var host = url.searchParams.get("host");
  var port = Number(url.searchParams.get("port"));
  if (!host || !port) {
    ws.close(1008, "Missing host/port");
    return;
  }
  var sock = net.createConnection({
    host: host,
    port: port
  }, function () {
    try {
      sock.setNoDelay(true);
    } catch (_unused26) {}
    // ok
  });
  sock.on("data", function (chunk) {
    try {
      ws.readyState === WebSocket.OPEN && ws.send(chunk);
    } catch (_unused27) {}
  });
  sock.on("error", function (err) {
    try {
      ws.close(1011, String(err));
    } catch (_unused28) {}
  });
  sock.on("close", function () {
    try {
      ws.close(1000);
    } catch (_unused29) {}
  });
  ws.on("message", function (data) {
    if (Buffer.isBuffer(data)) sock.write(data);else if (typeof data === "string") sock.write(Buffer.from(data, "binary"));
  });
  ws.on("close", function () {
    try {
      sock.destroy();
    } catch (_unused30) {}
  });
});
server.listen(WS_PORT, "0.0.0.0", function () {
  console.log("[bridge] listening ws://".concat(getAdvertiseHost(), ":").concat(WS_PORT)); // show the effective IP
  if (!BonjourCtor) {
    console.log("[mdns] bonjour-service unavailable.");
  } else {
    try {
      //console.log("[mdns] bonjour ctor resolved:", typeof BonjourCtor);
    } catch (_unused31) {}
  }
  // Startup summary: modules loaded status - prefer to show package versions when available
  function tryReadPkgVersion(names) {
    if (!Array.isArray(names)) names = [names];
    var _iterator = _createForOfIteratorHelper(names),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var name = _step.value;
        try {
          // Common case: package.json accessible via '<pkg>/package.json'
          var pkg = require(name + "/package.json");
          if (pkg && pkg.version) return "".concat(name, "@").concat(pkg.version);
        } catch (_unused32) {}
        try {
          // Fallback: resolve main entry and look for package.json nearby
          var resolved = require.resolve(name);
          var dir = path.dirname(resolved);
          try {
            var pkg2 = require(path.join(dir, "package.json"));
            if (pkg2 && pkg2.version) return "".concat(name, "@").concat(pkg2.version);
          } catch (_unused33) {}
        } catch (_unused34) {}
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    return null;
  }
  var wsVersion = tryReadPkgVersion("ws") || WebSocket && (WebSocket === null || WebSocket === void 0 ? void 0 : WebSocket.version) || "unknown";
  var bonjourVersion = tryReadPkgVersion(["bonjour-service", "bonjour"]) || BonjourCtor && BonjourCtor.name || "unknown";
  var onSerialReady = function onSerialReady(sp) {
    var serialVersion = tryReadPkgVersion(["serialport", "@serialport/bindings-cpp", "@serialport/bindings"]) || sp && (sp.version || sp.SerialPort && sp.SerialPort.version) || "unknown";
    console.log("[startup] modules: ".concat(wsVersion, ", ").concat(bonjourVersion, ", ").concat(serialVersion));
  };
  if (process.pkg) {
    // Prepare prebuild and warm serial
    ensureSerialportPrebuildExtracted().then(function () {
      return getSerialPort();
    }).then(onSerialReady)["catch"](function (e) {
      if (DEBUG) console.warn("[serial][pkg] startup extraction error:", String(e));
      onSerialReady(null);
    });
  } else {
    getSerialPort().then(onSerialReady)["catch"](function () {
      return onSerialReady(null);
    });
  }
  // Start background monitor to open/close TCP servers for all available serial ports
  try {
    startSerialMonitor()["catch"](function () {});
  } catch (_unused35) {}
});
function parseServiceType(full) {
  // e.g. _zigstar_gw._tcp.local. -> { type: 'zigstar_gw', protocol: 'tcp' }
  try {
    // Special token(s) to request local serial exposure
    if (isLocalSerialToken(full)) return {
      type: "local",
      protocol: "serial"
    };
    var m = full.match(/^_([^.]+)\._(tcp|udp)(?:\.|$)/i);
    if (!m) return null;
    //console.log("[mdns] parse type:", full, "=>", { type: m[1], protocol: m[2].toLowerCase() });
    return {
      type: m[1],
      protocol: m[2].toLowerCase()
    };
  } catch (_unused36) {
    return null;
  }
}
function isLocalSerialToken(s) {
  return ["local.serial", "local:serial", "local-serial", "local"].map(function (x) {
    return x.toLowerCase();
  }).includes(String(s || "").toLowerCase());
}
function scanMdns(_x3, _x4) {
  return _scanMdns.apply(this, arguments);
} // --- Local Serial exposure ---
function _scanMdns() {
  _scanMdns = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(typeList, timeoutMs) {
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.n) {
        case 0:
          _context5.n = 1;
          return new Promise(function (resolve) {
            console.log("[mdns] scanning with timeout", timeoutMs); //, typeList,
            var bonjour = new BonjourCtor();
            var found = new Map();
            var browsers = [];
            var onUp = function onUp(svc, base) {
              try {
                var _svc$addresses, _svc$txt, _svc$txt2;
                var ip = (svc === null || svc === void 0 || (_svc$addresses = svc.addresses) === null || _svc$addresses === void 0 ? void 0 : _svc$addresses[0]) || (svc === null || svc === void 0 ? void 0 : svc.host);
                var board = (svc === null || svc === void 0 || (_svc$txt = svc.txt) === null || _svc$txt === void 0 ? void 0 : _svc$txt.board) || "";
                var serialNum = (svc === null || svc === void 0 || (_svc$txt2 = svc.txt) === null || _svc$txt2 === void 0 ? void 0 : _svc$txt2.serial_number) || "";
                console.log("[mdns] found: ".concat(base === null || base === void 0 ? void 0 : base.type, " on ").concat(ip, ":").concat(svc === null || svc === void 0 ? void 0 : svc.port, " (").concat(board, ", ").concat(serialNum, ")"));
                var key = "".concat(svc.name, "|").concat(svc.host, "|").concat(svc.port);
                if (found.has(key)) return;
                var addr = (svc.addresses || []).find(function (a) {
                  return /\d+\.\d+\.\d+\.\d+/.test(a);
                }) || (svc.addresses || [])[0] || svc.host;
                found.set(key, {
                  name: svc.name || "",
                  host: addr || svc.host || "",
                  port: svc.port || 0,
                  type: base.type,
                  protocol: base.protocol,
                  fqdn: svc.fqdn || "",
                  txt: svc.txt || {}
                });
              } catch (_unused53) {}
            };
            var _iterator3 = _createForOfIteratorHelper(typeList),
              _step3;
            try {
              var _loop = function _loop() {
                var t = _step3.value;
                try {
                  var finder = bonjour.find || bonjour.browse || bonjour.findServices;
                  if (!finder) {
                    console.warn("[mdns] no find/browse API on bonjour instance");
                    return 1; // continue
                  }
                  var b = finder.call(bonjour, {
                    type: t.type,
                    protocol: t.protocol
                  });
                  b.on("up", function (svc) {
                    return onUp(svc, t);
                  });
                  b.on("error", function (err) {
                    return console.error("[mdns] browser error:", err);
                  });
                  try {
                    if (typeof b.start === "function") {
                      b.start();
                      //console.log("[mdns] started browser for", t);
                    } else {
                      console.log("[mdns] browser auto-start for", t);
                    }
                  } catch (e) {
                    console.warn("[mdns] start error for", t, e);
                  }
                  browsers.push(b);
                } catch (_unused57) {}
              };
              for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
                if (_loop()) continue;
              }
            } catch (err) {
              _iterator3.e(err);
            } finally {
              _iterator3.f();
            }
            var done = function done() {
              try {
                for (var _i7 = 0, _browsers = browsers; _i7 < _browsers.length; _i7++) {
                  var b = _browsers[_i7];
                  try {
                    b.stop();
                  } catch (_unused54) {}
                }
              } catch (_unused55) {}
              try {
                bonjour.destroy();
              } catch (_unused56) {}
              var arr = Array.from(found.values());
              console.log("[mdns] done; returning", arr.length, "services");
              resolve(arr);
            };
            setTimeout(done, timeoutMs);
          });
        case 1:
          return _context5.a(2, _context5.v);
      }
    }, _callee5);
  }));
  return _scanMdns.apply(this, arguments);
}
var serialServers = new Map(); // path -> { server, port }

// Keep original port info returned by serialport.list()
var serialPortDetails = new Map(); // path -> portInfo
function closeSerialTcpServer(_x5) {
  return _closeSerialTcpServer.apply(this, arguments);
}
function _closeSerialTcpServer() {
  _closeSerialTcpServer = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(path) {
    var info, sp, _t11;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.p = _context6.n) {
        case 0:
          _context6.p = 0;
          info = serialServers.get(path);
          if (info) {
            _context6.n = 1;
            break;
          }
          return _context6.a(2);
        case 1:
          try {
            // close TCP server
            info.server.close(function () {
              // closed
            });
          } catch (_unused58) {}
          try {
            tcpPortToSerialPath["delete"](info.port);
          } catch (_unused59) {}
          serialServers["delete"](path);
          serialPortDetails["delete"](path);
          try {
            sp = openSerialPorts.get(path);
            if (sp) {
              if (typeof sp.close === "function") {
                try {
                  sp.close();
                } catch (_unused60) {}
              }
              openSerialPorts["delete"](path);
            }
          } catch (_unused61) {}
          console.log("[serial] closed TCP server for", path);
          _context6.n = 3;
          break;
        case 2:
          _context6.p = 2;
          _t11 = _context6.v;
          console.warn("[serial] error closing tcp server for", path, String(_t11));
        case 3:
          return _context6.a(2);
      }
    }, _callee6, null, [[0, 2]]);
  }));
  return _closeSerialTcpServer.apply(this, arguments);
}
function scanAndSyncSerialPorts() {
  return _scanAndSyncSerialPorts.apply(this, arguments);
}
function _scanAndSyncSerialPorts() {
  _scanAndSyncSerialPorts = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7() {
    var _SerialPortLib2, ports, maybeSerialPort, foundPaths, _iterator4, _step4, _loop2, _i8, _Array$from, existingPath, _t12, _t13, _t14;
    return _regenerator().w(function (_context8) {
      while (1) switch (_context8.p = _context8.n) {
        case 0:
          _context8.p = 0;
          _context8.n = 1;
          return getSerialPort();
        case 1:
          _SerialPortLib2 = _context8.v;
          if (_SerialPortLib2) {
            _context8.n = 2;
            break;
          }
          return _context8.a(2);
        case 2:
          ports = [];
          _context8.p = 3;
          maybeSerialPort = _SerialPortLib2.SerialPort || _SerialPortLib2;
          if (!(typeof maybeSerialPort.list === "function")) {
            _context8.n = 5;
            break;
          }
          _context8.n = 4;
          return maybeSerialPort.list();
        case 4:
          ports = _context8.v;
          _context8.n = 8;
          break;
        case 5:
          if (!(typeof _SerialPortLib2.list === "function")) {
            _context8.n = 7;
            break;
          }
          _context8.n = 6;
          return _SerialPortLib2.list();
        case 6:
          ports = _context8.v;
          _context8.n = 8;
          break;
        case 7:
          return _context8.a(2);
        case 8:
          _context8.n = 10;
          break;
        case 9:
          _context8.p = 9;
          _t12 = _context8.v;
          console.warn("[serial] list() failed during scan:", _t12);
          return _context8.a(2);
        case 10:
          foundPaths = new Set();
          _iterator4 = _createForOfIteratorHelper(ports);
          _context8.p = 11;
          _loop2 = /*#__PURE__*/_regenerator().m(function _loop2() {
            var p, pathName;
            return _regenerator().w(function (_context7) {
              while (1) switch (_context7.n) {
                case 0:
                  p = _step4.value;
                  pathName = p.path || p.comName || p.device || p.port || p.friendlyName;
                  if (pathName) {
                    _context7.n = 1;
                    break;
                  }
                  return _context7.a(2, 1);
                case 1:
                  foundPaths.add(pathName);
                  serialPortDetails.set(pathName, p);
                  if (!serialServers.has(pathName)) {
                    try {
                      // start server for new port (don't await to allow parallel)
                      ensureSerialTcpServer(pathName, 115200 /* default baud */)["catch"](function (e) {
                        return console.warn("[serial] failed to create tcp server for", pathName, e);
                      });
                    } catch (e) {
                      console.warn("[serial] ensureSerialTcpServer error:", e);
                    }
                  }
                case 2:
                  return _context7.a(2);
              }
            }, _loop2);
          });
          _iterator4.s();
        case 12:
          if ((_step4 = _iterator4.n()).done) {
            _context8.n = 15;
            break;
          }
          return _context8.d(_regeneratorValues(_loop2()), 13);
        case 13:
          if (!_context8.v) {
            _context8.n = 14;
            break;
          }
          return _context8.a(3, 14);
        case 14:
          _context8.n = 12;
          break;
        case 15:
          _context8.n = 17;
          break;
        case 16:
          _context8.p = 16;
          _t13 = _context8.v;
          _iterator4.e(_t13);
        case 17:
          _context8.p = 17;
          _iterator4.f();
          return _context8.f(17);
        case 18:
          _i8 = 0, _Array$from = Array.from(serialServers.keys());
        case 19:
          if (!(_i8 < _Array$from.length)) {
            _context8.n = 21;
            break;
          }
          existingPath = _Array$from[_i8];
          if (foundPaths.has(existingPath)) {
            _context8.n = 20;
            break;
          }
          _context8.n = 20;
          return closeSerialTcpServer(existingPath);
        case 20:
          _i8++;
          _context8.n = 19;
          break;
        case 21:
          _context8.n = 23;
          break;
        case 22:
          _context8.p = 22;
          _t14 = _context8.v;
          if (DEBUG) console.warn("[serial] scanAndSyncSerialPorts error:", String(_t14));
        case 23:
          return _context8.a(2);
      }
    }, _callee7, null, [[11, 16, 17, 18], [3, 9], [0, 22]]);
  }));
  return _scanAndSyncSerialPorts.apply(this, arguments);
}
var _serialMonitorHandle = null;
function startSerialMonitor() {
  return _startSerialMonitor.apply(this, arguments);
}
function _startSerialMonitor() {
  _startSerialMonitor = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8() {
    var _t15;
    return _regenerator().w(function (_context9) {
      while (1) switch (_context9.p = _context9.n) {
        case 0:
          _context9.p = 0;
          if (!(SERIAL_SCAN_INTERVAL === 0)) {
            _context9.n = 1;
            break;
          }
          if (DEBUG) console.log("[serial] monitor disabled (SERIAL_SCAN_INTERVAL=0)");
          return _context9.a(2);
        case 1:
          _context9.n = 2;
          return scanAndSyncSerialPorts();
        case 2:
          if (!_serialMonitorHandle) {
            _context9.n = 3;
            break;
          }
          return _context9.a(2);
        case 3:
          _serialMonitorHandle = setInterval(function () {
            scanAndSyncSerialPorts()["catch"](function () {});
          }, SERIAL_SCAN_INTERVAL);
          if (DEBUG) console.log("[serial] monitor started, interval", SERIAL_SCAN_INTERVAL);
          _context9.n = 5;
          break;
        case 4:
          _context9.p = 4;
          _t15 = _context9.v;
          console.warn("[serial] failed to start monitor:", _t15);
        case 5:
          return _context9.a(2);
      }
    }, _callee8, null, [[0, 4]]);
  }));
  return _startSerialMonitor.apply(this, arguments);
}
function stopSerialMonitor() {
  try {
    if (_serialMonitorHandle) {
      clearInterval(_serialMonitorHandle);
      _serialMonitorHandle = null;
      if (DEBUG) console.log("[serial] monitor stopped");
    }
  } catch (e) {
    if (DEBUG) console.warn("[serial] stopSerialMonitor failed:", String(e));
  }
}
function closeAllSerialServers() {
  return _closeAllSerialServers.apply(this, arguments);
}
function _closeAllSerialServers() {
  _closeAllSerialServers = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9() {
    var keys, _i9, _keys, p, _t16, _t17;
    return _regenerator().w(function (_context0) {
      while (1) switch (_context0.p = _context0.n) {
        case 0:
          _context0.p = 0;
          keys = Array.from(serialServers.keys());
          _i9 = 0, _keys = keys;
        case 1:
          if (!(_i9 < _keys.length)) {
            _context0.n = 6;
            break;
          }
          p = _keys[_i9];
          _context0.p = 2;
          _context0.n = 3;
          return closeSerialTcpServer(p);
        case 3:
          _context0.n = 5;
          break;
        case 4:
          _context0.p = 4;
          _t16 = _context0.v;
          if (DEBUG) console.warn("[serial] failed closing server for", p, String(_t16));
        case 5:
          _i9++;
          _context0.n = 1;
          break;
        case 6:
          _context0.n = 8;
          break;
        case 7:
          _context0.p = 7;
          _t17 = _context0.v;
          if (DEBUG) console.warn("[serial] closeAllSerialServers failed:", String(_t17));
        case 8:
          return _context0.a(2);
      }
    }, _callee9, null, [[2, 4], [0, 7]]);
  }));
  return _closeAllSerialServers.apply(this, arguments);
}
var _gracefulShuttingDown = false;
function gracefulShutdown(_x6) {
  return _gracefulShutdown.apply(this, arguments);
}
function _gracefulShutdown() {
  _gracefulShutdown = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0(code) {
    var _t18;
    return _regenerator().w(function (_context1) {
      while (1) switch (_context1.p = _context1.n) {
        case 0:
          _context1.p = 0;
          if (!_gracefulShuttingDown) {
            _context1.n = 1;
            break;
          }
          return _context1.a(2);
        case 1:
          _gracefulShuttingDown = true;
          console.log("[shutdown] graceful shutdown starting...");
          // Stop monitor to avoid races
          stopSerialMonitor();
          // Close serial-related servers/ports
          _context1.n = 2;
          return closeAllSerialServers();
        case 2:
          // Close websocket and http servers
          try {
            if (wss && typeof wss.close === "function") {
              wss.close();
            }
          } catch (e) {}
          try {
            if (server && typeof server.close === "function") {
              server.close(function () {
                // closed
              });
            }
          } catch (e) {}
          console.log("[shutdown] done");
          _context1.n = 4;
          break;
        case 3:
          _context1.p = 3;
          _t18 = _context1.v;
          console.warn("[shutdown] error:", String(_t18));
        case 4:
          _context1.p = 4;
          try {
            if (typeof code === "number") process.exit(code);
          } catch (_unused62) {}
          return _context1.f(4);
        case 5:
          return _context1.a(2);
      }
    }, _callee0, null, [[0, 3, 4, 5]]);
  }));
  return _gracefulShutdown.apply(this, arguments);
}
function listLocalSerialAsServices() {
  return _listLocalSerialAsServices.apply(this, arguments);
}
function _listLocalSerialAsServices() {
  _listLocalSerialAsServices = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee1() {
    var services, hostIp, _iterator5, _step5, _step5$value, pathName, info, p;
    return _regenerator().w(function (_context10) {
      while (1) switch (_context10.n) {
        case 0:
          // Only return services for servers we already created via the monitor.
          services = [];
          try {
            hostIp = getAdvertiseHost(); // use the actual advertised IP
            _iterator5 = _createForOfIteratorHelper(serialServers);
            try {
              for (_iterator5.s(); !(_step5 = _iterator5.n()).done;) {
                _step5$value = _slicedToArray(_step5.value, 2), pathName = _step5$value[0], info = _step5$value[1];
                p = serialPortDetails.get(pathName) || {};
                services.push({
                  name: pathName,
                  host: hostIp,
                  port: info.port,
                  type: "local",
                  protocol: "serial",
                  fqdn: pathName,
                  txt: {
                    board: p.manufacturer || p.productId || "",
                    serial_number: p.serialNumber || "",
                    vendor_id: p.vendorId || "",
                    product_id: p.productId || p.productId || ""
                  }
                });
              }
            } catch (err) {
              _iterator5.e(err);
            } finally {
              _iterator5.f();
            }
          } catch (e) {
            console.warn("[serial] listLocalSerialAsServices failed:", e);
          }
          return _context10.a(2, services);
      }
    }, _callee1);
  }));
  return _listLocalSerialAsServices.apply(this, arguments);
}
function ensureSerialTcpServer(_x7, _x8) {
  return _ensureSerialTcpServer.apply(this, arguments);
}
function _ensureSerialTcpServer() {
  _ensureSerialTcpServer = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee10(path, baudRate) {
    var SerialPortLib, server, boundPort, info;
    return _regenerator().w(function (_context11) {
      while (1) switch (_context11.n) {
        case 0:
          _context11.n = 1;
          return getSerialPort();
        case 1:
          SerialPortLib = _context11.v;
          if (!serialServers.has(path)) {
            _context11.n = 2;
            break;
          }
          return _context11.a(2, serialServers.get(path));
        case 2:
          server = net.createServer();
          boundPort = null;
          server.on("connection", function (socket) {
            console.log("[serial] client connected for", path);
            var serial;
            try {
              var SP = SerialPortLib && (SerialPortLib.SerialPort || SerialPortLib) || null;
              if (!SP) throw new Error("serialport unavailable");
              serial = new SP({
                path: path,
                baudRate: baudRate,
                autoOpen: true
              });
              openSerialPorts.set(path, serial); // keep for DTR/RTS control
            } catch (e) {
              console.error("[serial] open failed", path, e);
              try {
                socket.destroy(e);
              } catch (_unused63) {}
              return;
            }
            var onSerialData = function onSerialData(data) {
              try {
                socket.write(data);
              } catch (_unused64) {}
            };
            var onSockData = function onSockData(data) {
              try {
                serial.write(data);
              } catch (_unused65) {}
            };
            serial.on("data", onSerialData);
            socket.on("data", onSockData);
            var safeOff = function safeOff(emitter, event, handler) {
              try {
                if (!emitter) return;
                if (typeof emitter.off === "function") emitter.off(event, handler);else if (typeof emitter.removeListener === "function") emitter.removeListener(event, handler);
              } catch (_unused66) {}
            };
            var cleaned = false;
            var cleanup = function cleanup(reason) {
              if (cleaned) return;
              cleaned = true;
              // Detach listeners first to avoid re-entrant calls
              safeOff(serial, "data", onSerialData);
              safeOff(socket, "data", onSockData);
              safeOff(socket, "close", onSocketClose);
              safeOff(socket, "error", onSocketError);
              safeOff(serial, "error", onSerialError);
              safeOff(serial, "close", onSerialClose);
              try {
                if (serial && typeof serial.close === "function" && serial.isOpen) {
                  serial.close();
                }
              } catch (_unused67) {}
              try {
                socket && socket.destroy && socket.destroy();
              } catch (_unused68) {}
              openSerialPorts["delete"](path); // remove from the store
              console.log("[serial] connection closed for", path, reason ? "(reason: ".concat(reason, ")") : "");
            };
            var onSocketClose = function onSocketClose() {
              return cleanup("socket close");
            };
            var onSocketError = function onSocketError() {
              return cleanup("socket error");
            };
            var onSerialError = function onSerialError() {
              return cleanup("serial error");
            };
            var onSerialClose = function onSerialClose() {
              return cleanup("serial close");
            };
            socket.on("close", onSocketClose);
            socket.on("error", onSocketError);
            serial.on("error", onSerialError);
            serial.on && serial.on("close", onSerialClose);
          });
          _context11.n = 3;
          return new Promise(function (resolve) {
            return server.listen(0, "0.0.0.0", resolve);
          });
        case 3:
          boundPort = server.address().port;
          console.log("[serial] TCP server for", path, "listening on", boundPort);
          info = {
            server: server,
            port: boundPort,
            baudRate: baudRate
          };
          serialServers.set(path, info);
          try {
            tcpPortToSerialPath.set(boundPort, path);
          } catch (_unused69) {}
          return _context11.a(2, info);
      }
    }, _callee10);
  }));
  return _ensureSerialTcpServer.apply(this, arguments);
}
function tcpPortFromPath(path) {
  try {
    var info = serialServers.get(path);
    return (info === null || info === void 0 ? void 0 : info.port) || null;
  } catch (_unused37) {
    return null;
  }
}

// Install graceful shutdown hooks
try {
  process.on("SIGINT", function () {
    return gracefulShutdown(0);
  });
  process.on("SIGTERM", function () {
    return gracefulShutdown(0);
  });
  process.on("SIGHUP", function () {
    return gracefulShutdown(0);
  });
  process.on("uncaughtException", function (err) {
    console.error("[uncaughtException]", err);
    gracefulShutdown(1);
  });
} catch (e) {
  if (DEBUG) console.warn("[shutdown] failed to install handlers:", String(e));
}
