/* ============================================================
   Study Tracker — Shared UI primitives
   Exposes components on window for cross-file use.
   ============================================================ */

const { useState, useEffect, useRef, useCallback } = React;

/* ---- Icon set (inline strokes, no external deps) ---------- */
function Icon({ name, size = 18, stroke = 1.7, style }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', style };
  const P = {
    dashboard: <><path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 7h6V4h-6zM4 20h6v-3H4z"/></>,
    planner: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 14h5M7 17h8"/></>,
    timer: <><circle cx="12" cy="13" r="8"/><path d="M12 13V9M12 5V3M9 3h6"/></>,
    vault: <><path d="M12 2 4 6v6c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6z"/><path d="M9 12l2 2 4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    minus: <><path d="M5 12h14"/></>,
    chevron: <><path d="M9 6l6 6-6 6"/></>,
    chevronDown: <><path d="M6 9l6 6 6-6"/></>,
    play: <><path d="M7 4v16l13-8z"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4"/></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    flame: <><path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 1.5-4 .8 1 1.5 1.2 2 1.2C10 6 11 4 12 2z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></>,
    leaf: <><path d="M11 20A7 7 0 0 1 4 13c0-5 5-9 16-9 0 9-4 16-9 16z"/><path d="M11 20c0-5 2-9 7-13"/></>,
    bolt: <><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></>,
    cal: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>,
    focus: <><circle cx="12" cy="12" r="3"/><path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></>,
    moon: <><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z"/></>,
    sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></>,
    file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
    key: <><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M17 5l2 2M14 8l2 2"/></>,
    arrowUp: <><path d="M12 19V5M6 11l6-6 6 6"/></>,
    arrowDown: <><path d="M12 5v14M6 13l6 6 6-6"/></>,
    check: <><path d="M5 12l5 5L20 6"/></>,
    edit: <><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
    layers: <><path d="M12 2 2 7l10 5 10-5z"/><path d="M2 12l10 5 10-5M2 17l10 5 10-5"/></>,
    x: <><path d="M6 6l12 12M18 6 6 18"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    flag: <><path d="M5 21V4M5 4h12l-2 4 2 4H5"/></>,
  };
  return <svg {...common}>{P[name] || null}</svg>;
}

/* ---- Button ----------------------------------------------- */
function Btn({ variant = 'ghost', size = 'md', icon, iconRight, children, onClick, disabled, title, style, active, full }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: children ? 7 : 0,
    fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.01em',
    borderRadius: 'var(--r-md)', border: '1px solid transparent', whiteSpace: 'nowrap',
    transition: 'all .16s ease', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1, width: full ? '100%' : 'auto',
  };
  const sizes = {
    sm: { padding: children ? '6px 11px' : '6px', fontSize: 12.5, height: 30 },
    md: { padding: children ? '9px 15px' : '9px', fontSize: 13.5, height: 38 },
    lg: { padding: children ? '13px 22px' : '13px', fontSize: 15, height: 48 },
  };
  const variants = {
    primary: { background: 'var(--accent)', color: 'oklch(0.18 0.02 250)', borderColor: 'var(--accent)', boxShadow: 'var(--shadow-sm)' },
    solid: { background: 'var(--surface-2)', color: 'var(--ink)', borderColor: 'var(--line)' },
    ghost: { background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--ink-2)', borderColor: active ? 'var(--accent-line)' : 'var(--line-soft)' },
    quiet: { background: 'transparent', color: 'var(--ink-3)', borderColor: 'transparent' },
    danger: { background: 'transparent', color: 'var(--ink-4)', borderColor: 'var(--line-soft)' },
  };
  const ico = sizes[size].fontSize + 3;
  const ref = useRef(null);
  return (
    <button ref={ref} title={title} onClick={disabled ? undefined : onClick} disabled={disabled}
      className={'btn btn-' + variant}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={ico} />}
      {children}
      {iconRight && <Icon name={iconRight} size={ico} />}
    </button>
  );
}

