// Shell.jsx — Window frame, title bar, tab system
// Exports: WindowFrame, TitleBar, WindowButton, TitleBarTab, ContentArea

function WindowFrame({ children }) {
  const Q = window.QuarksTokens;
  return (
    <div style={{
      width: '100%', height: '100%',
      background: Q.background,
      borderRadius: 8,
      borderTop: `1px solid ${Q.border}`,
      borderLeft: `1px solid ${Q.border}`,
      borderBottom: `1px solid ${Q.borderDark}`,
      borderRight: `1px solid ${Q.borderDark}`,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
    }}>
      {children}
    </div>
  );
}

function TitleBarTab({ label, isActive, onTap, onClose }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;
  const bgColor = isActive
    ? Q.surface
    : hovering ? Q.primaryDark : Q.primaryDark + '99';

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', padding: '0 12px',
        background: bgColor,
        borderTop: `1px solid ${isActive ? Q.border : 'transparent'}`,
        borderLeft: `1px solid ${isActive ? Q.border : 'transparent'}`,
        borderRight: `1px solid ${isActive ? Q.border : 'transparent'}`,
        borderBottom: isActive ? `1px solid ${Q.surface}` : '1px solid transparent',
        borderRadius: '6px 6px 0 0',
        cursor: 'pointer', gap: 6, userSelect: 'none',
        height: '100%',
      }}
    >
      <span style={{
        fontFamily: Q.font, fontSize: 12,
        color: isActive ? Q.textPrimary : Q.surface,
      }}>{label}</span>
      {onClose && (
        <span
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="material-icons"
          style={{ fontSize: 10, color: isActive ? Q.textSecondary : Q.surface, lineHeight: 1 }}
        >close</span>
      )}
    </div>
  );
}

function WindowButton({ children, onClick }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;
  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
      style={{
        width: 24, height: 24,
        background: 'transparent',
        border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }}
    >{children}</div>
  );
}

function TitleBar({ tabs, onGoHome, onOpenTab, onCloseTab, onToggleTheme, isDark }) {
  const Q = window.QuarksTokens;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={{
      height: 32, flexShrink: 0,
      background: Q.primary,
      borderBottom: `1px solid ${Q.borderDark}`,
      display: 'flex', alignItems: 'stretch', position: 'relative',
    }}>
      {/* Settings button */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', position: 'relative' }} ref={menuRef}>
        <WindowButton onClick={() => setMenuOpen(v => !v)}>
          <span className="material-icons" style={{ fontSize: 12, color: Q.textPrimary }}>settings</span>
        </WindowButton>
        {menuOpen && (
          <div style={{
            position: 'absolute', top: 28, left: 0, zIndex: 100,
            background: Q.surface, border: `2px solid ${Q.borderDark}`,
            minWidth: 160,
          }}>
            <div
              onClick={() => { onToggleTheme(); setMenuOpen(false); }}
              style={{
                padding: '8px 10px', cursor: 'pointer', display: 'flex', gap: 8,
                alignItems: 'center', fontSize: 12, fontFamily: Q.font, color: Q.textPrimary,
              }}
              onMouseEnter={e => e.currentTarget.style.background = Q.cardHover}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="material-icons" style={{ fontSize: 13, color: Q.textPrimary }}>
                {isDark ? 'light_mode' : 'dark_mode'}
              </span>
              {isDark ? 'Tema claro' : 'Tema oscuro'}
            </div>
          </div>
        )}
      </div>
      <div style={{ width: 4 }} />

      {/* Home tab */}
      <TitleBarTab label="Home" isActive={tabs.isHome} onTap={onGoHome} />
      <div style={{ width: 2 }} />

      {/* Quark tabs */}
      {tabs.openTabs.map((id, i) => (
        <React.Fragment key={id}>
          <TitleBarTab
            label={id === 'quark_music' ? 'Quark Music' : id}
            isActive={tabs.activeIndex === i}
            onTap={() => onOpenTab(id)}
            onClose={() => onCloseTab(id)}
          />
          <div style={{ width: 2 }} />
        </React.Fragment>
      ))}

      {/* Drag area */}
      <div style={{ flex: 1 }} />

      {/* Window controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px' }}>
        <WindowButton>
          <div style={{ width: 10, height: 2, background: Q.textPrimary }} />
        </WindowButton>
        <WindowButton>
          <div style={{
            width: 10, height: 10,
            border: `1.5px solid ${Q.textPrimary}`,
          }} />
        </WindowButton>
        <WindowButton>
          <span style={{ fontSize: 11, fontWeight: 'bold', color: Q.textPrimary, lineHeight: 1, fontFamily: Q.font }}>X</span>
        </WindowButton>
      </div>
    </div>
  );
}

function ContentArea({ children }) {
  const Q = window.QuarksTokens;
  return (
    <div style={{
      flex: 1, margin: 6, overflow: 'hidden',
      background: Q.surface,
      border: `1px solid ${Q.border}`,
      display: 'flex', flexDirection: 'column', position: 'relative',
    }}>
      {children}
    </div>
  );
}

Object.assign(window, { WindowFrame, TitleBar, ContentArea, WindowButton, TitleBarTab });
