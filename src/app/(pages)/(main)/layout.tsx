import Navbar from "./_components/navbar";
import Head from "next/head";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-full font-poppins">
      {/* Link to Google Fonts */}
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900&display=swap"
          rel="stylesheet"
        />
      </Head>

      {/* Navbar Component */}
      <div className="h-[80px] md:pl-56 fixed inset-y-0 w-full z-50">
        <Navbar />
      </div>

      {/* Main Content */}
      <main className="pt-[80px] h-full">{children}</main>
    </div>
  );
};

export default MainLayout;
