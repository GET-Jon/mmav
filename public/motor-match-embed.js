class MotorMatchEmbed extends HTMLElement {
  constructor() {
    super();
    this._onMessage = this._onMessage.bind(this);
  }

  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;

    this.style.display = "block";
    this.style.width = "100%";
    this.style.minWidth = "0";
    this.style.height = "620px";
    this.style.transition = "height 180ms ease";

    const iframe = document.createElement("iframe");
    iframe.src = "https://yourlotlogic.com/motor_match?embed=1";
    iframe.title = "Mindful Motor Match";
    iframe.loading = "eager";
    iframe.scrolling = "no";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allowtransparency", "true");
    iframe.style.display = "block";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.style.overflow = "hidden";

    this._iframe = iframe;
    this.appendChild(iframe);
    window.addEventListener("message", this._onMessage);
  }

  disconnectedCallback() {
    window.removeEventListener("message", this._onMessage);
  }

  _onMessage(event) {
    if (event.origin !== "https://yourlotlogic.com") return;
    if (event.source !== this._iframe?.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== "motor-match:resize") return;

    const requested = Number(data.height);
    if (!Number.isFinite(requested)) return;

    const next = Math.max(420, Math.min(2400, Math.ceil(requested + 4)));
    this.style.height = `${next}px`;
  }
}

if (!customElements.get("motor-match-embed")) {
  customElements.define("motor-match-embed", MotorMatchEmbed);
}
