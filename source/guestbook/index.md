---
title: 留言板
date: 2026-05-16 18:39:59
---

<style>
    .guestbook-neon-stage {
        display: grid;
        min-height: clamp(220px, 36vh, 360px);
        padding: clamp(1.5rem, 5vw, 3rem) 0;
        place-items: center;
        overflow: visible;
    }

    .cyber-old-school {
        display: inline-block;
        max-width: 100%;
        font-size: clamp(3rem, 14vw, 8rem);
        font-weight: 900;
        font-family: "SimHei", "STHeiti", sans-serif;
        line-height: 1.1;
        text-transform: uppercase;
        letter-spacing: clamp(0.2rem, 1.2vw, 0.9rem);
        text-align: center;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        background: linear-gradient(
            to right,
            #ff0000, #ff7f00, #ffff00, #00ff00, #00ffff, #0000ff, #8b00ff, #ff0000
        );
        background-size: 200% auto;
        background-clip: text;
        -webkit-background-clip: text;
        color: transparent;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 10px #ff00ff) drop-shadow(0 0 20px #00ffff);
        transform-origin: center;
        will-change: background-position, transform;
        animation:
            guestbook-stream 2s linear infinite,
            guestbook-pulse-shake 0.55s ease-in-out infinite alternate;
    }

    @keyframes guestbook-stream {
        0% { background-position: 0% center; }
        100% { background-position: 200% center; }
    }

    @keyframes guestbook-pulse-shake {
        0% { transform: translate3d(0, 0, 0) scale(0.95) rotate(-1deg); }
        25% { transform: translate3d(-2px, 2px, 0) scale(1.02) rotate(0.5deg); }
        50% { transform: translate3d(2px, -2px, 0) scale(1.07) rotate(-0.5deg); }
        75% { transform: translate3d(1px, 1px, 0) scale(1.02) rotate(0.6deg); }
        100% { transform: translate3d(0, 0, 0) scale(1.1) rotate(0deg); }
    }

    @media (prefers-reduced-motion: reduce) {
        .cyber-old-school {
            animation: none;
        }
    }
</style>

<div class="guestbook-neon-stage">
    <div class="cyber-old-school">留言板</div>
</div>

<p style="text-align: center; font-size: 10px;">这很酷。不是吗？</p>