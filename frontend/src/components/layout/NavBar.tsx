import { NavLink } from "react-router-dom";

import { useAppStore } from "../../store/useAppStore";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/settings", label: "Settings" },
];

export function NavBar(): JSX.Element {
  const setImportModalOpen = useAppStore((s) => s.setImportModalOpen);

  return (
    <nav className="navbar">
      <span className="navbar__logo">WIMM</span>
      <ul className="navbar__links">
        {NAV_LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) => (isActive ? "navbar__link is-active" : "navbar__link")}
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <button type="button" className="navbar__import" onClick={() => setImportModalOpen(true)}>
        Import CSV
      </button>
    </nav>
  );
}
