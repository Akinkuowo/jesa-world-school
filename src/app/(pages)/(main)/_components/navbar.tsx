"use client"

import MainMenu from "./mainmenu";
import TopMenu from "./topmenu"


const Navbar = () => {

  return (
    <div>
    
      {/* Header */}
      <header className="absolute z-[99] top-0 inset-x-0 bg-white shadow-md">
        <TopMenu />
        <MainMenu />
      </header>
    </div>
  );
};

export default Navbar;