/* ---- Progress bar ----------------------------------------- */
function Bar({ value, color = 'var(--accent)', height = 7, track = 'var(--ring-track)', glow }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ background: track, borderRadius: 99, height, overflow: 'hidden', width: '100%' }}>
      <div style={{
        width: pct + '%', height: '100%', background: color, borderRadius: 99,
        transition: 'width .5s cubic-bezier(.2,.7,.3,1)',
        boxShadow: glow ? `0 0 8px ${color}` : 'none',
      }} />
    </div>
  );
}

/* ---- Ring (SVG circular progress) ------------------------- */
function Ring({ value, size = 96, stroke = 9, color = 'var(--accent)', track = 'var(--ring-track)', label, sub, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const off = c - (pct / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.7,.3,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        {children || (<>
          <span className="mono" style={{ fontSize: size * 0.24, fontWeight: 600, lineHeight: 1, color: 'var(--ink)' }}>{label}</span>
          {sub && <span className="eyebrow" style={{ marginTop: 3, fontSize: 9 }}>{sub}</span>}
        </>)}
      </div>
    </div>
  );
}

/* ---- Pill / chip ------------------------------------------ */
function Chip({ children, color, bg, icon, size = 'md', style }) {
  const s = size === 'sm' ? { fontSize: 10.5, padding: '2px 8px', gap: 4 } : { fontSize: 11.5, padding: '4px 10px', gap: 5 };
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: s.gap, padding: s.padding,
      borderRadius: 'var(--r-pill)', fontSize: s.fontSize, fontWeight: 500, letterSpacing: '0.02em',
      background: bg || 'var(--surface-2)', color: color || 'var(--ink-3)',
      border: '1px solid var(--line-soft)', whiteSpace: 'nowrap', ...style,
    }}>
      {icon && <Icon name={icon} size={s.fontSize} />}
      {children}
    </span>
  );
}

/* ---- Course dot ------------------------------------------- */
function Dot({ color, size = 9, ring }) {
  return <span style={{ width: size, height: size, borderRadius: 99, background: ST.color(color), display: 'inline-block', flexShrink: 0, boxShadow: ring ? `0 0 0 3px ${ST.color(color)}22` : 'none' }} />;
}

/* ---- Priority tag ----------------------------------------- */
function PriorityTag({ p }) {
  const map = {
    high: { c: 'var(--danger)', bg: 'var(--danger-soft)', t: 'High' },
    medium: { c: 'var(--warn)', bg: 'var(--warn-soft)', t: 'Med' },
    low: { c: 'var(--ink-4)', bg: 'var(--surface-2)', t: 'Low' },
  };
  const m = map[p] || map.low;
  return <Chip size="sm" color={m.c} bg={m.bg} style={{ borderColor: 'transparent' }}>{m.t}</Chip>;
}

/* ---- Section card ----------------------------------------- */
function Card({ children, style, raised, pad = 20, className = '', onClick }) {
  return (
    <div onClick={onClick} className={(raised ? 'card-raised ' : 'card ') + className}
      style={{ padding: pad, ...style }}>
      {children}
    </div>
  );
}

/* ---- Card header ------------------------------------------ */
function CardHead({ eyebrow, title, icon, right, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>{icon && <Icon name={icon} size={12} />}{eyebrow}</div>}
        <div className="serif" style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ---- Empty state ------------------------------------------ */
function Empty({ icon = 'sparkle', title, sub, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '34px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', border: '1px solid var(--accent-line)' }}>
        <Icon name={icon} size={22} />
      </div>
      <div className="serif" style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', maxWidth: 280, lineHeight: 1.5 }}>{sub}</div>}
      {action}
    </div>
  );
}

