import { MessageCircleIcon, User2 } from "lucide-react";
import Link from "next/link";


const TopMenu = () => {
    return (
        <div className="flex items-center justify-between p-4 bg-sky-500 text-white">
          <div className="flex items-center justify-between gap-4 ml-auto">
            <Link href="#" className="flex items-center gap-2 font-[700]">
              
                <MessageCircleIcon />
                Live Chat
            </Link>
            <Link href="#" className="flex items-center gap-2 font-[700]">
                <User2 />
                Student Portal
            </Link>
            <Link href="/teacher" className="px-4 py-2 bg-yellow-400 text-white rounded hover:bg-black">Teacher's Portal</Link>
          </div>
        </div>
    )
}

export default TopMenu