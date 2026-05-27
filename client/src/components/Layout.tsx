import "./Layout.css";
import { Outlet } from "react-router-dom";
import Header from "./Header.tsx";
import SideBarNav from "./SideBarNav.tsx";

/**
 * Main component represents the layout of the main page, including a sidebar
 * and the main content area.
 */
export default function Layout() {
  return (
    <>
      <div id="main" className="main">
        <Header />
        <SideBarNav />
        <div id="right_main" className="right_main">
          <Outlet />
        </div>
      </div>
    </>
  );
}
