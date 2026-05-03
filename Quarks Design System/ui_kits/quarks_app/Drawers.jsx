// Drawers.jsx — Download drawer + Song Info drawer
// Exports: DownloadDrawer, SongInfoDrawer, DrawerTitleBar, ActionButton, SmallButton, PixelProgressBar

function DrawerTitleBar({ title, onClose }) {
  const Q = window.QuarksTokens;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
      <span style={{ fontFamily: Q.font, fontSize: 14, color: Q.textPrimary }}>{title}</span>
      <span
        className="material-icons"
        onClick={onClose}
        style={{ fontSize: 16, color: Q.textSecondary, cursor: 'pointer' }}
      >close</span>
    </div>
  );
}

function PixelProgressBar({ value }) {
  const Q = window.QuarksTokens;
  return (
    <div style={{
      borderTop: `1.5px solid ${Q.borderDark}`,
      borderLeft: `1.5px solid ${Q.borderDark}`,
      borderBottom: `1.5px solid ${Q.borderLight}`,
      borderRight: `1.5px solid ${Q.borderLight}`,
      background: Q.surfaceAlt,
      height: 12, overflow: 'hidden',
    }}>
      <div style={{ width: `${Math.min(100, value * 100)}%`, height: '100%', background: Q.primary }} />
    </div>
  );
}

function ActionButton({ label, onClick, destructive, disabled }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;

  const bg = disabled ? 'transparent'
    : destructive
      ? (hovering ? Q.error + '1A' : 'transparent')
      : (hovering ? Q.primary + '1A' : 'transparent');
  const borderColor = disabled ? Q.border
    : destructive ? (hovering ? Q.error : Q.border)
    : (hovering ? Q.primary : Q.border);
  const textColor = disabled ? Q.textLight
    : destructive ? Q.error
    : (hovering ? Q.primary : Q.textPrimary);

  return (
    <div
      onMouseEnter={() => !disabled && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={disabled ? undefined : onClick}
      style={{
        width: '100%', padding: '8px 0', textAlign: 'center',
        background: bg,
        border: `1px solid ${borderColor}`,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: Q.font, fontSize: 9, color: textColor,
        userSelect: 'none', opacity: disabled ? 0.5 : 1,
      }}
    >{label}</div>
  );
}

function SmallButton({ label, onClick, disabled }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;

  const bg = disabled ? 'transparent' : hovering ? Q.primary + '1A' : 'transparent';
  const borderColor = hovering && !disabled ? Q.primary : Q.border;
  const textColor = disabled ? Q.textLight : hovering ? Q.primary : Q.textSecondary;

  return (
    <div
      onMouseEnter={() => !disabled && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '5px 10px',
        background: bg,
        border: `1px solid ${borderColor}`,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: Q.font, fontSize: 9, color: textColor,
        userSelect: 'none', flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >{label}</div>
  );
}

function PixelInput({ placeholder, value, onChange, disabled }) {
  const Q = window.QuarksTokens;
  return (
    <div style={{
      borderTop: `1.5px solid ${Q.borderDark}`,
      borderLeft: `1.5px solid ${Q.borderDark}`,
      borderBottom: `1.5px solid ${Q.borderLight}`,
      borderRight: `1.5px solid ${Q.borderLight}`,
      background: Q.surface,
      padding: '2px 8px',
    }}>
      <input
        value={value}
        onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontFamily: Q.font, fontSize: 10, color: Q.textPrimary,
          width: '100%', padding: '6px 0',
        }}
      />
    </div>
  );
}

