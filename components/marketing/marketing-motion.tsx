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
        inner.style.transform = "translate3d(0, 22px, 0)";
        inner.style.transition =
          "opacity 700ms cubic-bezier(0.22,1,0.36,1), transform 850ms cubic-bezier(0.22,1,0.36,1)";
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
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    revealTargets.forEach((target) => observer.observe(target));

    const hero = document.querySelector<HTMLElement>("main > section:first-of-type");
    const heroBackground = hero?.children[0] as HTMLElement | undefined;
    const heroContent = hero?.children[1] as HTMLElement | undefined;
    const heroVisual = heroContent?.children[1] as HTMLElement | undefined;

    let frame = 0;

    const updateParallax = () => {
      frame = 0;
      const scrollY = Math.min(window.scrollY, 900);

      if (heroBackground) {
        heroBackground.style.transform = `translate3d(0, ${scrollY * 0.11}px, 0) scale(1.04)`;
      }

      if (heroVisual) {
        heroVisual.style.transform = `translate3d(0, ${scrollY * -0.035}px, 0)`;
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateParallax);
    };

    if (heroBackground) {
      heroBackground.style.willChange = "transform";
      heroBackground.style.transition = "transform 80ms linear";
    }

    if (heroVisual) {
      heroVisual.style.willChange = "transform";
      heroVisual.style.transition = "transform 120ms linear";
    }

    updateParallax();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);

      revealTargets.forEach((target) => {
        target.style.opacity = "";
        target.style.transform = "";
        target.style.transition = "";
        target.style.willChange = "";
        delete target.dataset.motionReveal;
      });

      cardTargets.forEach((card) => delete card.dataset.motionCard);

      if (heroBackground) {
        heroBackground.style.transform = "";
        heroBackground.style.transition = "";
        heroBackground.style.willChange = "";
      }

      if (heroVisual) {
        heroVisual.style.transform = "";
        heroVisual.style.transition = "";
        heroVisual.style.willChange = "";
      }
    };
  }, []);

  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        [data-motion-card="true"] {
          transition: transform 280ms cubic-bezier(0.22,1,0.36,1), box-shadow 280ms ease, border-color 280ms ease;
        }

        [data-motion-card="true"]:hover {
          transform: translate3d(0, -4px, 0);
        }

        main a svg {
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
        }

        main a:hover svg {
          transform: translateX(3px);
        }

        main > section:first-of-type [class*="blur-2xl"] {
          animation: lot-logic-breathe 7s ease-in-out infinite alternate;
        }

        #recon svg,
        main [class*="text-violet-700"] svg {
          animation: lot-logic-spark 4.5s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes lot-logic-breathe {
          from { opacity: .68; transform: scale(.98); }
          to { opacity: 1; transform: scale(1.035); }
        }

        @keyframes lot-logic-spark {
          0%, 72%, 100% { transform: rotate(0deg) scale(1); }
          80% { transform: rotate(7deg) scale(1.08); }
          88% { transform: rotate(-4deg) scale(1.03); }
        }
      }
    `}</style>
  );
}
