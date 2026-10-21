// scripts/design/board-runtime.js: a stand-in for the Claude Design runtime, so a board renders outside the tool.
//
// The boards of a handoff link `./support.js`, the design tool's runtime, which the export does not carry.
// scripts/design/render.mjs copies this file in its place (in a scratch copy of the handoff, never the handoff itself)
// and Chrome runs it. It does what a board needs to draw:
//   - <x-dc> holds the board; its <helmet> goes into <head>;
//   - <script type="text/x-dc" data-dc-script> defines `class Component extends DCLogic` with renderVals(), state and
//     setState; data-props gives the props' defaults; the page URL's query (?theme=light) sets the board's props;
//   - {{a.b}} holes in text and attributes; an exact hole in on* binds the function, in a boolean attribute sets or drops it;
//   - <sc-if value="{{x}}">, <sc-for list="{{xs}}" as="x">, and <dc-import name="Board" prop="v"> (the imported board
//     comes from a <template data-dc-board="Board"> render.mjs appends, holding that board's <body>).
// `?theme=` set in the URL also overrides every imported board's theme, so a whole page renders in one theme.
// Problems go to console.error with a "[dc]" prefix; render.mjs reports them. Plain browser JavaScript, no dependencies.
(function () {
  'use strict';
  var BOOL = { checked: 1, disabled: 1, selected: 1, hidden: 1, open: 1, readonly: 1, required: 1, multiple: 1, autofocus: 1 };
  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var EXACT = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.renderVals = function () { return {}; };
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, p || {});
    schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };
  window.DCLogic = DCLogic;

  var defs = {};
  var instances = {};
  var forced = {};
  var root = null;
  var rootDef = null;
  var rootProps = {};
  var pending = false;
  var helmets = {};

  function fail(msg, e) { console.error('[dc] ' + msg + (e ? ': ' + (e && e.message ? e.message : e) : '')); }

  function define(name, scope) {
    var xdc = scope.querySelector('x-dc');
    if (!xdc) { fail('board ' + name + ' has no <x-dc>'); return null; }
    var script = scope.querySelector('script[data-dc-script]');
    var meta = {};
    if (script) { try { meta = JSON.parse(script.getAttribute('data-props') || '{}'); } catch (e) { fail('board ' + name + ': data-props is not JSON', e); } }
    var defaults = {};
    Object.keys(meta).forEach(function (k) { if (k.charAt(0) !== '$' && meta[k] && 'default' in meta[k]) defaults[k] = meta[k].default; });
    var Cls = DCLogic;
    if (script) {
      try { Cls = new Function('DCLogic', script.textContent + '\n;return typeof Component === "undefined" ? DCLogic : Component;')(DCLogic); }
      catch (e) { fail('board ' + name + ': its script does not run', e); }
    }
    var helmet = null, nodes = [];
    Array.prototype.forEach.call(xdc.childNodes, function (n) {
      if (n.nodeType === 1 && n.localName === 'helmet') helmet = n; else nodes.push(n.cloneNode(true));
    });
    return { name: name, nodes: nodes, helmet: helmet, Cls: Cls, defaults: defaults };
  }

  function lookup(name) {
    if (defs[name] !== undefined) return defs[name];
    var t = document.querySelector('template[data-dc-board="' + name + '"]');
    defs[name] = t ? define(name, t.content) : null;
    if (!t) fail('no board named ' + name + ' to import');
    return defs[name];
  }

  function addHelmet(def) {
    if (!def.helmet || helmets[def.name]) return;
    helmets[def.name] = true;
    Array.prototype.forEach.call(def.helmet.children, function (el) {
      var html = el.outerHTML;
      var dup = Array.prototype.some.call(document.head.children, function (h) { return h.outerHTML === html; });
      if (!dup) document.head.appendChild(el.cloneNode(true));
    });
  }

  function get(expr, scope) {
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    var q = /^(['"])(.*)\1$/.exec(expr);
    if (q) return q[2];
    var parts = expr.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v === null || v === undefined) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function text(v) { return v === null || v === undefined || typeof v === 'function' ? '' : String(v); }
  function fill(s, scope) { return s.replace(HOLE, function (_, e) { return text(get(e, scope)); }); }
  function value(s, scope) { var m = EXACT.exec(s); return m ? get(m[1], scope) : fill(s, scope); }

  function expand(nodes, scope, ctx, out) {
    for (var i = 0; i < nodes.length; i++) one(nodes[i], scope, ctx, out);
  }

  function one(n, scope, ctx, out) {
    if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.data.indexOf('{{') < 0 ? n.data : fill(n.data, scope))); return; }
    if (n.nodeType !== 1) return;
    var tag = n.localName;
    var kids = n.localName === 'template' ? n.content.childNodes : n.childNodes;
    if (tag === 'sc-if') { if (value(n.getAttribute('value') || '', scope)) expand(kids, scope, ctx, out); return; }
    if (tag === 'sc-for') {
      var list = value(n.getAttribute('list') || '', scope);
      var as = n.getAttribute('as') || 'item';
      if (list && typeof list.length === 'number') {
        for (var k = 0; k < list.length; k++) {
          var s = Object.create(scope);
          s[as] = list[k];
          s[as + 'Index'] = k;
          expand(kids, s, ctx, out);
        }
      }
      return;
    }
    if (tag === 'dc-import') {
      var name = n.getAttribute('name') || (n.getAttribute('src') || '').replace(/^.*\//, '').replace(/(\.dc)?\.html?$/i, '');
      var props = {};
      Array.prototype.forEach.call(n.attributes, function (a) {
        if (a.name === 'name' || a.name === 'src' || a.name.indexOf('hint-') === 0) return;
        props[a.name] = value(a.value, scope);
      });
      Object.keys(forced).forEach(function (k) { props[k] = forced[k]; });
      var def = lookup(name);
      if (def) mount(def, props, ctx.key + '/' + (ctx.n++) + ':' + name, out);
      return;
    }
    var el = n.namespaceURI && n.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(n.namespaceURI, n.tagName)
      : document.createElement(tag);
    Array.prototype.forEach.call(n.attributes, function (a) {
      if (a.value.indexOf('{{') < 0) { el.setAttribute(a.name, a.value); return; }
      var v = value(a.value, scope);
      var lname = a.name.toLowerCase();
      if (lname.indexOf('on') === 0 && EXACT.test(a.value)) {
        if (typeof v === 'function') el.addEventListener(lname.slice(2), function (ev) { v(ev); });
        return;
      }
      if (typeof v === 'function') return;
      if (BOOL[lname]) { if (v && v !== 'false') el.setAttribute(a.name, ''); return; }
      if (v === null || v === undefined || v === false) return;
      el.setAttribute(a.name, String(v));
    });
    expand(kids, scope, ctx, el.localName === 'template' ? el.content : el);
    out.appendChild(el);
  }

  function mount(def, props, key, out) {
    var all = Object.assign({}, def.defaults, props);
    var inst = instances[key];
    if (!inst || inst.__def !== def) {
      try { inst = new def.Cls(all); } catch (e) { fail('board ' + def.name + ': its constructor threw', e); inst = new DCLogic(all); }
      inst.__def = def;
      if (!inst.state) inst.state = {};
      instances[key] = inst;
    }
    inst.props = all;
    addHelmet(def);
    var vals = {};
    try { vals = inst.renderVals() || {}; } catch (e) { fail('board ' + def.name + ': renderVals threw', e); }
    expand(def.nodes, vals, { key: key, n: 0 }, out);
  }

  function render() {
    pending = false;
    var frag = document.createDocumentFragment();
    mount(rootDef, rootProps, 'root', frag);
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(frag);
  }

  function schedule() {
    if (!root || pending) return;
    pending = true;
    Promise.resolve().then(render);
  }

  function start() {
    var xdc = document.querySelector('x-dc');
    if (!xdc) { fail('no <x-dc> on the page'); return; }
    rootDef = define('root', document);
    if (!rootDef) return;
    new URLSearchParams(location.search).forEach(function (v, k) { rootProps[k] = v; });
    if (rootProps.theme) forced.theme = rootProps.theme;
    root = document.createElement('div');
    root.setAttribute('data-dc-root', '');
    root.style.display = 'contents';
    xdc.parentNode.replaceChild(root, xdc);
    try { render(); } catch (e) { fail('the board did not render', e); }
    document.documentElement.setAttribute('data-dc-ready', '');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
