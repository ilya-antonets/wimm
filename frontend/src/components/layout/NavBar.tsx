import { ActionIcon, Button, Group, Text, useMantineColorScheme } from "@mantine/core";
import { NavLink } from "react-router-dom";

import { useAppStore } from "../../store/useAppStore";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/settings", label: "Settings" },
];

export function NavBar(): JSX.Element {
  const setImportModalOpen = useAppStore((s) => s.setImportModalOpen);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <Group component="nav" className="navbar" h="100%" px="md" justify="space-between" wrap="nowrap">
      <Text component="span" fw={700} size="lg" className="navbar__logo">
        WIMM
      </Text>
      <Group component="ul" className="navbar__links" gap="xs" style={{ listStyle: "none" }}>
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
      </Group>
      <Group gap="xs">
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="Toggle color scheme"
          onClick={() => toggleColorScheme()}
        >
          {colorScheme === "dark" ? "☀" : "☾"}
        </ActionIcon>
        <Button className="navbar__import" onClick={() => setImportModalOpen(true)}>
          Import CSV
        </Button>
      </Group>
    </Group>
  );
}
