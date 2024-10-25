// FeaturesSection.tsx


import Link from "next/link";
import {  BookOpen, ChevronsRight, School, UserPlus2 } from "lucide-react";

const features = [
  {
    id: 1,
    title: "School Life",
    description: "Eimply dummy text printing ypese tting industry. Ipsum has been the",
    icon: School, // Imported icon directly
  },
  {
    id: 2,
    title: "Academics",
    description: "Eimply dummy text printing ypese tting industry. Ipsum has been the",
    icon: BookOpen,
  },
  {
    id: 3,
    title: "Community",
    description: "Eimply dummy text printing ypese tting industry. Ipsum has been the",
    icon: UserPlus2,
  },
];

const FeaturesSection = () => {
  return (
    <section className="my-16 px-10  relative z-2">
      <div className="mx-[15.71%] xxxl:mx-[14.71%] xxl:mx-[9.71%] xl:mx-[5.71%] md:mx-10">
        <div className="grid grid-cols-3 md:grid-cols-3 xs:grid-cols-1 space-x-10">
          {features.map((feature) => (
            <div
              key={feature.id}
              className="bg-[#FAF9F6] hover:bg-yellow-400 border-t-4 border-yellow-400 hover:border-sky-700 duration-400 p-7.5 sm:p-6 group relative z-1 before:absolute before:-z-1 before:inset-0 before:bg-[url('/img/faeture-bg.jpg')] before:mix-blend-hard-light before:opacity-0 before:duration-400 hover:before:opacity-15"
            >
              <span className="icon">
                <feature.icon size={50} className="text-sky-700" />
              </span>
              <h4 className="font-semibold text-2xl xl:text-[22px] mb-0.75 text-sky-700">
                <Link href="#" className="hover:text-sky-700">
                  {feature.title}
                </Link>
              </h4>
              <p className="text-gray-400 group-hover:text-black mb-4.5">
                {feature.description}
              </p>
              <Link href="#" className="text-sky-700 hover:text-sky-700 flex items-center mt-4 cursor-pointer">
                <ChevronsRight className="ml-1" size={16} />
                <span className="text-sm ">
                  View More
                </span>
                
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
