import { memo } from "react";
import { motion } from "framer-motion";
import Button from "./Button";
import { Product } from "@/types";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  return (
    <motion.div
      className="flex-none w-64 overflow-hidden bg-white rounded-lg shadow-lg"
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-4">
        <h4 className="mb-2 text-lg font-bold">
          <span className="text-light-blue">{product.title.split(" ")[0]}</span>{" "}
          <span className="text-gray-800">
            {product.title.split(" ").slice(1).join(" ")}
          </span>
        </h4>

        <div className="relative mb-3 overflow-hidden rounded-md aspect-square">
          <img
            src={product.imageSrc}
            alt={product.title}
            className="object-cover w-full h-full transition-transform duration-300 hover:scale-105"
          />
        </div>

        <p className="mb-4 text-sm text-center text-gray-700">
          {product.description}
        </p>

        <Button
          variant="hot-pink"
          size="md"
          fullWidth
          href={product.url}
          external
        >
          Buy Now
        </Button>
      </div>
    </motion.div>
  );
};

export default memo(ProductCard);
