import { useState, useRef } from "react";
import { FaShoppingCart, FaEye } from "react-icons/fa";
import Button from "@components/common/Button";
import { Product, useProducts } from "../context/ProductContext";
import ProductQuickView from "./ProductQuickView";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const { addToCart } = useProducts();
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState(product.colors?.[0] || "");
  const [selectedSize, setSelectedSize] = useState(product.sizes?.[0] || "");
  const cardRef = useRef<HTMLDivElement>(null);

  // Handle add to cart
  const handleAddToCart = () => {
    addToCart(product, 1, selectedColor, selectedSize);
  };

  // Handle quick view
  const openQuickView = () => {
    setIsQuickViewOpen(true);
  };

  return (
    <>
      <div
        ref={cardRef}
        className="product-card group bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-budju-blue transition-all duration-300"
      >
        {/* Product Image */}
        <div className="relative aspect-square overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
          />

          {/* Quick View Button */}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button
              onClick={openQuickView}
              className="px-4 py-2 bg-budju-blue text-white rounded-lg flex items-center transform hover:scale-105 transition-transform duration-300"
            >
              <FaEye className="mr-2" /> Quick View
            </button>
          </div>

          {/* Category Badge */}
          <div className="absolute top-3 left-3 px-2 py-1 bg-black/70 text-white text-xs rounded capitalize">
            {product.category}
          </div>
        </div>

        {/* Product Info */}
        <div className="p-4">
          <h3 className="text-lg font-bold text-white mb-1">{product.name}</h3>
          <p className="text-gray-400 text-sm mb-3">{product.description}</p>

          {/* Price */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-lg font-bold text-budju-pink">
              ${product.price.toFixed(2)}
            </span>

            {!product.inStock && (
              <span className="text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded">
                Out of Stock
              </span>
            )}
          </div>

          {/* Add to Cart Button */}
          <Button
            fullWidth
            size="sm"
            disabled={!product.inStock}
            onClick={handleAddToCart}
            leftIcon={<FaShoppingCart />}
          >
            Add to Cart
          </Button>
        </div>
      </div>

      {/* Quick View Modal */}
      {isQuickViewOpen && (
        <ProductQuickView
          product={product}
          isOpen={isQuickViewOpen}
          onClose={() => setIsQuickViewOpen(false)}
          selectedColor={selectedColor}
          selectedSize={selectedSize}
          onColorChange={setSelectedColor}
          onSizeChange={setSelectedSize}
          onAddToCart={handleAddToCart}
        />
      )}
    </>
  );
};

export default ProductCard;
