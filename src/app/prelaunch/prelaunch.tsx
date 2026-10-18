'use client';
import {useRef} from 'react';
import SignupForm from './signup-form';
import './prelaunch.css';
export default function Prelaunch(){const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 function close(){dialog.current?.close();trigger.current?.focus();}
 return <div className="prelaunch-page">
 <section className="launch-hero" aria-label="Rise of the Machine">
 <div className="launch-art" aria-hidden="true"><img src="/prelaunch/hero-wide.jpg" alt="" fetchPriority="high"/></div>
 <header className="launch-top"><a href="/" aria-label="Kalacious Entertainment home"><img className="launch-logo" src="/prelaunch/kalacious-white.png" alt="Kalacious Entertainment" width="1376" height="1809"/></a><span>A new era is loading</span></header>
 <div className="launch-content"><p className="launch-eyebrow">The future is here</p><h1 className="launch-artist">ODUMODUBLVCK</h1>
 <img className="launch-title" src="/prelaunch/rise-machine-title.png" alt="Rise of the Machine" width="1200" height="180"/>
 <p className="launch-date">DECEMBER 19/20 <span>2026 · ABUJA</span></p>
 <p className="launch-invite">Be first to know.</p><button ref={trigger} className="fan-button" onClick={()=>dialog.current?.showModal()}>Join the waitlist <span aria-hidden="true">↗</span></button>
 <a className="launch-newsletter-link" href="#newsletter">Personal mails from OD ↓</a></div>
 <div className="launch-bottom"><span>Kalacious Entertainment</span><span>Rise of the Machine</span><span>19 / 20 December</span></div>
 </section>
 <section className="fan-newsletter" id="newsletter" aria-labelledby="newsletter-title"><div className="newsletter-copy"><p className="launch-eyebrow">Straight from OD</p><h2 id="newsletter-title">Beyond<br/>the stage<span>.</span></h2><p>Subscribe to ODUMODUBLVCK’s newsletter.</p><p>Personal mails. First updates. A little closer to the Machine.</p><span className="newsletter-signature">ODUMODUBLVCK</span></div><div className="newsletter-form"><h3>Stay in the loop.</h3><SignupForm source="newsletter"/></div></section>
 <footer className="launch-footer"><span>© {new Date().getFullYear()} Kalacious Entertainment</span><a href="/privacy">Privacy</a></footer>
 <dialog className="waitlist-dialog" ref={dialog} onClick={e=>{if(e.target===e.currentTarget)close();}} onClose={()=>trigger.current?.focus()} aria-labelledby="waitlist-title"><div className="dialog-inner"><button className="fan-close" onClick={close} aria-label="Close waitlist">×</button><p className="launch-eyebrow">Get in early</p><h2 id="waitlist-title">Join the<br/>waitlist<span>.</span></h2><p className="dialog-intro">Launch news. First information. Event exclusives. Leave your details and we’ll keep you posted.</p><SignupForm source="waitlist"/></div></dialog>
 </div>;}
