"use client";

import { useEffect } from "react";

export function MarketingMotion() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("main > section"),
    );

    const revealTargets: HTMLElement[] = [];

    sections.forEach((section, sectionIndex) => {
      const inner = Array.from(section.children).find((child) => {
        const element = child as HTMLElement;
        return !element.classList.contains("absolute");
      }) as HTMLElement | undefined;

      if (inner && sectionIndex > 0) {
        inner.dataset.motionReveal = "true";
        inner.style.opacity = "0";
        inner.style.transform = "translate3d(0, 46px, 0)";
        inner.style.transition =
          "opacity 760ms cubic-bezier(0.22,1,0.36,1), transform 980ms cubic-bezier(0.22,1,0.36,1)";
        inner.style.willChange = "opacity, transform";
        revealTargets.push(inner);
      }
    });

    const cardTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main article, main [class*='rounded-[26px]'], main [class*='rounded-[28px]'], main [class*='rounded-[30px]']",
      ),
    );

    cardTargets.forEach((card) => {
      card.dataset.motionCard = "true";
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target as HTMLElement;
          target.style.opacity = "1";
          target.style.transform = "translate3d(0, 0, 0)";
          observer.unobserve(target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -10% 0px" },
    );

    revealTargets.forEach((target) => observer.observe(target));

    const hero = document.querySelector<HTMLElement>("main > section:first-of-type");
    const heroBackground = hero?.children[0] as HTMLElement | undefined;
    const heroContent = hero?.children[1] as HTMLElement | undefined;
    const heroCopy = heroContent?.children[0] as HTMLElement | undefined;
    const heroVisual = heroContent?.children[1] as HTMLElement | undefined;

    const depthPanels = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main > section:nth-of-type(n+3) [class*='shadow-[0_20px_55px'], main > section:nth-of-type(n+3) [class*='shadow-[0_18px_50px']",
      ),
    );

    let frame = 0;

    const updateParallax = () => {
      frame = 0;
      const scrollY = Math.min(window.scrollY, 1100);

      if (heroBackground) {
        heroBackground.style.transform = `translate3d(0, ${scrollY * 0.2}px, 0) scale(1.09)`;
      }

      if (heroCopy) {
        heroCopy.style.transform = `translate3d(0, ${scrollY * 0.025}px, 0)`;
      }

      if (heroVisual) {
        heroVisual.style.transform = `translate3d(0, ${scrollY * -0.09}px, 0) rotate(${Math.min(scrollY * 0.0012, 0.7)}deg)`;
      }

      const viewportMid = window.innerHeight / 2;
      depthPanels.forEach((panel, index) => {
        const rect = panel.getBoundingClientRect();
        const panelMid = rect.top + rect.height / 2;
        const distance = panelMid - viewportMid;
        const offset = Math.max(-18, Math.min(18, distance * -0.035));
        panel.style.transform = `translate3d(0, ${offset}px, 0) rotate(${index % 2 === 0 ? -0.18 : 0.18}deg)`;
      });
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateParallax);
    };

    [heroBackground, heroCopy, heroVisual, ...depthPanels].forEach((element) => {
      if (!element) return;
      element.style.willChange = "transform";
    });

    if (heroBackground) heroBackground.style.transition = "transform 70ms linear";
    if (heroCopy) heroCopy.style.transition = "transform 90ms linear";
    if (heroVisual) heroVisual.style.transition = "transform 95ms linear";
    depthPanels.forEach((panel) => {
      panel.style.transition = "transform 120ms linear";
    });

    updateParallax();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);

      revealTargets.forEach((target) => {
        target.style.opacity = "";
        target.style.transform = "";
        target.style.transition = "";
        target.style.willChange = "";
        delete target.dataset.motionReveal;
      });

      cardTargets.forEach((card) => delete card.dataset.motionCard);

      [heroBackground, heroCopy, heroVisual, ...depthPanels].forEach((element) => {
        if (!element) return;
        element.style.transform = "";
        element.style.transition = "";
        element.style.willChange = "";
      });
    };
  }, []);

  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        html { scroll-behavior: smooth; }

        [data-motion-card="true"] {
          transition: transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms ease, border-color 320ms ease;
        }

        [data-motion-card="true"]:hover {
          transform: translate3d(0, -8px, 0) scale(1.012);
        }

        main a svg {
          transition: transform 240ms cubic-bezier(0.22,1,0.36,1);
        }

        main a:hover svg {
          transform: translateX(5px);
        }

        main > section:first-of-type [class*="blur-2xl"] {
          animation: lot-logic-breathe 5.2s ease-in-out infinite alternate;
        }

        #recon svg,
        main [class*="text-violet-700"] svg {
          animation: lot-logic-spark 3.4s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes lot-logic-breathe {
          from { opacity: .55; transform: scale(.94) translate3d(-6px, 3px, 0); }
          to { opacity: 1; transform: scale(1.08) translate3d(8px, -4px, 0); }
        }

        @keyframes lot-logic-spark {
          0%, 66%, 100% { transform: rotate(0deg) scale(1); }
          76% { transform: rotate(10deg) scale(1.16); }
          86% { transform: rotate(-7deg) scale(1.07); }
        }
      }
    `}</style>
  );
}
