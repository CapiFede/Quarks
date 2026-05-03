// PlayerControls.jsx — Bottom player bar: seek, volume, playback controls
// Exports: PlayerControls

function SeekBar({ position, duration, onSeek }) {
  const Q = window.QuarksTokens;
  const pct = duration > 0 ? (position / duration) : 0;

  function fmt(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  function handleClick(e) {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    onSeek(x * duration);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, width: 32, textAlign: 'right' }}>{fmt(position)}</span>
      <div
        onClick={handleClick}
        style={{
          flex: 1, height: 4, background: Q.border, cursor: 'pointer', position: 'relative',
        }}
      >
        <div style={{ width: `${pct * 100}%`, height: '100%', background: Q.primary }} />
      </div>
      <span style={{ fontFamily: Q.font, fontSize: 9, color: Q.textSecondary, width: 32 }}>{fmt(duration)}</span>
    </div>
  );
}

function PlayerControls({ track, isPlaying, position, duration, volume, shuffle, onTogglePlay, onPrev, onNext, onSeek, onVolume, onShuffle }) {
  const Q = window.QuarksTokens;
  if (!track) return null;

  return (
    <div style={{
      background: Q.surfaceAlt,
      borderTop: `1px solid ${Q.border}`,
      padding: '8px 12px',
      flexShrink: 0,
    }}>
      {/* Track title */}
      <div style={{
        fontFamily: Q.font, fontSize: 11, color: Q.textPrimary,
        textAlign: 'center', marginBottom: 6,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{track.title}</div>

      {/* Seek bar */}
      <SeekBar position={position} duration={duration} onSeek={onSeek} />

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
        {/* Volume */}
        <span className="material-icons" style={{ fontSize: 14, color: Q.textLight }}>volume_down</span>
        <input
          type="range" min={0} max={1} step={0.01} value={volume}
          onChange={e => onVolume(parseFloat(e.target.value))}
          style={{ width: 56, accentColor: Q.primary, margin: '0 4px' }}
        />

        <div style={{ flex: 1 }} />

        {/* Prev */}
        <span
          className="material-icons"
          onClick={onPrev}
          style={{ fontSize: 24, color: Q.textSecondary, cursor: 'pointer' }}
        >skip_previous</span>

        {/* Play/Pause — clean circle, no pixel border */}
        <span
          onClick={onTogglePlay}
          className="material-icons"
          style={{
            fontSize: 36, color: Q.primary, cursor: 'pointer', margin: '0 6px',
          }}
        >{isPlaying ? 'pause_circle' : 'play_circle'}</span>

        {/* Next */}
        <span
          className="material-icons"
          onClick={onNext}
          style={{ fontSize: 24, color: Q.textSecondary, cursor: 'pointer' }}
        >skip_next</span>

        <div style={{ flex: 1 }} />

        {/* Shuffle */}
        <span
          className="material-icons"
          onClick={onShuffle}
          style={{ fontSize: 16, color: shuffle ? Q.primary : Q.textLight, cursor: 'pointer' }}
        >shuffle</span>

        {/* Playlist dropdown */}
        <div style={{
          marginLeft: 8,
          padding: '3px 8px',
          background: 'transparent',
          borderBottom: `1px solid ${Q.border}`,
          fontFamily: Q.font, fontSize: 9, color: Q.textSecondary,
          cursor: 'pointer',
        }}>All Tracks ▾</div>
      </div>
    </div>
  );
}

Object.assign(window, { PlayerControls, SeekBar });
