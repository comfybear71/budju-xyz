import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTimes,
  FaTrash,
  FaPlus,
  FaMinus,
  FaCreditCard,
  FaCoins,
  FaWallet,
} from "react-icons/fa";
import Button from "@components/common/Button";
import { useProducts } from "../context/ProductContext";
import { particleBurst } from "@/lib/utils/animation";

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
}

const Cart = ({ isOpen, onClose }: CartProps) => {
  const {
    cartItems,
    cartTotal,
    removeFromCart,
    updateCartItemQuantity,
    clearCart,
  } = useProducts();

  const [checkoutStep, setCheckoutStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "crypto" | "wallet"
  >("crypto");
  const cartRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<HTMLDivElement>(null);

  // Close cart when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cartRef.current && !cartRef.current.contains(event.target as Node)) {
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

  // Prevent scrolling when cart is open
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

  // Reset checkout step when cart closes
  useEffect(() => {
    if (!isOpen) {
      setCheckoutStep(0);
    }
  }, [isOpen]);

  // Simulate checkout completion
  const handleCheckout = () => {
    if (checkoutStep === 0) {
      setCheckoutStep(1);
    } else if (checkoutStep === 1) {
      // Simulate successful checkout
      setTimeout(() => {
        if (checkoutRef.current) {
          particleBurst(checkoutRef.current, {
            count: 50,
            colors: ["#FF69B4", "#87CEFA", "#FFD700"],
            duration: 1.5,
          });
        }
        setCheckoutStep(2);
      }, 1000);
    } else {
      // Reset cart after success
      clearCart();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70">
          <motion.div
            ref={cartRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="absolute top-0 right-0 h-full w-full md:w-96 lg:w-[30rem] bg-gray-900 shadow-xl"
          >
            {/* Cart Header */}
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Your Cart</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <FaTimes size={20} />
              </button>
            </div>

            {/* Cart Body */}
            <div className="h-[calc(100%-64px-80px)] overflow-y-auto">
              {checkoutStep === 0 ? (
                <>
                  {/* Cart Items */}
                  {cartItems.length > 0 ? (
                    <div className="p-4 space-y-4">
                      {cartItems.map((item) => (
                        <div
                          key={item.product.id}
                          className="flex gap-4 p-3 bg-gray-800/50 rounded-lg border border-gray-800"
                        >
                          {/* Product Image */}
                          <div className="w-20 h-20 bg-gray-800 rounded-md overflow-hidden flex-shrink-0">
                            <img
                              src={item.product.image}
                              alt={item.product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Product Details */}
                          <div className="flex-grow">
                            <h3 className="text-white font-medium">
                              {item.product.name}
                            </h3>
                            <div className="text-sm text-gray-400 mb-1">
                              {item.selectedColor &&
                                `Color: ${item.selectedColor}`}
                              {item.selectedColor && item.selectedSize && " / "}
                              {item.selectedSize &&
                                `Size: ${item.selectedSize}`}
                            </div>
                            <div className="text-budju-pink font-bold">
                              ${item.product.price.toFixed(2)}
                            </div>

                            {/* Quantity Controls */}
                            <div className="flex justify-between items-center mt-2">
                              <div className="flex items-center bg-gray-800 rounded-lg overflow-hidden">
                                <button
                                  onClick={() =>
                                    updateCartItemQuantity(
                                      item.product.id,
                                      item.quantity - 1,
                                    )
                                  }
                                  disabled={item.quantity <= 1}
                                  className="px-2 py-1 text-gray-400 hover:bg-gray-700 disabled:opacity-50"
                                >
                                  <FaMinus size={12} />
                                </button>
                                <span className="px-3 text-white">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() =>
                                    updateCartItemQuantity(
                                      item.product.id,
                                      item.quantity + 1,
                                    )
                                  }
                                  className="px-2 py-1 text-gray-400 hover:bg-gray-700"
                                >
                                  <FaPlus size={12} />
                                </button>
                              </div>

                              {/* Remove Button */}
                              <button
                                onClick={() => removeFromCart(item.product.id)}
                                className="text-red-500 hover:text-red-400"
                              >
                                <FaTrash size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Clear Cart Button */}
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={clearCart}>
                          Clear Cart
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                      <img
                        src="/images/logo.png"
                        alt="Empty Cart"
                        className="w-32 h-32 opacity-30 mb-4"
                      />
                      <h3 className="text-xl font-bold text-white mb-2">
                        Your cart is empty
                      </h3>
                      <p className="text-gray-400 mb-6">
                        Add some awesome BUDJU merchandise to your cart!
                      </p>
                      <Button onClick={onClose} size="md">
                        Shop Now
                      </Button>
                    </div>
                  )}
                </>
              ) : checkoutStep === 1 ? (
                /* Checkout Form */
                <div ref={checkoutRef} className="p-4 space-y-6">
                  <h3 className="text-xl font-bold text-white mb-4">
                    Checkout
                  </h3>

                  {/* Payment Method */}
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">
                      Payment Method
                    </h4>
                    <div className="space-y-3">
                      <div
                        className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                          paymentMethod === "crypto"
                            ? "border-budju-pink bg-budju-pink/10"
                            : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                        }`}
                        onClick={() => setPaymentMethod("crypto")}
                      >
                        <FaCoins
                          className={`mr-3 ${paymentMethod === "crypto" ? "text-budju-pink" : "text-gray-400"}`}
                        />
                        <div>
                          <div
                            className={`font-medium ${paymentMethod === "crypto" ? "text-white" : "text-gray-300"}`}
                          >
                            Pay with BUDJU / SOL
                          </div>
                          <div className="text-sm text-gray-400">
                            Get 10% discount when paying with BUDJU tokens
                          </div>
                        </div>
                      </div>

                      <div
                        className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                          paymentMethod === "wallet"
                            ? "border-budju-blue bg-budju-blue/10"
                            : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                        }`}
                        onClick={() => setPaymentMethod("wallet")}
                      >
                        <FaWallet
                          className={`mr-3 ${paymentMethod === "wallet" ? "text-budju-blue" : "text-gray-400"}`}
                        />
                        <div>
                          <div
                            className={`font-medium ${paymentMethod === "wallet" ? "text-white" : "text-gray-300"}`}
                          >
                            Pay with Crypto Wallet
                          </div>
                          <div className="text-sm text-gray-400">
                            Connect wallet to pay with any supported
                            cryptocurrency
                          </div>
                        </div>
                      </div>

                      <div
                        className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                          paymentMethod === "card"
                            ? "border-green-500 bg-green-500/10"
                            : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                        }`}
                        onClick={() => setPaymentMethod("card")}
                      >
                        <FaCreditCard
                          className={`mr-3 ${paymentMethod === "card" ? "text-green-500" : "text-gray-400"}`}
                        />
                        <div>
                          <div
                            className={`font-medium ${paymentMethod === "card" ? "text-white" : "text-gray-300"}`}
                          >
                            Pay with Credit Card
                          </div>
                          <div className="text-sm text-gray-400">
                            All major credit cards accepted
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shipping Address */}
                  <div>
                    <h4 className="text-lg font-semibold text-white mb-3">
                      Shipping Address
                    </h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <input
                            type="text"
                            placeholder="First Name"
                            className="budju-input w-full"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Last Name"
                            className="budju-input w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <input
                          type="email"
                          placeholder="Email Address"
                          className="budju-input w-full"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Street Address"
                          className="budju-input w-full"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <input
                            type="text"
                            placeholder="City"
                            className="budju-input w-full"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="ZIP / Postal Code"
                            className="budju-input w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Order Confirmation */
                <div className="p-4 flex flex-col items-center justify-center h-full text-center">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                    <svg
                      className="w-10 h-10 text-green-500"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Order Confirmed!
                  </h3>
                  <p className="text-gray-400 mb-6">
                    Thank you for your purchase. Your order has been confirmed
                    and will be shipped soon.
                  </p>
                  <div className="bg-gray-800/50 p-4 rounded-lg mb-6 text-left w-full">
                    <h4 className="text-lg font-semibold text-white mb-2">
                      Order Summary
                    </h4>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-400">Order Number:</span>
                      <span className="text-white">
                        BUDJU-{Math.floor(Math.random() * 10000)}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-400">Date:</span>
                      <span className="text-white">
                        {new Date().toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-400">Payment Method:</span>
                      <span className="text-white capitalize">
                        {paymentMethod}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total:</span>
                      <span className="text-budju-pink font-bold">
                        ${cartTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cart Footer */}
            {(cartItems.length > 0 || checkoutStep > 0) && (
              <div className="p-4 border-t border-gray-800">
                {/* Cart Total */}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-400">
                    {checkoutStep === 0 ? (
                      <>
                        Subtotal ({cartItems.length}{" "}
                        {cartItems.length === 1 ? "item" : "items"})
                      </>
                    ) : (
                      "Total"
                    )}
                  </span>
                  <span className="text-xl font-bold text-white">
                    ${cartTotal.toFixed(2)}
                  </span>
                </div>

                {/* Checkout Button */}
                <Button fullWidth size="lg" onClick={handleCheckout}>
                  {checkoutStep === 0
                    ? "Proceed to Checkout"
                    : checkoutStep === 1
                      ? "Place Order"
                      : "Continue Shopping"}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Cart;
