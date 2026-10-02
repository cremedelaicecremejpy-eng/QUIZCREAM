// Experience levels in the UI.
//
// Kept out of index.html on purpose: the app's own functions are global, so
// this file wraps the four that matter and leaves the rest alone. Nothing here
// is load-bearing - if the progress endpoint is unreachable, or an element has
// moved, every hook falls back to the original behaviour.
//
// The look is deliberately plain. The visual treatment arrives with the reskin;
// this is about putting the numbers where they belong.

(function () {
  'use strict';

  var progress = null;      // { overall, topics: [...] }
  var byName = new Map();   // topic name -> that topic's row

  // ---------------------------------------------------------------- styling

  var css = [
    '.lv-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;',
    'background:rgba(255,178,26,.14);color:#d98b00;font-size:12px;font-weight:700;letter-spacing:.04em;white-space:nowrap}',
    '.lv-chip.lv-muted{background:rgba(120,130,140,.14);color:#6b7780}',
    '.lv-bar{display:block;position:relative;height:6px;border-radius:3px;background:rgba(120,130,140,.2);overflow:hidden}',
    '.lv-bar>i{display:block;height:100%;border-radius:3px;background:#ffb21a;width:0;',
    'transition:width .9s cubic-bezier(.2,.7,.2,1)}',
    '.lv-topic{display:flex;align-items:center;gap:8px;margin-top:6px}',
    '.lv-topic .lv-bar{flex:1;min-width:60px}',
    '.lv-xp{margin:18px 0 4px;text-align:center}',
    '.lv-xp .lv-gain{font-size:26px;font-weight:800;color:#ffb21a;letter-spacing:.02em}',
    '.lv-xp .lv-where{margin:2px 0 10px;font-size:13px;opacity:.75;letter-spacing:.06em;text-transform:uppercase}',
    '.lv-xp .lv-bar{max-width:320px;margin:0 auto;height:10px;border-radius:5px}',
    '.lv-xp .lv-counts{margin-top:6px;font-size:12px;opacity:.65}',
    '.lv-up{margin:10px auto 0;max-width:320px;padding:8px 12px;border-radius:10px;',
    'background:rgba(255,178,26,.16);color:#d98b00;font-weight:800;letter-spacing:.06em;font-size:13px;text-transform:uppercase}',
    '.lv-stats{margin-top:18px}',
    '.lv-stats h3{margin:0 0 8px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;opacity:.7}',
    '.lv-stats .lv-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid rgba(120,130,140,.18)}',
    '.lv-stats .lv-name{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lv-stats .lv-bar{width:84px;flex-shrink:0}',
    '.lv-stats .lv-num{width:74px;flex-shrink:0;text-align:right;font-size:12px;opacity:.7}'
  ].join('');

  function injectStyle() {
    if (document.getElementById('lv-style')) return;
    var el = document.createElement('style');
    el.id = 'lv-style';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  // ---------------------------------------------------------------- helpers

  function pct(row) {
    if (!row || !row.xpForThisLevel) return 100;
    return Math.max(0, Math.min(100, (row.xpIntoLevel / row.xpForThisLevel) * 100));
  }

  function bar(percent) {
    var wrap = document.createElement('span');
    wrap.className = 'lv-bar';
    var fill = document.createElement('i');
    wrap.appendChild(fill);
    // Next frame, so the width change animates rather than snapping.
    requestAnimationFrame(function () {
      fill.style.width = percent + '%';
    });
    return wrap;
  }

  function chip(text, muted) {
    var el = document.createElement('span');
    el.className = 'lv-chip' + (muted ? ' lv-muted' : '');
    el.textContent = text;
    return el;
  }

  function signedIn() {
    try {
      return Boolean(currentUser);
    } catch (_e) {
      return false;
    }
  }

  // --------------------------------------------------------------- the data

  var inFlight = null;

  function load(force) {
    if (!signedIn()) {
      progress = null;
      byName.clear();
      return Promise.resolve(null);
    }
    if (progress && !force) return Promise.resolve(progress);
    if (inFlight) return inFlight;

    inFlight = authFetch('/api/me/progress')
      .then(function (data) {
        progress = data;
        byName.clear();
        (data.topics || []).forEach(function (row) {
          byName.set(row.name, row);
        });
        return data;
      })
      .catch(function () {
        return null;   // levels simply do not appear; nothing else breaks
      })
      .then(function (out) {
        inFlight = null;
        return out;
      });

    return inFlight;
  }

  // ------------------------------------------------------- 1. topic picker

  function decorateTopics() {
    if (!progress) return;

    document.querySelectorAll('#topic-list .topic-row').forEach(function (row) {
      if (row.querySelector('.lv-topic')) return;

      var nameEl = row.querySelector('.topic-name');
      if (!nameEl) return;

      var found = byName.get(nameEl.textContent.trim());
      if (!found) return;

      var line = document.createElement('div');
      line.className = 'lv-topic';
      line.appendChild(chip('Lv ' + found.level, found.level <= 1 && found.matches === 0));
      line.appendChild(bar(pct(found)));
      nameEl.insertAdjacentElement('afterend', line);
    });
  }

  // ----------------------------------------------------- 2. the signed-in line

  function decorateUserLine() {
    var line = document.getElementById('home-user-line');
    if (!line || !progress || !progress.overall) return;
    if (line.querySelector('.lv-chip')) return;

    line.appendChild(document.createTextNode(' '));
    line.appendChild(chip('Level ' + progress.overall.level));
  }

  // ---------------------------------------------------- 3. the result screen

  function showEarned(data) {
    var panel = document.getElementById('match-score-screen');
    var earned = data && data.progress;

    var old = document.getElementById('lv-earned');
    if (old) old.remove();

    // Guests, and solo games, earn nothing - so show nothing.
    if (!panel || !earned) return;

    var block = document.createElement('div');
    block.className = 'lv-xp';
    block.id = 'lv-earned';

    var gain = document.createElement('p');
    gain.className = 'lv-gain';
    gain.textContent = '+' + earned.gained + ' XP';
    block.appendChild(gain);

    var where = document.createElement('p');
    where.className = 'lv-where';
    where.textContent = (data.topicName || '') + ' · Level ' + earned.topic.level;
    block.appendChild(where);

    // Start the bar where the player was before this match, then run it up, so
    // the match is visibly what moved it.
    var before = Math.max(0, earned.topic.xpIntoLevel - earned.gained);
    var span = earned.topic.xpForThisLevel || 1;
    var fromPct = earned.leveledUp ? 0 : Math.min(100, (before / span) * 100);

    var wrap = document.createElement('span');
    wrap.className = 'lv-bar';
    var fill = document.createElement('i');
    fill.style.width = fromPct + '%';
    wrap.appendChild(fill);
    block.appendChild(wrap);

    var counts = document.createElement('p');
    counts.className = 'lv-counts';
    counts.textContent = earned.topic.isMaxLevel
      ? 'Level 100 — the top'
      : earned.topic.xpIntoLevel + ' / ' + earned.topic.xpForThisLevel +
        ' · ' + earned.topic.xpToNextLevel + ' to level ' + (earned.topic.level + 1);
    block.appendChild(counts);

    if (earned.leveledUp) {
      var up = document.createElement('p');
      up.className = 'lv-up';
      up.textContent = 'Level ' + earned.topic.level + ' reached';
      block.appendChild(up);
    }

    var scores = panel.querySelector('.match-scores');
    if (scores) scores.insertAdjacentElement('afterend', block);
    else panel.appendChild(block);

    setTimeout(function () {
      fill.style.width = pct(earned.topic) + '%';
    }, 350);
  }

  // ------------------------------------------------------- 4. the stats view

  function decorateStats() {
    var host = document.getElementById('stats-signed-in');
    if (!host || !progress) return;

    var old = document.getElementById('lv-stats');
    if (old) old.remove();

    var box = document.createElement('div');
    box.className = 'lv-stats';
    box.id = 'lv-stats';

    var head = document.createElement('h3');
    head.textContent = 'Levels by topic · overall ' + progress.overall.level;
    box.appendChild(head);

    (progress.topics || [])
      .slice()
      .sort(function (a, b) { return b.xp - a.xp; })
      .forEach(function (row) {
        var line = document.createElement('div');
        line.className = 'lv-row';

        var name = document.createElement('span');
        name.className = 'lv-name';
        name.textContent = row.name;

        var num = document.createElement('span');
        num.className = 'lv-num';
        num.textContent = 'Lv ' + row.level + ' · ' + row.xp + ' xp';

        line.appendChild(name);
        line.appendChild(bar(pct(row)));
        line.appendChild(num);
        box.appendChild(line);
      });

    host.appendChild(box);
  }

  // ------------------------------------------------------------- the hooks

  function wrap(name, after) {
    var original = window[name];
    if (typeof original !== 'function') return;

    window[name] = function () {
      var out = original.apply(this, arguments);
      try {
        after.apply(this, arguments);
      } catch (error) {
        console.warn('[levels] ' + name + ' hook failed:', error && error.message);
      }
      return out;
    };
  }

  function start() {
    injectStyle();

    wrap('renderTopicList', function () {
      if (progress) decorateTopics();
      else load().then(function () { decorateTopics(); });
    });

    wrap('updateTopicScreenAuth', function () {
      if (progress) { decorateUserLine(); decorateStats(); }
      else load().then(function () { decorateUserLine(); decorateStats(); });
    });

    wrap('showMatchScore', function (data) {
      showEarned(data);
      // A match just changed the numbers, so the picker and stats must not
      // keep showing the old ones.
      load(true).then(function () {
        decorateTopics();
        decorateStats();
      });
    });

    load().then(function () {
      decorateTopics();
      decorateUserLine();
      decorateStats();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
