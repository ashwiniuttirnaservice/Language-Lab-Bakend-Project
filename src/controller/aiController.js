const axios = require("axios");

const SubTopic = require("../models/SubTopic");
const VideoModule = require("../models/VideoModule");
const AudioModule = require("../models/AudioModule");
const TextModule = require("../models/TextModule");
const ExerciseModule = require("../models/ExerciseModule");
const VocabularyModule = require("../models/VocabularyModule");
const ChatHistory = require("../models/ChatHistory");
const ActivityLog = require("../models/ActivityLog");
const asyncHandler = require("../middlewares/asyncHandler");
const { sendResponse, sendError } = require("../utils/apiResponse");

const MODULE_MAP = {
  video: VideoModule,
  audio: AudioModule,
  text: TextModule,
  exercise: ExerciseModule,
  vocabulary: VocabularyModule,
};

const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// POST /ai/ask
const ask = asyncHandler(async (req, res) => {
  const { question, sub_topic_id, module_type, module_id } = req.body;

  // Load subtopic + parent topic
  const subTopic = await SubTopic.findById(sub_topic_id).populate("topic_id", "title");
  if (!subTopic) return sendError(res, 404, false, "SubTopic not found.");

  // Load module content for context
  const Model = MODULE_MAP[module_type];
  let contextBody = "";
  if (Model && module_id) {
    const module = await Model.findById(module_id).select(
      "title content audio video words",
    );
    if (module) {
      contextBody =
        module?.content?.body?.slice(0, 400) ||
        module?.audio?.transcript?.slice(0, 400) ||
        module?.video?.transcript?.slice(0, 400) ||
        module?.words?.map((w) => `${w.word}: ${w.meaning}`).join(", ").slice(0, 400) ||
        module?.title ||
        "";
    }
  }

  const messages = [
    {
      role: "system",
      content:
        `You are a language learning assistant for LanguageLab.\n` +
        `Topic: ${subTopic.topic_id?.title || ""}. SubTopic: ${subTopic.title}.\n` +
        `Module type: ${module_type}.\n` +
        `Content context: ${contextBody}\n` +
        `Student: ${req.student.full_name}, Course: ${req.student.course || "General"}.\n` +
        `Rules: Answer in English only. Keep answers under 120 words. Do not answer off-topic questions.`,
    },
    { role: "user", content: question },
  ];

  // Call Ollama
  let answer = "";
  let tokens_used = 0;

  try {
    const response = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: {
          temperature: 0.4,
          num_predict: 500,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      },
    );

    answer       = response.data?.message?.content || "No response from AI.";
    tokens_used  = response.data?.eval_count || 0;
  } catch (err) {
    const reason = err.code === "ECONNREFUSED"
      ? "Ollama is not running. Start it with: ollama serve"
      : "AI service temporarily unavailable. Please try again.";
    return sendError(res, 502, false, reason);
  }


// const axios = require("axios");

// try {
//   console.log("Connecting to Ollama...");

//   const { data } = await axios.post(
//     "http://192.168.1.250:11434/api/chat",
//     {
//       model: "qwen3:4b-instruct",
//       messages: [
//         {
//           role: "user",
//           content: "Say Hello",
//         },
//       ],
//       stream: false,
//     },
//     {
//       timeout: 60000,
//       headers: {
//         "Content-Type": "application/json",
//       },
//     }
//   );

//   console.log("SUCCESS:", data);
// } catch (err) {
//   console.log("Code:", err.code);
//   console.log("Message:", err.message);
//   console.log("Response:", err.response?.data);
//   console.log("Stack:", err.stack);
// }


  // Save to ChatHistory
  await ChatHistory.create({
    student_id: req.student._id,
    institute_id: req.student.institute_id,
    session_id: req.session_id || null,
    topic_id:   subTopic.topic_id?._id,
    subtopic_id: sub_topic_id,
    module_type,
    question,
    answer,
    model: OLLAMA_MODEL,
    tokens_used,
  });

  // Log activity
  await ActivityLog.create({
    student_id:    req.student._id,
    institute_id:  req.student.institute_id,
    topic_id:      subTopic.topic_id?._id,
    sub_topic_id,
    module_type,
    activity_type: "ai_query",
  });

  return sendResponse(res, 200, true, "AI response received.", {
    answer,
    model: OLLAMA_MODEL,
    tokens_used,
  });
});

const getContentFromAI = asyncHandler(async (req, res) => {
  const { topic, subtopic, content } = req.body;


console.log("Content  for req length:", content.length);


  if (!topic || !subtopic || !content) {
    return sendError(
      res,
      400,
      false,
      "Topic, subtopic and content are required."
    );
  }

  const prompt = `
You are an educational AI assistant.

Topic: ${topic}
Subtopic: ${subtopic}

Content:
${content}


Requirements:
- Read and understand the provided content carefully.
- Create a learning module that helps students understand the topic.
- Organize the module using clear Markdown headings.
- Include:
1. Module Title
2. Learning Objectives (3–5 points)
3. Key Concepts (short explanations)
4. Important Points to Remember
5. 10 assessment questions based only on the provided content
- Questions should:
- Be clear and easy to understand.
- Cover the important concepts from the content.
- Encourage comprehension rather than memorization.
- Not include answers.
- Do not add information that is not present in the provided content.
- Return the entire response in well-formatted Markdown.

Respond in well-formatted Markdown.
`;

  try {
    const start = Date.now();
    const { data } = await axios.post("http://192.168.1.250:11434/api/chat", {
      model: "qwen3:4b-instruct",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
 stream: false,
  options: {

    temperature: 0.4,
    num_predict: 200,
  },

    });

    const responseContent = data?.message?.content;
    console.log("Content  ai length:", responseContent.length);
   console.log(`Ollama took ${(Date.now() - start) / 1000}s`);
    console.log("=========AI=========== Response Content:", responseContent);

    return sendResponse(
      res,
      200,
      true,
      "Content generated successfully.",
      {
        topic,
        subtopic,
        response: responseContent,
      }
    );
  } catch (error) {
    console.error("Error generating content from AI:", error.message);
    return sendError(
      res,
      500,
      false,
      "Failed to generate content from AI."
    );
  }
});



// GET /ai/history
const getHistory = asyncHandler(async (req, res) => {
  const { sub_topic_id, limit = 50 } = req.query;

  const query = { student_id: req.student._id };
  if (sub_topic_id) query.subtopic_id = sub_topic_id;

  const history = await ChatHistory.find(query)
    .sort({ createdAt: -1 })
    .limit(Number(limit));

  return sendResponse(res, 200, true, "Chat history fetched successfully.", history);
});

module.exports = { ask, getHistory, getContentFromAI };
