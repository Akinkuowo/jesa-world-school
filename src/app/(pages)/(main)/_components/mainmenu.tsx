import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const MainMenu = () => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const toggleMobileMenu = () => {
        setIsMobileMenuOpen((prev) => !prev);
    };
    return (
        <div>
            {/* Sidebar */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[100] bg-white transition-transform ease-linear duration-300 transform translate-x-0">
                    <div className="p-[20px] border-b border-gray-200 flex justify-between items-center">
                        <Link href="/">
                            <Image src="/assets/img/logo.png" alt="logo" width={100} height={40} />
                        </Link>
                        <Button
                            type="button"
                            className="border border-gray-200 w-[45px] h-[45px] text-black text-[22px] rounded-full"
                            onClick={toggleMobileMenu}
                        >
                            <X className="text-white"/>
                        </Button>
                    </div>
                    <div className="p-[20px]">
                        <ul className="space-y-4">
                            <li>
                                <Link href="/" className="font-[700]">Home</Link>
                            </li>
                            <li>
                                <Link href="/about" className="font-[700]">About us</Link>
                            </li>
                            <li>
                                <Link href="/our-teachers" className="font-[700]">Our Teachers</Link>
                            </li>
                            <li>
                                <Link href="/news" className="font-[700]">News</Link>
                            </li>
                            <li>
                                <Link href="/contact" className="font-[700]">Contact us</Link>
                            </li>
                        </ul>
                    </div>
                </div>
            )}


            <div className="flex justify-between items-center px-4 py-2">
                <Link href="/">
                    <Image src="/assets/img/logo.png" alt="logo" width={120} height={50} />
                </Link>
                <div className="hidden lg:flex items-center gap-8">
                    <nav>
                        <ul className="flex ">
                            <li className="mx-5">
                                <Link href="/" className="font-[700]">Home</Link>
                            </li>
                            <li className="mx-5 text-center">
                                <Link href="/about" className="font-[700]">About us</Link>
                            </li>
                            <li className="mx-5">
                                <Link href="/our-teachers" className="font-[700]">Our Teachers</Link>
                            </li>
                            <li className="mx-5">
                                <Link href="/news" className="font-[700]">News</Link>
                            </li>
                            <li className="mx-5">
                                <Link href="/contact" className="font-[700]">Contact us</Link>
                            </li>
                        </ul>
                    </nav>
            
                    <Link href="/contact" className="px-4 py-2 bg-yellow-500 text-white rounded">Apply Now</Link>
                </div>
                {/* Mobile menu button */}
                <Button type="button" className="lg:hidden text-blue-600 text-2xl" onClick={toggleMobileMenu}>
                    <Menu className="text-white"/>
                </Button>
            </div>
        </div>
    )
}

export default MainMenu