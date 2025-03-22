// crypto-polyfill.js
const crypto = require("crypto");

// Only add crypto if it doesn't exist
if (typeof global !== "undefined") {
  if (!global.crypto) {
    global.crypto = {};
  }

  // Add getRandomValues method if it doesn't exist
  if (!global.crypto.getRandomValues) {
    global.crypto.getRandomValues = function getRandomValues(array) {
      return crypto.randomFillSync(array);
    };
  }
}
