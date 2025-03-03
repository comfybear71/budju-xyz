import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaShoppingCart, FaTimes } from "react-icons/fa";
import Button from "@components/common/Button";
import { Product } from "../context/ProductContext";

interface ProductQuickViewProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  selectedColor: string;
  selectedSize: string;
  onColorChange: (color: string) => void;
  onSizeChange: (size: string) => void;
  onAddToCart: () => void;
}

const ProductQuickView = ({
  product,
  isOpen,
  onClose,
  selectedColor,
  selectedSize,
  onColorChange,
  onSizeChange,
  onAddToCart,
}: ProductQuickViewProps) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            ref={modalRef}
            className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-gray-800"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white z-10 bg-gray-800 rounded-full p-2"
            >
              <FaTimes />
            </button>

            {/* Product Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6">
              {/* Product Image */}
              <div className="aspect-square bg-gray-800 rounded-lg overflow-hidden">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Product Info */}
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  {product.name}
                </h2>
                <p className="text-gray-400 mb-4">{product.description}</p>

                {/* Price */}
                <div className="text-2xl font-bold text-budju-pink mb-6">
                  ${product.price.toFixed(2)}
                </div>

                {/* Color Selection */}
                {product.colors && product.colors.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Color
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {product.colors.map((color) => (
                        <button
                          key={color}
                          onClick={() => onColorChange(color)}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            selectedColor === color
                              ? "bg-budju-blue text-white"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          {color}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Size Selection */}
                {product.sizes && product.sizes.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Size
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {product.sizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => onSizeChange(size)}
                          className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${
                            selectedSize === size
                              ? "bg-budju-blue text-white"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Availability */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Availability
                  </h3>
                  <div className="flex items-center">
                    <div
                      className={`w-3 h-3 rounded-full mr-2 ${
                        product.inStock ? "bg-green-500" : "bg-red-500"
                      }`}
                    ></div>
                    <span
                      className={
                        product.inStock ? "text-green-500" : "text-red-500"
                      }
                    >
                      {product.inStock ? "In Stock" : "Out of Stock"}
                    </span>
                  </div>
                </div>

                {/* Add to Cart Button */}
                <Button
                  fullWidth
                  size="lg"
                  disabled={!product.inStock}
                  onClick={onAddToCart}
                  leftIcon={<FaShoppingCart />}
                >
                  Add to Cart
                </Button>

                {/* Additional Information */}
                <div className="mt-8 text-sm text-gray-400">
                  <p className="mb-2">
                    <span className="font-semibold">Category:</span>{" "}
                    {product.category}
                  </p>
                  <p>
                    <span className="font-semibold">Shipping:</span> Free
                    shipping on orders over $50
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ProductQuickView;
