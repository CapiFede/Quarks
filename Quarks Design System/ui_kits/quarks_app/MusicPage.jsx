// MusicPage.jsx — Music quark: search bar + track list
// Exports: MusicPage, TrackList, SearchBar

function SearchBar({ value, onChange }) {
  const Q = window.QuarksTokens;
  return (
    <div style={{
      padding: '6px 12px',
      background: Q.background,
      borderBottom: `1px solid ${Q.border}`,
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        border: `1px solid ${Q.border}`,
        background: Q.surface,
        padding: '4px 8px',
      }}>
        <span className="material-icons" style={{ fontSize: 16, color: Q.textSecondary }}>search</span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search songs..."
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontFamily: Q.font, fontSize: 12, color: Q.textPrimary,
            flex: 1,
          }}
        />
      </div>
    </div>
  );
}

function TrackRow({ track, isPlaying, isSelected, onTap, onDoubleTap, onContextMenu, inPlaylist }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;

  const bg = isSelected
    ? Q.secondary + '4D'
    : isPlaying
      ? Q.error + '40'
      : hovering ? Q.cardHover : 'transparent';

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onTap}
      onDoubleClick={onDoubleTap}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex', alignItems: 'stretch',
        background: bg,
        borderBottom: `1px solid ${Q.border}`,
        cursor: 'pointer', minHeight: 38,
      }}
    >
      {/* Playlist indicator */}
      <div style={{ width: 5, background: inPlaylist ? Q.primary : 'transparent', flexShrink: 0 }} />
      <div style={{ flex: 1, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="material-icons" style={{ fontSize: 16, color: isPlaying ? Q.error : Q.textSecondary }}>
          {isPlaying ? 'play_arrow' : 'music_note'}
        </span>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{
            fontFamily: Q.font, fontSize: 12,
            color: isSelected ? Q.primaryDark : isPlaying ? Q.error : Q.textPrimary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{track.title}</div>
          {track.artist && (
            <div style={{
              fontFamily: Q.font, fontSize: 10, color: Q.textSecondary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2,
            }}>{track.artist}</div>
          )}
        </div>
        <div style={{ fontFamily: Q.font, fontSize: 9, color: Q.textLight, flexShrink: 0 }}>{track.duration}</div>
      </div>
    </div>
  );
}

function TrackList({ tracks, currentTrack, selectedTrack, onSelect, onPlay, onContextMenu }) {
  const Q = window.QuarksTokens;
  if (!tracks || tracks.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: Q.font, fontSize: 14, color: Q.textSecondary }}>
          Scan a folder to find music
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {tracks.map((track, i) => (
        <TrackRow
          key={track.path || i}
          track={track}
          isPlaying={currentTrack?.path === track.path}
          isSelected={selectedTrack?.path === track.path}
          onTap={() => onSelect(track)}
          onDoubleTap={() => onPlay(track)}
          onContextMenu={e => onContextMenu && onContextMenu(e, track)}
          inPlaylist={track.inPlaylist}
        />
      ))}
    </div>
  );
}

function MusicPage({ tracks, currentTrack, selectedTrack, onSelect, onPlay, toolbar, player }) {
  const [search, setSearch] = React.useState('');
  const Q = window.QuarksTokens;

  const filtered = search
    ? tracks.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.artist || '').toLowerCase().includes(search.toLowerCase()))
    : tracks;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {toolbar}
      <SearchBar value={search} onChange={setSearch} />
      <TrackList
        tracks={filtered}
        currentTrack={currentTrack}
        selectedTrack={selectedTrack}
        onSelect={onSelect}
        onPlay={onPlay}
      />
      {player}
    </div>
  );
}

Object.assign(window, { MusicPage, TrackList, TrackRow, SearchBar });
