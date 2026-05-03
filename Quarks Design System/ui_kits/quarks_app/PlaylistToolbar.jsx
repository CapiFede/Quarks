// PlaylistToolbar.jsx — Playlist chips + toolbar action buttons
// Exports: PlaylistToolbar

function PixelChip({ label, isActive, onClick }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
      style={{
        padding: '3px 9px',
        background: 'transparent',
        borderBottom: isActive ? `2px solid ${Q.primary}` : hovering ? `2px solid ${Q.borderDark}` : '2px solid transparent',
        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        cursor: 'pointer', userSelect: 'none',
        fontFamily: Q.font, fontSize: 9,
        color: isActive ? Q.primary : hovering ? Q.textPrimary : Q.textSecondary,
        flexShrink: 0,
        transition: 'none',
      }}
    >{label}</div>
  );
}

function ToolbarIconBtn({ icon, onClick, spinning }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
      style={{
        padding: '4px 5px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26,
      }}
    >
      <span
        className="material-icons"
        style={{
          fontSize: 14,
          color: hovering ? Q.textPrimary : Q.textSecondary,
          animation: spinning ? 'spin 1s linear infinite' : 'none',
        }}
      >{icon}</span>
    </div>
  );
}

function PlaylistToolbar({ playlists, selectedId, onSelect, onAdd, onScan, scanning, onDownload, onCloud }) {
  const Q = window.QuarksTokens;
  const [hovering, setHovering] = React.useState(false);

  return (
    <div style={{
      background: Q.background,
      borderBottom: `1px solid ${Q.border}`,
      padding: '0 8px',
      display: 'flex', alignItems: 'center', gap: 2,
      flexShrink: 0,
      height: 32,
    }}>
      {/* Scrollable chips area */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', flex: 1 }}>
        <PixelChip label="All Tracks" isActive={selectedId === '__all'} onClick={() => onSelect('__all')} />
        {playlists.map(pl => (
          <PixelChip key={pl.id} label={pl.name} isActive={selectedId === pl.id} onClick={() => onSelect(pl.id)} />
        ))}
        {/* Add button */}
        <div
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onClick={onAdd}
          style={{
            padding: '4px 5px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}
        >
          <span className="material-icons" style={{ fontSize: 13, color: hovering ? Q.textPrimary : Q.textSecondary }}>add</span>
        </div>
      </div>
      <div style={{ width: 8 }} />
      <ToolbarIconBtn icon="folder_open" onClick={() => {}} />
      <ToolbarIconBtn icon="refresh" onClick={onScan} spinning={scanning} />
      <ToolbarIconBtn icon="download" onClick={onDownload} />
      <ToolbarIconBtn icon="cloud" onClick={onCloud} />
    </div>
  );
}

Object.assign(window, { PlaylistToolbar, PixelChip, ToolbarIconBtn });