/* ---- Form field ------------------------------------------- */
function Field({ label, hint, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      {label && <span className="eyebrow" style={{ fontSize: 10 }}>{label}</span>}
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--ink)',
  background: 'var(--surface-inset)', border: '1px solid var(--line)',
  borderRadius: 'var(--r-sm)', padding: '9px 12px', width: '100%', outline: 'none',
  transition: 'border-color .15s, box-shadow .15s',
};
function Input(props) {
  const [foc, setFoc] = useState(false);
  return <input {...props} onFocus={(e)=>{setFoc(true);props.onFocus&&props.onFocus(e);}} onBlur={(e)=>{setFoc(false);props.onBlur&&props.onBlur(e);}}
    style={{ ...inputStyle, borderColor: foc ? 'var(--accent)' : 'var(--line)', boxShadow: foc ? '0 0 0 3px var(--accent-soft)' : 'none', ...props.style }} />;
}
function Textarea(props) {
  const [foc, setFoc] = useState(false);
  return <textarea {...props} onFocus={(e)=>{setFoc(true);props.onFocus&&props.onFocus(e);}} onBlur={(e)=>{setFoc(false);props.onBlur&&props.onBlur(e);}}
    style={{ ...inputStyle, resize: 'vertical', minHeight: 64, lineHeight: 1.5, borderColor: foc ? 'var(--accent)' : 'var(--line)', boxShadow: foc ? '0 0 0 3px var(--accent-soft)' : 'none', ...props.style }} />;
}

/* ---- Segmented control ------------------------------------ */
function Segmented({ options, value, onChange, size = 'md', full }) {
  const pad = size === 'sm' ? '5px 10px' : '8px 14px';
  const fs = size === 'sm' ? 12 : 13;
  return (
    <div style={{ display: 'inline-flex', background: 'var(--surface-inset)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 3, gap: 2, width: full ? '100%' : 'auto' }}>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const lab = typeof o === 'string' ? o : o.label;
        const ico = typeof o === 'object' ? o.icon : null;
        const act = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            flex: full ? 1 : 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: pad, fontSize: fs, fontWeight: 600, fontFamily: 'var(--font-sans)',
            border: 'none', borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap', transition: 'all .15s',
            background: act ? 'var(--surface-raised)' : 'transparent',
            color: act ? 'var(--ink)' : 'var(--ink-4)',
            boxShadow: act ? 'var(--shadow-sm)' : 'none',
          }}>
            {ico && <Icon name={ico} size={fs + 2} />}{lab}
          </button>
        );
      })}
    </div>
  );
}

/* ---- Toggle switch ---------------------------------------- */
function Toggle({ on, onChange, label }) {
  return (
    <button onClick={() => onChange(!on)} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', padding: 0, color: 'var(--ink-2)', fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
      <span style={{ width: 38, height: 22, borderRadius: 99, background: on ? 'var(--accent)' : 'var(--surface-2)', border: '1px solid', borderColor: on ? 'var(--accent)' : 'var(--line)', position: 'relative', transition: 'all .2s', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 99, background: on ? 'oklch(0.2 0.02 250)' : 'var(--ink-3)', transition: 'left .2s' }} />
      </span>
      {label}
    </button>
  );
}

/* ---- Tooltip-ish stat ------------------------------------- */
function Stat({ label, value, unit, color, icon, big }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{icon && <Icon name={icon} size={11} />}{label}</span>
      <span className="mono" style={{ fontSize: big ? 30 : 21, fontWeight: 600, color: color || 'var(--ink)', lineHeight: 1, letterSpacing: '-0.01em' }}>
        {value}{unit && <span style={{ fontSize: big ? 14 : 11, color: 'var(--ink-4)', marginLeft: 3, fontWeight: 500 }}>{unit}</span>}
      </span>
    </div>
  );
}

/* ---- expose ----------------------------------------------- */
Object.assign(window, {
  Icon, Btn, Bar, Ring, Chip, Dot, PriorityTag, Card, CardHead, Empty,
  Field, Input, Textarea, Segmented, Toggle, Stat, inputStyle,
});