function DownloadDrawer({ onClose }) {
  const Q = window.QuarksTokens;
  const [url, setUrl] = React.useState('');
  const [stage, setStage] = React.useState('idle'); // idle | scanned | downloading
  const [progress, setProgress] = React.useState(0);

  function handleScan() {
    if (!url) return;
    setStage('scanned');
  }

  function handleDownload() {
    setStage('downloading');
    let p = 0;
    const iv = setInterval(() => {
      p += 0.05;
      setProgress(p);
      if (p >= 1) { clearInterval(iv); setStage('done'); }
    }, 120);
  }

  return (
    <div style={{
      position: 'absolute', top: 0, bottom: 0, right: 0,
      width: 320,
      background: Q.background,
      borderLeft: `2px solid ${Q.borderDark}`,
      boxShadow: `-4px 0 8px ${Q.cardShadow}`,
      display: 'flex', flexDirection: 'column',
      zIndex: 10,
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DrawerTitleBar title="DOWNLOAD" onClose={onClose} />

        <div>
          <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>URL</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <PixelInput placeholder="YouTube URL..." value={url} onChange={setUrl} />
            </div>
            <SmallButton label={stage === 'idle' ? 'SCAN' : '...'} onClick={handleScan} disabled={!url || stage !== 'idle'} />
          </div>
        </div>

        {stage === 'scanned' && (
          <div style={{
            borderTop: `1.5px solid ${Q.borderLight}`,
            borderLeft: `1.5px solid ${Q.borderLight}`,
            borderBottom: `1.5px solid ${Q.borderDark}`,
            borderRight: `1.5px solid ${Q.borderDark}`,
            background: Q.surface, padding: 8,
          }}>
            <div style={{
              background: Q.surfaceAlt, height: 80,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
            }}>
              <span className="material-icons" style={{ fontSize: 40, color: Q.textLight }}>music_note</span>
            </div>
            <div style={{ fontFamily: Q.font, fontSize: 10, color: Q.textPrimary }}>Video title from YouTube</div>
          </div>
        )}

        {stage === 'downloading' && (
          <div>
            <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, marginBottom: 6 }}>Downloading...</div>
            <PixelProgressBar value={progress} />
          </div>
        )}

        {stage === 'done' && (
          <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.success }}>Download complete!</div>
        )}
      </div>

      {stage === 'scanned' && (
        <div style={{ padding: 16 }}>
          <ActionButton label="DOWNLOAD" onClick={handleDownload} />
        </div>
      )}
    </div>
  );
}

function SongInfoDrawer({ track, onClose, onDelete }) {
  const Q = window.QuarksTokens;
  const [title, setTitle] = React.useState(track?.title || '');

  return (
    <div style={{
      position: 'absolute', top: 0, bottom: 0, right: 0,
      width: 360,
      background: Q.background,
      borderLeft: `2px solid ${Q.borderDark}`,
      boxShadow: `-4px 0 8px ${Q.cardShadow}`,
      display: 'flex', flexDirection: 'column',
      zIndex: 10,
    }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <DrawerTitleBar title="SONG INFO" onClose={onClose} />

        <div>
          <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>TITLE</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <PixelInput value={title} onChange={setTitle} placeholder="Track title..." />
            </div>
            <SmallButton label="RENAME" disabled={title === track?.title} onClick={() => {}} />
          </div>
        </div>

        <div>
          <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>PATH</div>
          <div style={{
            borderTop: `1.5px solid ${Q.borderDark}`,
            borderLeft: `1.5px solid ${Q.borderDark}`,
            borderBottom: `1.5px solid ${Q.borderLight}`,
            borderRight: `1.5px solid ${Q.borderLight}`,
            background: Q.surface, padding: 8,
            fontFamily: Q.font, fontSize: 9, color: Q.textLight, lineHeight: 1.5,
            wordBreak: 'break-all',
          }}>
            {track?.path || 'C:\\Users\\user\\Music\\track.mp3'}
          </div>
        </div>

        <div>
          <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>DURATION</div>
          <div style={{ fontFamily: Q.font, fontSize: 10, color: Q.textPrimary }}>{track?.duration || '03:42'}</div>
        </div>

        <div>
          <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>PLAYLISTS</div>
          <div style={{ fontFamily: Q.font, fontSize: 10, color: Q.textLight }}>Not in any playlist</div>
        </div>

        <ActionButton label="DELETE FILE" destructive onClick={onDelete} />
      </div>
    </div>
  );
}

Object.assign(window, { DownloadDrawer, SongInfoDrawer, DrawerTitleBar, ActionButton, SmallButton, PixelProgressBar, PixelInput });
