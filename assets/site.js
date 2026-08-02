/**
 * Everything the site needs at runtime: search, copy buttons, and the keyboard
 * shortcut. One file, no dependency, deferred.
 *
 * Search used to live only on the home page because the index was embedded
 * there — which made it unreachable from the 289 pages a reader is actually on.
 * The index is now a separate document fetched on first keystroke and cached by
 * the browser like any other asset.
 */
(function () {
  var BASE = window.__BASE__ || "";

  // ------------------------------------------------------------- search

  var input = document.getElementById("q");
  var list = document.getElementById("results");

  if (input && list) {
    var topics = null;
    var loading = null;
    var LIMIT = 12;

    var escapeHtml = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    };

    var load = function () {
      if (topics) return Promise.resolve(topics);
      if (loading) return loading;
      loading = fetch(input.dataset.index)
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          topics = data;
          return data;
        })
        .catch(function () {
          return [];
        });
      return loading;
    };

    // Rank by where the match lands: an exact name beats a prefix, which beats
    // a substring, which beats a match in the family or import path.
    var score = function (t, q) {
      var name = t.n.toLowerCase();
      if (name === q) return 0;
      if (name.indexOf(q) === 0) return 1;
      if (name.indexOf(q) !== -1) return 2;
      if (t.p.indexOf(q) !== -1) return 3;
      if ((t.f + " " + t.d).toLowerCase().indexOf(q) !== -1) return 4;
      return -1;
    };

    var render = function (matches, query) {
      if (!query) {
        list.innerHTML = "";
        list.hidden = true;
        return;
      }
      if (!matches.length) {
        list.innerHTML = '<li class="empty">No algorithm matches “' + escapeHtml(query) + "”</li>";
        list.hidden = false;
        return;
      }
      list.innerHTML = matches
        .map(function (t) {
          return (
            '<li><a href="' + BASE + "/" + t.p + '/">' + escapeHtml(t.n) +
            '<span class="where">' + escapeHtml(t.d) + " · " + escapeHtml(t.f) +
            (t.v ? " · verified" : "") + "</span></a></li>"
          );
        })
        .join("");
      list.hidden = false;
    };

    var run = function () {
      var q = input.value.trim().toLowerCase();
      if (!q) return render([], "");
      load().then(function (data) {
        var scored = [];
        for (var i = 0; i < data.length; i++) {
          var s = score(data[i], q);
          if (s !== -1) scored.push([s, i, data[i]]);
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
    };

    input.addEventListener("input", run);
    input.addEventListener("focus", load);

    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        input.value = "";
        render([], "");
        input.blur();
      }
      if (e.key === "Enter") {
        var first = list.querySelector("a[href]");
        if (first) window.location.href = first.getAttribute("href");
      }
      if (e.key === "ArrowDown") {
        var a = list.querySelector("a[href]");
        if (a) {
          e.preventDefault();
          a.focus();
        }
      }
    });

    // Click anywhere else closes the results.
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".site-search")) render([], "");
    });

    // `/` and ⌘K / Ctrl-K focus the box, the convention every docs site shares.
    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  // -------------------------------------------------------- copy buttons

  // Every code block on this site exists to be copied — import lines, install
  // commands, JSON payloads. Selecting a 26-line payload by hand is a chore.
  document.querySelectorAll("figure.code").forEach(function (fig) {
    var code = fig.querySelector("code");
    if (!code) return;

    var button = document.createElement("button");
    button.className = "copy";
    button.type = "button";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy code to clipboard");

    button.addEventListener("click", function () {
      navigator.clipboard.writeText(code.innerText).then(
        function () {
          button.textContent = "Copied";
          button.classList.add("done");
          setTimeout(function () {
            button.textContent = "Copy";
            button.classList.remove("done");
          }, 1600);
        },
        function () {
          button.textContent = "Press ⌘C";
        },
      );
    });

    var caption = fig.querySelector("figcaption");
    if (caption) caption.appendChild(button);
    else fig.insertBefore(button, fig.firstChild);
  });

  // --------------------------------------------------- contents highlight

  var toc = document.querySelector(".toc");
  if (toc && "IntersectionObserver" in window) {
    var links = {};
    toc.querySelectorAll("a[href^='#']").forEach(function (a) {
      links[decodeURIComponent(a.getAttribute("href").slice(1))] = a;
    });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = links[entry.target.id];
          if (link && entry.isIntersecting) {
            toc.querySelectorAll("a").forEach(function (a) {
              a.removeAttribute("aria-current");
            });
            link.setAttribute("aria-current", "true");
          }
        });
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    document.querySelectorAll("main h2[id]").forEach(function (h) {
      observer.observe(h);
    });
  }
})();
