// Loads the theme, and repaints the one thing a stylesheet cannot reach.
//
// The stylesheet is appended rather than linked from the <head> markup so it
// lands after the page's own inline <style>, which is what lets it win on
// equal specificity without a single !important.
//
// The match chart is drawn into a <canvas>, so its colours live in JavaScript
// as literals. Rather than fork drawMatchChart - which would then drift from
// whatever the chart becomes next - the canvas's own fillStyle and strokeStyle
// are shadowed with accessors that translate the old palette on the way
// through. Anything not in the map passes untouched.

(function () {
  'use strict';

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/theme.css';
  document.head.appendChild(link);

  var PALETTE = {
    '#667eea': '#ffffff',                 // your line
    '#764ba2': '#ffd479',                 // the rival's line
    '#ececf4': 'rgba(255,255,255,0.20)',  // gridlines
    '#9ca3af': 'rgba(255,255,255,0.62)',  // axis numbers
    '#6b7280': 'rgba(255,255,255,0.72)'   // question labels
  };

  function translate(value) {
    if (typeof value !== 'string') return value;
    var hit = PALETTE[value.toLowerCase()];
    return hit === undefined ? value : hit;
  }

  function repaint(canvas) {
    if (!canvas || canvas.dataset.qThemed) return;

    var ctx;
    try {
      ctx = canvas.getContext('2d');
    } catch (_e) {
      return;
    }
    if (!ctx) return;

    ['fillStyle', 'strokeStyle'].forEach(function (name) {
      // The real accessor lives on the prototype; find it there and keep it,
      // so the shadowing property still writes through to the canvas.
      var proto = Object.getPrototypeOf(ctx);
      var base = null;
      while (proto && !base) {
        base = Object.getOwnPropertyDescriptor(proto, name);
        proto = Object.getPrototypeOf(proto);
      }
      if (!base || !base.set) return;

      Object.defineProperty(ctx, name, {
        configurable: true,
        get: function () {
          return base.get.call(ctx);
        },
        set: function (value) {
          base.set.call(ctx, translate(value));
        }
      });
    });

    canvas.dataset.qThemed = '1';
  }

  function start() {
    try {
      repaint(document.getElementById('match-chart'));
    } catch (error) {
      console.warn('[theme] chart repaint skipped:', error && error.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
