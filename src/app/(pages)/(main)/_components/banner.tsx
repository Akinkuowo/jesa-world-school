// Banner.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp } from "lucide-react";

const Banner = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const swiperRef = useRef<any>(null);

  const slides = [
    {
      id: 1,
      title: "The Best School in Your Town",
      subtitle: "Welcome to Jesa World School",
      description:
        "Simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry’s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled.",
      bgImage: "/img/bg-1.jpg",
    },
    {
      id: 2,
      title: "School of the year",
      subtitle: "Welcome to Jesa World School",
      description:
        "Simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry’s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled.",
      bgImage: "/img/bg-2.jpg",
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      if (swiperRef.current) {
        swiperRef.current.slideNext();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval); // Clear interval on unmount
  }, []);

  return (
    <section>
      <div className="banner-slider relative">
        <Swiper
          modules={[Navigation]}
          navigation={{
            nextEl: ".next",
            prevEl: ".prev",
          }}
          onSlideChange={(swiper) => setActiveSlide(swiper.activeIndex)}
          onSwiper={(swiper) => (swiperRef.current = swiper)} // Set the swiper instance to ref
        >
          {slides.map((slide) => (
            <SwiperSlide key={slide.id}>
              <div
                className="pt-[390px] md:pt-[300px] xs:pt-[280px] pb-[205px] bg-no-repeat bg-center bg-cover relative z-[1] before:absolute before:-z-[1] before:inset-0 before:bg-sky-700/50 before:pointer-events-none"
                style={{
                  backgroundImage: `url(${slide.bgImage})`,
                }}
              >
                <div className="mx-[10%] md:mx-[55px] relative z-[2]">
                  <div className="text-white w-[48%] xl:w-[60%] md:w-[70%] sm:w-[80%] xs:w-full">
                    <h6 className="font-medium uppercase tracking-[3px] mb-[16px] text-yellow-400">
                      {slide.subtitle}
                    </h6>
                    <h2 className="font-bold text-[clamp(35px,4.57vw,80px)] leading-[1.13] mb-[15px]">
                      {slide.title}
                    </h2>
                    <p className="leading-[1.75] mb-[41px]">{slide.description}</p>
                    <div className="flex items-center gap-[20px]">
                      <Link href="/contact" className="bg-sky-600 px-4 py-4 text-white rounded hover:bg-black">
                        Apply now
                      </Link>
                      <Link href="/about" className="!bg-transparent border border-white hover:!bg-white hover:text-black hover:text-purple px-4 py-4 rounded">
                        About us
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Navigation buttons */}
        <div className="banner-slider-nav absolute z-[1] top-[50%] xs:top-[80%] right-[130px] md:right-[60px] sm:right-[40px] xs:hidden flex flex-col gap-[15px]">
          <Button className="prev !bg-transparent border hover:bg-yellow-400 hover:border-yellow-400 hover:text-black">
            <ArrowUp/>
          </Button>
          <Button className="next !bg-transparent border hover:bg-yellow-400 hover:border-yellow-400 hover:text-black">
            <ArrowDown />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Banner;
