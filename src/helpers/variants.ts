import { Variants } from "framer-motion";

export const myVariants: Variants = {
  hidden: { y: 20 },
  show: {
    y: 0,
    transition: {
      duration: 0.5,
      // Adding 'as const' fixes the "number[] is not assignable" error
      ease: [0.17, 0.67, 0.83, 0.67] as const, 
    },
  },
};