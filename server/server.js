const express = require("express");
const path = require("path");
const { getConfig } = require("./config");
const { OpenAICompatibleProvider } = require("./providers/openai-compatible-provider");
const { createReorderService } = require("./reorder-service");

const rootDir = path.resolve(__dirname, "..");

function createApp({ providerFactory } = {}) {
  const app = express();
  const reorderService = createReorderService({
    providerFactory: providerFactory || ((modelConfig) => new OpenAICompatibleProvider(modelConfig || {}))
  });

  app.use(express.json({ limit: "1mb" }));
  app.use("/assets", express.static(path.join(rootDir, "assets")));

  app.get("/", (req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
  });

  app.post("/api/reorder", async (req, res) => {
    try {
      const result = await reorderService.reorder(req.body);
      res.json(result);
    } catch (error) {
      res.status(400).json({
        source: "fallback",
        summary: "重排请求无效，请检查输入。",
        extractedTasks: [],
        queue: [],
        outOfToday: [],
        changeEvents: [],
        preservedManualConstraints: [],
        brokenManualConstraints: [],
        allTasks: [],
        warnings: [error.message]
      });
    }
  });

  return app;
}

const config = getConfig();
const app = createApp();

if (require.main === module) {
  app.listen(config.port, config.host, () => {
    const os = require("os");
    const interfaces = os.networkInterfaces();
    let localIp = "127.0.0.1";
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
    }
    console.log(`What to do now? app running at:`);
    console.log(`  - Local: http://localhost:${config.port}`);
    console.log(`  - Network: http://${localIp}:${config.port}`);
    console.log("Users can add their own model API settings in the browser; missing keys use local fallback.");
  });
}

module.exports = { app, createApp };
