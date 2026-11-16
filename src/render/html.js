// Tagged-template HTML builder. Every interpolated value is HTML-escaped
// unless it is the result of html`` / raw(), so database content (product
// names, descriptions, testimonials…) can never inject markup.
import { esc } from "../lib/util.js";

export class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s));

function render(v) {
  if (v === null || v === undefined || v === false || v === true) return "";
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

// JSON for <script type="application/ld+json">: escape "<" so "</script>" in
// data can't terminate the element.
export const jsonLd = (obj) =>
  raw('<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>");

// Escaped attribute containing JSON (for data-* attributes read by scripts).
export const dataJson = (obj) => esc(JSON.stringify(obj));
