/** The app's logo (frontend/public/logo.png, also the browser-tab and home-screen icon). Decorative: the name sits next to it. */
export default function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return <img src="/logo-96.png" alt="" width={28} height={28} className={`shrink-0 ${className}`} />;
}
