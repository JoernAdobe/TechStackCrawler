/** Login für den Admin-View: ausschließlich Okta (Sign in with Adobe). */
export default function DashboardLogin() {
  return (
    <div className="min-h-screen bg-ts-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-adobe-red to-adobe-red-dark flex items-center justify-center">
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm6.232 0L24 22.624V1.376z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ts-text-primary">Usage Dashboard</h1>
          <p className="text-sm text-ts-text-secondary mt-1">Account Radar — Management View</p>
        </div>

        {/* Okta SSO (einziger Login-Weg) — Full-Page-Navigation, damit Okta redirecten kann */}
        <a
          href="/auth/login"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-gradient-to-r from-adobe-red to-adobe-red-dark text-white font-semibold text-sm hover:from-adobe-red-dark hover:to-[#B03522] transition-all"
        >
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm6.232 0L24 22.624V1.376z" />
          </svg>
          Sign in with Adobe
        </a>

        <p className="text-center text-xs text-ts-text-secondary mt-6">
          <a href="#/" className="hover:text-ts-accent transition-colors">
            ← Back to Analyzer
          </a>
        </p>
      </div>
    </div>
  );
}
