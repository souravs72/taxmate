/* TaxMate /login cinematic entrance. GSAP is loaded just before this file.
   Auth stays in login.html. This file only moves paint: transform + opacity
   (and one SVG stroke-dashoffset for the gold swoosh). */
(function () {
  "use strict";

  var root = document.querySelector(".tm-login");
  if (!root) return;
  if (typeof gsap === "undefined") {
    root.querySelectorAll(".tm-reveal").forEach(function (el) { el.style.opacity = "1"; });
    root.classList.add("tm-ready");
    return;
  }

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mm = gsap.matchMedia();
  var loops = [];
  var paused = false;
  var toggle = document.getElementById("tm-motion-toggle");

  function drawLength(el) {
    if (!el || !el.getTotalLength) return 0;
    return el.getTotalLength();
  }

  function placeMotes() {
    var motes = root.querySelectorAll(".tm-mote");
    motes.forEach(function (mote, i) {
      gsap.set(mote, {
        xPercent: -50,
        yPercent: -50,
        left: 8 + ((i * 17) % 84) + "%",
        top: 6 + ((i * 29) % 78) + "%",
        opacity: 0.12 + (i % 5) * 0.06
      });
    });
  }

  function liveLoops() {
    loops.forEach(function (t) { t.kill(); });
    loops = [];
    if (paused) return;

    var bars = root.querySelectorAll(".tm-bar");
    if (bars.length) {
      loops.push(gsap.to(bars, {
        scaleY: 1.06,
        duration: 2.8,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        stagger: { each: 0.35, from: "start" }
      }));
    }

    var arrow = root.querySelector(".tm-arrow");
    if (arrow) {
      loops.push(gsap.to(arrow, {
        x: 6,
        y: -5,
        duration: 3.4,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1
      }));
    }

    var mark = root.querySelector(".tm-mark-wrap");
    if (mark) {
      loops.push(gsap.to(mark, {
        y: -8,
        duration: 5.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1
      }));
    }

    var orbit = root.querySelector(".tm-orbit");
    if (orbit) {
      loops.push(gsap.to(orbit, {
        rotation: 360,
        duration: 80,
        ease: "none",
        repeat: -1
      }));
    }

    root.querySelectorAll(".tm-mote").forEach(function (mote, i) {
      loops.push(gsap.to(mote, {
        y: "+=" + (18 + (i % 7) * 6),
        x: "+=" + ((i % 2 ? 12 : -10)),
        opacity: 0.08,
        duration: 4 + (i % 5),
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: i * 0.12
      }));
    });
  }

  function setPaused(on) {
    paused = on;
    loops.forEach(function (t) {
      if (on) t.pause();
      else t.resume();
    });
    if (!on && !loops.length) liveLoops();
    if (toggle) {
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.textContent = on ? toggle.getAttribute("data-label-play") : toggle.getAttribute("data-label-pause");
    }
  }

  function followSpot() {
    var spot = root.querySelector(".tm-spot");
    var stage = root.querySelector(".tm-stage");
    if (!spot || !stage) return;
    var xTo = gsap.quickTo(spot, "x", { duration: 0.9, ease: "power3" });
    var yTo = gsap.quickTo(spot, "y", { duration: 0.9, ease: "power3" });
    stage.addEventListener("pointermove", function (e) {
      if (paused) return;
      var r = stage.getBoundingClientRect();
      xTo(e.clientX - r.left - r.width * 0.38);
      yTo(e.clientY - r.top - r.height * 0.28);
    });
  }

  function intro() {
    var swoosh = root.querySelector(".tm-swoosh");
    var len = drawLength(swoosh);
    if (swoosh && len) {
      gsap.set(swoosh, { strokeDasharray: len, strokeDashoffset: len });
    }

    var tl = gsap.timeline({
      defaults: { ease: "power3.out", duration: 0.7 },
      onComplete: function () {
        root.classList.add("tm-ready");
        liveLoops();
      }
    });

    tl.fromTo(".tm-vignette", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, 0)
      .fromTo(".tm-grain", { autoAlpha: 0 }, { autoAlpha: 0.18, duration: 1 }, 0)
      .fromTo(".tm-spot", { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 1.2 }, 0.1)
      .fromTo(".tm-orbit", { autoAlpha: 0, scale: 0.86 }, { autoAlpha: 1, scale: 1, duration: 1.1 }, 0.15)
      .fromTo(".tm-doc-paper", { autoAlpha: 0, scale: 0.92, y: 18 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.7 }, 0.22)
      .fromTo(".tm-doc-red", { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.55 }, 0.38)
      .fromTo(".tm-doc-green", { autoAlpha: 0, x: 16 }, { autoAlpha: 1, x: 0, duration: 0.55 }, 0.42)
      .fromTo(".tm-fold", { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, 0.5)
      .fromTo(".tm-line", { autoAlpha: 0, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, stagger: 0.08, duration: 0.4, transformOrigin: "0% 50%" }, 0.55)
      .fromTo(".tm-bar", { autoAlpha: 0, scaleY: 0 }, { autoAlpha: 1, scaleY: 1, stagger: 0.1, duration: 0.55, ease: "expo.out" }, 0.62);

    if (swoosh && len) {
      tl.to(swoosh, { strokeDashoffset: 0, duration: 1.05, ease: "power2.inOut" }, 0.7);
    }
    tl.fromTo(".tm-arrow", { autoAlpha: 0, x: -24, y: 18, rotation: -18 }, { autoAlpha: 1, x: 0, y: 0, rotation: 0, duration: 0.55, ease: "back.out(1.4)" }, 1.15)
      .fromTo(".tm-wordmark", { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 1.05)
      .fromTo(".tm-seal", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 1.25)
      .fromTo(".tm-hero-title", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 1.32)
      .fromTo(".tm-hero-sub", { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.55 }, 1.42)
      .fromTo(".tm-plaque, .tm-credits li, .tm-trust", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.45 }, 1.5)
      .fromTo(".tm-form-side", { autoAlpha: 0, x: 28 }, { autoAlpha: 1, x: 0, duration: 0.8, ease: "power3.out" }, 0.9)
      .fromTo(".tm-invite > *", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, stagger: 0.05, duration: 0.45 }, 1.35);
  }

  mm.add(
    {
      reduce: "(prefers-reduced-motion: reduce)",
      motion: "(prefers-reduced-motion: no-preference)"
    },
    function (context) {
      var conditions = context.conditions;
      if (conditions.reduce) {
        gsap.set(".tm-reveal", { autoAlpha: 1, clearProps: "transform" });
        if (toggle) toggle.hidden = true;
        return;
      }
      placeMotes();
      gsap.set(".tm-form-side", { autoAlpha: 0 });
      intro();
      followSpot();
      if (toggle) {
        toggle.hidden = false;
        toggle.addEventListener("click", function () { setPaused(!paused); });
      }
      return function () {
        loops.forEach(function (t) { t.kill(); });
        loops = [];
      };
    }
  );

  reduce.addEventListener("change", function () {
    mm.revert();
  });
})();
