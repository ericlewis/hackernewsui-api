const { build } = require("../src/build");

export default async (req, res) => {
  const app = build({ logger: false });
  await app.ready();
  app.server.emit("request", req, res);
};
