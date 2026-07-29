const dotenv = require("dotenv");

dotenv.config();

function getConfig() {
  return {
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT || 3000)
  };
}

module.exports = { getConfig };
