"use client";

import { useEffect } from "react";

const TIME_INPUT_SELECTOR = 'input[type="time"], input[type="datetime-local"]';
const QUARTER_HOURS = ["00", "15", "30", "45"] as const;
const ENHANCED_ATTR = "data-quarter-hour-enhanced";

function nativeSetValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function parseInputValue(input: HTMLInputElement) {
  const raw = input.value || "";
  const isDateTime = input.type === "datetime-local";
  const [datePart, timePart = ""] = isDateTime ? raw.split("T") : ["", raw];
  const [hour24Text = "", minuteText = ""] = timePart.split(":");
  const hour24 = Number(hour24Text);
  const validHour = Number.isFinite(hour24) && hour24 >= 0 && hour24 <= 23;
  const hour12 = validHour ? ((hour24 + 11) % 12) + 1 : 12;
  const period = validHour && hour24 >= 12 ? "PM" : "AM";
  const minuteNumber = Number(minuteText);
  const roundedMinute = Number.isFinite(minuteNumber)
    ? QUARTER_HOURS.reduce((best, candidate) =>
        Math.abs(Number(candidate) - minuteNumber) < Math.abs(Number(best) - minuteNumber)
          ? candidate
          : best,
      )
    : "00";

  return {
    datePart,
    hour12: String(hour12).padStart(2, "0"),
    minute: roundedMinute,
    period,
  };
}

function option(value: string, label = value) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function enhanceInput(input: HTMLInputElement) {
  if (input.dataset.timeStepOptOut === "true" || input.hasAttribute(ENHANCED_ATTR)) return;

  input.setAttribute(ENHANCED_ATTR, "true");
  input.step = "900";

  const wrapper = document.createElement("div");
  wrapper.dataset.quarterHourControl = "true";
  wrapper.className = "flex min-w-0 flex-1 flex-wrap items-center gap-2";

  const parsed = parseInputValue(input);
  const isDateTime = input.type === "datetime-local";

  const date = document.createElement("input");
  if (isDateTime) {
    date.type = "date";
    date.value = parsed.datePart;
    date.disabled = input.disabled;
    date.className = "min-w-[150px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
    wrapper.appendChild(date);
  }

  const hour = document.createElement("select");
  hour.className = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  hour.disabled = input.disabled;
  for (let value = 1; value <= 12; value += 1) {
    const text = String(value).padStart(2, "0");
    hour.appendChild(option(text));
  }
  hour.value = parsed.hour12;
  wrapper.appendChild(hour);

  const minute = document.createElement("select");
  minute.className = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  minute.disabled = input.disabled;
  for (const value of QUARTER_HOURS) minute.appendChild(option(value));
  minute.value = parsed.minute;
  wrapper.appendChild(minute);

  const period = document.createElement("select");
  period.className = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  period.disabled = input.disabled;
  period.appendChild(option("AM"));
  period.appendChild(option("PM"));
  period.value = parsed.period;
  wrapper.appendChild(period);

  function commit() {
    const hour12 = Number(hour.value);
    let hour24 = hour12 % 12;
    if (period.value === "PM") hour24 += 12;
    const time = `${String(hour24).padStart(2, "0")}:${minute.value}`;
    if (isDateTime) {
      if (!date.value) return;
      nativeSetValue(input, `${date.value}T${time}`);
    } else {
      nativeSetValue(input, time);
    }
  }

  date.addEventListener("change", commit);
  hour.addEventListener("change", commit);
  minute.addEventListener("change", commit);
  period.addEventListener("change", commit);

  input.style.display = "none";
  input.insertAdjacentElement("afterend", wrapper);
}

function enhanceAll(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>(TIME_INPUT_SELECTOR).forEach(enhanceInput);
}

export function GlobalFifteenMinuteTimeInputs() {
  useEffect(() => {
    enhanceAll(document);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node instanceof HTMLInputElement && node.matches(TIME_INPUT_SELECTOR)) enhanceInput(node);
          enhanceAll(node);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const syncTimer = window.setInterval(() => {
      document.querySelectorAll<HTMLInputElement>(`${TIME_INPUT_SELECTOR}[${ENHANCED_ATTR}]`).forEach((input) => {
        const wrapper = input.nextElementSibling;
        if (!(wrapper instanceof HTMLDivElement) || wrapper.dataset.quarterHourControl !== "true") {
          input.removeAttribute(ENHANCED_ATTR);
          input.style.display = "";
          enhanceInput(input);
          return;
        }

        const controls = Array.from(wrapper.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"));
        controls.forEach((control) => { control.disabled = input.disabled; });
      });
    }, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(syncTimer);
    };
  }, []);

  return null;
}
