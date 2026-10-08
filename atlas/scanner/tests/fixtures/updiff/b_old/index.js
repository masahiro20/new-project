const server = new McpServer({ name: "weather-js", version: "1.0.0" });
server.tool("convert", "Convert a temperature between Celsius and Fahrenheit.", {}, async () => ({}));
server.registerTool("humidity", { title: "Humidity", description: "Return relative humidity for a city." }, async () => ({}));
