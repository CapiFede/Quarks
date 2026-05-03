// LauncherGrid.jsx — Home screen quark launcher
// Exports: LauncherGrid

const QUARKS_LIST = [
  { id: 'quark_music', name: 'Quark Music', icon: 'music_note' },
  { id: 'quark_notes', name: 'Quark Notes', icon: 'edit_note', placeholder: true },
  { id: 'quark_photos', name: 'Quark Photos', icon: 'photo_camera', placeholder: true },
  { id: 'quark_timer', name: 'Quark Timer', icon: 'timer', placeholder: true },
];

function QuarkCardItem({ name, icon, onTap, placeholder }) {
  const [hovering, setHovering] = React.useState(false);
  const Q = window.QuarksTokens;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={placeholder ? undefined : onTap}
      style={{
        background: hovering && !placeholder ? Q.cardHover : Q.surface,
        border: `1px solid ${Q.border}`,
        boxShadow: hovering && !placeholder ? 'none' : `2px 2px 0px ${Q.cardShadow}`,
        padding: 16,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        cursor: placeholder ? 'default' : 'pointer',
        opacity: placeholder ? 0.35 : 1,
        aspectRatio: '1',
      }}
    >
      <span className="material-icons" style={{ fontSize: 48, color: Q.primary }}>{icon}</span>
      <span style={{
        fontFamily: Q.font, fontSize: 12, color: Q.textPrimary,
        textAlign: 'center', lineHeight: 1.3,
      }}>{name}</span>
    </div>
  );
}

function LauncherGrid({ onOpenQuark }) {
  const Q = window.QuarksTokens;

  return (
    <div style={{
      flex: 1, padding: 24, overflow: 'auto',
      background: Q.surface,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: 16,
      }}>
        {QUARKS_LIST.map(q => (
          <QuarkCardItem
            key={q.id}
            name={q.name}
            icon={q.icon}
            placeholder={q.placeholder}
            onTap={() => onOpenQuark(q.id)}
          />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { LauncherGrid, QUARKS_LIST });
