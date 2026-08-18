function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function worldPoint(lngLat, zoom) {
  const [lng, latRaw] = lngLat;
  const lat = clamp(Number(latRaw) || 0, -85.05112878, 85.05112878);
  const scale = 256 * Math.pow(2, zoom);
  const x = ((Number(lng) + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function installFastMapRuntime() {
  if (typeof window === 'undefined') return;
  if (window.maplibregl?.__jarvisFastRuntime) return;

  class FastMap {
    constructor(options = {}) {
      this.container = typeof options.container === 'string' ? document.getElementById(options.container) : options.container;
      if (!this.container) throw new Error('Map container unavailable');
      this.center = Array.isArray(options.center) ? options.center : [0, 0];
      this.zoom = Number.isFinite(options.zoom) ? options.zoom : 10;
      this.bearing = Number(options.bearing || 0);
      this.handlers = {};
      this.markers = new Set();
      this.loaded = false;
      this.removed = false;
      this.renderToken = 0;

      this.container.innerHTML = '';
      this.root = document.createElement('div');
      this.root.className = 'maplibregl-map j4-fast-map-runtime';
      Object.assign(this.root.style, { position: 'absolute', inset: '0', overflow: 'hidden', background: '#020713', userSelect: 'none' });

      this.tileLayer = document.createElement('div');
      Object.assign(this.tileLayer.style, { position: 'absolute', inset: '0', overflow: 'hidden', background: '#020713' });
      this.root.appendChild(this.tileLayer);

      this.markerLayer = document.createElement('div');
      Object.assign(this.markerLayer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3' });
      this.root.appendChild(this.markerLayer);

      this.credit = document.createElement('div');
      this.credit.textContent = '© OpenStreetMap contributors';
      Object.assign(this.credit.style, { position: 'absolute', right: '5px', bottom: '5px', zIndex: '4', padding: '2px 4px', background: 'rgba(0,8,18,.66)', color: '#7ab6d4', font: '7px ui-monospace,monospace', opacity: '.78' });
      this.root.appendChild(this.credit);
      this.container.appendChild(this.root);

      this._render();
      this.loadTimer = setTimeout(() => this._markLoaded(), 1200);
    }

    on(name, callback) {
      (this.handlers[name] ||= []).push(callback);
      if (name === 'load' && this.loaded) setTimeout(() => callback(), 0);
      if (name === 'styledata' && this.loaded) setTimeout(() => callback(), 0);
      return this;
    }
    _emit(name) { for (const fn of this.handlers[name] || []) { try { fn(); } catch {} } }
    _markLoaded() {
      if (this.loaded || this.removed) return;
      this.loaded = true;
      clearTimeout(this.loadTimer);
      this._emit('load');
      this._emit('styledata');
    }
    getStyle() { return { layers: [] }; }
    setPaintProperty() { return this; }
    isStyleLoaded() { return true; }
    addControl() { return this; }
    getZoom() { return this.zoom; }
    getBearing() { return this.bearing; }

    flyTo(options = {}) {
      if (Array.isArray(options.center)) this.center = options.center;
      if (Number.isFinite(options.zoom)) this.zoom = options.zoom;
      if (Number.isFinite(options.bearing)) this.bearing = options.bearing;
      this._render();
      return this;
    }
    zoomIn() { this.zoom = clamp(this.zoom + 1, 2, 18); this._render(); return this; }
    zoomOut() { this.zoom = clamp(this.zoom - 1, 2, 18); this._render(); return this; }
    rotateTo(value) { this.bearing = Number(value || 0); this._render(); return this; }
    resize() { this._render(); return this; }

    _render() {
      if (this.removed || !this.tileLayer) return;
      const token = ++this.renderToken;
      const width = Math.max(320, this.container.clientWidth || 620);
      const height = Math.max(220, this.container.clientHeight || 360);
      const z = clamp(Math.round(this.zoom), 2, 18);
      const n = Math.pow(2, z);
      const point = worldPoint(this.center, z);
      const leftWorld = point.x - width / 2;
      const topWorld = point.y - height / 2;
      const startX = Math.floor(leftWorld / 256) - 1;
      const endX = Math.floor((leftWorld + width) / 256) + 1;
      const startY = Math.max(0, Math.floor(topWorld / 256) - 1);
      const endY = Math.min(n - 1, Math.floor((topWorld + height) / 256) + 1);

      const frag = document.createDocumentFragment();
      let settled = false;
      const firstSettled = () => {
        if (settled || token !== this.renderToken) return;
        settled = true;
        this._markLoaded();
      };

      for (let ty = startY; ty <= endY; ty++) {
        for (let txRaw = startX; txRaw <= endX; txRaw++) {
          const tx = ((txRaw % n) + n) % n;
          const img = document.createElement('img');
          img.alt = '';
          img.draggable = false;
          img.decoding = 'async';
          img.referrerPolicy = 'no-referrer';
          img.src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
          const px = txRaw * 256 - leftWorld;
          const py = ty * 256 - topWorld;
          Object.assign(img.style, {
            position: 'absolute', left: `${Math.round(px)}px`, top: `${Math.round(py)}px`, width: '257px', height: '257px',
            maxWidth: 'none', pointerEvents: 'none', opacity: '0', transition: 'opacity 120ms linear',
            filter: 'brightness(.52) saturate(.72) hue-rotate(148deg) contrast(1.38)'
          });
          img.onload = () => { if (token !== this.renderToken) return; img.style.opacity = '1'; firstSettled(); };
          img.onerror = () => { if (token !== this.renderToken) return; img.remove(); };
          frag.appendChild(img);
        }
      }
      this.tileLayer.replaceChildren(frag);
      this._renderMarkers();
      setTimeout(firstSettled, 1400);
    }

    _renderMarkers() {
      if (!this.markerLayer) return;
      const width = Math.max(320, this.container.clientWidth || 620);
      const height = Math.max(220, this.container.clientHeight || 360);
      const z = clamp(Math.round(this.zoom), 2, 18);
      const centerPx = worldPoint(this.center, z);
      for (const marker of this.markers) {
        const p = worldPoint(marker.lngLat || this.center, z);
        const left = width / 2 + (p.x - centerPx.x);
        const top = height / 2 + (p.y - centerPx.y);
        marker.el.style.left = `${Math.round(left)}px`;
        marker.el.style.top = `${Math.round(top)}px`;
      }
    }

    remove() {
      this.removed = true;
      clearTimeout(this.loadTimer);
      this.root?.remove();
      this.handlers = {};
      this.markers.clear();
    }
  }

  class FastMarker {
    constructor(options = {}) {
      this.color = options.color || '#55d8ff';
      this.scale = Number(options.scale || 1);
      this.lngLat = [0, 0];
      this.map = null;
      this.el = document.createElement('div');
      Object.assign(this.el.style, {
        position: 'absolute', width: `${14 * this.scale}px`, height: `${14 * this.scale}px`, borderRadius: '50%',
        transform: 'translate(-50%,-50%)', background: this.color, border: '2px solid rgba(225,249,255,.95)',
        boxShadow: `0 0 5px ${this.color},0 0 18px ${this.color}`, zIndex: '5'
      });
    }
    setLngLat(value) { if (Array.isArray(value)) this.lngLat = value; this.map?._renderMarkers(); return this; }
    addTo(map) {
      this.map = map;
      map.markers.add(this);
      map.markerLayer.appendChild(this.el);
      map._renderMarkers();
      return this;
    }
    remove() { if (this.map) this.map.markers.delete(this); this.el.remove(); this.map = null; }
  }

  class NavigationControl { constructor() {} }
  window.maplibregl = { Map: FastMap, Marker: FastMarker, NavigationControl, __jarvisFastRuntime: true };
}

export default function FastMapRuntime() {
  if (typeof window !== 'undefined') installFastMapRuntime();
  return null;
}
