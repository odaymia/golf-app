// Round profile photo, or the first letter of the name.
export default function Avatar({ profile, size = 36 }) {
  const letter = (profile?.displayName || profile?.username || '?').trim().charAt(0).toUpperCase();
  return profile?.avatarUrl ? (
    <img className="avatar-img" src={profile.avatarUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {letter}
    </span>
  );
}
