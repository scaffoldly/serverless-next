import { startServer } from "next/dist/server/lib/start-server";
import portfinder from "portfinder";
import axios from "axios";
const { _HANDLER, IS_OFFLINE, AWS_LAMBDA_RUNTIME_API } = process.env;

(async () => {
  if (!_HANDLER) {
    throw new Error("No handler specified");
  }

  if (_HANDLER !== "next") {
    throw new Error("Not Implemented");
  }

  const dev = IS_OFFLINE === "true";
  const port = await portfinder.getPortPromise({ startPort: 12000 });

  axios
    .get(
      `http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/next`,
      { timeout: 0 }
    )
    .then(({ headers, data }) => {
      const requestId = headers["lambda-runtime-aws-request-id"];
      console.log("Received request from Lambda Runtime API", { requestId });

      console.log("!!! data", JSON.stringify(data));

      const payload = {
        statusCode: 200,
        body: "Hello, World!",
      };

      return axios.post(
        `http://${AWS_LAMBDA_RUNTIME_API}/2018-06-01/runtime/invocation/${requestId}/response`,
        payload
      );
    })
    .then(() => {
      console.log("Successfully responded to the Lambda Runtime API");
    });

  await startServer({
    dir: process.cwd(),
    isDev: dev,
    port,
  });
})();
