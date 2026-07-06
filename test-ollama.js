const axios = require("axios");

(async () => {
  try {
    const { data } = await axios.post(
      "http://192.168.1.250:11434/api/chat",
      {
        model: "qwen3:4b-instruct",
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
        stream: false,
      }
    );

    console.log(data);
  } catch (err) {
    console.log(err.code);
    console.log(err.message);
    console.log(err.response?.data);
  }
})();