import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

// Product type definition
export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  category: "mens" | "ladies" | "caps" | "special";
  description: string;
  colors?: string[];
  sizes?: string[];
  inStock: boolean;
}

// Cart item type definition
export interface CartItem {
  product: Product;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
}

// Context type definition
interface ProductContextType {
  products: Product[];
  featuredProducts: Product[];
  cartItems: CartItem[];
  addToCart: (
    product: Product,
    quantity: number,
    color?: string,
    size?: string,
  ) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
}

// Create context with default values
const ProductContext = createContext<ProductContextType>({
  products: [],
  featuredProducts: [],
  cartItems: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateCartItemQuantity: () => {},
  clearCart: () => {},
  cartTotal: 0,
  cartCount: 0,
});

// Hook to use the product context
export const useProducts = () => useContext(ProductContext);

// Sample products data - in a real app, this would come from an API
const sampleProducts: Product[] = [
  // Ladies Singlet Tops
  {
    id: "ladies-singlet-1",
    name: "Ladies Pink Singlet Top",
    price: 29.99,
    image:
      "src/assets/images/merch/ladies/singlets/pink-ladies-singlet-top.png",
    category: "ladies",
    description: "Vibrant pink singlet—chic & bold",
    colors: ["Pink", "White", "Black"],
    sizes: ["XS", "S", "M", "L", "XL"],
    inStock: true,
  },
  {
    id: "ladies-singlet-2",
    name: "Ladies Blue Singlet Top",
    price: 29.99,
    image:
      "src/assets/images/merch/ladies/singlets/light-blue-bg-ladies-singlet.png",
    category: "ladies",
    description: "Light blue singlet—fresh & bold",
    colors: ["Light Blue", "White", "Black"],
    sizes: ["XS", "S", "M", "L", "XL"],
    inStock: true,
  },
  {
    id: "ladies-singlet-3",
    name: "Ladies Light Blue Singlet Top",
    price: 29.99,
    image:
      "src/assets/images/merch/ladies/singlets/light-blue-ladies-singlet-top.png",
    category: "ladies",
    description: "Light blue singlet—modern & edgy",
    colors: ["Blue", "White", "Pink"],
    sizes: ["XS", "S", "M", "L", "XL"],
    inStock: true,
  },
  {
    id: "ladies-singlet-4",
    name: "Ladies Black Logo Singlet Top",
    price: 32.99,
    image:
      "src/assets/images/merch/ladies/singlets/white-bg-black-logo-ladies-singlet-top.png",
    category: "ladies",
    description: "White singlet—bold black logo",
    colors: ["White", "Black", "Pink"],
    sizes: ["XS", "S", "M", "L", "XL"],
    inStock: true,
  },

  // Mens Singlet Tops
  {
    id: "mens-singlet-1",
    name: "Mens Pink Singlet Top",
    price: 32.99,
    image:
      "src/assets/images/merch/mens/singlets/black-logo-pink-bg-mens-singlet.jpg",
    category: "mens",
    description: "Black logo pops—pink grit shines",
    colors: ["Pink", "Blue", "Black"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    inStock: true,
  },
  {
    id: "mens-singlet-2",
    name: "Mens White Singlet Top",
    price: 32.99,
    image:
      "src/assets/images/merch/mens/singlets/black-logo-white-bg-mens-singlet.jpg",
    category: "mens",
    description: "Black logo stands—white edge cuts",
    colors: ["White", "Gray", "Black"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    inStock: true,
  },
  {
    id: "mens-singlet-3",
    name: "Mens Yellow Singlet Top",
    price: 32.99,
    image:
      "src/assets/images/merch/mens/singlets/black-logo-yellow-bg-mens-singlet.jpg",
    category: "mens",
    description: "Black logo roars—yellow fire burns",
    colors: ["Yellow", "White", "Black"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    inStock: true,
  },
  {
    id: "mens-singlet-4",
    name: "Mens Blue Logo Singlet Top",
    price: 34.99,
    image:
      "src/assets/images/merch/mens/singlets/blue-logo-white-bg-mens-singlet.jpg",
    category: "mens",
    description: "Blue logo strikes—white power glows",
    colors: ["White", "Blue", "Black"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    inStock: true,
  },

  // Caps
  {
    id: "cap-1",
    name: "Pink BUDJU Cap",
    price: 24.99,
    image: "src/assets/images/merch/caps/pink-cap-white-logo.jpg",
    category: "caps",
    description: "Pink cap pops—white logo strikes",
    colors: ["Pink"],
    sizes: ["One Size"],
    inStock: true,
  },
  {
    id: "cap-2",
    name: "White BUDJU Cap",
    price: 24.99,
    image: "src/assets/images/merch/caps/white-cap-pink-logo.jpg",
    category: "caps",
    description: "White cap glows—pink logo rules",
    colors: ["White"],
    sizes: ["One Size"],
    inStock: true,
  },

  // Special Items
  {
    id: "mug-1",
    name: "BUDJU Coffee Mug",
    price: 19.99,
    image: "src/assets/images/merch/items/coffee-mug.jpg",
    category: "special",
    description: "Mug stands tough—sip stays bold",
    colors: ["Black"],
    inStock: true,
  },
];

// Provider component
export const ProductProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [products] = useState<Product[]>(sampleProducts);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Get featured products (for showcase)
  const featuredProducts = products.filter(
    (product, index) =>
      // First product from each category
      products.findIndex((p) => p.category === product.category) === index,
  );

  // Calculate cart total
  const cartTotal = cartItems.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  );

  // Calculate cart item count
  const cartCount = cartItems.reduce((count, item) => count + item.quantity, 0);

  // Add item to cart
  const addToCart = (
    product: Product,
    quantity: number = 1,
    selectedColor?: string,
    selectedSize?: string,
  ) => {
    setCartItems((prevItems) => {
      // Check if product already in cart
      const existingItemIndex = prevItems.findIndex(
        (item) => item.product.id === product.id,
      );

      if (existingItemIndex !== -1) {
        // Update existing item
        const updatedItems = [...prevItems];
        updatedItems[existingItemIndex].quantity += quantity;
        return updatedItems;
      } else {
        // Add new item
        return [
          ...prevItems,
          {
            product,
            quantity,
            selectedColor,
            selectedSize,
          },
        ];
      }
    });
  };

  // Remove item from cart
  const removeFromCart = (productId: string) => {
    setCartItems((prevItems) =>
      prevItems.filter((item) => item.product.id !== productId),
    );
  };

  // Update cart item quantity
  const updateCartItemQuantity = (productId: string, quantity: number) => {
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.max(1, quantity) }
          : item,
      ),
    );
  };

  // Clear cart
  const clearCart = () => {
    setCartItems([]);
  };

  // Load cart from localStorage on initial render
  useEffect(() => {
    const savedCart = localStorage.getItem("budjuCart");
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (error) {
        console.error("Failed to parse saved cart:", error);
      }
    }
  }, []);

  // Save cart to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("budjuCart", JSON.stringify(cartItems));
  }, [cartItems]);

  return (
    <ProductContext.Provider
      value={{
        products,
        featuredProducts,
        cartItems,
        addToCart,
        removeFromCart,
        updateCartItemQuantity,
        clearCart,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};
