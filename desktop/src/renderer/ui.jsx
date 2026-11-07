/* The desktop's primitives: a button with its key, a speaker, a ring, a row.
   One of each, as native/src/ui.js is one of each on the phone (§30cb). */

import React from "react";
import { say, hasRealAudio } from "./audio.js";
import { familiarityLabel } from "@core/scheduler";

export function Kbd({ children }) { return <span className="kbd">{children}</span>; }

export function Btn({ label, onClick, kind = "plain", kbd, disabled, block, title, children, testID, style }) {
  return (
    <button type="button" className={`btn ${kind}${block ? " block" : ""}`} onClick={onClick} disabled={disabled}
            title={title} data-testid={testID} style={style}>
      {children || label}
      {kbd ? <Kbd>{kbd}</Kbd> : null}
    </button>
  );
}

const SPEAKER_PATH = "M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zm-2.5-8.8v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z";
export function Icon({ d, size = 20, stroke, fill = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={stroke ? "none" : fill} stroke={stroke ? "currentColor" : "none"}
         strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

/* A speaker: a bought clip plays; without one the system voice reads, and
   the title says so (§27). `recordedOnly` draws nothing without a clip. */
export function Speaker({ text, size = 36, recordedOnly, device, label }) {
  const real = hasRealAudio(text);
  if (recordedOnly && !real && !device) return null;
  const dev = device || !real;
  return (
    <button type="button" className="iconbtn" style={{ width: size, height: size }}
            title={label || (dev ? "Hear it (device voice)" : "Hear it")} aria-label={dev ? "Hear it (device voice)" : "Hear it"}
            onClick={(e) => { e.stopPropagation(); say(text, { device: !!device }); }}>
      <Icon d={SPEAKER_PATH} size={Math.round(size * 0.55)} />
    </button>
  );
}

export function IconButton({ d, onClick, title, on, size = 36, disabled, children }) {
  return (
    <button type="button" className={"iconbtn" + (on ? " on" : "")} style={{ width: size, height: size }} title={title}
            aria-label={title} onClick={onClick} disabled={disabled}>
      {children || <Icon d={d} size={Math.round(size * 0.55)} stroke />}
    </button>
  );
}

export const ICONS = {
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.9-1.1L14.6 3H9.4L9 5.8a7 7 0 0 0-1.9 1.1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.9 1.1l.4 2.8h5.2l.4-2.8a7 7 0 0 0 1.9-1.1l2.4 1 2-3.4-2-1.6c.1-.4.1-.7.1-1.1z",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.4 1 2.5h6c0-1.1.3-1.9 1-2.5A6 6 0 0 0 12 3z",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  play: "M8 5v14l11-7z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l5 5L20 7",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
};

/* The familiarity ring (0–100) in the scheduler's colours, with the score in
   the middle; `null` draws a bare track and nothing in it. */
export function Ring({ score, size = 40, stroke = 4, title }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const s = score === null || score === undefined ? null : Math.max(0, Math.min(100, score));
  const color = s === null ? "var(--line)" : s < 40 ? "var(--bad)" : s < 70 ? "var(--warn)" : "var(--good)";
  return (
    <span className="ring" style={{ width: size, height: size }} title={title || (s === null ? "Not studied yet" : `${familiarityLabel(s)}, ${s} of 100`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface3)" strokeWidth={stroke} />
        {s !== null ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                  strokeDasharray={`${(s / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        ) : null}
      </svg>
      {s !== null ? <span>{s}</span> : null}
    </span>
  );
}

export function Row({ children, onClick, testID, className = "" }) {
  return (
    <div className={`row ${onClick ? "press " : ""}${className}`} onClick={onClick} data-testid={testID}
         role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
         onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}>
      {children}
    </div>
  );
}
export const List = ({ children }) => <div className="list">{children}</div>;
export const Pill = ({ children, tone = "" }) => <span className={`pill ${tone}`}>{children}</span>;
export const Muted = ({ children, style }) => <div className="muted" style={style}>{children}</div>;

export function Switch({ checked, onChange, label }) {
  return <input type="checkbox" className="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />;
}

export function Seg({ value, options, onChange }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} type="button" className={o.id === value ? "on" : ""} role="radio" aria-checked={o.id === value}
                onClick={() => onChange(o.id)}>{o.name}</button>
      ))}
    </div>
  );
}

export const Bar = ({ value }) => <div className="bar"><div style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} /></div>;
