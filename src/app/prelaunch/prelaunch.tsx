"use client";
import { useEffect, useRef } from "react";
import SignupForm from "./signup-form";
import "./prelaunch.css";
export default function Prelaunch() {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const hero = useRef<HTMLElement>(null);
  const portrait = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = hero.current, art = portrait.current;
    if (!section || !art) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let visible = true, frame = 0, x = 0, y = 0, targetX = 0, targetY = 0;
    function reset() {
      cancelAnimationFrame(frame); frame = 0; x = y = targetX = targetY = 0;
      art!.style.setProperty("--head-x", "0px");
      art!.style.setProperty("--head-y", "0px");
      art!.style.setProperty("--head-tilt", "0deg");
    }
    function updateMotion() {
      section!.dataset.motion = reduced.matches ? "still" : visible && !document.hidden ? "running" : "paused";
      if (reduced.matches || !visible || document.hidden || !fine.matches) reset();
    }
    function tick() {
      x += (targetX - x) * 0.085; y += (targetY - y) * 0.085;
      art!.style.setProperty("--head-x", `${x.toFixed(2)}px`);
      art!.style.setProperty("--head-y", `${y.toFixed(2)}px`);
      art!.style.setProperty("--head-tilt", `${(x * 0.055).toFixed(3)}deg`);
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.03 ? requestAnimationFrame(tick) : 0;
    }
    function move(event: PointerEvent) {
      if (!fine.matches || reduced.matches || !visible || document.hidden || dialog.current?.open) return;
      const box = section!.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1)) * 8;
      targetY = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1)) * 5;
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function leave() { targetX = targetY = 0; if (!frame && !reduced.matches) frame = requestAnimationFrame(tick); }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateMotion(); });
    observer.observe(section); updateMotion();
    section.addEventListener("pointermove", move, { passive: true });
    section.addEventListener("pointerleave", leave);
    reduced.addEventListener("change", updateMotion); fine.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);
    return () => {
      observer.disconnect(); reset(); section.removeEventListener("pointermove", move);
      section.removeEventListener("pointerleave", leave); reduced.removeEventListener("change", updateMotion);
      fine.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", updateMotion);
    };
  }, []);
  function close() {
    dialog.current?.close();
    trigger.current?.focus();
  }
  return (
    <div className="prelaunch-page">
      <section ref={hero} className="launch-hero" data-motion="paused" aria-label="Rise of the Machine">
        <div className="launch-art" aria-hidden="true" />
        <div className="launch-embers" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
        </div>
        <header className="launch-top">
          <a href="/" aria-label="Kalacious Entertainment home">
            <img
              className="launch-logo"
              src="/prelaunch/kalacious-white.png"
              alt="Kalacious Entertainment"
              width="1376"
              height="1809"
            />
          </a>
        </header>
        <div className="launch-content">
          <div className="launch-art-stage">
            <h1 className="launch-artist">ODUMODUBLVCK</h1>
            <div ref={portrait} className="launch-head-parallax" aria-hidden="true">
              <div className="launch-head-float">
                <div className="launch-head-crop">
                  <img className="launch-head-image" src="/prelaunch/odumo-head.png" alt="" width="772" height="992" fetchPriority="high" draggable={false} />
                  <div className="launch-head-energy" />
                  <span className="launch-eye-glow" />
                </div>
              </div>
            </div>
          </div>
          <img
            className="launch-title"
            src="/prelaunch/rise-machine-title.png"
            alt="Rise of the Machine"
            width="1200"
            height="180"
          />
          <p className="launch-date">
            DEC 19 & 20 <span>2026 · ABUJA</span>
          </p>
          <p className="launch-invite">Be first to know.</p>
          <button
            ref={trigger}
            className="fan-button"
            onClick={() => dialog.current?.showModal()}
          >
            Join the waitlist <span aria-hidden="true">↗</span>
          </button>
          {/* <a className="launch-newsletter-link" href="#newsletter">
            Personal mails from OD ↓
          </a> */}
        </div>
      </section>
      <section
        className="fan-newsletter"
        id="newsletter"
        aria-labelledby="newsletter-title"
      >
        <div className="newsletter-copy">
          <p className="launch-eyebrow">Straight from OD</p>
          <h2 id="newsletter-title">
            JOIN MY FAN
            <br />
            COMMUNITY<span>.</span>
          </h2>
          <p>Subscribe to ODUMODUBLVCK’s newsletter.</p>
          <p>Personal mails. First updates. A little closer to the Machine.</p>
        </div>
        <div className="newsletter-form">
          <h3>Stay in the loop.</h3>
          <SignupForm source="newsletter" />
        </div>
      </section>
      <footer className="launch-footer">
        <span>© {new Date().getFullYear()} Kalacious Entertainment</span>
        <a href="/privacy">Privacy</a>
      </footer>
      <dialog
        className="waitlist-dialog"
        ref={dialog}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onClose={() => trigger.current?.focus()}
        aria-labelledby="waitlist-title"
      >
        <div className="dialog-inner">
          <button
            className="fan-close"
            onClick={close}
            aria-label="Close waitlist"
          >
            ×
          </button>
          <p className="launch-eyebrow">Get in early</p>
          <h2 id="waitlist-title">
            Join the
            <br />
            waitlist<span>.</span>
          </h2>
          <p className="dialog-intro">
            Launch news. First information. Event exclusives. Leave your details
            and we’ll keep you posted.
          </p>
          <SignupForm source="waitlist" />
        </div>
      </dialog>
    </div>
  );
}
