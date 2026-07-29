/**
 * Client-side search over the topic index embedded in the home page.
 *
 * 187 entries is a few kilobytes, so there is no service, no API key and no
 * network call — the index ships inside the document that uses it. Matching is
 * a plain substring scan across name, family, domain and import path, which is
 * what someone typing "mcclellan" or "split" actually wants.
 */
(function () {
  var input = document.getElementById("q");
  var list = document.getElementById("results");
  var node = document.getElementById("search-index");
  if (!input || !list || !node) return;

  var topics = JSON.parse(node.textContent);
  var LIMIT = 12;
  var BASE = window.__BASE__ || "";

  function render(matches, query) {
    if (!matches.length) {
      list.innerHTML = query
        ? '<li><a tabindex="-1">No algorithm matches “' + escapeHtml(query) + '”</a></li>'
        : "";
      list.hidden = !query;
      return;
    }
    list.innerHTML = matches
      .map(function (t) {
        return (
          '<li><a href="' + BASE + "/" + t.p + '/">' + escapeHtml(t.n) +
          ' <span class="where">' + escapeHtml(t.d) + " · " + escapeHtml(t.f) +
          (t.v ? " · verified" : "") + "</span></a></li>"
        );
      })
      .join("");
    list.hidden = false;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function score(t, q) {
    var name = t.n.toLowerCase();
    if (name === q) return 0;
    if (name.indexOf(q) === 0) return 1;
    if (name.indexOf(q) !== -1) return 2;
    if (t.p.indexOf(q) !== -1) return 3;
    if ((t.f + " " + t.d).toLowerCase().indexOf(q) !== -1) return 4;
    return -1;
  }

  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      render([], "");
      return;
    }
    var scored = [];
    for (var i = 0; i < topics.length; i++) {
      var s = score(topics[i], q);
      if (s !== -1) scored.push([s, i, topics[i]]);
    }
    scored.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    render(
      scored.slice(0, LIMIT).map(function (x) {
        return x[2];
      }),
      q,
    );
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      input.value = "";
      render([], "");
    }
    if (e.key === "Enter") {
      var first = list.querySelector("a[href]");
      if (first) window.location.href = first.getAttribute("href");
    }
  });
})();
