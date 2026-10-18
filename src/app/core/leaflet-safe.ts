import * as L from 'leaflet';

/**
 * Leaflet sets a string tooltip or popup with innerHTML. Shop, street, zone and station names are user-entered, so every
 * string given to bindTooltip / bindPopup is wrapped in a text node instead. Imported once from main.ts.
 */
function asText(content: unknown): unknown {
  if (typeof content !== 'string') return content;
  const el = document.createElement('div');
  el.textContent = content;
  return el;
}
const proto = L.Layer.prototype as any;
const origTooltip = proto.bindTooltip, origPopup = proto.bindPopup;
proto.bindTooltip = function (content: unknown, options?: L.TooltipOptions) { return origTooltip.call(this, asText(content), options); };
proto.bindPopup = function (content: unknown, options?: L.PopupOptions) { return origPopup.call(this, asText(content), options); };
