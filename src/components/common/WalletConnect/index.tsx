import { useState, useEffect } from "react";
import { FaWallet, FaSignOutAlt } from "react-icons/fa";
import Button from "../Button";

interface WalletConnectProps {
  fullWidth?: boolean;
}

const WalletConnect = ({ fullWidth = false }: WalletConnectProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Simulate checking for an existing wallet connection
  useEffect(() => {
    const checkWalletConnection = () => {
      const savedConnection = localStorage.getItem("budjuWalletConnected");
      const savedAddress = localStorage.getItem("budjuWalletAddress");

      if (savedConnection === "true" && savedAddress) {
        setIsConnected(true);
        setWalletAddress(savedAddress);
      }
    };

    checkWalletConnection();
  }, []);

  // Simulate connecting to a wallet
  const connectWallet = () => {
    // This will be replaced with actual wallet connection logic
    const mockAddress = "7gr...CVpc";

    // Simulate connection process
    setIsConnected(true);
    setWalletAddress(mockAddress);

    // Save to localStorage to persist the connection
    localStorage.setItem("budjuWalletConnected", "true");
    localStorage.setItem("budjuWalletAddress", mockAddress);
  };

  // Simulate disconnecting from a wallet
  const disconnectWallet = () => {
    setIsConnected(false);
    setWalletAddress("");
    setIsDropdownOpen(false);

    // Clear from localStorage
    localStorage.removeItem("budjuWalletConnected");
    localStorage.removeItem("budjuWalletAddress");
  };

  // Toggle the dropdown menu
  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  if (!isConnected) {
    return (
      <Button
        variant="secondary"
        size="md"
        fullWidth={fullWidth}
        leftIcon={<FaWallet />}
        onClick={connectWallet}
      >
        Connect Wallet
      </Button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className={`flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-budju transition-colors duration-300 ${
          fullWidth ? "w-full justify-center" : ""
        }`}
      >
        <FaWallet className="text-budju-blue" />
        <span className="font-mono">{walletAddress}</span>
      </button>

      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-budju shadow-lg overflow-hidden z-10">
          <div className="p-2">
            <button
              onClick={disconnectWallet}
              className="flex items-center w-full space-x-2 px-4 py-2 text-white hover:bg-gray-700 rounded transition-colors duration-200"
            >
              <FaSignOutAlt className="text-budju-pink" />
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletConnect;
