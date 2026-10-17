class MotorMatchEmbed extends HTMLElement {
  constructor() {
    super();
    this._onMessage = this._onMessage.bind(this);
    this._fitWidth = this._fitWidth.bind(this);
  }

  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;

    this.style.display = "block";
    this.style.minWidth = "0";
    this.style.height = "620px";
    this.style.transition = "height 180ms ease,width 180ms ease,transform 180ms ease";
    this.style.position = "relative";
    this.style.zIndex = "1";

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
    window.addEventListener("resize", this._fitWidth);
    this._fitWidth();
    this._fitTimers = [80, 300, 900].map(ms => window.setTimeout(this._fitWidth, ms));
  }

  disconnectedCallback() {
    window.removeEventListener("message", this._onMessage);
    window.removeEventListener("resize", this._fitWidth);
    (this._fitTimers || []).forEach(clearTimeout);
  }

  _fitWidth() {
    const viewport = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (!viewport) return;

    if (viewport < 760) {
      this.style.width = "100%";
      this.style.maxWidth = "100%";
      this.style.transform = "none";
      return;
    }

    const targetWidth = Math.min(1440, Math.max(980, viewport - 64));
    const rect = this.getBoundingClientRect();
    const currentCenter = rect.left + rect.width / 2;
    const viewportCenter = viewport / 2;
    const shift = viewportCenter - currentCenter;

    this.style.width = targetWidth + "px";
    this.style.maxWidth = "none";
    this.style.transform = "translateX(" + Math.round(shift) + "px)";
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
